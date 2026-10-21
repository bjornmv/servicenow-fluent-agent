#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkUpdates, recordDecision } = require('../lib/update-advisor.cjs');
const { parseJsonc, setJsoncValue } = require('../lib/jsonc-settings.cjs');
const { findGit, prepareTerminalSettings, writeTerminalSettings, terminalEnvKey } = require('../lib/vscode-terminal.cjs');
const { configureWindowsGit, detectPathShadow } = require('../lib/windows-git-environment.cjs');
const { payloadFiles } = require('../lib/payload-files.cjs');
const { ensureShellFunction, removeShellFunction, ensureSkillShim, removeSkillShim, findGitBash } = require('../lib/posix-terminal.cjs');
const { generate: generateBaseline } = require('../tools/generate-baseline.cjs');

const PACKAGE_NAME = 'servicenow-fluent-agent';
const RECEIPT_NAME = '.servicenow-fluent-agent-install.json';
const repoRoot = path.resolve(__dirname, '..');
const payloadRoot = path.join(repoRoot, 'payload');
const home = os.homedir();
const agentsRoot = path.join(home, '.agents');
const receiptPath = path.join(agentsRoot, RECEIPT_NAME);
const backupRootBase = path.join(agentsRoot, '_backups', PACKAGE_NAME);

const argv = process.argv.slice(2);
// The command is the first argument; with none, or only options, it is install.
const explicitCommand = argv.length > 0 && !argv[0].startsWith('-');
const command = explicitCommand ? argv[0] : ['--help', '-h'].includes(argv[0]) ? 'help' : 'install';
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const dryRun = flags.has('--dry-run');
const force = flags.has('--force');
const noVscodeSettings = flags.has('--no-vscode-settings');
const noShellFunction = flags.has('--no-shell-function');
const isWindows = process.platform === 'win32';

function flagValues(flag) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values.push(value);
  }
  return values;
}

function flagValue(flag) {
  return flagValues(flag)[0];
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

// Options each command accepts. Anything else stops the command before it does any work,
// so a mistyped option never runs with defaults. `update` is an alias of `install`.
const COMMAND_OPTIONS = {
  install: { flags: ['--dry-run', '--force', '--no-vscode-settings', '--no-shell-function'], values: ['--git-exe', '--settings-file'] },
  'configure-git': { flags: ['--dry-run'], values: ['--git-exe'] },
  'configure-terminal': { flags: ['--dry-run'], values: ['--git-exe', '--settings-file'] },
  verify: { flags: ['--no-vscode-settings'], values: [] },
  status: { flags: [], values: [] },
  'check-updates': { flags: ['--force'], values: ['--only', '--project', '--docs', '--docs-branch'] },
  'update-decision': { flags: [], values: ['--component'], positionals: 1 },
  uninstall: { flags: ['--dry-run', '--force', '--no-shell-function'], values: [] },
  help: { flags: [], values: [] },
};

function argumentError() {
  const name = command === 'update' ? 'install' : command;
  if (!Object.prototype.hasOwnProperty.call(COMMAND_OPTIONS, name)) return `Unknown command: ${command}`;
  const allowed = COMMAND_OPTIONS[name];
  positionalArgs.length = 0;
  for (let index = explicitCommand || command === 'help' ? 1 : 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (allowed.values.includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) return `Missing value for ${arg}`;
      if (arg !== '--component' && argv.indexOf(arg) !== index) return `Duplicate option ${arg}`;
      index += 1;
    } else if (allowed.flags.includes(arg)) {
      if (argv.indexOf(arg) !== index) return `Duplicate option ${arg}`;
    } else if (arg.startsWith('-')) {
      return `Unknown option ${arg} for ${command}. Run help for usage.`;
    } else if (!explicitCommand && (arg === 'update' || Object.prototype.hasOwnProperty.call(COMMAND_OPTIONS, arg))) {
      return `Put the command first: node bin/sn-fluent-agent.cjs ${arg} [options].`;
    } else if (positionalArgs.push(arg) > (allowed.positionals || 0)) {
      return `Unexpected argument ${arg} for ${command}. Run help for usage.`;
    }
  }
  return '';
}

// Arguments after the command that are neither options nor option values; set by argumentError().
const positionalArgs = [];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function toSlash(value) {
  return value.replace(/\\/g, '/');
}

