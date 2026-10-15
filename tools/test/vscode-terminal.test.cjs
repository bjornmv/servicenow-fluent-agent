'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseJsonc } = require('../../lib/jsonc-settings.cjs');
const { profileName, profilesKey, terminalEnvKey, sdkCommand, defaultProfile, approvedGitBlock, gitFunctionBlock, ensureProfileFunctions, planTerminalSettings, removeLegacyGitOverrides, writeTerminalSettings, findGit, verifyGit, gitCandidates, findPathShadow, applyGitSelection } = require('../../lib/vscode-terminal.cjs');
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
  assert.equal(settings[terminalEnvKey], undefined, 'no terminal PATH prefix without a shadowing Git');
  assert.equal(settings['git.path'], undefined);
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

test('SDK-profile CLI updates isolated settings; git function only when shadowed', { skip: process.platform !== 'win32' }, () => withTemp(folder => {
  const git = findGit();
  const appData = path.join(folder, 'AppData');
  const file = path.join(appData, 'Code/User/settings.json');
  const cli = path.resolve(__dirname, '../../bin/sn-fluent-agent.cjs');
  const result = spawnSync(process.execPath, [cli, 'configure-terminal', '--git-exe', git.executable], {
    env: { ...process.env, APPDATA: appData }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr);
  // The real machine decides: a Git ahead of the selected one in Windows PATH
  // (e.g. a blocked system Git) adds the git function beside now-sdk.
  const shadowedBy = require('../../lib/windows-git-environment.cjs').detectPathShadow(git.executable);
  const expected = shadowedBy ? { ...defaultProfile, args: [...defaultProfile.args.slice(0, -1), `${sdkCommand}\n${gitFunctionBlock(git.executable)}`] } : defaultProfile;
  assert.deepEqual(parseJsonc(fs.readFileSync(file, 'utf8'))[profilesKey][profileName], expected);
  assert.match(result.stdout, /SDK profile configuration only/);
}));

const env = { LOCALAPPDATA: 'C:\\Users\\Example\\AppData\\Local', Path: 'C:\\Program Files\\Git\\cmd;C:\\Tools', ProgramFiles: 'C:\\Program Files' };
const managedExe = 'C:\\Users\\Example\\AppData\\Local\\Programs\\Git\\cmd\\git.exe';
const systemExe = 'C:\\Program Files\\Git\\cmd\\git.exe';

test('Git candidates put the managed per-user copy first and drop duplicates', () => {
  assert.deepEqual(gitCandidates(env), [managedExe, systemExe, 'C:\\Tools\\git.exe']);
});

test('findGit skips a blocked or older copy and selects the next usable one', () => {
  const verify = candidate => {
    if (candidate === systemExe) throw new Error('spawnSync EPERM: blocked by group policy');
    return { executable: candidate, version: 'git version 2.54.0.windows.1' };
  };
  const git = findGit(undefined, env, { verify, exists: candidate => candidate !== managedExe });
  assert.equal(git.executable, 'C:\\Tools\\git.exe');
  assert.deepEqual(git.unusable, [`${systemExe} (spawnSync EPERM: blocked by group policy)`]);
  assert.equal(findGit(undefined, env, { verify, exists: () => true }).executable, managedExe, 'managed copy first: blocked system Git is never launched');
});

test('findGit reports every unusable copy, and never installs, when none is usable', () => {
  const verify = () => { throw new Error('Git must be a working stable version >=2.54.0: git version 2.39.1.windows.1'); };
  assert.throws(() => findGit(undefined, env, { verify, exists: candidate => candidate === systemExe }), /No usable Git >=2\.54\.0 found[\s\S]*Program Files\\Git\\cmd\\git\.exe[\s\S]*side by side[\s\S]*No Git was installed/);
  assert.throws(() => findGit(undefined, env, { verify, exists: () => false }), /No Git executable found/);
  assert.throws(() => findGit('C:\\Blocked\\git.exe', env, { verify }), /2\.39\.1/, 'an explicit path is never substituted');
});

test('PATH shadow follows machine-then-user order and ignores the selected directory', () => {
  const exists = candidate => [systemExe, managedExe].includes(candidate);
  const userPath = 'C:\\Users\\Example\\AppData\\Local\\Programs\\Git\\cmd\\';
  assert.equal(findPathShadow(managedExe, { machinePath: 'C:\\Windows;C:\\Program Files\\Git\\cmd', userPath, exists }), systemExe);
  assert.equal(findPathShadow(managedExe, { machinePath: 'C:\\Windows', userPath, exists }), null);
  assert.equal(findPathShadow(managedExe, { machinePath: 'C:\\Windows', userPath: '', exists }), null, 'not on PATH yet: registration appends it');
  assert.equal(findPathShadow(managedExe, { machinePath: '"C:\\Program Files\\Git\\cmd";%UNEXPANDED%', userPath, exists }), systemExe);
  assert.equal(findPathShadow(systemExe, { machinePath: 'C:\\Program Files\\Git\\cmd\\', userPath, exists }), null);
});

test('shadowed selection prepends the terminal PATH once and selects Source Control Git', () => {
  const source = '// keep\n{\n  "editor.fontSize": 14\n}\n';
  const plan = planTerminalSettings(source, managedExe, { cleanupOnly: true, shadowedBy: systemExe, env });
  const settings = parseJsonc(plan.text);
  assert.deepEqual(settings[terminalEnvKey], { Path: 'C:\\Users\\Example\\AppData\\Local\\Programs\\Git\\cmd;${env:Path}' });
  assert.equal(settings['git.path'], managedExe);
  assert.equal(settings['editor.fontSize'], 14);
  assert.ok(plan.text.startsWith('// keep\n'));
  assert.deepEqual(plan.warnings, []);
  assert.equal(planTerminalSettings(plan.text, managedExe, { cleanupOnly: true, shadowedBy: systemExe, env }).text, plan.text, 'idempotent');
});

test('selection recognizes the repair guide form and preserves existing terminal environment', () => {
  const guideForm = JSON.stringify({ [terminalEnvKey]: { Path: '${env:LOCALAPPDATA}\\Programs\\Git\\cmd;${env:Path}', KEEP: '1' }, 'git.path': managedExe });
  assert.equal(applyGitSelection(guideForm, managedExe, env).text, guideForm);
  const custom = JSON.stringify({ [terminalEnvKey]: { PATH: 'C:\\Custom;${env:Path}', KEEP: '1' } });
  const result = parseJsonc(applyGitSelection(custom, managedExe, env).text);
  assert.deepEqual(result[terminalEnvKey], { PATH: 'C:\\Users\\Example\\AppData\\Local\\Programs\\Git\\cmd;C:\\Custom;${env:Path}', KEEP: '1' });
  const noPath = parseJsonc(applyGitSelection(JSON.stringify({ [terminalEnvKey]: { KEEP: '1' } }), managedExe, env).text);
  assert.deepEqual(noPath[terminalEnvKey], { KEEP: '1', Path: 'C:\\Users\\Example\\AppData\\Local\\Programs\\Git\\cmd;${env:Path}' });
});

test('selection keeps a different git.path with a warning and fails closed on ambiguous PATH', () => {
  const other = applyGitSelection(JSON.stringify({ 'git.path': 'D:\\Portable\\git.exe' }), managedExe, env);
  assert.equal(parseJsonc(other.text)['git.path'], 'D:\\Portable\\git.exe');
  assert.match(other.warnings[0], /git\.path already selects/);
  assert.throws(() => applyGitSelection(JSON.stringify({ [terminalEnvKey]: { Path: 'a', PATH: 'b' } }), managedExe, env), /Ambiguous PATH keys/);
  assert.throws(() => applyGitSelection(JSON.stringify({ [terminalEnvKey]: { Path: null } }), managedExe, env), /not a string/);
});

const sdkArgs = command => [...defaultProfile.args.slice(0, -1), command];
const profileOf = text => parseJsonc(text)[profilesKey][profileName];

test('shadowed Git adds the git function beside now-sdk in the SDK profile, once', () => {
  const plan = planTerminalSettings('{}\n', managedExe, { shadowedBy: systemExe, env });
  const command = profileOf(plan.text).args.at(-1);
  assert.equal(command, `${sdkCommand}\n${approvedGitBlock}`, 'repair-guide block for the managed copy');
  assert.equal(parseJsonc(plan.text)['terminal.integrated.defaultProfile.windows'], profileName);
  assert.equal(planTerminalSettings(plan.text, managedExe, { shadowedBy: systemExe, env }).text, plan.text, 'idempotent');
  const configureGit = planTerminalSettings('{}\n', managedExe, { cleanupOnly: true, shadowedBy: systemExe, env });
  assert.equal(profileOf(configureGit.text).args.at(-1), command, 'configure-git creates the home for the function when shadowed');
});

test('a non-managed selected Git gets a literal path in the same block shape', () => {
  const other = 'D:\\Tools\\O\'Git\\cmd\\git.exe';
  const block = gitFunctionBlock(other, env);
  assert.match(block, /\$approvedGit = 'D:\\Tools\\O''Git\\cmd\\git\.exe'/);
  const managedPlan = planTerminalSettings('{}', managedExe, { shadowedBy: systemExe, env }).text;
  const switched = profileOf(planTerminalSettings(managedPlan, other, { shadowedBy: systemExe, env }).text).args.at(-1);
  assert.equal(switched, `${sdkCommand}\n${block}`, 'generated block is replaced for a new selection, never duplicated');
});

test('repair-guide block is recognized whitespace-insensitively and removed when no longer shadowed', () => {
  const guideStyle = sdkCommand + '\r\n' + approvedGitBlock.replaceAll('\n', '\r\n    ');
  const source = JSON.stringify({ [profilesKey]: { [profileName]: { ...defaultProfile, args: sdkArgs(guideStyle) } } }, null, 2);
  const kept = planTerminalSettings(source, managedExe, { shadowedBy: systemExe, env });
  assert.equal(profileOf(kept.text).args.at(-1), guideStyle, 'equivalent block is kept as written');
  assert.deepEqual(kept.warnings, []);
  const removed = planTerminalSettings(source, managedExe, { env });
  assert.deepEqual(profileOf(removed.text).args, defaultProfile.args);
});

test('now-sdk function is always ensured in the SDK profile; custom content is kept', () => {
  const missing = JSON.stringify({ [profilesKey]: { [profileName]: { ...defaultProfile, args: sdkArgs('Write-Host custom') } } });
  assert.equal(profileOf(planTerminalSettings(missing, managedExe).text).args.at(-1), `${sdkCommand}\nWrite-Host custom`);
  assert.equal(profileOf(planTerminalSettings(missing, managedExe, { cleanupOnly: true }).text).args.at(-1), `${sdkCommand}\nWrite-Host custom`);
  const customSdk = JSON.stringify({ [profilesKey]: { [profileName]: { ...defaultProfile, args: sdkArgs('function global:now-sdk { & node.exe custom.js @args }') } } });
  assert.equal(planTerminalSettings(customSdk, managedExe).text.includes(sdkCommand), false, 'an existing now-sdk function is not replaced');
});

test('modified Git block, other profiles and profiles without -Command are not rewritten', () => {
  const modified = sdkCommand + '\n' + approvedGitBlock.replace('& $approvedGit @args', '& C:\\other\\git.exe @args');
  const source = JSON.stringify({ [profilesKey]: { [profileName]: { ...defaultProfile, args: sdkArgs(modified) }, Other: { path: 'x.exe', args: ['-Command', approvedGitBlock] } } });
  const plan = planTerminalSettings(source, managedExe, { shadowedBy: systemExe, env });
  assert.equal(profileOf(plan.text).args.at(-1), modified);
  assert.deepEqual(parseJsonc(plan.text)[profilesKey].Other, { path: 'x.exe', args: ['-Command', approvedGitBlock] });
  assert.ok(plan.warnings.some(w => /modified approved-user-git block/.test(w)));
  const noCommand = ensureProfileFunctions(JSON.stringify({ [profilesKey]: { [profileName]: { path: 'custom.exe', args: ['--user-flag'] } } }), managedExe, { gitFunction: true, env });
  assert.match(noCommand.warnings[0], /no -Command string; the now-sdk and git functions were not added/);
});

test('agent-host terminal tool setting is managed everywhere the installer lists its settings', () => {
  const key = 'chat.agentHost.customTerminalTool.enabled';
  const root = path.resolve(__dirname, '../..');
  const cli = fs.readFileSync(path.join(root, 'bin/sn-fluent-agent.cjs'), 'utf8');
  assert.match(cli, new RegExp(`setScalar\\('${key.replaceAll('.', '\\.')}', true\\)`));
  assert.match(cli, new RegExp(`'${key.replaceAll('.', '\\.')}': true`), 'manual settings block');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).vscodeSettings[key], true);
  assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes(`"${key}": true`));
});
