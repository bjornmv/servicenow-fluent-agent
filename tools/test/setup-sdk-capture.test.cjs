'use strict';

// Exercise the canonical saved worker using fake npm/package files only.
// No real npm/SDK invocation, network, registry or live installation changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const setup = fs.readFileSync(path.join(root, 'setup.md'), 'utf8');
const section = setup.split('### 2. Install now-sdk')[1].split('### 3.')[0];
const worker = fs.readFileSync(path.join(root, 'tools/Invoke-SdkSetup.ps1'), 'utf8');
const windows = { skip: process.platform !== 'win32' };
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const quote = value => "'" + value.replaceAll("'", "''") + "'";

function run({ exit = 0, metadata = true, entry = true, mock = '', recover = false, repeat = false, legacy = false, recorded = '0', logs = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk capture '));
  try {
    const npm = path.join(dir, "fake npm's cli.js");
    const count = path.join(dir, 'calls.txt');
    fs.writeFileSync(npm, `const fs=require('fs'); fs.appendFileSync(${JSON.stringify(count)},'call\\n'); console.log('ARGS='+JSON.stringify(process.argv.slice(2))); console.error('npm warn deprecated: fixture warning only'); process.exitCode=${exit};`);
    const appData = path.join(dir, 'Roaming');
    const localData = path.join(dir, 'Local');
    const sdk = path.join(appData, 'npm/node_modules/@servicenow/sdk');
    if (metadata || entry) fs.mkdirSync(path.join(sdk, 'bin'), { recursive: true });
    if (metadata) fs.writeFileSync(path.join(sdk, 'package.json'), JSON.stringify({ name: '@servicenow/sdk', version: '4.13.3' }));
    if (entry) fs.writeFileSync(path.join(sdk, 'bin/index.js'), '// fixture, never executed');
    const logDir = path.join(localData, 'SNSetup', 'test-run');
    if (legacy) {
      fs.mkdirSync(logDir, { recursive: true });
      if (recorded !== null) fs.writeFileSync(path.join(logDir, 'npm.exit-code.txt'), recorded);
      if (logs) {
        fs.writeFileSync(path.join(logDir, 'npm.stdout.log'), 'legacy run output');
        fs.writeFileSync(path.join(logDir, 'npm.stderr.log'), 'legacy warning');
      }
    }
    const binding = "$NpmCli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\\npm\\bin\\npm-cli.js'";
    assert.ok(worker.includes(binding));
    const script = path.join(dir, 'capture.ps1');
    const definition = mock ? `function Start-Process { param($FilePath,$ArgumentList,[switch]$NoNewWindow,[switch]$Wait,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError,$ErrorAction) ${mock} }\n` : '';
    const start = worker.indexOf("$ErrorActionPreference = 'Stop'");
    fs.writeFileSync(script, worker.slice(0, start) + definition + `try {\n${worker.slice(start).replace(binding, '$NpmCli = ' + quote(npm))}\nWrite-Output 'CAPTURE_COMPLETE'\n} catch { Write-Output ('CAPTURE_ERROR: '+$_.Exception.Message); exit 11 }\n`);
    const invoke = install => {
      // The child returns to the caller: this marker would be lost if an inline
      // exit closed the parent terminal, the regression seen in the real runner.
      const wrapper = `$ErrorActionPreference='Stop'; try { $text=@(& ${quote(powershell)} -NoLogo -NoProfile -NonInteractive -File ${quote(script)} -RunDirectory ${quote(logDir)} ${install ? '-Install' : ''} 2>&1); $code=$LASTEXITCODE; $text | ForEach-Object { Write-Output ([string]$_) }; Write-Output 'PARENT_STILL_ALIVE'; exit $code } catch { Write-Output ('WRAPPER_ERROR: '+$_.FullyQualifiedErrorId); exit 92 }`;
      const r = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', wrapper], {
        env: { ...process.env, APPDATA: appData, LOCALAPPDATA: localData }, encoding: 'utf8', timeout: 30000,
      });
      assert.ifError(r.error);
      return { status: r.status, stdout: r.stdout, stderr: r.stderr };
    };
    const snapshot = () => fs.existsSync(logDir) ? fs.readdirSync(logDir).sort().map(n => [n, fs.statSync(path.join(logDir, n)).mtimeMs, fs.readFileSync(path.join(logDir, n), 'utf8')]) : [];
    const before = snapshot();
    const result = invoke(!legacy);
    if (legacy) assert.deepEqual(snapshot(), before, 'legacy recovery must not change logs');
    let second;
    if (recover || repeat) {
      const saved = snapshot();
      second = invoke(repeat);
      assert.deepEqual(snapshot(), saved, 'recovery/refused repeat must not write files');
    }
    const read = name => fs.existsSync(path.join(logDir, name)) ? fs.readFileSync(path.join(logDir, name), 'utf8').replace(/^\uFEFF/, '').trim() : null;
    return { ...result, second, calls: fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim().split('\n').length : 0,
      out: read('npm.stdout.log'), err: read('npm.stderr.log'), code: read('npm.exit-code.txt'), durable: read('sdk.result.json') && JSON.parse(read('sdk.result.json')) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('SDK setup uses a reviewed saved worker and read-only recovery, never inline exit', () => {
  assert.match(section, /Do not run bare `now-sdk` yet/);
  assert.doesNotMatch(worker, /now-sdk(?:\.cmd|\.ps1)?\s+--version|\*>\s*\$null|2>&1|\[pscustomobject\]|SilentlyContinue|^\s*exit\b/im);
  assert.match(worker, /-RedirectStandardOutput \$SdkStdout -RedirectStandardError \$SdkStderr/);
  const blocks = [...section.matchAll(/```powershell\n([\s\S]*?)```/g)].map(x => x[1]);
  assert.match(blocks[0], /Get-FileHash -LiteralPath \$SdkWorker/);
  assert.doesNotMatch(blocks[0], /-File \$SdkWorker/);
  assert.match(blocks[1], /-File \$SdkWorker -RunDirectory \$SdkLogDir -Install/);
  assert.match(blocks[2], /-File \$SdkWorker -RunDirectory \$SdkLogDir\n/);
  assert.doesNotMatch(blocks.join('\n'), /\bexit\b|ExecutionPolicy|\[pscustomobject\]|SilentlyContinue/);
  assert.match(section, /continuing at step 3/);
  assert.match(setup, /do not delegate installation or recovery to an execution subagent/);
  const acceptance = setup.split('### 7.')[1];
  assert.match(acceptance, /Create New Terminal \(With Profile\)/);
  assert.ok(acceptance.indexOf("$SdkCommand.CommandType -ne 'Function'") < acceptance.indexOf('\nnow-sdk --version'));
});

test('npm warning survives strict PS 5.1, saves durable result, returns to caller and recovers without reinstall', windows, () => {
  const r = run({ recover: true });
  assert.equal(r.status, 0, JSON.stringify(r));
  assert.equal(r.calls, 1);
  assert.equal(r.code, '0');
  assert.match(r.out, /@servicenow\/sdk@latest/);
  assert.match(r.err, /npm warn deprecated/);
  assert.match(r.stdout, /SDK_PACKAGE_VERSION=4\.13\.3/);
  assert.match(r.stdout, /PARENT_STILL_ALIVE/);
  assert.equal(r.durable.state, 'package-verified');
  assert.equal(r.durable.cliVerified, false);
  assert.equal(r.second.status, 0, JSON.stringify(r));
  assert.match(r.second.stdout, /SDK_NEXT_STEP=3/);
});

test('same run cannot trigger duplicate installation', windows, () => {
  const r = run({ repeat: true });
  assert.equal(r.status, 0);
  assert.equal(r.second.status, 11);
  assert.equal(r.calls, 1);
  assert.match(r.second.stdout, /already exists/);
});

test('nonzero native exit stays fatal even when metadata exists', windows, () => {
  const r = run({ exit: 23 });
  assert.equal(r.status, 11, JSON.stringify(r));
  assert.equal(r.calls, 1);
  assert.equal(r.code, '23');
  assert.match(r.stdout, /SDK installation failed/);
  assert.equal(r.durable, null);
});

for (const [name, options, expected] of [
  ['missing package metadata', { metadata: false }, /SDK metadata is missing/],
  ['missing entry file', { entry: false }, /entry point is missing/],
  ['missing exit code', { mock: 'return @{}' }, /completion is unknown/],
  ['missing process result', { mock: 'return $null' }, /completion is unknown/],
  ['launch failure', { mock: "throw 'Simulated launch failure'" }, /Simulated launch failure/],
]) {
  test('worker stops on ' + name, windows, () => {
    const r = run(options);
    assert.equal(r.status, 11, JSON.stringify(r));
    assert.equal(r.durable, null);
    assert.match(r.stdout, expected);
    assert.doesNotMatch(r.stdout, /CAPTURE_COMPLETE|SDK_PACKAGE_VERIFIED=true/);
  });
}

test('legacy 0.3.4 exit/logs recover without launching npm, modifying logs or claiming CLI acceptance', windows, () => {
  const r = run({ legacy: true });
  assert.equal(r.status, 0, JSON.stringify(r));
  assert.equal(r.calls, 0);
  assert.equal(r.durable, null);
  assert.match(r.stdout, /SDK_PACKAGE_VERIFIED=true/);
});

for (const [name, options, expected] of [
  ['absent exit status', { recorded: null }, /completion is unknown/],
  ['malformed exit status', { recorded: 'not an exit code' }, /Invalid recorded/],
  ['nonzero exit status', { recorded: '1' }, /installation failed/],
  ['missing logs', { logs: false }, /logs are missing/],
  ['subsequently removed package', { metadata: false, entry: false }, /metadata is missing/],
]) {
  test('read-only recovery refuses ' + name + ' rather than installing', windows, () => {
    const r = run({ legacy: true, ...options });
    assert.equal(r.status, 11, JSON.stringify(r));
    assert.equal(r.calls, 0);
    assert.match(r.stdout, expected);
  });
}
