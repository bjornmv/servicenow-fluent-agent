#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const home = os.homedir();
const receiptPath = path.join(home, '.agents', '.servicenow-fluent-agent-install.json');
const statePath = path.join(home, '.agents', '.servicenow-fluent-agent-update.json');
const argv = process.argv.slice(2);
const command = argv[0] || 'check';

// session-start and state take no arguments; check and decision options are validated by
// the checkout CLI, which exits non-zero on anything it does not accept.
if (['session-start', 'state'].includes(command) && argv.length > 1) {
  stop(`Unexpected argument ${argv[1]} for ${command}. Nothing was run.`);
}

// Local session gate only: no receipt, repository, network or decision-state access.
// The agent invokes the skill AFTER a due result. The mtime records an attempt.
if (command === 'session-start') {
  try {
    const stamp = path.join(home, '.agents', '.servicenow-fluent-agent-update-check.stamp');
    const now = Date.now();
    let stat;
    try { stat = fs.lstatSync(stamp); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1)) {
      throw new Error('Update-check stamp must be an ordinary unlinked file.');
    }
    const due = !stat || now - stat.mtimeMs > 48 * 60 * 60 * 1000;
    if (due) {
      if (!stat) {
        fs.mkdirSync(path.dirname(stamp), { recursive: true });
        fs.writeFileSync(stamp, '', { flag: 'wx' });
      }
      fs.utimesSync(stamp, stat ? stat.atimeMs / 1000 : now / 1000, now / 1000);
    }
    console.log(JSON.stringify({ due, stamp }));
  } catch (error) {
    console.error(`Session update check failed: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit();
}

// Every failure below is reported on stderr with a non-zero exit. stdout carries only a
// validated notice (check), the forwarded confirmation (decision) or the state (state).
function stop(message, code = 1) {
  console.error(message);
  process.exitCode = code;
  process.exit();
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Read-only. The checkout library replaces unparsable state with an empty one on its next
// write, which would erase reminder/skip decisions, so malformed state stops here instead.
function readState() {
  let text;
  try {
    text = fs.readFileSync(statePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { exists: false, components: {} };
    throw new Error(`cannot read ${statePath}: ${error && error.message}`);
  }
  let state;
  try { state = JSON.parse(text); }
  catch { throw new Error(`${statePath} is not valid JSON`); }
  if (!isRecord(state) || !isRecord(state.components) || !Object.values(state.components).every(isRecord)) {
    throw new Error(`${statePath} has no valid component map`);
  }
  return { exists: true, components: state.components };
}

function stateOrStop(action) {
  try {
    return readState();
  } catch (error) {
    return stop(`Update ${action}: ${error.message}. The file was left unchanged; do not reset it.`);
  }
}

function firstLine(text) {
  const line = String(text || '').split(/\r?\n/).find((entry) => entry.trim());
  return line ? line.trim().slice(0, 300) : '';
}

// Read-only view of the recorded decisions and check results. No receipt, child or network.
if (command === 'state') {
  const state = stateOrStop('state not shown');
  console.log(JSON.stringify({ state: statePath, exists: state.exists, components: state.components }, null, 2));
  process.exit();
}

const targetCommand = { check: 'check-updates', decision: 'update-decision' }[command];
if (!targetCommand) stop(`Unknown command: ${command}. Use session-start, check, decision or state.`);
const action = command === 'check' ? 'check not run' : 'decision not recorded';

const before = stateOrStop(action);

let decisionKeys = [];
if (command === 'decision') {
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--component' && argv[index + 1] && !argv[index + 1].startsWith('--')) decisionKeys.push(argv[index + 1]);
  }
  decisionKeys = [...new Set(decisionKeys)];
  // A key without a recorded notice would be skipped by the checkout CLI with exit 0.
  const unmatched = decisionKeys.filter((key) =>
    !Object.prototype.hasOwnProperty.call(before.components, key) || !isRecord(before.components[key].available));
  if (unmatched.length) {
    const known = Object.keys(before.components).filter((key) => isRecord(before.components[key].available));
    stop(`Update ${action}: no recorded notice for ${unmatched.map((key) => JSON.stringify(key)).join(', ')}. ` +
      `Nothing was changed. Components with a recorded notice: ${known.length ? known.join(', ') : '(none)'}.`);
  }
}

let receipt;
try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); }
catch { receipt = undefined; }
const repoRoot = receipt && typeof receipt.repoRoot === 'string' && receipt.repoRoot;
const cliPath = repoRoot && path.join(repoRoot, 'bin', 'sn-fluent-agent.cjs');
if (!cliPath || !fs.existsSync(cliPath)) {
  stop(`Update ${action}: the install receipt ${receiptPath} is missing or unreadable, or its checkout has no bin/sn-fluent-agent.cjs.`);
}

const MAX_CHECK_OUTPUT = 64 * 1024;
let result;
try {
  result = spawnSync(process.execPath, [cliPath, targetCommand, ...argv.slice(1)],
    command === 'check'
      ? { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: MAX_CHECK_OUTPUT }
      : { stdio: 'inherit' });
} catch (error) {
  result = { error };
}

if (result.error) stop(`Update ${action}: could not run the checkout CLI (${result.error.message}).`);
if (result.signal || result.status !== 0) {
  // Decision output is inherited, so the child's own error is already visible.
  const detail = command === 'check' ? firstLine(result.stderr) : '';
  stop(`Update ${command} failed: checkout CLI ${result.signal ? `ended by ${result.signal}` : `exited ${result.status ?? 'without a status'}`}${detail ? ` (${detail})` : ''}.`,
    !result.signal && Number.isInteger(result.status) && result.status > 0 ? result.status : 1);
}

const after = stateOrStop(`${command} finished but its state cannot be verified`);

if (command === 'decision') {
  const decision = argv.slice(1).find((arg, index, args) => !arg.startsWith('--') && args[index - 1] !== '--component');
  const unrecorded = decisionKeys.filter((key) => {
    const was = before.components[key];
    const now = after.components[key];
    return !now || now.lastDecision !== decision || !now.lastDecisionAt || now.lastDecisionAt === was.lastDecisionAt;
  });
  if (unrecorded.length) stop(`Update decision not recorded for ${unrecorded.map((key) => JSON.stringify(key)).join(', ')}; the state file does not show it.`);
  process.exit();
}

// Fail closed: diagnostics and partial/invalid responses are never notifications.
let invalid = typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout, 'utf8') > MAX_CHECK_OUTPUT;
if (!invalid && result.stdout.trim()) {
  try {
    const payload = JSON.parse(result.stdout);
    const updates = payload && payload.updates;
    if (Array.isArray(updates) && updates.length && updates.every((update) =>
      update && ['component', 'id', 'label', 'current', 'available'].every((field) =>
        typeof update[field] === 'string' && update[field].trim().length > 0) &&
      update.current !== update.available)) {
      console.log(JSON.stringify({ updates }));
    } else {
      invalid = true;
    }
  } catch {
    invalid = true;
  }
}

// Discovery errors (Git, registry, unreadable project) are swallowed by the checkout CLI
// and only recorded in state. Surface the ones this run recorded.
const failed = Object.keys(after.components).filter((key) => after.components[key].lastCheckFailedAt &&
  after.components[key].lastCheckFailedAt !== (before.components[key] || {}).lastCheckFailedAt);
// A newer release withheld because its checkout has local changes is not a failure, but it
// must not be silent: name it so the user can commit, stash or remove the changes.
for (const key of Object.keys(after.components)) {
  const blocked = after.components[key].blocked;
  if (!isRecord(blocked) || blocked.at === ((before.components[key] || {}).blocked || {}).at) continue;
  console.error(`Update not offered for ${key}: ${blocked.label || key} ${blocked.current} -> ${blocked.available} is available, ` +
    `but the checkout has ${blocked.reason}. Commit, stash or remove them, then check again.`);
}
if (invalid) console.error('Update check failed: the checkout CLI returned a response that is not a valid update notice.');
if (failed.length) console.error(`Update check failed for ${failed.join(', ')}: the release source could not be read (lastCheckFailedAt recorded). No update status is known for it.`);
if (invalid || failed.length) process.exitCode = 1;
process.exit();
