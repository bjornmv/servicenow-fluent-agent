'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseJsonc, setJsoncValue } = require('./jsonc-settings.cjs');
const profileName = 'PowerShell with now-sdk';
const profilesKey = 'terminal.integrated.profiles.windows';
const terminalEnvKey = 'terminal.integrated.env.windows';
const minimumGit = '2.54.0';
const managedGitForm = '${env:LOCALAPPDATA}\\Programs\\Git\\cmd';
const nowSdkFunction = "function global:now-sdk { $sdk = '.\\node_modules\\@servicenow\\sdk\\bin\\index.js'; if (!(Test-Path $sdk)) { $sdk = Join-Path $env:APPDATA 'npm\\node_modules\\@servicenow\\sdk\\bin\\index.js' }; & node.exe $sdk @args }";
// OS-neutral skill helper entry point (payload .agents/tools/sn-skill.cjs). USERPROFILE,
// not $HOME: PowerShell 5.1 derives $HOME from HOMEDRIVE/HOMEPATH, which can be a
// redirected share, while the installer writes to os.homedir() (USERPROFILE).
const skillFunction = "function global:sn-skill { & node.exe (Join-Path $env:USERPROFILE '.agents\\tools\\sn-skill.cjs') @args }";
const sdkCommand = `${nowSdkFunction}\n${skillFunction}`;
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
  if (!match || Number(match[1]) < 2 || (Number(match[1]) === 2 && Number(match[2]) < 54)) throw new Error(`Git must be a working stable version >=${minimumGit}: ${version}`);
  return { executable, version };
}

function isFile(candidate) {
  try { return fs.statSync(candidate).isFile(); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
}

function managedGitDirectory(env = process.env) {
  return env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'Programs', 'Git', 'cmd') : null;
}

