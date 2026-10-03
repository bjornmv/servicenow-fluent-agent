#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkUpdates, recordDecision } = require('../lib/update-advisor.cjs');
const { parseJsonc, setJsoncValue } = require('../lib/jsonc-settings.cjs');
const { prepareTerminalSettings, writeTerminalSettings } = require('../lib/vscode-terminal.cjs');
const { configureWindowsGit } = require('../lib/windows-git-environment.cjs');

const PACKAGE_NAME = 'servicenow-fluent-agent';
const RECEIPT_NAME = '.servicenow-fluent-agent-install.json';
const repoRoot = path.resolve(__dirname, '..');
const payloadRoot = path.join(repoRoot, 'payload');
const home = os.homedir();
const agentsRoot = path.join(home, '.agents');
const receiptPath = path.join(agentsRoot, RECEIPT_NAME);
const backupRootBase = path.join(agentsRoot, '_backups', PACKAGE_NAME);

const argv = process.argv.slice(2);
const command = argv.find((arg) => !arg.startsWith('--')) || 'install';
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const dryRun = flags.has('--dry-run');
const force = flags.has('--force');
const noVscodeSettings = flags.has('--no-vscode-settings');

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

function isIgnoredFile(file) {
  const lower = file.toLowerCase();
  return (
    lower.endsWith('.pyc') ||
    lower.endsWith('.pyo') ||
    lower.endsWith('.tmp') ||
    lower.endsWith('.bak') ||
    lower.endsWith('.ds_store') ||
    lower.endsWith('thumbs.db')
  );
}

function isIgnoredDir(name) {
  return name === '.git' || name === 'node_modules' || name === '__pycache__';
}

function walkFiles(root) {
  const files = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (entry.isDirectory() && isIgnoredDir(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && !isIgnoredFile(entry.name)) {
        files.push(full);
      }
    }
  }

  if (fs.existsSync(root)) walk(root);
  return files;
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

function removeObsoleteFiles(payloadRels, backupRoot, summary) {
  for (const rel of Object.keys(summary.previousReceipt.files || {}).sort()) {
    if (payloadRels.has(rel)) continue;
    const previous = summary.previousReceipt.files[rel];
    const target = targetForRel(rel);
    if (!fs.existsSync(target)) {
      summary.removedMissing.push(rel);
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
    if (!dryRun) fs.unlinkSync(target);
  }
}

function settingsPath() {
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return path.join(appData, 'Code', 'User', 'settings.json');
}

function ensureObjectSetting(settings, key) {
  if (!settings[key] || typeof settings[key] !== 'object' || Array.isArray(settings[key])) {
    settings[key] = {};
  }
  return settings[key];
}

function configureVsCodeSettings(summary) {
  if (noVscodeSettings) {
    summary.vscodeSettings = 'skipped (--no-vscode-settings)';
    return;
  }

  const file = settingsPath();
  const original = readTextIfExists(file) ?? '{}\n';
  // SDK profile only; Git PATH belongs to the Windows user environment.
  const terminal = process.platform === 'win32' ? prepareTerminalSettings(file, flagValue('--git-exe')) : null;
  let updated = terminal ? terminal.text : original;
  if (terminal) summary.vscodeGit = terminal.git;
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
  setMapValue('chat.agentFilesLocations', agentPath, true);
  setMapValue('chat.instructionsFilesLocations', instructionsPath, true);
  setMapValue('chat.instructionsFilesLocations', '.github/instructions', true);
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
    'chat.agentFilesLocations': { [agentPath]: true },
    'chat.instructionsFilesLocations': { [instructionsPath]: true, '.github/instructions': true },
    'chat.skillsFilesLocations': { [skillsPath]: true },
  };
}

function install() {
  if (!fs.existsSync(payloadRoot)) {
    fail(`Payload directory not found: ${payloadRoot}`);
    return;
  }

  const version = readVersion();
  const previousReceipt = loadReceipt();
  const backupRoot = path.join(backupRootBase, timestamp());
  const sourceFiles = walkFiles(payloadRoot);
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

  if (process.platform === 'win32') summary.windowsGit = configureWindowsGit({ gitExe: flagValue('--git-exe'), dryRun });
  configureVsCodeSettings(summary);
  for (const sourceFile of sourceFiles) {
    const rel = payloadRel(sourceFile);
    copyPayloadFile(sourceFile, targetForRel(rel), backupRoot, rel, summary);
  }

  removeObsoleteFiles(payloadRels, backupRoot, summary);

  const receipt = {
    packageName: PACKAGE_NAME,
    version,
    installedAt: new Date().toISOString(),
    repoRoot: toSlash(repoRoot),
    payloadRoot: toSlash(payloadRoot),
    files: summary.nextFiles,
  };

  writeReceipt(receipt);

  printInstallSummary(summary, Object.keys(receipt.files).length);
}

