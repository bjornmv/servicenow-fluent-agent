'use strict';

// Source-extracted orchestration uses in-memory PowerShell mocks. Separate
// rename tests use disposable directories containing text files, never Git.
// Never launch the worker, Git, SSH, tar, whoami, an updater or an uninstaller.
// No downloads, Git deployment, registry access or persistent environment changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const worker = fs.readFileSync(path.resolve(__dirname, '../../tools/win-git-bootstrap/scripts/Ensure-MinGit254.ps1'), 'utf8').replaceAll('\r\n', '\n');
const windowsOnly = { skip: process.platform !== 'win32' };
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
function extract(name) {
  const source = worker.match(new RegExp(`^function ${name} \\{\\n[\\s\\S]*?^\\}`, 'm'))?.[0];
  assert.ok(source, `missing canonical ${name}`);
  return source;
}
const parameters = worker.match(/^\[CmdletBinding\(\)\]\nparam\([\s\S]*?^\)/m)?.[0];
const preamble = worker.slice(worker.indexOf("$ErrorActionPreference = 'Stop'"), worker.indexOf('function Write-Log'));
const entry = worker.slice(worker.indexOf('\ntry {\n') + 1);
const helpers = ['Confirm-InstallMode', 'Confirm-VSCodeHostGitConfig', 'Get-VSCodeGit', 'Read-GitVersion', 'Get-Inventory', 'Confirm-Archive', 'Confirm-NoBusyGit'].map(extract).join('\n');

// Replace only the three known native call sites in the extracted orchestration.
// Deployment filesystem/registry/process boundaries below are mocks; indexed
// config uses real child-only environment fixtures. No real deployment functions
// (Get-Archive, Invoke-Git, Add-UserGitPath, etc.) are loaded.
function mockEntry() {
  assert.ok(parameters);
  assert.ok(entry.startsWith('try {\n'));
  const whoami = '& "$env:SystemRoot\\System32\\whoami.exe" /groups /fo csv /nh 2>&1';
  assert.equal(entry.split(whoami).length - 1, 2);
  assert.equal(entry.split('& $tar @excludeArguments -tf $archive').length - 1, 1);
  assert.equal(entry.split('& $tar @excludeArguments -xf $archive -C $stage').length - 1, 1);
  const body = entry.replaceAll(whoami, 'Invoke-FixtureWhoami')
    .replace('& $tar @excludeArguments -tf $archive', 'Get-FixtureArchiveList')
    .replace('& $tar @excludeArguments -xf $archive -C $stage', 'Expand-FixtureArchive');
  assert.doesNotMatch(body + helpers + preamble, /&|Invoke-Expression|Invoke-WebRequest|Start-Job|Start-ThreadJob/i);
  return body;
}

