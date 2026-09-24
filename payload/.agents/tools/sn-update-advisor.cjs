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

const result = spawnSync(process.execPath, [cliPath, targetCommand, ...argv.slice(1)], {
  stdio: 'inherit',
});

if (result.error) {
  if (command !== 'check') {
    console.error(result.error.message);
    process.exitCode = 1;
  }
  process.exit();
}

if (command === 'check') process.exit();
process.exitCode = result.status || 0;