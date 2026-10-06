'use strict';

// Exercise the canonical saved worker using fake npm/package files only.
// No real npm/SDK invocation, network, registry or live installation changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const setup = fs.readFileSync(path.join(root, 'setup.md'), 'utf8');
const section = setup.split('### 2. Install now-sdk')[1].split('### 3.')[0];
const worker = fs.readFileSync(path.join(root, 'tools/Invoke-SdkSetup.ps1'), 'utf8');
const windows = { skip: process.platform !== 'win32' };
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const quote = value => "'" + value.replaceAll("'", "''") + "'";

function run({ exit = 0, metadata = true, entry = true, mock = '', mockPhase = 'install', prefix, prefixExit = 0, normalizePrefix = false, recover = false, repeat = false, legacy = false, recorded = '0', logs = true, waitSeconds = 0, delayedExit = false, stderr = 'npm warn deprecated: fixture warning only' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk capture '));
  try {
    const npm = path.join(dir, "fake npm's cli.js");
    const count = path.join(dir, 'calls.txt');
    const prefixCount = path.join(dir, 'prefix-calls.txt');
    const appData = path.join(dir, 'Roaming');
    const expectedPrefix = path.join(appData, 'npm');
    const prefixOutput = prefix === undefined ? (normalizePrefix ? expectedPrefix.toUpperCase().replaceAll('\\', '/') + '/' : expectedPrefix) : prefix;
    fs.writeFileSync(npm, `const fs=require('fs'); const args=process.argv.slice(2);
if(args[0]==='prefix') {
  fs.appendFileSync(${JSON.stringify(prefixCount)},JSON.stringify(args)+'\\n');
  if(${JSON.stringify(prefixOutput)}!==null) console.log(${JSON.stringify(prefixOutput)});
  console.error('fixture prefix diagnostic'); process.exitCode=${prefixExit};
} else {
  fs.appendFileSync(${JSON.stringify(count)},'call\\n'); console.log('ARGS='+JSON.stringify(args)); console.error(${JSON.stringify(stderr)}); process.exitCode=${exit};
}`);
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
        fs.writeFileSync(path.join(logDir, 'npm.stderr.log'), stderr);
      }
    }
    const binding = "$NpmCli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\\npm\\bin\\npm-cli.js'";
    assert.ok(worker.includes(binding));
    const script = path.join(dir, 'capture.ps1');
    const definition = mock ? `function Start-Process { param($FilePath,$ArgumentList,[switch]$NoNewWindow,[switch]$Wait,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError,$ErrorAction) if ($ArgumentList[1] -ne ${quote(mockPhase)}) { return Microsoft.PowerShell.Management\\Start-Process @PSBoundParameters }; ${mock} }\n` : '';
    const start = worker.indexOf("$ErrorActionPreference = 'Stop'");
    fs.writeFileSync(script, worker.slice(0, start) + definition + `try {\n${worker.slice(start).replace(binding, '$NpmCli = ' + quote(npm))}\nWrite-Output 'CAPTURE_COMPLETE'\n} catch { Write-Output ('CAPTURE_ERROR: '+$_.Exception.Message); exit 11 }\n`);
    const invoke = install => {
      // The child returns to the caller: this marker would be lost if an inline
      // exit closed the parent terminal, the regression seen in the real runner.
      const wrapper = `$ErrorActionPreference='Stop'; try { $text=@(& ${quote(powershell)} -NoLogo -NoProfile -NonInteractive -File ${quote(script)} -RunDirectory ${quote(logDir)} ${install ? '-Install' : ''} -WaitSeconds ${waitSeconds} 2>&1); $code=$LASTEXITCODE; $text | ForEach-Object { Write-Output ([string]$_) }; Write-Output 'PARENT_STILL_ALIVE'; exit $code } catch { Write-Output ('WRAPPER_ERROR: '+$_.FullyQualifiedErrorId); exit 92 }`;
      const r = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', wrapper], {
        env: { ...process.env, APPDATA: appData, LOCALAPPDATA: localData }, encoding: 'utf8', timeout: 30000,
      });
      assert.ifError(r.error);
      return { status: r.status, stdout: r.stdout, stderr: r.stderr };
    };
    const snapshot = () => fs.existsSync(logDir) ? fs.readdirSync(logDir).sort().map(n => [n, fs.statSync(path.join(logDir, n)).mtimeMs, fs.readFileSync(path.join(logDir, n), 'utf8')]) : [];
    const before = snapshot();
    if (delayedExit) {
      // Simulate the ORIGINAL operation completing independently after the first
      // missing-marker observation. This child never runs npm/the SDK.
      spawn(process.execPath, ['-e', `setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(path.join(logDir, 'npm.exit-code.txt'))},'0'),4000)`], { stdio: 'ignore' });
    }
    const started = Date.now();
    const result = invoke(!legacy);
    result.elapsedMs = Date.now() - started;
    if (legacy) {
      assert.deepEqual(snapshot().filter(x => !delayedExit || x[0] !== 'npm.exit-code.txt'), before, 'recovery must not change logs apart from the external fixture writer');
      assert.equal(fs.existsSync(prefixCount), false, 'recovery must not run npm prefix');
    }
    let second;
    if (recover || repeat) {
      const saved = snapshot();
      const savedPrefixCalls = fs.existsSync(prefixCount) ? fs.readFileSync(prefixCount, 'utf8') : null;
      second = invoke(repeat);
      assert.deepEqual(snapshot(), saved, 'recovery/refused repeat must not write files');
      assert.equal(fs.existsSync(prefixCount) ? fs.readFileSync(prefixCount, 'utf8') : null, savedPrefixCalls, 'recovery/refused repeat must not run npm prefix');
    }
    const read = name => fs.existsSync(path.join(logDir, name)) ? fs.readFileSync(path.join(logDir, name), 'utf8').replace(/^\uFEFF/, '').trim() : null;
    return { ...result, second, calls: fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim().split('\n').length : 0,
      expectedPrefix, prefixCalls: fs.existsSync(prefixCount) ? fs.readFileSync(prefixCount, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [],
      prefixOut: read('npm-prefix.stdout.log'), prefixErr: read('npm-prefix.stderr.log'),
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
  assert.match(blocks[2], /-File \$SdkWorker -RunDirectory \$SdkLogDir -WaitSeconds 180\n/);
  assert.match(section, /same still-busy terminal/);
  assert.match(section, /Re-read at the end of the wait budget/);
  assert.doesNotMatch(blocks.join('\n'), /\bexit\b|ExecutionPolicy|\[pscustomobject\]|SilentlyContinue/);
  assert.match(section, /continuing at step 3/);
  assert.match(setup, /do not delegate installation or recovery to an execution subagent/);
  const acceptance = setup.split('### 7.')[1];
  assert.match(acceptance, /Create New Terminal \(With Profile\)/);
  assert.ok(acceptance.indexOf("$SdkCommand.CommandType -ne 'Function'") < acceptance.indexOf('\nnow-sdk --version'));
});