const mocks = String.raw`
$script:occupied = $selected -ne 'absent'
$script:promoted = $false
$script:auditCount = 0
function Write-Log { param($Message) Write-Host $Message }
function Get-Command {
    param($Name, $CommandType, $ErrorAction)
    Write-Host 'INVENTORY_LOOKUP'
    if ($InstallForVSCode) { throw 'Unexpected unselected lookup' }
    if ($system -ne 'absent' -and $system -ne 'registration') { return @{ Source = $systemGit } }
}
function Resolve-Path { param($LiteralPath) return @{ Path = $LiteralPath } }
function Test-Path {
    param($LiteralPath, $PathType)
    if ($LiteralPath -eq $target) {
        Write-Host "TARGET_CHECK|locked=$lockAcquired"
        return $script:occupied
    }
    if ($LiteralPath -eq $targetGit) { return ($selected -in @('working', 'blocked', 'wrong', 'newer') -or $script:promoted) }
    if ($LiteralPath -like 'HKLM:*') {
        Write-Host 'SYSTEM_REGISTRATION_CHECK'
        if ($InstallForVSCode) { throw 'Unexpected system registration read' }
        return ($system -ne 'absent')
    }
    if ($LiteralPath -like 'HKCU:*') {
        if ($LiteralPath -notlike '*\Uninstall\Git_is1') { throw 'Unexpected registry path' }
        if ($registration -eq 'wow') { return $LiteralPath -like '*WOW6432Node*' }
        return ($registration -ne 'none' -and $LiteralPath -eq $fullGitKey)
    }
    if ($LiteralPath -eq $systemGit) { return ($system -ne 'absent' -and $system -ne 'registration') }
    if ($LiteralPath -eq $tar) { return $failure -ne 'tar-missing' }
    if ($failure -eq 'excluded-extracted' -and $LiteralPath -eq (Join-Path $stage 'usr/bin/find.exe')) { return $true }
    return $false
}
function Get-ItemProperty {
    param($LiteralPath)
    Write-Host "REGISTRATION_READ|$LiteralPath"
    if ($LiteralPath -like 'HKLM:*') {
        if ($InstallForVSCode) { throw 'Unexpected system registration read' }
        return @{ InstallLocation = 'C:\fixture-system\Git' }
    }
    switch ($registration) {
        'unknown' { return @{} }
        'other' { return @{ InstallLocation = 'C:\other-user-git' } }
        'uninstaller' { return @{ InstallLocation = 'C:\other-user-git'; UninstallString = ('"' + $target + '\unins000.exe"') } }
        default { return @{ InstallLocation = $target.ToUpperInvariant().Replace('\', '/') + '/' } }
    }
}
function Invoke-Git {
    param($Executable, $GitArguments)
    Write-Host "GIT_MOCK|$Executable|$($GitArguments -join ' ')"
    if ($Executable -eq $systemGit) {
        if ($system -eq 'blocked') { throw 'Fixture SYSTEM Git blocked' }
        if ($system -eq 'old') { return 'git version 2.53.0.windows.1' }
        return 'git version 2.55.0.windows.1'
    }
    if ($Executable -ne $targetGit -and $Executable -ne (Join-Path $stage 'cmd\git.exe')) { throw 'Unexpected Git path' }
    if ($Executable -eq $targetGit -and -not $script:promoted) {
        if ($selected -eq 'blocked') { throw 'Fixture selected Git blocked' }
        if ($selected -eq 'wrong') { return 'git version 2.54.0.windows.2' }
        if ($selected -eq 'newer') { return 'git version 2.55.0.windows.1' }
    }
    if ($GitArguments[0] -eq '--version') {
        if ($failure -eq 'stage-version' -and $Executable -ne $targetGit) { return 'git version 2.53.0.windows.1' }
        if ($failure -eq 'final-version' -and $script:promoted) { return 'git version 2.53.0.windows.1' }
        return 'git version 2.54.0.windows.1'
    }
    if ($GitArguments -contains '--get') {
        if ($failure -eq 'final-config') { return 'wrong-setting' }
        return $settings[$GitArguments[-1]]
    }
    if ($failure -eq 'stage-init' -and $GitArguments -contains 'init') { throw 'Fixture init failed' }
}
function Invoke-FixtureWhoami {
    Write-Host 'NON_ELEVATED_CHECK'
    $global:LASTEXITCODE = 0
    if ($failure -eq 'elevated') { return 'S-1-16-12288' }
    return 'S-1-16-8192'
}
function Confirm-WindowsOpenSsh {
    param($Executable, $LogPrefix)
    Write-Host 'SSH_CHECK'
    if ($failure -eq 'ssh') { throw 'Fixture SSH failed' }
}
function Get-Process {
    param($Name, $ErrorAction)
    Write-Host 'BUSY_CHECK'
    if ($failure -eq 'busy') { return @{ Name = 'git' } }
}
function New-Item {
    param($ItemType, $Path, [switch]$Force, $ErrorAction)
    if ($Path -eq $lock) {
        if ($Force) { throw 'Lock must not use Force' }
        Write-Host 'LOCK_ACQUIRE'
        if ($failure -eq 'lock') { throw 'Fixture lock occupied' }
        if ($appear -eq 'lock') { $script:occupied = $true }
        if ($appear -eq 'registration-lock') { $script:registration = 'target' }
    } elseif ($Path -eq $stage) { Write-Host 'STAGE_CREATE' }
    elseif ($Path -eq (Join-Path $stage '.bootstrap-empty-template')) { Write-Host 'EMPTY_TEMPLATE_CREATE' }
    elseif ($Path -ne $LogDirectory -and $Path -ne (Split-Path -Parent $target)) { throw 'Unexpected directory write' }
}
function Get-Archive {
    $currentConfig = @(Get-ChildItem Env:GIT_CONFIG_* | Where-Object { $_.Name -eq 'GIT_CONFIG_COUNT' -or $_.Name -like 'GIT_CONFIG_KEY_*' -or $_.Name -like 'GIT_CONFIG_VALUE_*' } | Sort-Object Name | Select-Object Name,Value) | ConvertTo-Json -Compress
    if ($currentConfig -cne $initialConfig) { throw 'Host config was unexpectedly changed' }
    Write-Host 'HOST_CONFIG_UNCHANGED'
    Write-Host 'ARCHIVE_CHECK'
    Confirm-Archive $archive
}
function Get-FileHash {
    param($LiteralPath, $Algorithm)
    if ($LiteralPath -ne $archive -or $Algorithm -ne 'SHA256') { throw 'Unexpected hash request' }
    if ($failure -eq 'hash') { return @{ Hash = 'BAD' } }
    return @{ Hash = $expectedHash }
}
function Get-FixtureArchiveList {
    Write-Host "FILTERED_LIST|$($excludeArguments -join ' ')"
    $global:LASTEXITCODE = 0
    if ($failure -eq 'list-exclusion') { return @('cmd/git.exe', 'usr/bin/find.exe') }
    return @('cmd/git.exe', 'etc/gitconfig')
}
function Expand-FixtureArchive { Write-Host 'EXTRACT_MOCK'; $global:LASTEXITCODE = 0 }
function Set-Content {
    param($LiteralPath, $Encoding, [Parameter(ValueFromPipeline)]$Value)
    process {
        if ($LiteralPath -ne (Join-Path $stage $markerName)) { throw 'Unexpected content write' }
        Write-Host 'MARKER_WRITE'
    }
}
function Remove-Item {
    param($LiteralPath, [switch]$Recurse, [switch]$Force, $ErrorAction)
    if ($LiteralPath -eq $lock) { Write-Host 'LOCK_RELEASE' }
    elseif ($LiteralPath -eq (Join-Path $stage '.bootstrap-probe')) { Write-Host 'PROBE_REMOVE' }
    elseif ($LiteralPath -eq (Join-Path $stage '.bootstrap-empty-template')) { Write-Host 'EMPTY_TEMPLATE_REMOVE' }
    else { throw 'Unexpected removal' }
}
function Confirm-NoDeploymentBlocks {
    param($Since)
    $script:auditCount++
    Write-Host "SECURITY_CHECK|$script:auditCount"
    if ($failure -eq 'security' -or ($failure -eq 'final-security' -and $script:auditCount -eq 2)) { throw 'Fixture security log denied/blocked' }
    if ($appear -eq 'promotion') { $script:occupied = $true }
    if ($appear -eq 'registration-promotion') { $script:registration = 'target' }
}
function Rename-Item {
    param($LiteralPath, $NewName, $ErrorAction)
    Write-Host 'RENAME_ATTEMPT'
    if (-not $lockAcquired -or $LiteralPath -ne $stage -or $NewName -ne 'Git' -or (Split-Path -Parent $stage) -ne (Split-Path -Parent $target)) { throw 'Unsafe promotion' }
    if ($appear -eq 'rename') { $script:occupied = $true }
    if ($script:occupied) { throw 'Fixture rename refuses appeared target' }
    $script:promoted = $true
    $script:occupied = $true
    Write-Host 'PROMOTED'
}
function Move-Item {
    param($LiteralPath, $Destination)
    if ($InstallForVSCode) { throw 'VS Code mode must never back up or Move-Item a target' }
    if ($LiteralPath -ne $stage -or $Destination -ne $target) { throw 'Unexpected move' }
    $script:promoted = $true
    $script:occupied = $true
    Write-Host 'DEFAULT_PROMOTED'
}
function Add-UserGitPath {
    param($GitDirectory)
    if ($InstallForVSCode) { throw 'Unexpected PATH updater' }
    Write-Host 'DEFAULT_PATH_UPDATER'
}
function Get-Content { throw 'Unexpected content read' }
function Get-Item { throw 'Unexpected registry/item read' }
function New-ItemProperty { throw 'Forbidden registry write' }
function Set-ItemProperty { throw 'Forbidden registry write' }
function Write-UserGitPath { throw 'Forbidden PATH write' }
function Read-UserGitPath { throw 'Forbidden PATH read' }
function Get-EnvironmentPublisher { throw 'Forbidden environment updater' }
function Publish-EnvironmentChange { throw 'Forbidden environment publication' }
function Start-Process { throw 'Forbidden process launch' }
function Invoke-WebRequest { throw 'Forbidden download' }
function Get-AuthenticodeSignature { throw 'Unexpected uninstaller inspection' }
`;