function ensureDir(dir) {
  if (!dryRun) fs.mkdirSync(dir, { recursive: true });
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function sha256Buffer(buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function readVersion() {
  return (readTextIfExists(path.join(repoRoot, 'VERSION')) || '0.0.0').trim();
}

function payloadRel(sourceFile) {
  return toSlash(path.relative(payloadRoot, sourceFile));
}

function targetForRel(rel) {
  return path.join(home, ...rel.split('/'));
}

function loadReceipt() {
  const text = readTextIfExists(receiptPath);
  if (!text) return { version: undefined, files: {} };
  try {
    const parsed = JSON.parse(text);
    if (!parsed.files || typeof parsed.files !== 'object') parsed.files = {};
    return parsed;
  } catch {
    return { version: undefined, files: {} };
  }
}

function writeReceipt(receipt) {
  ensureDir(path.dirname(receiptPath));
  if (!dryRun) fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
}

function backupFile(file, backupRoot, rel, summary) {
  if (!fs.existsSync(file)) return;
  const backupPath = path.join(backupRoot, ...rel.split('/'));
  summary.backups.push(toSlash(backupPath));
  if (dryRun) return;
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file, backupPath);
}

function copyPayloadFile(sourceFile, targetFile, backupRoot, rel, summary) {
  const sourceHash = sha256File(sourceFile);
  const previous = summary.previousReceipt.files[rel];
  const exists = fs.existsSync(targetFile);

  if (exists) {
    const currentHash = sha256File(targetFile);
    if (currentHash === sourceHash) {
      summary.unchanged.push(rel);
      summary.nextFiles[rel] = { sha256: sourceHash, target: toSlash(targetFile) };
      return;
    }

    const previousHash = previous && previous.sha256;
    const locallyModified = previousHash && currentHash !== previousHash;
    if (locallyModified && !force) {
      summary.skippedConflicts.push(rel);
      summary.nextFiles[rel] = previous;
      return;
    }

    backupFile(targetFile, backupRoot, rel, summary);
  }

  summary.copied.push(rel);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
  summary.nextFiles[rel] = { sha256: sourceHash, target: toSlash(targetFile) };
}

// Removes directories left empty by a managed-file removal, up to but not including the
// profile roots the payload installs into (.agents, .copilot). Directories that still hold
// anything (user files) are kept.
const managedRoots = [agentsRoot, path.join(home, '.copilot')];

function removeEmptyParents(file) {
  const root = managedRoots.find((candidate) => file.startsWith(candidate + path.sep));
  if (!root) return;
  for (let dir = path.dirname(file); dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
    try {
      if (fs.readdirSync(dir).length) return;
      fs.rmdirSync(dir);
    } catch {
      return;
    }
  }
}

// Earlier installs removed retired skill files without their folders. Remove skill folders
// that hold only empty directories; a folder with any file in it is left alone.
function removeEmptySkillDirs() {
  const skillsRoot = path.join(agentsRoot, 'skills');
  const prune = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    let empty = true;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !prune(path.join(dir, entry.name))) empty = false;
    }
    if (!empty) return false;
    try { fs.rmdirSync(dir); return true; } catch { return false; }
  };
  let skills;
  try { skills = fs.readdirSync(skillsRoot, { withFileTypes: true }); } catch { return; }
  for (const entry of skills) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) prune(path.join(skillsRoot, entry.name));
  }
}

function removeObsoleteFiles(payloadRels, backupRoot, summary) {
  for (const rel of Object.keys(summary.previousReceipt.files || {}).sort()) {
    if (payloadRels.has(rel)) continue;
    const previous = summary.previousReceipt.files[rel];
    const target = targetForRel(rel);
    if (!fs.existsSync(target)) {
      summary.removedMissing.push(rel);
      if (!dryRun) removeEmptyParents(target);
      continue;
    }

    const currentHash = sha256File(target);
    const safe = force || currentHash === previous.sha256;
    if (!safe) {
      summary.skippedObsoleteConflicts.push(rel);
      summary.nextFiles[rel] = previous;
      continue;
    }

    backupFile(target, backupRoot, rel, summary);
    summary.removedObsolete.push(rel);
    if (!dryRun) {
      fs.unlinkSync(target);
      removeEmptyParents(target);
    }
  }
}

