'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findGit, findPathShadow } = require('./vscode-terminal.cjs');

function environmentScript(root = path.resolve(__dirname, '..')) {
  return path.join(root, 'tools/win-git-bootstrap/scripts/Ensure-MinGit254.ps1');
}

function environmentCommand(gitExe, root = path.resolve(__dirname, '..'), systemRoot = process.env.SystemRoot) {
  if (!systemRoot) throw new Error('Windows SystemRoot is unavailable.');
  return {
    executable: path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
      environmentScript(root),
      '-RefreshEnvironment', '-GitExecutable', gitExe],
  };
}

function expandEnvironment(value, env = process.env) {
  return value.replace(/%([^%;]+)%/g, (all, name) => {
    const key = Object.keys(env).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key ? env[key] : all;
  });
}

// Parses `reg query <key> /v Path` output; reg separates fields with four spaces.
function parseRegistryPath(output) {
  const match = /^ {4}Path {4}(?:REG_EXPAND_SZ|REG_SZ) {4}(.*)$/m.exec(output);
  return match ? match[1].replace(/\r$/, '') : '';
}

function readRegistryPath(scope, env = process.env, run = spawnSync) {
  const key = scope === 'machine' ? 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' : 'HKCU\\Environment';
  const reg = path.win32.join(env.SystemRoot, 'System32', 'reg.exe');
  const result = run(reg, ['query', key, '/v', 'Path'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error) throw new Error(`Cannot read ${scope} PATH: ${result.error.message}`);
  // A user without a personal PATH value is normal; reg then exits 1.
  if (result.status !== 0) {
    if (scope === 'user') return '';
    throw new Error(`Cannot read machine PATH (reg exit ${result.status}).`);
  }
  return expandEnvironment(parseRegistryPath(result.stdout), env);
}

// Read-only. Which other git.exe would a NEW process find before gitExe?
function detectPathShadow(gitExe, env = process.env) {
  if (process.platform !== 'win32') return null;
  return findPathShadow(gitExe, { machinePath: readRegistryPath('machine', env), userPath: readRegistryPath('user', env) });
}

// PowerShell refuses an unsigned script that carries the download mark (Mark-of-the-Web),
// e.g. files extracted from a GitHub "Download ZIP". A Git clone has no such mark.
// The mark is checked directly (the Zone.Identifier stream); the error text alone also
// matches Restricted, AllSigned and application-control refusals, which Unblock-File cannot fix.
const NOT_SIGNED = /is not digitally signed/i;
const POLICY_REFUSED = /is not digitally signed|running scripts is disabled|UnauthorizedAccess|PSSecurityException/i;

function hasDownloadMark(file) {
  try { return fs.existsSync(file + ':Zone.Identifier'); } catch { return false; }
}

// Returns an Error for a failed environment update, or null when the worker verified it.
// `expected` marks a configuration problem: the CLI prints the message without a stack.
function environmentUpdateError(result, scriptPath = environmentScript(), markCheck = hasDownloadMark) {
  const output = String(result.stderr || '') + '\n' + String(result.stdout || '');
  if (!result.error && result.status === 0 && output.includes('ENVIRONMENT UPDATED for ')) return null;
  const firstLine = output.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  let error;
  if (!result.error && NOT_SIGNED.test(output) && markCheck(scriptPath)) {
    error = new Error('Windows blocked the Git setup script because this checkout\'s files carry the download mark '
      + '(files extracted from a downloaded ZIP). A Git clone has no such mark. '
      + 'Fix: run Unblock-File on the downloaded ZIP, extract it again and rerun install (or clone the repository with Git). '
      + `Do not change the execution policy.\nPowerShell said: ${firstLine}`);
  } else if (!result.error && POLICY_REFUSED.test(output)) {
    error = new Error('PowerShell execution policy or application control refused the unsigned Git setup script; the worker did not run. '
      + 'Ask your organization for approval or signing; do not change the execution policy.'
      + `\nPowerShell said: ${firstLine}`);
  } else {
    error = new Error(`Windows Git environment update incomplete; do not reinstall Git or bypass policy. ${result.error?.message || result.stderr || result.stdout || 'No verified result'}`);
  }
  error.expected = true;
  return error;
}

function configureWindowsGit({ gitExe, dryRun = false } = {}) {
  if (process.platform !== 'win32') throw new Error('Windows user environment configuration requires Windows.');
  const git = findGit(gitExe);
  if (dryRun) return { git, shadowedBy: detectPathShadow(git.executable), status: 'would register user PATH and request native Windows environment propagation', liveTerminalVerified: false };
  const command = environmentCommand(git.executable);
  const result = spawnSync(command.executable, command.args, { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const failure = environmentUpdateError(result);
  if (failure) throw failure;
  return { git, shadowedBy: detectPathShadow(git.executable), status: 'user PATH verified; native Windows environment update requested', log: result.stdout.trim(), liveTerminalVerified: false };
}

module.exports = { configureWindowsGit, environmentUpdateError, environmentCommand, detectPathShadow, expandEnvironment, parseRegistryPath, readRegistryPath };