function runScenario(options = {}) {
  const { args = ['-InstallForVSCode'], selected = 'absent', system = 'blocked', registration = 'none', appear = '', failure = '' } = options;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mingit vscode fixture '));
  try {
    const script = path.join(directory, 'scenario.ps1');
    const setup = Object.entries({ selected, system, registration, appear, failure }).map(([key, value]) => `$${key} = ${quote(value)}`).join('\n');
    const childEnvironment = String.raw`
Write-Host "LANGUAGE_MODE=$($ExecutionContext.SessionState.LanguageMode)"
$env:LOCALAPPDATA = 'C:\fixture-user'
$env:ProgramFiles = 'C:\fixture-system'
$env:PROCESSOR_ARCHITECTURE = 'AMD64'
$env:GIT_SSH = $null
$env:GIT_SSH_COMMAND = $null
$env:GIT_CONFIG_SYSTEM = $null
$env:GIT_CONFIG_NOSYSTEM = $null
$env:GIT_CONFIG_COUNT = $null
$env:GIT_SSL_NO_VERIFY = $null
$CacheDirectory = 'C:\fixture-cache'
$LogDirectory = 'C:\fixture-logs'
$systemGit = 'C:\fixture-system\Git\cmd\git.exe'
`;
    const isolatedEnv = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_PARAMETERS', 'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR'].map(name => `$env:${name} = $null`).join('\n');
    const override = options.override ? `$env:${options.override} = 'fixture-override'` : '';
    const hostConfig = options.hostConfig || {};
    const configSetup = Object.entries(hostConfig).map(([name, value]) => {
      assert.match(name, /^GIT_CONFIG_(COUNT|(KEY|VALUE)_[A-Za-z0-9]+)$/);
      return `Set-Item -LiteralPath ${quote('Env:' + name)} -Value ${quote(value)}`;
    }).join('\n');
    const configFixture = `Get-ChildItem Env:GIT_CONFIG_* | Where-Object { $_.Name -like 'GIT_CONFIG_KEY_*' -or $_.Name -like 'GIT_CONFIG_VALUE_*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }\n${configSetup}\n$initialConfig = @(Get-ChildItem Env:GIT_CONFIG_* | Where-Object { $_.Name -eq 'GIT_CONFIG_COUNT' -or $_.Name -like 'GIT_CONFIG_KEY_*' -or $_.Name -like 'GIT_CONFIG_VALUE_*' } | Sort-Object Name | Select-Object Name,Value) | ConvertTo-Json -Compress`;
    fs.writeFileSync(script, `${parameters}\n${childEnvironment}\n${isolatedEnv}\n${override}\n${configFixture}\n${preamble}\n${helpers}\n${setup}\n${mocks}\n${mockEntry()}`);
    const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, ...args], {
      encoding: 'utf8', timeout: 30000, windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '', JSON.stringify(result));
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function expectResult(result, status, pattern) {
  assert.equal(result.status, status, JSON.stringify(result));
  assert.match(result.stdout, pattern);
}
function noUnselected(result) {
  assert.doesNotMatch(result.stdout, /INVENTORY_LOOKUP|SYSTEM_REGISTRATION_CHECK|GIT_MOCK\|C:\\fixture-system|DEFAULT_PATH_UPDATER/);
}

test('source keeps default inventory, shared safeguards and explicit no-clobber/no-PATH boundaries', () => {
  mockEntry();
  assert.match(parameters, /\[switch\]\$InstallForVSCode/);
  assert.match(entry, /if \(\$InstallForVSCode\) \{\n        Confirm-VSCodeHostGitConfig\n        \$inventory = @\(Get-VSCodeGit\)[\s\S]*?\} else \{\n        \$inventory = @\(Get-Inventory\)/);
  assert.match(entry, /Confirm-InstallMode -HasGitExecutable \(\$PSBoundParameters.Keys -contains 'GitExecutable'\)/);
  assert.match(entry, /\$lockAcquired = \$true\n    if \(\$InstallForVSCode\) \{ \$null = Get-VSCodeGit -RequireAbsent \}\n    Get-Archive/);
  assert.match(entry, /if \(\$InstallForVSCode\) \{\n        \$null = Get-VSCodeGit -RequireAbsent[\s\S]*?Rename-Item -LiteralPath \$stage -NewName \(Split-Path -Leaf \$target\) -ErrorAction Stop\n    \} else \{/);
  assert.match(entry, /if \(-not \$InstallForVSCode\) \{ Add-UserGitPath \(Join-Path \$target 'cmd'\) \}/);
  assert.match(entry, /finally \{\n    if \(\$lockAcquired\) \{ Remove-Item -LiteralPath \$lock/);
  assert.match(preamble, /04F937E1F0918B17B9BE6F2294CB2BB66E96E1D9832D1C298E2DE088A1D0E668/);
  assert.match(preamble, /@\('usr\/bin\/find.exe', 'usr\/bin\/sort.exe'\)/);
  assert.match(entry, /'http.sslBackend' = 'schannel'; 'http.sslVerify' = 'true'/);
  assert.match(entry, /'core.sshCommand' = \$windowsSsh.Replace/);
  assert.equal(entry.split('Confirm-NoBusyGit').length - 1, 2);
  assert.equal(entry.split('Confirm-NoDeploymentBlocks $auditStart').length - 1, 2);
  assert.doesNotMatch(extract('Get-VSCodeGit'), /Get-Inventory|Get-Command|HKLM:|ProgramFiles/);
});

const hostConfig = {
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_KEY_0: 'safe.bareRepository', GIT_CONFIG_VALUE_0: 'explicit',
  GIT_CONFIG_KEY_1: 'credential.interactive', GIT_CONFIG_VALUE_1: 'never',
  GIT_CONFIG_KEY_2: 'core.fsmonitor', GIT_CONFIG_VALUE_2: 'false',
};

for (const [label, config] of [
  ['actual three host settings', hostConfig],
  ['empty count', { GIT_CONFIG_COUNT: '0' }],
  ['known subset', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' }],
]) {
  test(`missing approved Git installs with ${label} preserved (mock deployment)`, windowsOnly, t => {
    const result = runScenario({ hostConfig: config });
    assert.match(result.stdout, /LANGUAGE_MODE=(ConstrainedLanguage|FullLanguage)/);
    t.diagnostic(result.stdout.match(/LANGUAGE_MODE=\w+/)[0]);
    expectResult(result, 0, /SUCCESS: Official MinGit/);
    assert.match(result.stdout, /HOST_CONFIG_UNCHANGED/);
    assert.match(result.stdout, /Preserved \d verified restrictive agent-host Git settings/);
    noUnselected(result);
  });
}

for (const [label, config] of [
  ['unknown key', { ...hostConfig, GIT_CONFIG_KEY_2: 'http.extraHeader', GIT_CONFIG_VALUE_2: 'HOST_SECRET_SENTINEL' }],
  ['weaker bare-repository setting', { ...hostConfig, GIT_CONFIG_VALUE_0: 'all' }],
  ['interactive credentials', { ...hostConfig, GIT_CONFIG_VALUE_1: 'always' }],
  ['external fsmonitor', { ...hostConfig, GIT_CONFIG_VALUE_2: 'HOST_SECRET_SENTINEL' }],
  ['duplicate key', { ...hostConfig, GIT_CONFIG_KEY_1: 'safe.bareRepository', GIT_CONFIG_VALUE_1: 'explicit' }],
  ['orphan without count', { GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' }],
  ['extra index', { ...hostConfig, GIT_CONFIG_KEY_3: 'core.fsmonitor', GIT_CONFIG_VALUE_3: 'false' }],
  ['missing value', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor' }],
  ['non-contiguous indexes', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_1: 'core.fsmonitor', GIT_CONFIG_VALUE_1: 'false' }],
  ...['-1', '4', '03', '1e0', '3 ', 'invalid', '3\n', '3\r\n', '0\n'].map(value => ['bad count ' + JSON.stringify(value), { GIT_CONFIG_COUNT: value }]),
]) {
  test(`unsafe/malformed host config stops: ${label}`, windowsOnly, () => {
    const result = runScenario({ hostConfig: config });
    expectResult(result, 1, /Git configuration|indexed Git configuration/);
    assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|LOCK_ACQUIRE|PROMOTED|HOST_SECRET_SENTINEL/);
    noUnselected(result);
  });
}

for (const unsafe of [false, true]) {
  test(`existing selected Git validates host config before probing: unsafe=${unsafe}`, windowsOnly, () => {
    const config = unsafe ? { ...hostConfig, GIT_CONFIG_KEY_2: 'http.sslVerify' } : hostConfig;
    const result = runScenario({ selected: 'working', hostConfig: config });
    expectResult(result, unsafe ? 1 : 0, unsafe ? /Unrecognized Git configuration override/ : /SKIP:/);
    if (unsafe) assert.doesNotMatch(result.stdout, /GIT_MOCK/);
    assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|LOCK_ACQUIRE/);
    noUnselected(result);
  });
}

test('default absent-only still rejects even known indexed host config', windowsOnly, () => {
  const result = runScenario({ args: ['-InstallIfMissing'], system: 'absent', hostConfig });
  expectResult(result, 1, /Git environment overrides are present/);
  assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|LOCK_ACQUIRE/);
});

test('host config validation never strips variables or relaxes other guards', () => {
  assert.doesNotMatch(extract('Confirm-VSCodeHostGitConfig'), /Set-Item|Remove-Item|\$env:\w+\s*=/);
  assert.match(entry, /if \(\$InstallForVSCode\) \{\n        Confirm-VSCodeHostGitConfig\n        \$inventory/);
  assert.match(entry, /\$env:GIT_CONFIG_COUNT -and -not \$InstallForVSCode/);
  for (const name of ['GIT_SSH', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'GIT_SSL_NO_VERIFY', 'GIT_CONFIG_PARAMETERS']) assert.ok(entry.includes('$env:' + name));
});

for (const override of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_CONFIG_GLOBAL', 'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR', 'GIT_SSL_NO_VERIFY', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_CONFIG_PARAMETERS']) {
  test(`VS Code installation rejects inherited ${override} despite allowed host config`, windowsOnly, () => {
    const result = runScenario({ override, hostConfig });
    expectResult(result, 1, /(?:environment|repository\/configuration) overrides are present/);
    assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|LOCK_ACQUIRE|PROMOTED/);
  });
}

test('existing approved selected Git skips without probing blocked SYSTEM Git', windowsOnly, () => {
  const result = runScenario({ selected: 'working' });
  expectResult(result, 0, /SKIP: Working Git/);
  noUnselected(result);
  assert.equal((result.stdout.match(/GIT_MOCK\|/g) || []).length, 1);
  assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|LOCK_ACQUIRE|PROMOTED/);
});

for (const [selected, expected] of [
  ['blocked', /Fixture selected Git blocked/],
  ['wrong', /not the exact pinned build/],
  ['newer', /not the exact pinned build/],
  ['occupied', /exists without a verified executable/],
]) {
  test(`selected ${selected} stops, never falls back or replaces`, windowsOnly, () => {
    const result = runScenario({ selected });
    expectResult(result, 1, expected);
    noUnselected(result);
    assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|LOCK_ACQUIRE|PROMOTED/);
  });
}

for (const registration of ['target', 'wow', 'unknown', 'uninstaller']) {
  test(`per-user registration remnant (${registration}) stops absent target`, windowsOnly, () => {
    const result = runScenario({ registration });
    expectResult(result, 1, /Per-user Git registration remains/);
    noUnselected(result);
    assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|LOCK_ACQUIRE|PROMOTED/);
  });
}

for (const system of ['blocked', 'registration']) {
  test(`absent target installs through shared mocked checks despite SYSTEM ${system}`, windowsOnly, () => {
    const result = runScenario({ system });
    expectResult(result, 0, /SUCCESS: Official MinGit/);
    noUnselected(result);
    const events = ['NON_ELEVATED_CHECK', 'SSH_CHECK', 'BUSY_CHECK', 'LOCK_ACQUIRE', 'TARGET_CHECK|locked=True', 'ARCHIVE_CHECK', 'FILTERED_LIST|--exclude=usr/bin/find.exe --exclude=usr/bin/sort.exe', 'STAGE_CREATE', 'EXTRACT_MOCK', 'PROBE_REMOVE', 'MARKER_WRITE', 'SECURITY_CHECK|1', 'BUSY_CHECK', 'TARGET_CHECK|locked=True', 'RENAME_ATTEMPT', 'PROMOTED', 'SECURITY_CHECK|2', 'SUCCESS:', 'LOCK_RELEASE'];
    let position = -1;
    for (const event of events) {
      position = result.stdout.indexOf(event, position + 1);
      assert.notEqual(position, -1, `missing/out-of-order ${event}: ${result.stdout}`);
    }
    assert.match(result.stdout, /GIT_MOCK\|C:\\fixture-user\\Programs\\Git\\cmd\\git.exe\|--version/);
    assert.match(result.stdout, /\|config --system --get http.sslBackend/);
    assert.match(result.stdout, /\|config --system --get core.sshCommand/);
  });
}

test('unrelated known per-user registration is not a target remnant', windowsOnly, () => {
  const result = runScenario({ registration: 'other' });
  expectResult(result, 0, /SUCCESS:/);
  noUnselected(result);
});

for (const appear of ['lock', 'promotion', 'registration-lock', 'registration-promotion', 'rename']) {
  test(`appeared target/remnant at ${appear} stops without backup or replacement and releases lock`, windowsOnly, () => {
    const result = runScenario({ appear });
    expectResult(result, 1, /appeared|Per-user Git registration remains/);
    noUnselected(result);
    assert.match(result.stdout, /LOCK_RELEASE/);
    assert.doesNotMatch(result.stdout, /PROMOTED|Retained previous|SUCCESS:/);
    if (appear.endsWith('lock')) { assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK/); }
  });
}

