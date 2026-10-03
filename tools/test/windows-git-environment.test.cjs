'use strict';
// Orchestration tests mock ALL registry/publisher operations. One backend test
// uses an isolated HKCU Software fixture, never the user's Environment key.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { environmentCommand } = require('../../lib/windows-git-environment.cjs');
const root = path.resolve(__dirname, '../..');
const worker = fs.readFileSync(path.join(root, 'payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1'), 'utf8');
const extract = name => worker.match(new RegExp('^function ' + name + ' \\{\\r?\\n[\\s\\S]*?^\\}', 'm'))?.[0];
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const windows = { skip: process.platform !== 'win32' };

function runCase(value, kind = 'REG_EXPAND_SZ', scenario = 'ok') {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-user-path-'));
  try {
    const script = path.join(folder, 'test.ps1');
    const output = path.join(folder, 'result.json');
    const directory = path.win32.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd');
    fs.writeFileSync(script, `$ErrorActionPreference='Stop'\n$LogDirectory=${quote(folder)}\n$runId='test'\n$script:pathValue=${quote(value)}\n$script:kind=${quote(kind)}\n$script:reads=0\n$script:writes=0\n$script:published=$false\n$scenario=${quote(scenario)}\nfunction Write-Log { param($Message) }\nfunction Get-EnvironmentPublisher { if ($scenario -eq 'blocked') { throw 'Publisher unavailable' }; return 'MOCK' }\nfunction Read-UserGitPath { $script:reads++; $v=$script:pathValue; if ($scenario -eq 'concurrent' -and $script:reads -eq 2) { $v='concurrent edit' }; return @{ Value=$v; Kind=$script:kind; Exists=$true } }\nfunction Write-UserGitPath { param($Value,$Kind) $script:writes++; $script:pathValue=$Value; $script:kind=$Kind }\nfunction Publish-EnvironmentChange { param($Publisher) if ($scenario -eq 'notify-failure') { throw 'Notification failed' }; $script:published=$true }\n${extract('Add-UserGitPath')}\n$code=0\ntry { Add-UserGitPath ${quote(directory)} } catch { $code=11; Write-Output $_.Exception.Message }\n@{ Value=$script:pathValue; Kind=$script:kind; Writes=$script:writes; Published=$script:published } | ConvertTo-Json | Set-Content -LiteralPath ${quote(output)} -Encoding utf8\nexit $code\n`);
    const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], { encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    assert.equal(result.stderr, '', result.stderr);
    const state = JSON.parse(fs.readFileSync(output, 'utf8').replace(/^\ufeff/, ''));
    const backup = path.join(folder, 'environment-before-test.json');
    return { ...state, status: result.status, stdout: result.stdout, directory, backup: fs.existsSync(backup) ? JSON.parse(fs.readFileSync(backup, 'utf8').replace(/^\ufeff/, '')) : null };
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}

test('environment adapter invokes only explicit refresh mode, not installation or policy changes', () => {
  const command = environmentCommand('C:\\Git\\cmd\\git.exe', root, 'C:\\Windows');
  assert.ok(command.args.includes('-RefreshEnvironment'));
  assert.ok(command.args.includes('-GitExecutable'));
  assert.ok(!command.args.some(arg => /InstallIfMissing|ReplaceFullGit|ExecutionPolicy|EncodedCommand/.test(arg)));
  assert.match(worker, /RefreshEnvironment cannot be combined/);
  assert.match(worker, /ENVIRONMENT UPDATED for/);
});

test('native updater receives ONLY a short owned marker, never PATH or machine environment', () => {
  const publish = extract('Publish-EnvironmentChange');
  assert.match(publish, /& \$Publisher SN_FLUENT_ENV_REFRESH \$stamp/);
  assert.match(publish, /\$stamp\.Length -gt 100/);
  assert.match(publish, /SN_FLUENT_ENV_REFRESH -cne \$stamp/);
  assert.doesNotMatch(publish, /& \$Publisher\s+Path\b|\/M\b|Add-Type\s+-|New-Object\s+-ComObject/);
  assert.match(extract('Write-UserGitPath'), /New-ItemProperty -LiteralPath 'HKCU:\\Environment' -Name Path -PropertyType \$propertyType -Value \$Value/);
  assert.doesNotMatch(extract('Get-EnvironmentPublisher'), /SilentlyContinue/);
  assert.doesNotMatch(extract('Write-UserGitPath'), /& .*setx/i);
});

test('registry backend preserves quotes, whitespace, long raw values and both types in an isolated fixture', windows, () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-registry-test-'));
  try {
    const script = path.join(folder, 'registry.ps1');
    const helpers = ['Read-UserGitPath', 'Write-UserGitPath'].map(name => extract(name)
      .replaceAll("'HKCU:\\Environment'", '$fixtureKey')
      .replaceAll("'HKCU\\Environment'", '$fixtureNativeKey')).join('\n');
    fs.writeFileSync(script, `$ErrorActionPreference='Stop'\n$fixtureKey='HKCU:\\Software\\SnFluentEnvironmentTest-'+$PID\n$fixtureNativeKey='HKCU\\Software\\SnFluentEnvironmentTest-'+$PID\nif (Test-Path -LiteralPath $fixtureKey) { throw 'Fixture already exists' }\n$created=$false\n${helpers}\ntry {\nNew-Item -Path $fixtureKey -ErrorAction Stop | Out-Null\n$created=$true\nif ((Read-UserGitPath).Exists) { throw 'Expected missing fixture value' }\n$value='  %SystemRoot%\\Tools;"C:\\Space Dir";'+('C:\\Long Directory;' * 200)+'  '\nforeach ($kind in @('REG_SZ','REG_EXPAND_SZ')) {\nWrite-UserGitPath $value $kind\n$read=Read-UserGitPath\nif ($read.Value -cne $value -or $read.Kind -cne $kind) { throw 'Raw registry roundtrip mismatch' }\n}\nWrite-Output 'EXACT_RAW_ROUNDTRIP_PASSED'\n} finally { if ($created) { Remove-Item -LiteralPath $fixtureKey -Recurse -Force -ErrorAction Stop } }\n`);
    const exe = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const result = spawnSync(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], { encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /EXACT_RAW_ROUNDTRIP_PASSED/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('long raw PATH and expandable references survive unchanged before appended Git', windows, () => {
  const original = '%USERPROFILE%\\Tools;' + 'C:\\SomeLongExistingDirectory;'.repeat(200);
  const result = runCase(original);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.Value, original + result.directory);
  assert.equal(result.Kind, 'REG_EXPAND_SZ');
  assert.equal(result.Writes, 1);
  assert.equal(result.Published, true);
  assert.equal(result.backup.Value, original);
  assert.equal(result.backup.Kind, 'REG_EXPAND_SZ');
});

test('REG_SZ is preserved and duplicate registration is avoided while notification still runs', windows, () => {
  const directory = path.win32.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd');
  const original = 'C:\\Custom;' + directory + ';';
  const result = runCase(original, 'REG_SZ');
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.Value, original);
  assert.equal(result.Kind, 'REG_SZ');
  assert.equal(result.Writes, 0);
  assert.equal(result.Published, true);
});

test('managed expandable Git reference is not duplicated or expanded', windows, () => {
  const original = '%LOCALAPPDATA%\\Programs\\Git\\cmd;C:\\Other';
  const result = runCase(original);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.Value, original);
  assert.equal(result.Writes, 0);
});

for (const scenario of ['blocked', 'concurrent', 'notify-failure']) {
  test(`PATH publication stops on ${scenario}`, windows, () => {
    const result = runCase('C:\\Original', 'REG_EXPAND_SZ', scenario);
    assert.equal(result.status, 11, result.stdout);
    assert.equal(result.Published, false);
    if (scenario !== 'notify-failure') assert.equal(result.Writes, 0);
    else assert.equal(result.Writes, 1); // partial registration must NOT be called complete
  });
}
