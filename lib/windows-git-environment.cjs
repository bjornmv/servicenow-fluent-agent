'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findGit, findPathShadow } = require('./vscode-terminal.cjs');

function environmentCommand(gitExe, root = path.resolve(__dirname, '..'), systemRoot = process.env.SystemRoot) {
  if (!systemRoot) throw new Error('Windows SystemRoot is unavailable.');
  return {
    executable: path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
      path.join(root, 'tools/win-git-bootstrap/scripts/Ensure-MinGit254.ps1'),
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

function configureWindowsGit({ gitExe, dryRun = false } = {}) {
  if (process.platform !== 'win32') throw new Error('Windows user environment configuration requires Windows.');
  const git = findGit(gitExe);
  if (dryRun) return { git, shadowedBy: detectPathShadow(git.executable), status: 'would register user PATH and request native Windows environment propagation', liveTerminalVerified: false };
  const command = environmentCommand(git.executable);
  const result = spawnSync(command.executable, command.args, { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0 || !result.stdout.includes('ENVIRONMENT UPDATED for ')) {
    throw new Error(`Windows Git environment update incomplete; do not reinstall Git or bypass policy. ${result.error?.message || result.stderr || result.stdout || 'No verified result'}`);
  }
  return { git, shadowedBy: detectPathShadow(git.executable), status: 'user PATH verified; native Windows environment update requested', log: result.stdout.trim(), liveTerminalVerified: false };
}

module.exports = { configureWindowsGit, environmentCommand, detectPathShadow, expandEnvironment, parseRegistryPath, readRegistryPath };