// Same order as setup discovery and the MinGit worker: the per-user managed copy
// first (so a blocked system Git need not be launched), then PATH, then the
// standard machine locations.
function gitCandidates(env = process.env) {
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
  const managed = managedGitDirectory(env);
  const candidates = managed ? [path.win32.join(managed, 'git.exe')] : [];
  candidates.push(...(env[pathKey] || '').split(';').filter(Boolean).map(dir => path.win32.join(dir.replace(/^"|"$/g, ''), 'git.exe')));
  for (const root of [env.ProgramFiles, env['ProgramFiles(x86)']]) {
    if (root) candidates.push(path.win32.join(root, 'Git', 'cmd', 'git.exe'));
  }
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = path.win32.normalize(candidate).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Selects the first usable Git. A copy that cannot run (for example one blocked
// by application control) or is too old is skipped and reported, never touched.
function findGit(explicit, env = process.env, { verify = verifyGit, exists = isFile } = {}) {
  if (explicit) return verify(explicit);
  const unusable = [];
  for (const candidate of gitCandidates(env)) {
    if (!exists(candidate)) continue;
    try { return { ...verify(candidate), unusable }; }
    catch (error) { unusable.push(`${candidate} (${error.message.split('\n')[0]})`); }
  }
  if (unusable.length) throw new Error(`No usable Git >=${minimumGit} found. Unusable copies, left untouched: ${unusable.join('; ')}. Install the pinned MinGit side by side with the Git setup procedure, or pass --git-exe <absolute path>. No Git was installed.`);
  throw new Error('No Git executable found. Complete the approved Git prerequisite first, or pass --git-exe <absolute path>. No Git was installed.');
}

function samePath(a, b) {
  const clean = value => path.win32.normalize(value.trim().replace(/^"|"$/g, '')).replace(/\\+$/, '').toLowerCase();
  return clean(a) === clean(b);
}

// New Windows processes get machine PATH first, then user PATH. Returns the
// first other git.exe that bare `git` would resolve before gitExe, or null.
function findPathShadow(gitExe, { machinePath = '', userPath = '', exists = isFile } = {}) {
  const directory = path.win32.dirname(gitExe);
  for (const raw of `${machinePath};${userPath}`.split(';')) {
    const entry = raw.trim().replace(/^"|"$/g, '');
    if (!entry || /%/.test(entry)) continue;
    if (samePath(entry, directory)) return null;
    const candidate = path.win32.join(entry, 'git.exe');
    if (exists(candidate)) return candidate;
  }
  return null;
}

function hasManagedForm(entry, directory, env) {
  const managed = managedGitDirectory(env);
  return samePath(entry, directory) || (managed && samePath(directory, managed) && samePath(entry.replace(/\$\{env:LOCALAPPDATA\}/i, env.LOCALAPPDATA), managed));
}

// Shadowed selection: make VS Code terminals and Source Control use the
// selected Git without touching machine PATH, other Git copies or shell code.
function applyGitSelection(original, gitExe, env = process.env) {
  const settings = parseJsonc(original);
  const directory = path.win32.dirname(gitExe);
  const warnings = [];
  let text = original;
  const terminalEnv = settings[terminalEnvKey];
  if (terminalEnv === undefined) {
    text = setJsoncValue(text, [terminalEnvKey], { Path: `${directory};\${env:Path}` });
  } else {
    object(terminalEnv, terminalEnvKey);
    const keys = Object.keys(terminalEnv).filter(key => key.toLowerCase() === 'path');
    if (keys.length > 1) throw new Error(`Ambiguous PATH keys in ${terminalEnvKey}; review before selecting Git.`);
    const key = keys[0] || 'Path';
    const value = terminalEnv[key];
    if (value !== undefined && typeof value !== 'string') throw new Error(`${terminalEnvKey}.${key} is not a string; review before selecting Git.`);
    if (value === undefined) text = setJsoncValue(text, [terminalEnvKey, key], `${directory};\${env:Path}`);
    else if (!hasManagedForm(value.split(';')[0], directory, env)) text = setJsoncValue(text, [terminalEnvKey, key], `${directory};${value}`);
  }
  const current = settings['git.path'];
  if (current === undefined || current === null || current === '') text = setJsoncValue(text, ['git.path'], gitExe);
  else if (typeof current !== 'string' || !samePath(current, gitExe)) warnings.push(`git.path already selects ${JSON.stringify(current)}; left unchanged, so Source Control may use a different Git than terminals.`);
  return { text, warnings };
}

// PowerShell resolves a function before any application of the same name, so
// when a non-working Git shadows the selected one in Windows PATH this function
// makes `git` in SDK-profile terminals run the selected Git whatever PATH says.
// Same markers and body as docs/fix-vscode-git.md, so both recognize each other.
const approvedGitStart = '# sn-fluent-agent:approved-user-git:start';
const approvedGitEnd = '# sn-fluent-agent:approved-user-git:end';
const managedGitExpression = "Join-Path $env:LOCALAPPDATA 'Programs\\Git\\cmd\\git.exe'";
const approvedGitBlock = `${approvedGitStart}
function global:git {
    $approvedGit = ${managedGitExpression}
    if (-not (Test-Path -LiteralPath $approvedGit -PathType Leaf)) {
        $global:LASTEXITCODE = 1
        throw 'Approved per-user Git is missing. Do not fall back to system Git.'
    }
    $global:LASTEXITCODE = $null
    & $approvedGit @args
    if ($null -eq $global:LASTEXITCODE) {
        throw 'Approved Git did not return a native exit code. Stop and inspect the launch error.'
    }
}
${approvedGitEnd}`;
const squash = value => value.replace(/\s+/g, ' ').trim();
// Generated blocks differ only in the selected path expression.
const blockShape = value => squash(value.replace(/\$approvedGit = [^\r\n]+/, '$approvedGit = <selected>'));

function gitFunctionBlock(gitExe, env = process.env) {
  const managed = managedGitDirectory(env);
  if (managed && samePath(path.win32.dirname(gitExe), managed)) return approvedGitBlock;
  return approvedGitBlock.replace(managedGitExpression, `'${gitExe.replaceAll("'", "''")}'`);
}

// Owns the SDK profile's -Command string: the now-sdk and sn-skill functions are
// always present, and the Git function exactly when Git is shadowed.
// Other profiles and unrecognized customizations are left alone with a warning.
function ensureProfileFunctions(original, gitExe, { gitFunction = false, create = true, env = process.env } = {}) {
  const settings = parseJsonc(original);
  const warnings = [];
  const profiles = settings[profilesKey];
  if (profiles !== undefined) object(profiles, profilesKey);
  if (!profiles || !Object.hasOwn(profiles, profileName)) {
    if (!create) return { text: original, warnings };
    const command = gitFunction ? `${sdkCommand}\n${gitFunctionBlock(gitExe, env)}` : sdkCommand;
    return { text: setJsoncValue(original, [profilesKey, profileName], { ...defaultProfile, args: [...defaultProfile.args.slice(0, -1), command] }), warnings };
  }
  const profile = object(profiles[profileName], profileName);
  const args = Array.isArray(profile.args) ? [...profile.args] : [];
  const index = args.findIndex((arg, i) => typeof arg === 'string' && arg.toLowerCase() === '-command' && typeof args[i + 1] === 'string');
  if (index < 0) {
    warnings.push(`Profile "${profileName}" has no -Command string; the now-sdk, sn-skill${gitFunction ? ' and git' : ''} functions were not added. Review the custom profile.`);
    return { text: original, warnings };
  }
  let command = args[index + 1];
  const hasSdk = command.includes('function global:now-sdk');
  const hasSkill = command.includes('function global:sn-skill');
  if (!hasSdk) command = `${hasSkill ? nowSdkFunction : sdkCommand}\n${command}`;
  // Profiles from 0.3.x carry only the now-sdk function: add sn-skill beside it.
  else if (!hasSkill) command = command.includes(nowSdkFunction) ? command.replace(nowSdkFunction, sdkCommand) : `${skillFunction}\n${command}`;
  const start = command.indexOf(approvedGitStart);
  const end = start < 0 ? -1 : command.indexOf(approvedGitEnd, start);
  const expected = gitFunctionBlock(gitExe, env);
  if (start < 0) {
    if (gitFunction) command = `${command.replace(/\s+$/, '')}\n${expected}`;
  } else {
    const existing = end < 0 ? null : command.slice(start, end + approvedGitEnd.length);
    const generated = existing && command.indexOf(approvedGitStart, start + 1) < 0 && blockShape(existing) === blockShape(approvedGitBlock);
    if (!generated) {
      warnings.push(`Profile "${profileName}" has a modified approved-user-git block; left unchanged. Review it so git runs ${gitFunction ? gitExe : 'the PATH-resolved Git'}.`);
    } else if (gitFunction) {
      if (squash(existing) !== squash(expected)) command = command.slice(0, start) + expected + command.slice(end + approvedGitEnd.length);
    } else {
      command = command.slice(0, start).replace(/\s+$/, '') + command.slice(end + approvedGitEnd.length).replace(/^[ \t]*\r?\n?/, '');
    }
  }
  if (command === args[index + 1]) return { text: original, warnings };
  args[index + 1] = command;
  return { text: setJsoncValue(original, [profilesKey, profileName, 'args'], args), warnings };
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
      if ([sdkCommand, nowSdkFunction].includes(args[i])) owned = true;
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

function planTerminalSettings(original, gitExe, { cleanupOnly = false, shadowedBy = null, env = process.env } = {}) {
  let text = removeLegacyGitOverrides(original, gitExe);
  const warnings = [];
  if (shadowedBy) {
    const selection = applyGitSelection(text, gitExe, env);
    text = selection.text;
    warnings.push(...selection.warnings);
  }
  // configure-git (cleanupOnly) creates and selects the SDK profile only when
  // the Git function needs a home; otherwise it only maintains an existing one.
  const manageProfile = !cleanupOnly || Boolean(shadowedBy);
  const profile = ensureProfileFunctions(text, gitExe, { gitFunction: Boolean(shadowedBy), create: manageProfile, env });
  text = profile.text;
  warnings.push(...profile.warnings);
  if (manageProfile) text = setJsoncValue(text, ['terminal.integrated.defaultProfile.windows'], profileName);
  return { text, warnings };
}

function prepareTerminalSettings(file, explicitGit, options = {}) {
  const git = findGit(explicitGit);
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}\n';
  return { file, original, git, ...planTerminalSettings(original, git.executable, options) };
}

function writeTerminalSettings(plan, { dryRun = false } = {}) {
  const current = fs.existsSync(plan.file) ? fs.readFileSync(plan.file, 'utf8') : '{}\n';
  if (current !== plan.original) throw new Error('VS Code settings changed during configuration; stop and retry after review.');
  if (plan.text === plan.original) return { status: 'unchanged' };
  const hadFile = fs.existsSync(plan.file);
  // A new settings file has nothing to back up; only report a backup that exists (or would).
  const backup = hadFile ? `${plan.file}.servicenow-fluent-agent.${new Date().toISOString().replace(/[:.]/g, '-')}.bak` : undefined;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(plan.file), { recursive: true });
    if (hadFile) fs.copyFileSync(plan.file, backup, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(plan.file, plan.text, 'utf8');
  }
  return { status: dryRun ? 'would update' : 'updated', backup };
}

module.exports = { profileName, profilesKey, terminalEnvKey, managedGitForm, sdkCommand, nowSdkFunction, skillFunction, defaultProfile, approvedGitBlock, gitFunctionBlock, gitCandidates, findGit, verifyGit, findPathShadow, applyGitSelection, ensureProfileFunctions, removeLegacyGitOverrides, planTerminalSettings, prepareTerminalSettings, writeTerminalSettings };