for (const other of ['InstallIfMissing', 'StageOnly', 'ValidateOnly', 'ReplaceFullGit', 'RefreshEnvironment', 'GitExecutable']) {
  test(`InstallForVSCode rejects ${other} before selection/deployment`, windowsOnly, () => {
    const args = ['-InstallForVSCode', `-${other}`];
    if (other === 'GitExecutable') args.push('C:\\fixture-user\\Programs\\Git\\cmd\\git.exe');
    const result = runScenario({ args });
    expectResult(result, 1, /InstallForVSCode must be used alone/);
    assert.doesNotMatch(result.stdout, /GIT_MOCK|TARGET_CHECK|INVENTORY_LOOKUP|ARCHIVE_CHECK|LOCK_ACQUIRE/);
  });
}

for (const failure of ['elevated', 'ssh', 'busy', 'lock', 'hash', 'tar-missing', 'list-exclusion', 'excluded-extracted', 'stage-version', 'stage-init', 'security', 'final-version', 'final-config', 'final-security']) {
  test(`shared safeguard ${failure} fails closed in explicit mode`, windowsOnly, () => {
    const result = runScenario({ failure });
    expectResult(result, 1, /FAILED:/);
    noUnselected(result);
    assert.doesNotMatch(result.stdout, /SUCCESS:/);
    if (!failure.startsWith('final-')) assert.doesNotMatch(result.stdout, /^PROMOTED$/m);
    if (['elevated', 'ssh', 'busy', 'lock'].includes(failure)) assert.doesNotMatch(result.stdout, /LOCK_RELEASE/);
    else assert.match(result.stdout, /LOCK_RELEASE/);
  });
}

