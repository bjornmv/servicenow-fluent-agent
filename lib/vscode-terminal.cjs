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
  if (!path.win32.isAbsolute(executable) || path.win32.basename(executable).toLowerCase() !== 'git.exe') {
    throw new Error('Expected an absolute path to the verified git.exe.');
  }
  if (/[;\r\n]/.test(executable) || executable.includes('${')) throw new Error('Git path cannot be represented safely in a VS Code PATH setting.');
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) {
    throw new Error(`Git is not runnable at ${executable}; stop for review, do not install a replacement. ${result.error?.message || result.stderr || 'Nonzero exit'}`);
  }
  const version = result.stdout.trim();
  const match = /^git version (\d+)\.(\d+)\.(\d+)(?:\.windows\.\d+)?$/.exec(version);
  if (!match || Number(match[1]) < 2 || (Number(match[1]) === 2 && Number(match[2]) < 54)) {
    throw new Error(`Git must be a working stable version >=2.54.0: ${version}`);
  }
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
    try {
      if (fs.statSync(candidate).isFile()) return verifyGit(candidate);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  throw new Error('No Git executable found. Complete the approved Git prerequisite first, or pass --git-exe <absolute path>. No Git was installed.');
}

function planTerminalSettings(original, gitExe) {
  const settings = object(parseJsonc(original), 'VS Code settings');
  if (Object.hasOwn(settings, profilesKey)) object(settings[profilesKey], profilesKey);
  const profiles = settings[profilesKey] || {};
  let text = original;
  if (!Object.hasOwn(profiles, profileName)) {
    text = setJsoncValue(text, [profilesKey, profileName], defaultProfile);
  } else {
    object(profiles[profileName], profileName);
  }
  const profile = profiles[profileName] || defaultProfile;
  if (Object.hasOwn(profile, 'env')) object(profile.env, `${profileName}.env`);
  const env = profile.env || {};
  const keys = Object.keys(env).filter(key => key.toLowerCase() === 'path');
  if (keys.length > 1) throw new Error('Ambiguous PATH/Path keys in terminal profile; review rather than overwrite.');
  const key = keys[0] || 'Path';
  const globalEnvKey = 'terminal.integrated.env.windows';
  const globalEnv = Object.hasOwn(settings, globalEnvKey) ? object(settings[globalEnvKey], globalEnvKey) : {};
  const globalPathKeys = Object.keys(globalEnv).filter(name => name.toLowerCase() === 'path');
  if (globalPathKeys.length > 1) throw new Error('Ambiguous global terminal PATH/Path keys; review existing settings.');
  const inherited = globalPathKeys.length ? globalEnv[globalPathKeys[0]] : '${env:Path}';
  const previous = keys.length ? env[key] : inherited;
  if (typeof previous !== 'string') throw new Error('Terminal PATH is disabled or not a string; review existing customization.');
  // Explicit terminal environment: no dependence on the parent Code/Explorer
  // process noticing registry changes. Preserve all other PATH entries/settings.
  const gitDirectory = path.win32.dirname(gitExe);
  const normalize = value => value.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const remaining = previous.split(';').filter(entry => normalize(entry) !== normalize(gitDirectory));
  const terminalPath = [gitDirectory, ...remaining].join(';');
  text = setJsoncValue(text, [profilesKey, profileName, 'env', key], terminalPath);
  text = setJsoncValue(text, ['terminal.integrated.defaultProfile.windows'], profileName);
  return { text, gitDirectory, terminalPath };
}

function prepareTerminalSettings(file, explicitGit) {
  const git = findGit(explicitGit);
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}\n';
  return { file, original, git, ...planTerminalSettings(original, git.executable) };
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

module.exports = { profileName, profilesKey, sdkCommand, defaultProfile, findGit, verifyGit, planTerminalSettings, prepareTerminalSettings, writeTerminalSettings };
