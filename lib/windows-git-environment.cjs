'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findGit } = require('./vscode-terminal.cjs');

function environmentCommand(gitExe, root = path.resolve(__dirname, '..'), systemRoot = process.env.SystemRoot) {
  if (!systemRoot) throw new Error('Windows SystemRoot is unavailable.');
  return {
    executable: path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
      path.join(root, 'payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1'),
      '-RefreshEnvironment', '-GitExecutable', gitExe],
  };
}

function configureWindowsGit({ gitExe, dryRun = false } = {}) {
  if (process.platform !== 'win32') throw new Error('Windows user environment configuration requires Windows.');
  const git = findGit(gitExe);
  if (dryRun) return { git, status: 'would register user PATH and request native Windows environment propagation', liveTerminalVerified: false };
  const command = environmentCommand(git.executable);
  const result = spawnSync(command.executable, command.args, { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0 || !result.stdout.includes('ENVIRONMENT UPDATED for ')) {
    throw new Error(`Windows Git environment update incomplete; do not reinstall Git or bypass policy. ${result.error?.message || result.stderr || result.stdout || 'No verified result'}`);
  }
  return { git, status: 'user PATH verified; native Windows environment update requested', log: result.stdout.trim(), liveTerminalVerified: false };
}

module.exports = { configureWindowsGit, environmentCommand };