for (const args of [[], ['-InstallIfMissing']]) {
  test(`default inventory still stops on blocked SYSTEM Git (${args.join(' ') || 'no mode'})`, windowsOnly, () => {
    const result = runScenario({ args });
    expectResult(result, 1, /Fixture SYSTEM Git blocked/);
    assert.match(result.stdout, /INVENTORY_LOOKUP/);
    assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|PROMOTED/);
  });
}

test('default absent-only keeps system-registration veto', windowsOnly, () => {
  const result = runScenario({ args: ['-InstallIfMissing'], system: 'registration' });
  expectResult(result, 1, /Git registration exists but no executable was verified/);
  assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|PROMOTED/);
});

test('default absent-only keeps existing target and older Git guards', windowsOnly, () => {
  expectResult(runScenario({ args: ['-InstallIfMissing'], selected: 'occupied', system: 'absent' }), 1, /installation directory already exists/);
  expectResult(runScenario({ args: ['-InstallIfMissing'], system: 'old' }), 1, /An older Git is already installed/);
});

test('default working newer Git still skips instead of requiring exact pin', windowsOnly, () => {
  const result = runScenario({ args: ['-InstallIfMissing'], system: 'working' });
  expectResult(result, 0, /SKIP: Working Git/);
  assert.match(result.stdout, /not the pinned build/);
  assert.doesNotMatch(result.stdout, /ARCHIVE_CHECK|PROMOTED/);
});