// VS Code settings file the installer patches. Windows is unchanged (desktop User
// settings under %APPDATA%). Elsewhere: --settings-file or SN_FLUENT_VSCODE_SETTINGS
// wins, e.g. a VS Code server's Machine settings (`code serve-web` keeps User settings
// in the browser, so <server-data-dir>/data/Machine/settings.json is the file-based
// target); otherwise the desktop User settings for the platform.
function settingsPath() {
  const override = flagValue('--settings-file') || process.env.SN_FLUENT_VSCODE_SETTINGS;
  if (override) return path.resolve(override);
  if (isWindows) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Code', 'User', 'settings.json');
  }
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  const configHome = process.env.XDG_CONFIG_HOME && path.isAbsolute(process.env.XDG_CONFIG_HOME)
    ? process.env.XDG_CONFIG_HOME
    : path.join(home, '.config');
  return path.join(configHome, 'Code', 'User', 'settings.json');
}

// Home-relative forms VS Code documents for user-level chat locations (resolved
// against the remote user's home on VS Code server/serve-web). Written beside the
// absolute paths that older installs used.
const TILDE_AGENTS = '~/.copilot/agents';
const TILDE_INSTRUCTIONS = '~/.agents/instructions';
const TILDE_SKILLS = '~/.agents/skills';

function ensureObjectSetting(settings, key) {
  if (!settings[key] || typeof settings[key] !== 'object' || Array.isArray(settings[key])) {
    settings[key] = {};
  }
  return settings[key];
}

function configureVsCodeSettings(summary) {
  const shadowedBy = summary.windowsGit?.shadowedBy || null;
  if (noVscodeSettings) {
    summary.vscodeSettings = 'skipped (--no-vscode-settings)';
    if (shadowedBy) summary.gitSelectionWarnings = [`VS Code Git selection skipped: ${shadowedBy} precedes the selected Git in Windows PATH. Run configure-git, or add the profile git function, ${terminalEnvKey} prefix and git.path as in docs/fix-vscode-git.md.`];
    return;
  }

  const file = settingsPath();
  summary.vscodeSettingsFile = toSlash(file);
  const original = readTextIfExists(file) ?? '{}\n';
  // SDK profile, plus VS Code Git selection only when another Git shadows the
  // selected one in Windows PATH. Git PATH itself is the Windows user environment.
  const gitExe = summary.windowsGit?.git.executable || flagValue('--git-exe');
  const terminal = isWindows ? prepareTerminalSettings(file, gitExe, { shadowedBy }) : null;
  let updated = terminal ? terminal.text : original;
  if (terminal) {
    summary.vscodeGit = terminal.git;
    summary.gitSelectionWarnings = terminal.warnings;
  }
  let settings;

  try {
    settings = parseJsonc(updated);
  } catch (error) {
    summary.vscodeSettings = `skipped (could not parse ${file}: ${error.message})`;
    summary.vscodeManualSettings = requiredSettingsBlock();
    return;
  }

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    summary.vscodeSettings = `skipped (${file} is not a JSON object)`;
    summary.vscodeManualSettings = requiredSettingsBlock();
    return;
  }

  const agentPath = toSlash(path.join(home, '.copilot', 'agents'));
  const instructionsPath = toSlash(path.join(home, '.agents', 'instructions'));
  const skillsPath = toSlash(path.join(home, '.agents', 'skills'));

  let changed = updated !== original;

  function setScalar(key, value) {
    updated = setJsoncValue(updated, [key], value);
    if (settings[key] !== value) {
      settings[key] = value;
      changed = true;
    }
  }

  function setMapValue(key, mapKey, value) {
    updated = setJsoncValue(updated, [key, mapKey], value);
    const object = ensureObjectSetting(settings, key);
    if (object[mapKey] !== value) {
      object[mapKey] = value;
      changed = true;
    }
  }

  setScalar('chat.promptFiles', true);
  setScalar('github.copilot.chat.codeGeneration.useInstructionFiles', true);
  // Agent-host terminal tool; avoids Copilot terminal errors with the SDK profile.
  setScalar('chat.agentHost.customTerminalTool.enabled', true);
  setMapValue('chat.agentFilesLocations', agentPath, true);
  setMapValue('chat.agentFilesLocations', TILDE_AGENTS, true);
  setMapValue('chat.instructionsFilesLocations', instructionsPath, true);
  setMapValue('chat.instructionsFilesLocations', TILDE_INSTRUCTIONS, true);
  setMapValue('chat.instructionsFilesLocations', '.github/instructions', true);
  // VS Code 1.142 reads chat.agentSkillsLocations; chat.skillsFilesLocations is the older key.
  setMapValue('chat.agentSkillsLocations', TILDE_SKILLS, true);
  setMapValue('chat.skillsFilesLocations', skillsPath, true);

  if (!changed) {
    summary.vscodeSettings = 'unchanged';
    return;
  }

  const result = writeTerminalSettings({ file, original, text: updated }, { dryRun });
  summary.vscodeSettings = result.status;
  if (result.backup) summary.vscodeSettingsBackup = toSlash(result.backup);
}

