'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseJsonc } = require('../../lib/jsonc-settings.cjs');
const { profileName, profilesKey, sdkCommand, defaultProfile, planTerminalSettings, removeLegacyGitOverrides, writeTerminalSettings, findGit, verifyGit } = require('../../lib/vscode-terminal.cjs');
const gitExe = 'C:\\Users\\Example\\Programs\\Git\\cmd\\git.exe';
const directory = path.win32.dirname(gitExe);
const legacy = `# sn-fluent-agent:git-path:start\n$env:Path = '${directory};' + (($env:Path -split ';' | Where-Object { $_ -ine '${directory}' }) -join ';');\n# sn-fluent-agent:git-path:end\n`;
function withTemp(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-'));
  try { return fn(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('SDK profile adds no Git environment override or startup code', () => {
  const plan = planTerminalSettings('{}\n', gitExe);
  const settings = parseJsonc(plan.text);
  assert.deepEqual(settings[profilesKey][profileName], defaultProfile);
  assert.equal(settings['terminal.integrated.defaultProfile.windows'], profileName);
  assert.equal(planTerminalSettings(plan.text, gitExe).text, plan.text);
  assert.equal(planTerminalSettings('{}', gitExe, { cleanupOnly: true }).text, '{}');
});

test('legacy env-only and startup workarounds are removed, not unrelated settings', () => {
  for (const prefix of ['', legacy]) {
    const settings = { 'editor.fontSize': 16, [profilesKey]: {
      Other: { path: 'custom.exe', env: { Path: 'keep' } },
      [profileName]: { ...defaultProfile, args: [...defaultProfile.args.slice(0, -1), prefix + sdkCommand], env: { Path: directory + ';${env:Path}', KEEP: 'yes' } },
    } };
    const source = '// header retained\n' + JSON.stringify(settings, null, 2);
    const result = removeLegacyGitOverrides(source, gitExe);
    const profile = parseJsonc(result)[profilesKey][profileName];
    assert.deepEqual(profile.args, defaultProfile.args);
    assert.deepEqual(profile.env, { KEEP: 'yes' });
    assert.deepEqual(parseJsonc(result)[profilesKey].Other, settings[profilesKey].Other);
    assert.ok(result.startsWith('// header retained\n'));
    assert.equal(removeLegacyGitOverrides(result, gitExe), result);
  }
});

test('legacy prefix cleanup restores preexisting PATH suffix, preserving global environment', () => {
  const source = JSON.stringify({
    'terminal.integrated.env.windows': { Path: 'global-custom', OTHER: 'yes' },
    [profilesKey]: { [profileName]: { ...defaultProfile, env: { PATH: directory + ';custom;${env:Path}' } } },
  });
  const result = parseJsonc(removeLegacyGitOverrides(source, gitExe));
  assert.equal(result[profilesKey][profileName].env.PATH, 'custom;${env:Path}');
  assert.deepEqual(result['terminal.integrated.env.windows'], { Path: 'global-custom', OTHER: 'yes' });
});

test('custom shell arguments/environment are not rewritten or injected with PowerShell code', () => {
  const custom = { path: 'custom.exe', args: ['--user-flag'], env: { Path: 'custom-path', KEEP: 'yes' } };
  const source = JSON.stringify({ [profilesKey]: { [profileName]: custom } });
  assert.deepEqual(parseJsonc(planTerminalSettings(source, gitExe).text)[profilesKey][profileName], custom);
});

test('modified legacy marker and ambiguous settings fail closed', () => {
  const custom = { ...defaultProfile, args: ['-Command', legacy.replace('$env:Path =', '$env:Path +=') + sdkCommand] };
  assert.throws(() => removeLegacyGitOverrides(JSON.stringify({ [profilesKey]: { [profileName]: custom } }), gitExe), /modified/);
  assert.throws(() => planTerminalSettings('{"terminal.integrated.profiles.windows":{},"terminal.integrated.profiles.windows":{}}', gitExe), /Duplicate/);
});

test('settings writer backs up exact bytes, supports dry-run and rejects concurrent edits', () => withTemp(folder => {
  const file = path.join(folder, 'settings.json');
  const original = '// original\n{}\n';
  fs.writeFileSync(file, original);
  const plan = { file, original, ...planTerminalSettings(original, gitExe) };
  const dry = writeTerminalSettings(plan, { dryRun: true });
  assert.equal(dry.status, 'would update');
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.equal(fs.existsSync(dry.backup), false);
  const written = writeTerminalSettings(plan);
  assert.equal(fs.readFileSync(written.backup, 'utf8'), original);
  assert.equal(fs.readFileSync(file, 'utf8'), plan.text);
  assert.throws(() => writeTerminalSettings(plan), /changed during/);
}));

test('Git validation refuses relative, non-Git and unsafe registry PATH values', () => {
  for (const executable of ['git.exe', 'C:\\Git;other\\git.exe', 'C:\\%OTHER%\\git.exe', 'C:\\Git\\notgit.exe']) assert.throws(() => verifyGit(executable));
});

test('SDK-only CLI updates isolated settings without creating Git profile workarounds', { skip: process.platform !== 'win32' }, () => withTemp(folder => {
  const git = findGit();
  const appData = path.join(folder, 'AppData');
  const file = path.join(appData, 'Code/User/settings.json');
  const cli = path.resolve(__dirname, '../../bin/sn-fluent-agent.cjs');
  const result = spawnSync(process.execPath, [cli, 'configure-terminal', '--git-exe', git.executable], {
    env: { ...process.env, APPDATA: appData }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parseJsonc(fs.readFileSync(file, 'utf8'))[profilesKey][profileName], defaultProfile);
  assert.match(result.stdout, /SDK profile configuration only/);
}));