test('default genuinely absent installation retains PATH updater (mock only)', windowsOnly, () => {
  const result = runScenario({ args: ['-InstallIfMissing'], system: 'absent' });
  expectResult(result, 0, /SUCCESS:/);
  assert.match(result.stdout, /DEFAULT_PROMOTED/);
  assert.match(result.stdout, /DEFAULT_PATH_UPDATER/);
  assert.match(result.stdout, /LOCK_RELEASE/);
});

function guideProbe(outcome, executable = 'C:\\fixture system Git\\cmd\\git.exe') {
  const guide = fs.readFileSync(path.resolve(__dirname, '../../docs/fix-vscode-git.md'), 'utf8').replaceAll('\r\n', '\n');
  const source = guide.match(/\$gitProbe = @'\n([\s\S]*?)\n'@/)?.[1];
  assert.ok(source, 'actual documented preflight JavaScript');
  let launches = 0;
  const messages = [];
  const processMock = { argv: ['node', executable] };
  vm.runInNewContext(source, {
    process: processMock,
    console: { log: message => messages.push(message) },
    require: name => {
      assert.equal(name, 'node:child_process');
      return { spawnSync: (file, args, options) => {
        launches++;
        assert.equal(file, executable);
        assert.deepEqual(Array.from(args), ['--version']);
        assert.equal(options.shell, false);
        assert.equal(options.timeout, 10000);
        assert.equal(options.maxBuffer, 8192);
        assert.equal(options.windowsHide, true);
        if (Object.hasOwn(outcome, 'throws')) throw outcome.throws;
        return outcome;
      } };
    },
  }, { timeout: 1000 });
  assert.equal(messages.length, 1);
  assert.ok(messages[0].startsWith('GIT_PREFLIGHT='));
  assert.equal(processMock.exitCode, undefined, 'diagnostic failures do not fail the Node process');
  assert.equal(launches, executable === '-' ? 0 : 1, 'at most one Git attempt; never a launcher retry');
  return JSON.parse(messages[0].slice('GIT_PREFLIGHT='.length));
}