function configureGit() {
  const plan = prepareTerminalSettings(settingsPath(), flagValue('--git-exe'), { cleanupOnly: true });
  const result = configureWindowsGit({ gitExe: plan.git.executable, dryRun });
  const cleanup = writeTerminalSettings(plan, { dryRun });
  console.log(`Windows Git environment: ${result.status}`);
  if (result.log) console.log(result.log);
  console.log(`Legacy profile workaround cleanup: ${cleanup.status}`);
  if (cleanup.backup) console.log(`Settings backup: ${cleanup.backup}`);
  console.log('Restart affected terminal applications from a refreshed launcher. Existing processes are not forced to refresh or killed.');
  console.log('Verify bare git --version in the actual terminal hosts you use; no shell/profile-specific PATH is required.');
}

function configureTerminal() {
  if (process.platform !== 'win32') throw new Error('configure-terminal requires Windows.');
  const plan = prepareTerminalSettings(settingsPath(), flagValue('--git-exe'));
  const result = writeTerminalSettings(plan, { dryRun });
  console.log(`VS Code terminal settings: ${result.status}`);
  console.log(`Verified Git: ${plan.git.executable} (${plan.git.version})`);
  if (result.backup) console.log(`Settings backup: ${result.backup}`);
  console.log('SDK profile configuration only. Create a NEW PowerShell with now-sdk terminal; Get-Command now-sdk must resolve to a Function before running now-sdk --version.');
  console.log('Git PATH is configured by install/configure-git in the Windows user environment.');
}

function verify() {
  if (!fs.existsSync(payloadRoot)) {
    fail(`Payload directory not found: ${payloadRoot}`);
    return;
  }

  const sourceFiles = walkFiles(payloadRoot);
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
  console.log('Payload check only: separately verify bare git --version in fresh terminals across the hosts you use.');

  if (missing.length) {
    console.log('\nMissing:');
    for (const rel of missing) console.log(`  ${rel}`);
  }

  if (mismatched.length) {
    console.log('\nMismatched:');
    for (const rel of mismatched) console.log(`  ${rel}`);
  }

  if (missing.length || mismatched.length) process.exitCode = 1;
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
    force,
  });
  if (updates.length) console.log(JSON.stringify({ updates }));
}

function recordUpdateDecision() {
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  const decision = positionals[1];
  const componentKeys = flagValues('--component');
  if (!decision) throw new Error('Specify update, remind, or skip after update-decision.');
  if (!componentKeys.length) throw new Error('Specify at least one --component returned by check-updates.');
  const updated = recordDecision({ decision, componentKeys });
  console.log(`Recorded ${decision} for ${updated} update component(s).`);
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
  }

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

  console.log('\nFor SDK acceptance, create a NEW PowerShell with now-sdk terminal after profile configuration.');
  console.log('Require Get-Command now-sdk to resolve to a Function before running now-sdk --version; do not probe batch shims or reinstall for an old terminal.');
  console.log('Restart affected terminal applications from a refreshed launcher if Git PATH remains stale; reload alone may retain old process environments.');
  console.log('Run bare git --version in actual fresh terminals before reporting setup complete. No shell-specific Git PATH workaround is installed.');
}

function help() {
  console.log(`Usage:
  node bin/sn-fluent-agent.cjs install [--dry-run] [--force] [--no-vscode-settings] [--git-exe <absolute path>]
  node bin/sn-fluent-agent.cjs configure-git [--git-exe <absolute path>] [--dry-run]
  node bin/sn-fluent-agent.cjs configure-terminal [--git-exe <absolute path>] [--dry-run]
  node bin/sn-fluent-agent.cjs verify
  node bin/sn-fluent-agent.cjs status
  node bin/sn-fluent-agent.cjs check-updates [--project <path>] [--docs <path>] [--docs-branch <branch>] [--force]
  node bin/sn-fluent-agent.cjs update-decision <update|remind|skip> --component <key> [...]
  node bin/sn-fluent-agent.cjs uninstall [--dry-run] [--force]

Commands:
  install    Copy payload files into this user's profile and configure VS Code settings.
  configure-git    Register existing Git in user PATH, request native Windows environment propagation and remove known legacy profile workarounds. No Git/payload reinstall.
  configure-terminal    Configure the SDK terminal profile only, not Git PATH.
  verify     Compare installed files with payload files.
  status     Show installed receipt details.
  check-updates    Quietly check due agent, project SDK, and docs updates; prints JSON only when an update is actionable.
  update-decision  Record Update, Remind me in 7 days, or Skip this release for selected update components.
  uninstall  Remove managed files that are unchanged from the install receipt.

Options:
  --dry-run              Show what would happen without writing files.
  --force                Overwrite/remove locally modified managed files.
  --no-vscode-settings   Do not patch VS Code User/settings.json.
  --git-exe <path>        Use the Git executable verified during prerequisites; never install Git here.
`);
}

async function main() {
  if (command === 'install' || command === 'update') install();
  else if (command === 'configure-git') configureGit();
  else if (command === 'configure-terminal') configureTerminal();
  else if (command === 'verify') verify();
  else if (command === 'status') status();
  else if (command === 'check-updates') await checkForUpdates();
  else if (command === 'update-decision') recordUpdateDecision();
  else if (command === 'uninstall') uninstall();
  else if (command === 'help' || command === '--help' || command === '-h') help();
  else fail(`Unknown command: ${command}`);
}

main().catch((error) => fail(error && error.stack ? error.stack : String(error)));