// Documentation contract regressions for the early-return incident. These do
// not simulate Copilot or establish live notification/terminal acceptance.
test('early tool returns stay pending and cannot stand in for an elapsed recovery wait', () => {
  assert.match(setup, /missing exit status remains UNKNOWN/);
  assert.match(setup, /tool's `ok`, `mode: sync`, or “Command produced no output” is not a native exit status/);
  assert.match(section, /launch time and any returned operation ID/);
  assert.match(section, /do not reset it to not-started/);
  assert.match(section, /measured from the recorded install launch time/);
  assert.match(section, /13-second early return is not a completed 180-second recovery wait/);
  assert.match(section, /Record actual elapsed time and completion evidence/);
  assert.match(section, /Immediately before any unresolved handoff, make one final independent reread/);
  assert.match(section, /If evidence cannot be read, report that limitation/);
  assert.doesNotMatch(setup, /genuine launch failures, missing exit status and policy blocks remain failures/);
});

test('setup respects notification-only hosts rather than polling or queuing into a busy terminal', () => {
  assert.match(setup, /do not force async, issue sleep commands, or poll when the host forbids them/);
  assert.match(section, /identify the host's documented completion mechanism/);
  assert.match(section, /Do not send recovery, `Get-Process`, echo\/probe or other diagnostic commands into that same still-busy terminal/);
  assert.match(section, /new tool-call ID does not prove a new idle terminal/);
  assert.match(section, /tool explicitly reports background execution, timeout or input-needed/);
  assert.match(section, /notification-driven hosts, yield and wait for the completion notification; do not poll/);
  assert.match(section, /Do not invent an ID or call `get_terminal_output` after an ordinary sync result/);
  assert.match(section, /Repeated timed file checks are polling too/);
  assert.match(section, /Positive `-WaitSeconds` internally polls with `Start-Sleep`/);
  assert.match(section, /`-WaitSeconds 0` is a one-shot read-only check/);
  assert.doesNotMatch(section, /Poll the original tool operation, or use file-reading tools/);
  assert.doesNotMatch(section, /every 10–15 seconds/);
});

test('original durable success can resume setup without an unnecessary recovery launch', () => {
  const durable = section.split('- **Original durable result:**')[1].split('- **Completed read-only recovery:**')[0];
  for (const term of ['`npm.exit-code.txt` as exactly `0`', 'both saved logs', '`sdk.result.json`', '`schemaVersion: 1`', '`state: package-verified`', '`npmExitCode: 0`', 'expected worker version', 'exact recorded `runDirectory`', '`packagePath`', '`@servicenow/sdk`', '`packageVersion`', '`bin/index.js` exists']) {
    assert.ok(durable.includes(term), term);
  }
  assert.match(durable, /Do not launch recovery merely to print another success marker/);
  assert.match(section, /resume at step 3 without another installation approval/);
  assert.match(section, /Completion of the package does not prove the original terminal is idle/);
  assert.match(section, /Fresh-terminal CLI acceptance remains step 7/);
});

test('recovery cannot hide conflicting results or turn its own nonzero exit into npm failure', () => {
  assert.match(section, /nonzero recovery exit can mean missing evidence or wait-budget expiry/);
  assert.match(section, /not\*\* by itself a nonzero npm exit/);
  assert.match(section, /Resolve `\$PowerShellExe`, `\$SdkWorker` and `\$SdkLogDir` from their recorded absolute paths/);
  assert.match(section, /reduce `-WaitSeconds` accordingly/);
  assert.match(section, /does \*\*not\*\* validate an existing `sdk.result.json`/);
  assert.match(section, /independently apply the same identity\/version\/metadata consistency checks/);
  assert.match(section, /malformed or conflicting existing result cannot be ignored/);
  assert.match(section, /attributable native recovery exit 0/);
  assert.match(section, /Native npm exit is nonzero, or a launch\/policy failure is confirmed/);
});

test('unresolved host limitations preserve a resumable checkpoint without claiming installation failure', () => {
  assert.match(section, /Setup pending — terminal completion unavailable/);
  assert.match(section, /Do not call this an installer failure or an expired wait/);
  assert.match(section, /Do not ask the user to run recovery while a supported automatic route remains available/);
  assert.match(section, /instructions alone cannot repair a terminal/);
  assert.match(section, /SDK package verified; remaining setup pending terminal availability/);
  assert.match(section, /Setup pending — SDK completion still unknown/);
  assert.match(section, /recover that same run first and continue from step 3 on success/);
  assert.match(section, /never restart step 2 just because the chat or terminal changed/);
});

test('npm warning survives strict PS 5.1, saves durable result, returns to caller and recovers without reinstall', windows, () => {
  const r = run({ recover: true });
  assert.equal(r.status, 0, JSON.stringify(r));
  assert.equal(r.calls, 1);
  assert.deepEqual(r.prefixCalls, [['prefix', '--global']], 'recovery must not repeat prefix discovery');
  assert.equal(r.prefixOut, r.expectedPrefix);
  assert.equal(r.prefixErr, 'fixture prefix diagnostic');
  const args = JSON.parse(r.out.slice('ARGS='.length));
  assert.equal(args[args.indexOf('--prefix') + 1], r.expectedPrefix, 'install pins the verified prefix as one argument');
  assert.equal(r.code, '0');
  assert.match(r.out, /@servicenow\/sdk@latest/);
  assert.match(r.err, /npm warn deprecated/);
  assert.match(r.stdout, /SDK_PACKAGE_VERSION=4\.13\.3/);
  assert.match(r.stdout, /PARENT_STILL_ALIVE/);
  assert.equal(r.durable.state, 'package-verified');
  assert.equal(r.durable.cliVerified, false);
  assert.equal(r.durable.workerVersion, fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
  assert.equal(r.second.status, 0, JSON.stringify(r));
  assert.match(r.second.stdout, /SDK_NEXT_STEP=3/);
});

test('prefix comparison accepts case, slash and trailing separator normalization', windows, () => {
  const r = run({ normalizePrefix: true });
  assert.equal(r.status, 0, JSON.stringify(r));
  assert.equal(r.calls, 1);
  assert.deepEqual(r.prefixCalls, [['prefix', '--global']]);
  const args = JSON.parse(r.out.slice('ARGS='.length));
  assert.equal(args[args.indexOf('--prefix') + 1], r.expectedPrefix);
});

for (const [name, options, expected] of [
  ['custom prefix', { prefix: 'C:\\custom-npm' }, /differs from expected/],
  ['nonzero exit', { prefixExit: 29 }, /npm prefix failed/],
  ['missing output', { prefix: null }, /output is empty or multiple/],
  ['blank output', { prefix: '' }, /output is empty or multiple/],
  ['multiple paths', { prefix: 'C:\\one\nC:\\two' }, /output is empty or multiple/],
  ['relative path', { prefix: 'npm' }, /Malformed npm global prefix/],
  ['drive-relative path', { prefix: 'C:npm' }, /Malformed npm global prefix/],
  ['dot segment', { prefix: 'C:\\one\\..\\npm' }, /Malformed npm global prefix/],
  ['quoted path', { prefix: '"C:\\npm"' }, /Malformed npm global prefix/],
  ['missing exit code', { mock: 'return @{}', mockPhase: 'prefix' }, /prefix completion is unknown/],
  ['missing process result', { mock: 'return $null', mockPhase: 'prefix' }, /prefix completion is unknown/],
  ['launch failure', { mock: "throw 'Simulated prefix launch failure'", mockPhase: 'prefix' }, /Simulated prefix launch failure/],
  ['missing stdout file', { mock: 'return @{ ExitCode = 0 }', mockPhase: 'prefix' }, /Cannot find path/],
]) {
  test('prefix preflight refuses ' + name + ' despite existing standard-path package', windows, () => {
    const r = run(options); // Metadata and entry already exist by default.
    assert.equal(r.status, 11, JSON.stringify(r));
    assert.equal(r.calls, 0, 'no actual install after unverified prefix');
    assert.deepEqual(r.prefixCalls, options.mock ? [] : [['prefix', '--global']]);
    assert.equal(r.code, null, 'prefix exit must never become the install exit');
    assert.equal(r.out, null);
    assert.equal(r.err, null);
    assert.equal(r.durable, null);
    assert.match(r.stdout, expected);
    assert.doesNotMatch(r.stdout, /CAPTURE_COMPLETE|SDK_PACKAGE_VERSION=|SDK_PACKAGE_VERIFIED=true|SDK_NEXT_STEP=3|package-verified/);
    if (!options.mock) assert.equal(r.prefixErr, 'fixture prefix diagnostic');
  });
}

// Keep the engine warning outside the last 12 lines to catch tail-only scans.
const engineWarning = ['npm warn EBADENGINE Unsupported engine', ...Array.from({ length: 20 }, (_, i) => `npm warn deprecated: fixture warning ${i}`)].join('\n');

function assertEngineReview(r) {
  assert.equal(r.status, 11, JSON.stringify(r));
  assert.match(r.stdout, /SDK_NPM_EXIT=0/);
  assert.match(r.stdout, /SDK_ENGINE_WARNING=true/);
  assert.match(r.stdout, /npm exited 0.*compatibility review/);
  assert.match(r.stdout, /do not reinstall/);
  assert.doesNotMatch(r.stdout, /CAPTURE_COMPLETE|SDK_PACKAGE_VERSION=|SDK_PACKAGE_VERIFIED=true|SDK_NEXT_STEP=3|package-verified|npm failed|installation failed/i);
}

test('EBADENGINE outside stderr tail stops installation and read-only recovery with native exit 0 intact', windows, () => {
  const r = run({ stderr: engineWarning, recover: true });
  assertEngineReview(r);
  assertEngineReview(r.second);
  assert.equal(r.calls, 1, 'only the original fake npm invocation is allowed');
  assert.equal(r.code, '0');
  assert.match(r.out, /@servicenow\/sdk@latest/);
  assert.equal(r.err, engineWarning);
  assert.doesNotMatch(r.err.split('\n').slice(-12).join('\n'), /EBADENGINE/);
  assert.equal(r.durable, null);
  // run() also asserts every saved file's contents and mtime survive recovery.
});

test('legacy EBADENGINE logs refuse package success without invoking npm or modifying evidence', windows, () => {
  const r = run({ legacy: true, stderr: engineWarning });
  assertEngineReview(r);
  assert.equal(r.calls, 0);
  assert.equal(r.code, '0');
  assert.equal(r.out, 'legacy run output');
  assert.equal(r.err, engineWarning);
  assert.equal(r.durable, null);
  // run() compares all legacy evidence contents and mtimes before/after.
});

test('read-only recovery waits for a late exit marker without reinstalling', windows, () => {
  const r = run({ legacy: true, recorded: null, delayedExit: true, waitSeconds: 8 });
  assert.equal(r.status, 0, JSON.stringify(r));
  assert.equal(r.calls, 0);
  assert.ok(r.elapsedMs >= 3500, JSON.stringify(r));
  assert.match(r.stdout, /SDK_PACKAGE_VERIFIED=true/);
});

test('read-only wait expires as unknown, not a failed or repeated installation', windows, () => {
  const r = run({ legacy: true, recorded: null, waitSeconds: 1 });
  assert.equal(r.status, 11, JSON.stringify(r));
  assert.equal(r.calls, 0);
  assert.equal(r.code, null);
  assert.match(r.stdout, /waiting-for-original-run/);
  assert.match(r.stdout, /completion is unknown/);
  assert.ok(r.elapsedMs < 15000, JSON.stringify(r));
});

test('wait mode cannot accidentally authorize installation', windows, () => {
  const r = run({ waitSeconds: 1 });
  assert.equal(r.status, 11, JSON.stringify(r));
  assert.equal(r.calls, 0);
  assert.match(r.stdout, /for read-only recovery/);
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
    assert.deepEqual(r.prefixCalls, [['prefix', '--global']], 'install-phase mocks must allow real fixture prefix discovery');
    if (options.mock) {
      assert.equal(r.calls, 0);
      assert.equal(r.code, null);
      assert.equal(r.out, null);
    }
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
