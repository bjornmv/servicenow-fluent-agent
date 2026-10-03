'use strict';

// Run the documented block with a tiny fake npm JS file in isolated temp dirs.
// Never invoke npm, the SDK, networking, registry writes or a real installation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const setup = fs.readFileSync(path.join(root, 'setup.md'), 'utf8');
const section = setup.split('### 2. Install now-sdk')[1].split('### 3.')[0];
const snippet = section.match(/```powershell\n([\s\S]*?)```/)[1];
const windows = { skip: process.platform !== 'win32' };
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const quote = value => "'" + value.replaceAll("'", "''") + "'";

function run({ exit = 0, metadata = true, mock = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk capture '));
  try {
    const npm = path.join(dir, "fake npm's cli.js");
    const count = path.join(dir, 'calls.txt');
    fs.writeFileSync(npm, `const fs=require('fs'); fs.appendFileSync(${JSON.stringify(count)},'call\\n'); console.log('ARGS='+JSON.stringify(process.argv.slice(2))); console.error('npm warn deprecated: fixture warning only'); process.exitCode=${exit};`);
    const appData = path.join(dir, 'Roaming');
    const localData = path.join(dir, 'Local');
    if (metadata) {
      const pkg = path.join(appData, 'npm/node_modules/@servicenow/sdk/package.json');
      fs.mkdirSync(path.dirname(pkg), { recursive: true });
      fs.writeFileSync(pkg, JSON.stringify({ name: '@servicenow/sdk', version: '4.13.3' }));
    }
    const binding = "$NpmCli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\\npm\\bin\\npm-cli.js'";
    assert.ok(snippet.includes(binding));
    const script = path.join(dir, 'capture.ps1');
    const definition = mock ? `function Start-Process { param($FilePath,$ArgumentList,[switch]$NoNewWindow,[switch]$Wait,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError,$ErrorAction) ${mock} }\n` : '';
    fs.writeFileSync(script, `${definition}try {\n${snippet.replace(binding, '$NpmCli = ' + quote(npm))}\nWrite-Output 'CAPTURE_COMPLETE'\nexit 0\n} catch { Write-Output ('CAPTURE_ERROR: '+$_.Exception.Message); exit 11 }\n`);
    // Strict PS 5.1 parent with merged child streams, reproducing the failure-prone caller.
    const wrapper = `$ErrorActionPreference='Stop'; try { $text=@(& ${quote(powershell)} -NoLogo -NoProfile -NonInteractive -File ${quote(script)} 2>&1); $code=$LASTEXITCODE; $text | ForEach-Object { Write-Output ([string]$_) }; exit $code } catch { Write-Output ('WRAPPER_ERROR: '+$_.FullyQualifiedErrorId); exit 92 }`;
    const r = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', wrapper], {
      env: { ...process.env, APPDATA: appData, LOCALAPPDATA: localData }, encoding: 'utf8', timeout: 30000,
    });
    assert.ifError(r.error);
    const logsRoot = path.join(localData, 'SNSetup');
    const logDir = fs.existsSync(logsRoot) && fs.readdirSync(logsRoot)[0];
    const read = name => logDir && fs.existsSync(path.join(logsRoot, logDir, name)) ? fs.readFileSync(path.join(logsRoot, logDir, name), 'utf8').trim() : null;
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls: fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim().split('\n').length : 0,
      out: read('npm.stdout.log'), err: read('npm.stderr.log'), code: read('npm.exit-code.txt') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('setup separates package installation from fresh-profile function acceptance', () => {
  assert.match(section, /Do not run bare `now-sdk` yet/);
  assert.doesNotMatch(snippet, /now-sdk(?:\.cmd|\.ps1)?\s+--version|\*>\s*\$null|2>&1|\[pscustomobject\]/i);
  assert.match(snippet, /-RedirectStandardOutput \$SdkStdout -RedirectStandardError \$SdkStderr/);
  const acceptance = setup.split('### 7.')[1];
  assert.match(acceptance, /Create New Terminal \(With Profile\)/);
  assert.ok(acceptance.indexOf("$SdkCommand.CommandType -ne 'Function'") < acceptance.indexOf('\nnow-sdk --version'));
  assert.match(setup, /Do not start a second copy/);
  assert.match(setup, /ConstrainedLanguage/);
  assert.match(setup, /Do not invoke CMD/);
  const installer = fs.readFileSync(path.join(root, 'bin/sn-fluent-agent.cjs'), 'utf8');
  assert.match(installer, /create a NEW PowerShell with now-sdk terminal after profile configuration/);
  assert.match(installer, /do not probe batch shims or reinstall for an old terminal/);
});

test('npm stderr warning survives strict PS 5.1 caller with one execution and durable exit log', windows, () => {
  const r = run();
  assert.equal(r.status, 0, JSON.stringify(r));
  assert.equal(r.calls, 1);
  assert.equal(r.code, '0');
  assert.match(r.out, /@servicenow\/sdk@latest/);
  assert.match(r.out, /--no-progress/);
  assert.match(r.err, /npm warn deprecated/);
  assert.match(r.stdout, /SDK_PACKAGE_VERSION=4\.13\.3/);
  assert.match(r.stdout, /CAPTURE_COMPLETE/);
  assert.doesNotMatch(r.stdout, /WRAPPER_ERROR|CAPTURE_ERROR/);
});

test('nonzero native exit stays fatal even when package metadata exists', windows, () => {
  const r = run({ exit: 23 });
  assert.equal(r.status, 11, JSON.stringify(r));
  assert.equal(r.calls, 1);
  assert.equal(r.code, '23');
  assert.match(r.err, /fixture warning/);
  assert.match(r.stdout, /SDK installation failed/);
  assert.doesNotMatch(r.stdout, /SDK_PACKAGE_VERSION|CAPTURE_COMPLETE/);
});

test('zero npm exit without expected package metadata is not installation acceptance', windows, () => {
  const r = run({ metadata: false });
  assert.equal(r.status, 11, JSON.stringify(r));
  assert.equal(r.code, '0');
  assert.match(r.stdout, /SDK metadata is missing/);
  assert.doesNotMatch(r.stdout, /CAPTURE_COMPLETE/);
});

for (const [name, mock, expected] of [
  ['missing exit code', 'return @{}', /completion is unknown/],
  ['missing process result', 'return $null', /completion is unknown/],
  ['launch failure', "throw 'Simulated launch failure'", /Simulated launch failure/],
]) {
  test('capture stops on ' + name + ' without starting a second process', windows, () => {
    const r = run({ mock });
    assert.equal(r.status, 11, JSON.stringify(r));
    assert.equal(r.calls, 0);
    assert.equal(r.code, null);
    assert.match(r.stdout, expected);
    assert.doesNotMatch(r.stdout, /CAPTURE_COMPLETE|SDK_PACKAGE_VERSION/);
  });
}
