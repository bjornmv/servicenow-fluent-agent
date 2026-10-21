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
// Missing or older than 48 hours is due; the stamp is created/touched before any check,
// so its mtime records an attempt, not success.
function sessionGate() {
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
      // EEXIST: a concurrent session just created it and runs the checks.
      try { fs.writeFileSync(stamp, '', { flag: 'wx' }); }
      catch (error) { if (error.code === 'EEXIST') return { due: false, stamp }; throw error; }
    }
    fs.utimesSync(stamp, stat ? stat.atimeMs / 1000 : now / 1000, now / 1000);
  }
  return { due, stamp };
}

// Manual gate: prints {due, stamp}.
if (command === 'session-start') {
  try {
    console.log(JSON.stringify(sessionGate()));
  } catch (error) {
    console.error(`Session update check failed: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit();
}

// VS Code chat SessionStart hook, declared in the agent file. VS Code shows stderr or a
// non-zero exit to the user as a hook warning and kills the hook after 30 s, so this always
// exits 0, writes nothing to stderr and prints hook JSON only when the agent must act.
if (command === 'session-hook') {
  sessionHook();
  process.exit();
}

function sessionHook() {
  const deadline = Date.now() + 20 * 1000;
  const updates = [];
  const blocked = [];
  const failed = [];
  try {
    if (!sessionGate().due) return;
    // No credential prompt or dialog may hold the hook; a public remote needs none.
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '' };
    // Windows: the hook does not get the VS Code terminal's PATH prefix or profile git
    // function, so put the Git the installer selected first, as those do.
    let receipt;
    try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); }
    catch { receipt = undefined; }
    if (receipt && typeof receipt.gitExe === 'string' && fs.existsSync(receipt.gitExe)) {
      const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') || 'PATH';
      env[key] = `${path.dirname(receipt.gitExe)}${path.delimiter}${env[key] || ''}`;
    }
    // A check gets an absolute deadline, so its own start-up counts, and 3 s of grace:
    // its inner kill of the checkout CLI always comes before this one.
    const run = (args, limit = Infinity, grace = 0) => {
      const left = Math.min(limit, deadline - Date.now());
      if (left < 2000) return { error: new Error('time budget used up') };
      try {
        return spawnSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true,
          timeout: left + grace, env: { ...env, SN_FLUENT_UPDATE_DEADLINE: String(Date.now() + left) } });
      } catch (error) { return { error }; }
    };
    // Re-use the quiet `check` command below for every component it would have been run for.
    const check = (name, args) => {
      const result = run([__filename, 'check', '--only', name, ...args], Infinity, 3000);
      const lines = String(result.stderr || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      blocked.push(...lines.filter((line) => line.startsWith('Update not offered for ')).map((line) => line.slice(0, 2000)));
      // stdout only ever carries a validated notice, already recorded as shown: keep it on failure too.
      try { if (String(result.stdout || '').trim()) updates.push(...JSON.parse(result.stdout).updates); }
      catch { /* partial output from a killed run is no notice */ }
      if (result.error || result.signal || result.status !== 0) {
        const reason = result.error ? result.error.message : lines.find((line) => !line.startsWith('Update not offered for ')) || `exit ${result.status}`;
        failed.push(`${name}: ${reason.replace(/\.$/, '').slice(0, 300)}`);
      }
    };
    check('agent', []);
    // VS Code starts the hook in the first workspace folder; its stdin JSON is not read.
    const cwd = process.cwd();
    if (['now.config.json', 'aiux.json'].some((name) => fs.existsSync(path.join(cwd, name)))) check('sdk', ['--project', cwd]);
    const paths = run([path.join(home, '.agents', 'skills', 'sn-doc-lookup', 'bin', 'sn-doc-md.js'), 'paths'], 5000);
    let docs;
    try { docs = paths.status === 0 ? JSON.parse(paths.stdout) : undefined; }
    catch { docs = undefined; }
    if (!docs) failed.push(`docs: checkout lookup failed (${paths.error ? paths.error.message : firstLine(paths.stderr) || `exit ${paths.status}`})`);
    else if (docs.docsExists && typeof docs.docs === 'string') check('docs', ['--docs', docs.docs]);
  } catch (error) {
    failed.push(error.message);
  }
  const parts = [];
  if (updates.length) {
    parts.push(`Update notices: ${JSON.stringify({ updates })}. Before other work, present them and record the user's choices per the sn-update-advisor skill (Present and record choices). They are shown once, then withheld for 7 days. Applying any update needs the user's explicit approval.`);
  }
  if (blocked.length) parts.push(`Updates withheld for local changes; report these verbatim and ask the user how to handle them, without committing, stashing or discarding: ${blocked.join(' ')}`);
  if (failed.length) parts.push(`Not checked (${failed.join('; ')}). Tell the user once; do not retry, force or reset update state, and do not block their task.`);
  if (!parts.length) return;
  const additionalContext = `ServiceNow Fluent session update check (SessionStart hook; do not run it again). ${parts.join(' ')}`;
  // ASCII only: Windows PowerShell 5.1 re-encodes a native command's output with the console code page.
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } })
    .replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
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
if (!targetCommand) stop(`Unknown command: ${command}. Use session-start, session-hook, check, decision or state.`);
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
// Set by session-hook only: the checkout CLI's Git and registry calls have no timeout of their own.
const deadline = command === 'check' ? Number(process.env.SN_FLUENT_UPDATE_DEADLINE) || undefined : undefined;
const timeout = deadline && deadline - Date.now();
if (deadline && timeout < 1000) stop('Update check failed: the session-hook time budget was used up before the checkout CLI started.');
let result;
try {
  result = spawnSync(process.execPath, [cliPath, targetCommand, ...argv.slice(1)],
    command === 'check'
      ? { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: MAX_CHECK_OUTPUT, timeout, windowsHide: true }
      : { stdio: 'inherit' });
} catch (error) {
  result = { error };
}

if (result.error && result.error.code === 'ETIMEDOUT') stop(`Update check failed: checkout CLI timed out after ${Math.round(timeout / 1000)} s.`);
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
// and only recorded in state. Surface the ones this run recorded; with --only, only for
// that component, since a concurrent session may record others meanwhile.
const onlyAt = argv.indexOf('--only');
const inScope = (key) => onlyAt < 1 || key === argv[onlyAt + 1] || key.startsWith(`${argv[onlyAt + 1]}:`);
const failed = Object.keys(after.components).filter((key) => inScope(key) && after.components[key].lastCheckFailedAt &&
  after.components[key].lastCheckFailedAt !== (before.components[key] || {}).lastCheckFailedAt);
// A newer release withheld because its checkout has local changes is not a failure, but it
// must not be silent: name it so the user can commit, stash or remove the changes.
for (const key of Object.keys(after.components).filter(inScope)) {
  const blocked = after.components[key].blocked;
  if (!isRecord(blocked) || blocked.at === ((before.components[key] || {}).blocked || {}).at) continue;
  console.error(`Update not offered for ${key}: ${blocked.label || key} ${blocked.current} -> ${blocked.available} is available, ` +
    `but the checkout has ${blocked.reason}. Commit, stash or remove them, then check again.`);
}
if (invalid) console.error('Update check failed: the checkout CLI returned a response that is not a valid update notice.');
if (failed.length) console.error(`Update check failed for ${failed.join(', ')}: the release source could not be read (lastCheckFailedAt recorded). No update status is known for it.`);
if (invalid || failed.length) process.exitCode = 1;
process.exit();