function requiredSettingsBlock() {
  const agentPath = toSlash(path.join(home, '.copilot', 'agents'));
  const instructionsPath = toSlash(path.join(home, '.agents', 'instructions'));
  const skillsPath = toSlash(path.join(home, '.agents', 'skills'));
  return {
    'chat.promptFiles': true,
    'github.copilot.chat.codeGeneration.useInstructionFiles': true,
    'chat.agentHost.customTerminalTool.enabled': true,
    'chat.agentFilesLocations': { [agentPath]: true, [TILDE_AGENTS]: true },
    'chat.instructionsFilesLocations': { [instructionsPath]: true, [TILDE_INSTRUCTIONS]: true, '.github/instructions': true },
    'chat.agentSkillsLocations': { [TILDE_SKILLS]: true },
    'chat.skillsFilesLocations': { [skillsPath]: true },
  };
}

// Linux/macOS: now-sdk shell function plus the acceptance notes printed after install.
function posixInstallNotes() {
  const shell = noShellFunction ? { status: 'skipped (--no-shell-function)' } : ensureShellFunction(home, { dryRun });
  const shim = noShellFunction ? { status: 'skipped (--no-shell-function)' } : ensureSkillShim(home, { dryRun });
  const notes = [`now-sdk shell function: ${shell.status}${shell.file ? ` (${toSlash(shell.file)})` : ''}`];
  notes.push(`sn-skill command: ${shim.status}${shim.file ? ` (${toSlash(shim.file)})` : ''}`);
  notes.push('', 'For SDK acceptance, open a NEW VS Code terminal (bash). `type now-sdk` must report a shell function and `sn-skill list` must print the helper names before running now-sdk --version.');
  if (!flagValue('--settings-file') && !process.env.SN_FLUENT_VSCODE_SETTINGS) {
    notes.push('On a VS Code server (`code serve-web`, Remote), User settings live in the browser: point --settings-file / SN_FLUENT_VSCODE_SETTINGS at <server-data-dir>/data/Machine/settings.json.');
  }
  if (process.platform === 'linux' && !process.env.DBUS_SESSION_BUS_ADDRESS) {
    notes.push('WARNING: no D-Bus session. now-sdk stores OAuth credentials in the Secret Service (gnome-keyring); without one they are lost on restart or cannot be stored. Start a session bus and an unlocked gnome-keyring before `now-sdk auth --add`.');
  }
  return notes;
}

