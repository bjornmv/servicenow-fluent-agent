'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseJsonc, setJsoncValue } = require('./jsonc-settings.cjs');
const profileName = 'PowerShell with now-sdk';
const profilesKey = 'terminal.integrated.profiles.windows';
const sdkCommand = "function global:now-sdk { $sdk = '.\\node_modules\\@servicenow\\sdk\\bin\\index.js'; if (!(Test-Path $sdk)) { $sdk = Join-Path $env:APPDATA 'npm\\node_modules\\@servicenow\\sdk\\bin\\index.js' }; & node.exe $sdk @args }";
const defaultProfile = {
  path: '${env:windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', sdkCommand],
};

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object; review existing settings instead of overwriting them.`);
  return value;
}

function verifyGit(executable) {
  if (!/^[a-z]:[\\/]/i.test(executable) || path.win32.basename(executable).toLowerCase() !== 'git.exe') throw new Error('Expected an absolute local path to the verified git.exe.');
  if (/[;\r\n%]/.test(executable)) throw new Error('Git path cannot be represented safely in Windows user PATH.');
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) throw new Error(`Git is not runnable at ${executable}; stop for review, do not install a replacement. ${result.error?.message || result.stderr || 'Nonzero exit'}`);
  const version = result.stdout.trim();
  const match = /^git version (\d+)\.(\d+)\.(\d+)(?:\.windows\.\d+)?$/.exec(version);
  if (!match || Number(match[1]) < 2 || (Number(match[1]) === 2 && Number(match[2]) < 54)) throw new Error(`Git must be a working stable version >=2.54.0: ${version}`);
  return { executable, version };
}

function findGit(explicit, env = process.env) {
  if (explicit) return verifyGit(explicit);
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
  const candidates = (env[pathKey] || '').split(';').filter(Boolean).map(dir => path.win32.join(dir.replace(/^"|"$/g, ''), 'git.exe'));
  for (const root of [env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']]) {
    if (root) candidates.push(path.win32.join(root, 'Git', 'cmd', 'git.exe'));
  }
  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isFile()) return verifyGit(candidate); }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  throw new Error('No Git executable found. Complete the approved Git prerequisite first, or pass --git-exe <absolute path>. No Git was installed.');
}

// Migration only. Do not create any new shell-specific Git PATH setting.
function removeLegacyGitOverrides(original, gitExe) {
  const settings = object(parseJsonc(original), 'VS Code settings');
  const profiles = settings[profilesKey];
  if (profiles === undefined) return original;
  object(profiles, profilesKey);
  if (!Object.hasOwn(profiles, profileName)) return original;
  const profile = object(profiles[profileName], profileName);
  const directory = path.win32.dirname(gitExe);
  const literal = directory.replaceAll("'", "''");
  const begin = '# sn-fluent-agent:git-path:start';
  const end = '# sn-fluent-agent:git-path:end';
  const generated = `${begin}\n$env:Path = '${literal};' + (($env:Path -split ';' | Where-Object { $_ -ine '${literal}' }) -join ';');\n${end}\n`;
  let text = original;
  let owned = false;
  if (Array.isArray(profile.args)) {
    const args = [...profile.args];
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] !== 'string') continue;
      if (args[i].includes(begin) || args[i].includes(end)) {
        if (!args[i].startsWith(generated) || args[i].slice(generated.length).includes(begin) || args[i].slice(generated.length).includes(end)) throw new Error('Legacy Git startup block was modified; review before removing it.');
        args[i] = args[i].slice(generated.length);
        owned = true;
      }
      if (args[i] === sdkCommand) owned = true;
    }
    if (args.some((arg, i) => arg !== profile.args[i])) text = setJsoncValue(text, [profilesKey, profileName, 'args'], args);
  }
  if (profile.env !== undefined) {
    const env = object(profile.env, `${profileName}.env`);
    const keys = Object.keys(env).filter(key => key.toLowerCase() === 'path');
    if (keys.length > 1) throw new Error('Ambiguous profile PATH keys; review before migration.');
    const key = keys[0];
    const value = env[key];
    // Remove only our known prefix from the owned SDK profile, never another
    // profile or unrelated PATH entries/custom initialization.
    if (owned && typeof value === 'string' && value.toLowerCase().startsWith((directory + ';').toLowerCase())) {
      const remaining = value.slice(directory.length + 1);
      const next = { ...env };
      if (remaining === '${env:Path}') delete next[key];
      else next[key] = remaining;
      text = setJsoncValue(text, [profilesKey, profileName, 'env'], next);
    }
  }
  return text;
}

function planTerminalSettings(original, gitExe, { cleanupOnly = false } = {}) {
  let text = removeLegacyGitOverrides(original, gitExe);
  if (!cleanupOnly) {
    const settings = parseJsonc(text);
    const profiles = settings[profilesKey] || {};
    if (!Object.hasOwn(profiles, profileName)) text = setJsoncValue(text, [profilesKey, profileName], defaultProfile);
    text = setJsoncValue(text, ['terminal.integrated.defaultProfile.windows'], profileName);
  }
  return { text };
}

function prepareTerminalSettings(file, explicitGit, options) {
  const git = findGit(explicitGit);
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}\n';
  return { file, original, git, ...planTerminalSettings(original, git.executable, options) };
}

function writeTerminalSettings(plan, { dryRun = false } = {}) {
  const current = fs.existsSync(plan.file) ? fs.readFileSync(plan.file, 'utf8') : '{}\n';
  if (current !== plan.original) throw new Error('VS Code settings changed during configuration; stop and retry after review.');
  if (plan.text === plan.original) return { status: 'unchanged' };
  const backup = `${plan.file}.servicenow-fluent-agent.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(plan.file), { recursive: true });
    if (fs.existsSync(plan.file)) fs.copyFileSync(plan.file, backup, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(plan.file, plan.text, 'utf8');
  }
  return { status: dryRun ? 'would update' : 'updated', backup };
}

module.exports = { profileName, profilesKey, sdkCommand, defaultProfile, findGit, verifyGit, removeLegacyGitOverrides, planTerminalSettings, prepareTerminalSettings, writeTerminalSettings };
