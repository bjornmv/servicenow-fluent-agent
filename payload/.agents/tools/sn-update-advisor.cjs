#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const home = os.homedir();
const receiptPath = path.join(home, '.agents', '.servicenow-fluent-agent-install.json');
const argv = process.argv.slice(2);
const command = argv[0] || 'check';

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

function loadReceipt() {
  try {
    return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  } catch {
    return undefined;
  }
}

function forwardedCommand() {
  if (command === 'check') return 'check-updates';
  if (command === 'decision') return 'update-decision';
  return undefined;
}

const receipt = loadReceipt();
const targetCommand = forwardedCommand();
const repoRoot = receipt && receipt.repoRoot;
const cliPath = repoRoot && path.join(repoRoot, 'bin', 'sn-fluent-agent.cjs');

if (!targetCommand || !cliPath || !fs.existsSync(cliPath)) {
  if (command !== 'check') process.exitCode = 1;
  process.exit();
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

if (command === 'check') {
  // Fail closed: diagnostics and partial/invalid responses are never notifications.
  if (!result.error && result.status === 0 && !result.signal &&
      typeof result.stdout === 'string' && Buffer.byteLength(result.stdout, 'utf8') <= MAX_CHECK_OUTPUT) {
    try {
      const payload = JSON.parse(result.stdout);
      const updates = payload && payload.updates;
      if (Array.isArray(updates) && updates.length && updates.every((update) =>
        update && ['component', 'id', 'label', 'current', 'available'].every((field) =>
          typeof update[field] === 'string' && update[field].trim().length > 0) &&
        update.current !== update.available)) {
        console.log(JSON.stringify({ updates }));
      }
    } catch {
      // Empty, malformed or noisy stdout is not an actionable update response.
    }
  }
  process.exit();
}

if (result.error) {
  if (command !== 'check') {
    console.error(result.error.message);
    process.exitCode = 1;
  }
  process.exit();
}

process.exitCode = result.signal ? 1 : (result.status ?? 1);