function install() {
  if (!fs.existsSync(payloadRoot)) {
    fail(`Payload directory not found: ${payloadRoot}`);
    return;
  }

  generateBaseline(repoRoot, true); // fail before settings/PATH/payload writes on stale generated guidance
  const version = readVersion();
  const previousReceipt = loadReceipt();
  const backupRoot = path.join(backupRootBase, timestamp());
  const sourceFiles = payloadFiles(payloadRoot);
  const payloadRels = new Set(sourceFiles.map(payloadRel));
  const summary = {
    command: 'install',
    version,
    home: toSlash(home),
    dryRun,
    force,
    previousReceipt,
    nextFiles: {},
    copied: [],
    unchanged: [],
    skippedConflicts: [],
    skippedObsoleteConflicts: [],
    removedObsolete: [],
    removedMissing: [],
    backups: [],
  };

  if (isWindows) summary.windowsGit = configureWindowsGit({ gitExe: flagValue('--git-exe'), dryRun });
  // Git Bash only: other agent hosts (Claude Code, pi) run Git Bash on Windows, where the
  // PowerShell profile function does not exist. VS Code agents use the profile function.
  if (isWindows && !noShellFunction && findGitBash()) summary.gitBashShim = ensureSkillShim(home, { dryRun, windows: true });
  configureVsCodeSettings(summary);
  if (!isWindows) summary.posixNotes = posixInstallNotes();
  for (const sourceFile of sourceFiles) {
    const rel = payloadRel(sourceFile);
    copyPayloadFile(sourceFile, targetForRel(rel), backupRoot, rel, summary);
  }

  removeObsoleteFiles(payloadRels, backupRoot, summary);
  if (!dryRun) removeEmptySkillDirs();

  const receipt = {
    packageName: PACKAGE_NAME,
    version,
    installedAt: new Date().toISOString(),
    repoRoot: toSlash(repoRoot),
    payloadRoot: toSlash(payloadRoot),
    // Windows: the session hook puts this Git first, as VS Code terminals do.
    ...(summary.windowsGit ? { gitExe: summary.windowsGit.git.executable } : {}),
    files: summary.nextFiles,
  };

  writeReceipt(receipt);

  printInstallSummary(summary, Object.keys(receipt.files).length);
}

function configureGit() {
  if (process.platform !== 'win32') throw new Error('configure-git requires Windows.');
  const git = findGit(flagValue('--git-exe'));
  // Read-only; checked before any change so settings problems stop early.
  const shadowedBy = detectPathShadow(git.executable);
  const plan = prepareTerminalSettings(settingsPath(), git.executable, { cleanupOnly: true, shadowedBy });
  const result = configureWindowsGit({ gitExe: plan.git.executable, dryRun });
  const settings = writeTerminalSettings(plan, { dryRun });
  console.log(`Windows Git environment: ${result.status}`);
  if (result.log) console.log(result.log);
  console.log(`VS Code Git settings: ${settings.status}`);
  if (settings.backup) console.log(`Settings backup: ${settings.backup}`);
  printGitSelection(plan.git, shadowedBy, plan.warnings);
  console.log('Restart affected terminal applications from a refreshed launcher. Existing processes are not forced to refresh or killed.');
}

function printGitSelection(git, shadowedBy, warnings = []) {
  console.log(`Selected Git: ${git.executable} (${git.version})`);
  for (const entry of git.unusable || []) console.log(`Unusable Git left untouched: ${entry}`);
  if (shadowedBy) {
    console.log(`Shadowed in Windows PATH by: ${shadowedBy}`);
    console.log(`PowerShell with now-sdk terminals run the selected Git through a git function beside now-sdk; VS Code terminals prepend its directory (${terminalEnvKey}) for child processes; Source Control uses git.path. Other terminal applications still resolve ${shadowedBy}; use the absolute path there.`);
  } else {
    console.log('Bare git resolves to the selected Git in new processes after the user PATH update.');
  }
  for (const warning of warnings) console.log(`WARNING: ${warning}`);
  console.log('Verify bare git --version in a NEW VS Code terminal and in any other terminal host you use.');
}

function configureTerminal() {
  if (!isWindows) {
    const result = ensureShellFunction(home, { dryRun });
    const shim = ensureSkillShim(home, { dryRun });
    console.log(`now-sdk shell function (${toSlash(result.file)}): ${result.status}`);
    console.log(`sn-skill command (${toSlash(shim.file)}): ${shim.status}`);
    console.log('Open a NEW VS Code terminal (bash); `type now-sdk` must report a shell function and `sn-skill list` must print the helper names before running now-sdk --version.');
    return;
  }
  const git = findGit(flagValue('--git-exe'));
  // Keeps the profile git function in step with Git shadowing (read-only check).
  const plan = prepareTerminalSettings(settingsPath(), git.executable, { shadowedBy: detectPathShadow(git.executable) });
  const result = writeTerminalSettings(plan, { dryRun });
  console.log(`VS Code terminal settings: ${result.status}`);
  for (const warning of plan.warnings) console.log(`WARNING: ${warning}`);
  console.log(`Verified Git: ${plan.git.executable} (${plan.git.version})`);
  if (result.backup) console.log(`Settings backup: ${result.backup}`);
  console.log('SDK profile configuration only. Create a NEW PowerShell with now-sdk terminal; Get-Command now-sdk -CommandType Function must resolve before running now-sdk --version.');
  console.log('Git PATH is configured by install/configure-git in the Windows user environment.');
}

