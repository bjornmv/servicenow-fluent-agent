'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseJsonc } = require('../../lib/jsonc-settings.cjs');
const { profileName, profilesKey, planTerminalSettings, writeTerminalSettings, findGit, verifyGit } = require('../../lib/vscode-terminal.cjs');
const gitExe = 'C:\\Users\\Example\\Programs\\Git\\cmd\\git.exe';

function withTemp(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-'));
  try { return fn(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('new profile explicitly supplies verified Git before inherited PATH', () => {
  const plan = planTerminalSettings('{}\n', gitExe);
  const settings = parseJsonc(plan.text);
  assert.equal(settings[profilesKey][profileName].env.Path, 'C:\\Users\\Example\\Programs\\Git\\cmd;${env:Path}');
  assert.equal(settings['terminal.integrated.defaultProfile.windows'], profileName);
  assert.ok(settings[profilesKey][profileName].args.includes('-NoProfile'));
  assert.equal(planTerminalSettings(plan.text, gitExe).text, plan.text);
});

test('existing profiles, comments, custom arguments and environment are preserved', () => {
  const source = `// keep header\n{\n  "editor.fontSize": 16, // keep font\n  "${profilesKey}": {\n    "Other": { "path": "custom.exe" }, // keep profile\n    "${profileName}": {"path":"powershell.exe","args":["-NoProfile"],"env":{"PATH":"C:\\\\Custom;\${env:Path}","FOO":"bar"}},\n  },\n}\n`;
  const plan = planTerminalSettings(source, gitExe);
  const profile = parseJsonc(plan.text)[profilesKey][profileName];
  assert.deepEqual(profile.args, ['-NoProfile']);
  assert.equal(profile.env.FOO, 'bar');
  assert.equal(profile.env.PATH, 'C:\\Users\\Example\\Programs\\Git\\cmd;C:\\Custom;${env:Path}');
  assert.ok(plan.text.includes('"Other": { "path": "custom.exe" }, // keep profile'));
  assert.ok(plan.text.includes('"editor.fontSize": 16, // keep font'));
  assert.ok(plan.text.startsWith('// keep header'));
  assert.equal(planTerminalSettings(plan.text, gitExe).text, plan.text);
});

test('global terminal PATH customization is retained when the profile has no override', () => {
  const source = JSON.stringify({ 'terminal.integrated.env.windows': { Path: 'C:\\Tools;${env:Path}', KEEP: 'yes' } });
  const plan = planTerminalSettings(source, gitExe);
  const settings = parseJsonc(plan.text);
  assert.equal(settings[profilesKey][profileName].env.Path, 'C:\\Users\\Example\\Programs\\Git\\cmd;C:\\Tools;${env:Path}');
  assert.deepEqual(settings['terminal.integrated.env.windows'], { Path: 'C:\\Tools;${env:Path}', KEEP: 'yes' });
});

test('an existing profile PATH override retains its precedence over global terminal PATH', () => {
  const source = JSON.stringify({
    'terminal.integrated.env.windows': { Path: 'global-only;${env:Path}' },
    [profilesKey]: { [profileName]: { env: { Path: 'profile-only;${env:Path}' } } },
  });
  const settings = parseJsonc(planTerminalSettings(source, gitExe).text);
  assert.ok(settings[profilesKey][profileName].env.Path.endsWith(';profile-only;${env:Path}'));
  assert.equal(settings['terminal.integrated.env.windows'].Path, 'global-only;${env:Path}');
  // The profile already overrides the global PATH in VS Code; do not merge in
  // previously overridden entries and unexpectedly change command precedence.
  assert.ok(!settings[profilesKey][profileName].env.Path.includes('global-only'));
});

test('disabled or ambiguous customized PATH and profile settings are not overwritten', () => {
  for (const env of [{ Path: null }, { Path: 'a', PATH: 'b' }, null, []]) {
    const source = JSON.stringify({ [profilesKey]: { [profileName]: { env } } });
    assert.throws(() => planTerminalSettings(source, gitExe));
  }
  assert.throws(() => planTerminalSettings(JSON.stringify({ [profilesKey]: { [profileName]: null } }), gitExe));
  assert.throws(() => planTerminalSettings('{"terminal.integrated.profiles.windows":{},"terminal.integrated.profiles.windows":{}}', gitExe), /Duplicate/);
});

test('settings-only writer backs up exact bytes, supports dry-run and rejects concurrent edits', () => withTemp(directory => {
  const file = path.join(directory, 'settings.json');
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
  assert.equal(writeTerminalSettings({ ...plan, original: plan.text }).status, 'unchanged');
}));

test('Git executable validation refuses relative and template/semicolon paths', () => {
  for (const executable of ['git.exe', 'C:\\Git;other\\git.exe', 'C:\\${env:bad}\\git.exe', 'C:\\Git\\notgit.exe']) {
    assert.throws(() => verifyGit(executable));
  }
});

test('configure-terminal CLI updates only isolated settings and is idempotent', { skip: process.platform !== 'win32' }, () => withTemp(directory => {
  const git = findGit();
  const appData = path.join(directory, 'AppData');
  const file = path.join(appData, 'Code/User/settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '// retained comment\n{}\n');
  const cli = path.resolve(__dirname, '../../bin/sn-fluent-agent.cjs');
  const invoke = extra => spawnSync(process.execPath, [cli, 'configure-terminal', '--git-exe', git.executable, ...extra], {
    env: { ...process.env, APPDATA: appData }, encoding: 'utf8', timeout: 20000,
  });
  const dry = invoke(['--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would update/);
  assert.equal(fs.readFileSync(file, 'utf8'), '// retained comment\n{}\n');
  const result = invoke([]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /settings: updated/);
  assert.ok(fs.readFileSync(file, 'utf8').startsWith('// retained comment\n'));
  assert.equal(fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.bak')).length, 1);
  const again = invoke([]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /settings: unchanged/);
  assert.equal(fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.bak')).length, 1);
}));

test('configured fresh PowerShell resolves bare git even with a stale parent PATH', { skip: process.platform !== 'win32' }, () => {
  const git = findGit();
  const settings = parseJsonc(planTerminalSettings('{}', git.executable).text);
  const profile = settings[profilesKey][profileName];
  const systemRoot = process.env.SystemRoot;
  const powershell = path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  const stalePath = path.join(systemRoot, 'System32');
  env.Path = stalePath;
  const missing = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "if (Get-Command git -ErrorAction SilentlyContinue) { exit 1 }; exit 0"], { env, encoding: 'utf8', timeout: 20000 });
  assert.ifError(missing.error);
  assert.equal(missing.status, 0, missing.stdout + missing.stderr);
  // Apply precisely the profile environment VS Code supplies to a NEW terminal.
  env.Path = profile.env.Path.replace('${env:Path}', stalePath);
  const args = profile.args.filter(arg => arg !== '-NoExit');
  args[args.length - 1] += "; $ErrorActionPreference = 'Stop'; (Get-Command git).Source; git --version; exit $LASTEXITCODE";
  const result = spawnSync(powershell, args, { env, encoding: 'utf8', timeout: 20000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.toLowerCase().includes(git.executable.toLowerCase()), result.stdout);
  assert.ok(result.stdout.includes(git.version), result.stdout);
});
