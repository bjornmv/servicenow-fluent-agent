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
function block(id) {
  const matches = [...setup.matchAll(new RegExp(`<!-- setup-block:${id} -->\\s*\\x60{3}powershell\\r?\\n([\\s\\S]*?)\\x60{3}`, 'g'))];
  assert.equal(matches.length, 1, `one PowerShell block: ${id}`);
  return matches[0][1];
}
function appendix(id) {
  const match = setup.match(new RegExp(`<a id="${id}"></a>([\\s\\S]*?)(?=<a id=|$)`));
  assert.ok(match, `appendix anchor: ${id}`);
  return match[1];
}
function contract(text, patterns) {
  for (const pattern of patterns) assert.match(text, pattern);
}
const recovery = appendix('sdk-recovery');
const evidence = appendix('sdk-evidence');
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

test('SDK launch uses the reviewed hash-verified worker and guarded prefix, not inline installation', () => {
  assert.doesNotMatch(worker, /now-sdk(?:\.cmd|\.ps1)?\s+--version|\*>\s*\$null|2>&1|\[pscustomobject\]|SilentlyContinue|^\s*exit\b/im);
  assert.match(worker, /-RedirectStandardOutput \$SdkStdout -RedirectStandardError \$SdkStderr/);
  const download = block('sdk-download');
  contract(download, [/Get-FileHash -LiteralPath \$SdkWorker/, /\$Manifest.sdkWorker.sha256 -ne \$ExpectedSdkSetupSha256/, /\.Hash -ne \$ExpectedSdkSetupSha256/]);
  assert.doesNotMatch(download, /-File \$SdkWorker/);
  assert.match(block('sdk-install'), /-File \$SdkWorker -RunDirectory \$SdkLogDir -Install/);
  assert.match(block('sdk-recovery'), /-File \$SdkWorker -RunDirectory \$SdkLogDir -WaitSeconds 180\r?\n/);
  assert.doesNotMatch(block('sdk-recovery'), /\s-Install\b/);
  for (const id of ['sdk-download', 'sdk-install', 'sdk-recovery']) {
    assert.doesNotMatch(block(id), /\bexit\b|ExecutionPolicy|\[pscustomobject\]|SilentlyContinue/);
  }
  contract(appendix('sdk-download'), [
    /Download without executing; read the saved script/, /local copy must pass the same hash gate/,
    /Hash\/signing\/policy failure stops/, /no zone-marker removal or alternate interpreter/,
    /exact saved worker.*not an inline rewrite/, /rejects a custom global prefix/,
    /npm-prefix.stdout.log/, /npm-prefix.stderr.log/, /Failed\/missing prefix verification prevents installation/,
    /No `--force`, suppressed lifecycle scripts or elevation/,
  ]);
  contract(setup, [/Keep mutations in the parent agent/, /one owner per operation/, /checks\/pins `%APPDATA%\\npm`/, /Package verification is separate from the profile Function\/CLI check in step 7/]);
});