function verify() {
  if (!fs.existsSync(payloadRoot)) {
    fail(`Payload directory not found: ${payloadRoot}`);
    return;
  }

  generateBaseline(repoRoot, true);
  const sourceFiles = payloadFiles(payloadRoot);
  const sourceRels = new Set(sourceFiles.map(payloadRel));
  const retainedObsolete = Object.keys(loadReceipt().files).filter(rel => !sourceRels.has(rel) && fs.existsSync(targetForRel(rel)));
  const missing = [];
  const mismatched = [];
  const ok = [];

  for (const sourceFile of sourceFiles) {
    const rel = payloadRel(sourceFile);
    const target = targetForRel(rel);
    if (!fs.existsSync(target)) {
      missing.push(rel);
      continue;
    }
    const sourceHash = sha256File(sourceFile);
    const targetHash = sha256File(target);
    if (sourceHash !== targetHash) mismatched.push(rel);
    else ok.push(rel);
  }

  console.log(`ServiceNow Fluent Agent verify`);
  console.log(`repo: ${repoRoot}`);
  console.log(`home: ${home}`);
  console.log(`ok: ${ok.length}`);
  console.log(`missing: ${missing.length}`);
  console.log(`mismatched: ${mismatched.length}`);
  console.log(`retained obsolete managed files: ${retainedObsolete.length}`);
  if (retainedObsolete.length) console.log('Review preserved local edits before removing retired skill/test files:\n' + retainedObsolete.join('\n'));
  console.log('Payload check only: separately verify bare git --version in fresh terminals across the hosts you use.');

  if (missing.length) {
    console.log('\nMissing:');
    for (const rel of missing) console.log(`  ${rel}`);
  }

  if (mismatched.length) {
    console.log('\nMismatched:');
    for (const rel of mismatched) console.log(`  ${rel}`);
  }

  if (missing.length || mismatched.length || retainedObsolete.length) process.exitCode = 1;
}

function uninstall() {
  const receipt = loadReceipt();
  if (!receipt.files || Object.keys(receipt.files).length === 0) {
    console.log('No installed file receipt found. Nothing to uninstall.');
    return;
  }

  const backupRoot = path.join(backupRootBase, `uninstall-${timestamp()}`);
  const removed = [];
  const skipped = [];
  const missing = [];
  const backups = [];

  for (const rel of Object.keys(receipt.files).sort()) {
    const target = targetForRel(rel);
    const info = receipt.files[rel];
    if (!fs.existsSync(target)) {
      missing.push(rel);
      continue;
    }

    const currentHash = sha256File(target);
    if (currentHash !== info.sha256 && !force) {
      skipped.push(rel);
      continue;
    }

    const backupPath = path.join(backupRoot, ...rel.split('/'));
    backups.push(toSlash(backupPath));
    if (!dryRun) {
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(target, backupPath);
      fs.unlinkSync(target);
      removeEmptyParents(target);
    }
    removed.push(rel);
  }

  if (!dryRun && skipped.length === 0) {
    fs.unlinkSync(receiptPath);
  }

  console.log('ServiceNow Fluent Agent uninstall');
  console.log(`dryRun: ${dryRun}`);
  console.log(`force: ${force}`);
  console.log(`removed: ${removed.length}`);
  console.log(`missing: ${missing.length}`);
  console.log(`skipped modified: ${skipped.length}`);
  console.log(`backups: ${backups.length}`);
  if (skipped.length) {
    console.log('\nSkipped locally modified files. Rerun with --force to remove:');
    for (const rel of skipped) console.log(`  ${rel}`);
  }
  if (!isWindows && !noShellFunction) {
    const shell = removeShellFunction(home, { dryRun });
    console.log(`now-sdk shell function (${toSlash(shell.file)}): ${shell.status}`);
  }
  if (!noShellFunction) {
    const shim = removeSkillShim(home, { dryRun, windows: isWindows });
    if (shim.status !== 'absent' || !isWindows) console.log(`sn-skill command (${toSlash(shim.file)}): ${shim.status}`);
  }
  console.log('\nVS Code settings were not removed. Remove chat.* location settings manually if desired.');
}