for (const version of ['2.54.0.windows.1', '2.55.1.windows.1', '2.45.0.windows.1']) {
  test(`one preflight keeps working Git ${version} without enforcing the install pin`, () => {
    const result = guideProbe({ status: 0, signal: null, stdout: 'git version ' + version + '\r\n' });
    assert.equal(result.next, 'finish_no_changes');
    assert.equal(result.result, 'working');
    assert.equal(result.version, 'git version ' + version);
    assert.equal(result.exitCode, 0);
  });
}

test('no resolved Git is a handled continue-repair result, without launching anything', () => {
  const result = guideProbe({}, '-');
  assert.equal(result.next, 'continue_repair');
  assert.equal(result.result, 'unavailable');
  assert.equal(result.executable, null);
});

for (const [label, outcome] of [
  ['nonzero exit', { status: 128, stdout: '', stderr: 'PRIVATE_DIAGNOSTIC' }],
  ['nonzero with a version', { status: 1, stdout: 'git version 2.54.0.windows.1' }],
  ['missing executable', { status: null, error: { code: 'ENOENT' } }],
  ['denied launch', { status: null, error: { code: 'EACCES', message: 'PRIVATE_DIAGNOSTIC' } }],
  ['policy launch failure', { status: null, error: { code: 'EPERM' } }],
  ['timeout', { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } }],
  ['output bound', { status: null, error: { code: 'ENOBUFS' } }],
  ['signal', { status: null, signal: 'SIGTERM' }],
  ['missing completion', { status: null, stdout: 'git version 2.54.0.windows.1' }],
  ['unexpected output', { status: 0, stdout: 'PRIVATE_DIAGNOSTIC' }],
  ['empty output', { status: 0, stdout: '' }],
  ['thrown launch error', { throws: { code: 'EACCES', message: 'PRIVATE_DIAGNOSTIC' } }],
  ['unknown thrown error', { throws: null }],
]) {
  test(`one preflight captures ${label} and continues rather than throwing`, () => {
    const result = guideProbe(outcome);
    assert.equal(result.next, 'continue_repair');
    assert.equal(result.result, 'failed');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DIAGNOSTIC/);
  });
}