// Safety-decision contracts include the appendices. These are offline guide
// regressions, not live Copilot notification or terminal acceptance evidence.
test('early return stays unknown with measured budget and final independent evidence reread', () => {
  contract(setup, [/tool's `ok`, `mode: sync` or blank output is not native completion/, /missing exit evidence is \*\*UNKNOWN\*\*, not failure or permission to retry/, /Record absolute targets, start time, operation ID and native stdout\/stderr\/exit evidence/]);
  contract(recovery, [
    /original operation in progress/, /\*\*5 minutes\*\*, measured from original launch/,
    /Record actual elapsed time/, /requested waits are not elapsed waits/,
    /Limit recovery to the remaining budget/, /Before an unresolved handoff.*final independent reread if permitted/,
    /classify current evidence/, /report unavailable access honestly/,
    /still-unknown result preserves the original checkpoint/, /does not authorize reinstall/,
  ]);
});

test('host notification and status rules prohibit polling loopholes and busy-terminal recovery', () => {
  contract(setup, [/host's actual sync\/status\/notification contract/, /No forced async, sleeps or polling where forbidden/, /Recovery needs independent file access or a confirmed separate idle execution context/]);
  contract(recovery, [
    /different tool-call ID does not establish an independent idle terminal/,
    /Explicit background, timeout or input-needed result[^\n]*Use the returned ID.*documented status\/input tool/,
    /Notification-driven host[^\n]*Yield for completion notification; no polling/,
    /Early sync return[^\n]*exact run's durable files independently; missing files are UNKNOWN/,
    /Separate idle terminal or approved direct-process tool, with waiting permitted/,
    /Never queue recovery, process probes or diagnostics into a potentially busy terminal/,
    /`get_terminal_output` after ordinary sync output.*only if the host contract permits/,
    /Repeated timed file checks and positive `-WaitSeconds`.*`Start-Sleep`.*polling too/,
    /completion files already exist, `-WaitSeconds 0` is a one-shot check, not a polling loop/,
  ]);
});

test('durable success requires exact run, worker, package identity and complete stderr engine review', () => {
  const durable = evidence.match(/^\| Original durable result \| ([^\n]+)$/m)?.[1];
  assert.ok(durable, 'original evidence route');
  contract(durable, [
    /`npm.exit-code.txt` exactly `0`/, /both install logs/, /valid `sdk.result.json`/,
    /`schemaVersion: 1`/, /`state: package-verified`/, /`npmExitCode: 0`/, /expected worker version/,
    /exact recorded `runDirectory`/, /expected `packagePath`/, /metadata name `@servicenow\/sdk`/,
    /version equal to `packageVersion`/, /`bin\/index.js` exists/,
  ]);
  contract(evidence, [
    /%APPDATA%\\npm\\node_modules\\@servicenow\\sdk\\package.json/,
    /For both: scan \*\*complete stderr\*\* for `EBADENGINE`, not only the tail/,
    /engine warnings require compatibility review even with npm exit 0/,
    /deprecations\/optional-add-on failures separately.*do not themselves prove npm failed or affected features work/,
    /not automatic build-tool installation or Node changes/,
    /Consistent success[^\n]*step 3; skip redundant recovery/, /Package presence alone is insufficient/,
    /Package success does not establish terminal idleness/, /queued commands or use a confirmed independent context/,
    /CLI acceptance remains step 7/,
  ]);
  assert.match(setup, /`EBADENGINE` \/ `SDK_ENGINE_WARNING=true`[^\n]*compatibility review, even with npm exit 0/);
});

test('read-only recovery cannot override conflicting JSON or invent npm failure from its own exit', () => {
  const route = evidence.match(/^\| Completed read-only recovery \| ([^\n]+)$/m)?.[1];
  assert.ok(route, 'completed recovery route');
  contract(route, [
    /Attributable native exit 0/, /SDK_PACKAGE_VERIFIED=true/,
    /expected worker \(`SDK_WORKER_VERSION=0\.3\.8`\) and exact run/,
    /Independently validate any existing `sdk.result.json`.*same identity\/version\/metadata checks/,
    /worker does not validate that file/, /Legacy result-less exit\/log evidence.*0\.3\.4 logs/,
    /conflicting existing JSON is not ignored/,
  ]);
  contract(evidence, [/For either evidence path, reject malformed\/conflicting records/, /Proven nonzero npm exit or launch\/policy failure[^\n]*report failure/, /Missing evidence[^\n]*UNKNOWN; conflict[^\n]*review/]);
  contract(recovery, [
    /recorded absolute paths and operation ID, not the newest directory or inherited shell variables/,
    /same worker\/run \*\*without `-Install`\*\*/, /within the remaining budget/,
    /nonzero recovery exit can mean missing evidence or budget expiry, not npm failure/,
    /Save the true outputs\/errors; never hide them in an empty catch or `SilentlyContinue`/,
  ]);
  for (const variable of ['$PowerShellExe', '$SdkWorker', '$SdkLogDir']) {
    assert.ok(block('sdk-recovery').includes(variable + " = '<recorded absolute"), variable);
  }
  assert.match(block('sdk-recovery'), /Fill the original recorded paths before recovery/);
});

test('same-operation resumption and actionable outcomes preserve truthful unknown and completed work', () => {
  contract(setup, [
    /Recover any recorded SDK run first using \[C\]\(#sdk-recovery\)/,
    /Use absolute recorded paths if the shell changed/,
    /Verified original package result[^\n]*Continue at step 3 without reinstall or unnecessary recovery/,
    /Early\/blank return or incomplete evidence[^\n]*Recover the same operation.*no duplicate install/,
    /recover recorded operations before starting replacements/,
  ]);
  contract(appendix('outcome'), [
    /\*\*Complete\*\*[^\n]*Installation and required live checks passed/,
    /\*\*Action needed\*\*[^\n]*concrete question with a recommended choice/,
    /\*\*Could not complete\*\*[^\n]*confirmed failure or host limitation/,
    /UNKNOWN completion is not an npm failure/, /Use supported automatic recovery first/,
    /verified \/ missing \/ not checked/, /one next action/, /checkpoint/,
    /Authentication and instance connectivity are not tested/,
  ]);
  contract(recovery, [/No supported route[^\n]*final permitted evidence snapshot.*specific access\/terminal action needed/, /original checkpoint/]);
  assert.match(appendix('rationale'), /Instructions cannot repair a lost host completion signal/);
  assert.match(setup, /Keep installation, environment registration and terminal acceptance separate/);
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