function status() {
  const receipt = loadReceipt();
  const fileCount = receipt.files ? Object.keys(receipt.files).length : 0;
  console.log('ServiceNow Fluent Agent status');
  console.log(`repo: ${repoRoot}`);
  console.log(`payload: ${payloadRoot}`);
  console.log(`home: ${home}`);
  console.log(`receipt: ${receiptPath}`);
  console.log(`installed version: ${receipt.version || '(none)'}`);
  console.log(`installed files: ${fileCount}`);
  if (receipt.installedAt) console.log(`installed at: ${receipt.installedAt}`);
}

async function checkForUpdates() {
  const updates = await checkUpdates({
    repoRoot,
    projectPath: flagValue('--project'),
    docsPath: flagValue('--docs'),
    docsBranch: flagValue('--docs-branch'),
    only: flagValue('--only'),
    force,
  });
  if (updates.length) console.log(JSON.stringify({ updates }));
}

function recordUpdateDecision() {
  const decision = positionalArgs[0];
  const componentKeys = flagValues('--component');
  if (!decision) throw new Error('Specify update, remind, or skip after update-decision.');
  if (!componentKeys.length) throw new Error('Specify at least one --component returned by check-updates.');
  const updated = recordDecision({ decision, componentKeys });
  console.log(`Recorded ${decision} for ${updated} update component(s).`);
  // A key with no recorded notice is skipped by the library; never report that as a recorded decision.
  if (updated < componentKeys.length) throw new Error(`Only ${updated} of ${componentKeys.length} update component(s) had a recorded notice; the others were not recorded.`);
}

function printInstallSummary(summary, receiptCount) {
  console.log('ServiceNow Fluent Agent install');
  console.log(`version: ${summary.version}`);
  console.log(`home: ${summary.home}`);
  console.log(`dryRun: ${summary.dryRun}`);
  console.log(`force: ${summary.force}`);
  console.log(`copied/updated: ${summary.copied.length}`);
  console.log(`unchanged: ${summary.unchanged.length}`);
  console.log(`removed obsolete: ${summary.removedObsolete.length}`);
  console.log(`skipped conflicts: ${summary.skippedConflicts.length}`);
  console.log(`skipped obsolete conflicts: ${summary.skippedObsoleteConflicts.length}`);
  console.log(`backups: ${summary.backups.length}`);
  console.log(`receipt files: ${receiptCount}`);
  console.log(`VS Code settings: ${summary.vscodeSettings || 'not checked'}`);
  if (summary.vscodeSettingsBackup) console.log(`VS Code settings backup: ${summary.vscodeSettingsBackup}`);
  if (summary.windowsGit) {
    console.log(`Windows Git environment: ${summary.windowsGit.status}`);
    if (summary.windowsGit.log) console.log(summary.windowsGit.log);
    printGitSelection(summary.windowsGit.git, summary.windowsGit.shadowedBy, summary.gitSelectionWarnings);
  }
  if (summary.gitBashShim) console.log(`sn-skill command for Git Bash (${toSlash(summary.gitBashShim.file)}): ${summary.gitBashShim.status}`);

  if (summary.skippedConflicts.length) {
    console.log('\nSkipped locally modified files. Review or rerun with --force:');
    for (const rel of summary.skippedConflicts) console.log(`  ${rel}`);
  }

  if (summary.skippedObsoleteConflicts.length) {
    console.log('\nSkipped obsolete locally modified files. Review or rerun with --force:');
    for (const rel of summary.skippedObsoleteConflicts) console.log(`  ${rel}`);
  }

  if (summary.vscodeManualSettings) {
    console.log('\nAdd these VS Code user settings manually:');
    console.log(JSON.stringify(summary.vscodeManualSettings, null, 4));
  }

  if (summary.vscodeSettingsFile) console.log(`VS Code settings file: ${summary.vscodeSettingsFile}`);

  if (summary.posixNotes) {
    // Linux/macOS (set by install); printInstallSummary itself stays platform-free.
    for (const line of summary.posixNotes) console.log(line);
  } else {
    console.log('\nFor SDK acceptance, create a NEW PowerShell with now-sdk terminal after profile configuration.');
    console.log('Require Get-Command now-sdk -CommandType Function and Get-Command sn-skill -CommandType Function to resolve before running now-sdk --version; do not probe batch shims or reinstall for an old terminal.');
    console.log('Restart affected terminal applications from a refreshed launcher if Git PATH remains stale; reload alone may retain old process environments.');
    console.log('Run bare git --version in actual fresh terminals before reporting setup complete. The profile git function is added only when another Git shadows the selected one.');
  }

  if (!summary.dryRun && !summary.skippedConflicts.length && !summary.skippedObsoleteConflicts.length) {
    console.log('\nNext: connect your PDI (if not already connected).');
    console.log('1. Open your PDI in your browser and log in first.');
    console.log('2. In VS Code, choose Terminal -> New Terminal.');
    console.log('3. Run: now-sdk auth --add dev123456');
    console.log('Replace dev123456 with your own instance name, then follow the SDK prompts and choose OAuth.');
    console.log('Enter any authorization code only in the terminal; never paste passwords or OAuth codes into chat.');
    console.log('Guide with screenshots: https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/connect-pdi.md');
  }
}