test('guide gates all mutations and restart behind failure, retaining target safeguards', () => {
  const guide = fs.readFileSync(path.resolve(__dirname, '../../docs/fix-vscode-git.md'), 'utf8');
  assert.match(guide, /finish_no_changes[^\n]*finish immediately/);
  assert.match(guide, /Do not install, back up\/edit settings[^\n]*request a restart/);
  assert.match(guide, /continue_repair[^\n]*section 1 automatically/);
  assert.match(guide, /do not overwrite an occupied\/broken target/);
  assert.match(guide, /After a timeout or missing completion status, establish/);
  assert.match(guide, /No valid record[^\n]*Recover its evidence/);
  assert.ok(guide.indexOf('## 0.') < guide.indexOf('## 1.'));
});

test('guide installs before final user restart and pins the actual worker', () => {
  const guide = fs.readFileSync(path.resolve(__dirname, '../../docs/fix-vscode-git.md'), 'utf8');
  const hash = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../tools/win-git-bootstrap/scripts/Ensure-MinGit254.ps1'))).digest('hex');
  assert.ok(guide.includes(hash));
  assert.match(guide, /-File \$worker -InstallForVSCode/);
  assert.match(guide, /Verify now, before handing back control/);
  assert.match(guide, /There is no post-restart agent task/);
  assert.match(guide, /Allow All\/Autopilot mode, proceed[\s\S]*without an extra approval pause/);
  assert.match(guide, /Do not invoke `code\.cmd`/);
  assert.match(guide, /Never reconstruct a hash from a truncated table display/);
  assert.match(guide, /GIT_WORKER_EXIT=/);
  assert.match(guide, /Host-wrapper errors/);
  assert.match(guide, /do not classify every exit 1 as harmless/);
  assert.match(guide, /node --check/);
  assert.match(guide, /credential\.interactive=never/);
  assert.doesNotMatch(guide, /Continue Git verification using a new terminal|waiting for restart and fresh-terminal verification|Installation is a separate approved task/);
});

for (const collision of [false, true]) {
  test(`real temporary-directory promotion refuses replacement: collision=${collision}`, windowsOnly, () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mingit rename proof '));
    try {
      const stage = path.join(folder, 'Programs', 'Git.stage');
      const target = path.join(folder, 'Programs', 'Git');
      const script = path.join(folder, 'rename.ps1');
      const statement = entry.match(/^        Rename-Item -LiteralPath \$stage -NewName \(Split-Path -Leaf \$target\) -ErrorAction Stop$/m)?.[0];
      assert.ok(statement);
      fs.writeFileSync(script, `$ErrorActionPreference='Stop'\n$stage=${quote(stage)}\n$target=${quote(target)}\nNew-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null\nSet-Content -LiteralPath (Join-Path $stage 'stage.txt') -Value 'stage'\n${collision ? "New-Item -ItemType Directory -Path $target | Out-Null\nSet-Content -LiteralPath (Join-Path $target 'existing.txt') -Value 'preserve'" : ''}\ntry {\n${statement}\nexit 0\n} catch { Write-Output $_.Exception.Message; exit 11 }\n`);
      const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], { encoding: 'utf8', timeout: 15000, windowsHide: true });
      assert.ifError(result.error);
      assert.equal(result.status, collision ? 11 : 0, result.stdout + result.stderr);
      if (collision) {
        assert.ok(fs.existsSync(path.join(stage, 'stage.txt')));
        assert.deepEqual(fs.readdirSync(target), ['existing.txt']);
        assert.equal(fs.readFileSync(path.join(target, 'existing.txt'), 'utf8').trim(), 'preserve');
      } else {
        assert.ok(!fs.existsSync(stage));
        assert.deepEqual(fs.readdirSync(target), ['stage.txt']);
      }
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  });
}