function help() {
  console.log(`Usage:
  node bin/sn-fluent-agent.cjs install [--dry-run] [--force] [--no-vscode-settings] [--settings-file <path>] [--no-shell-function] [--git-exe <absolute path>]
  node bin/sn-fluent-agent.cjs configure-git [--git-exe <absolute path>] [--dry-run]
  node bin/sn-fluent-agent.cjs configure-terminal [--git-exe <absolute path>] [--dry-run]
  node bin/sn-fluent-agent.cjs verify
  node bin/sn-fluent-agent.cjs status
  node bin/sn-fluent-agent.cjs check-updates [--only <agent|sdk|docs>] [--project <path>] [--docs <path>] [--docs-branch <branch>] [--force]
  node bin/sn-fluent-agent.cjs update-decision <update|remind|skip> --component <key> [...]
  node bin/sn-fluent-agent.cjs uninstall [--dry-run] [--force] [--no-shell-function]

Commands:
  install    Copy payload files into this user's profile and configure VS Code settings; on Linux/macOS also add the now-sdk shell function to ~/.bashrc and the sn-skill command to ~/.local/bin (Windows: ~/bin when Git Bash is installed).
  configure-git    (Windows only) Register the selected Git in user PATH, request native Windows environment propagation, select it for VS Code terminals/Source Control when another Git precedes it in Windows PATH, and remove known legacy profile workarounds. No Git/payload reinstall.
  configure-terminal    Windows: configure the SDK terminal profile (now-sdk and sn-skill functions, plus the git function when another Git shadows the selected one; not Git PATH). Linux/macOS: ensure the now-sdk function in ~/.bashrc and the sn-skill command.
  verify     Compare installed files with payload files.
  status     Show installed receipt details.
  check-updates    Quietly check due agent, project SDK, and docs updates; prints JSON only when an update is actionable.
  update-decision  Record Update, Remind me in 7 days, or Skip this release for selected update components.
  uninstall  Remove managed files that are unchanged from the install receipt.

Options:
  --dry-run              Show what would happen without writing files.
  --force                Overwrite/remove locally modified managed files.
  --no-vscode-settings   Do not patch the VS Code settings file.
  --settings-file <path> Patch this settings file instead of the desktop User settings (env: SN_FLUENT_VSCODE_SETTINGS), e.g. a VS Code server's <server-data-dir>/data/Machine/settings.json. Not used on Windows unless given.
  --no-shell-function    Do not add/remove the now-sdk function in ~/.bashrc or the sn-skill shim (Linux/macOS; Git Bash on Windows).
  --git-exe <path>        (Windows only) Use the Git executable verified during prerequisites; never install Git here.
`);
}

async function main() {
  const invalid = argumentError();
  if (invalid) fail(invalid);
  else if (command === 'install' || command === 'update') install();
  else if (command === 'configure-git') configureGit();
  else if (command === 'configure-terminal') configureTerminal();
  else if (command === 'verify') verify();
  else if (command === 'status') status();
  else if (command === 'check-updates') await checkForUpdates();
  else if (command === 'update-decision') recordUpdateDecision();
  else if (command === 'uninstall') uninstall();
  else if (command === 'help') help();
  else fail(`Unknown command: ${command}`);
}

// Expected configuration errors (error.expected) print their message only; anything else keeps the stack.
main().catch((error) => fail(error && error.expected ? error.message : error && error.stack ? error.stack : String(error)));
