'use strict';

// Exercise ONLY the canonical SSH probe, never the bootstrap entry point.
// Windows tests run ssh -V or mock Start-Process; no Git installation, network,
// registry/PATH changes, policy switches, or archive extraction.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const worker = fs.readFileSync(path.join(root, 'payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1'), 'utf8');
const probe = worker.match(/^function Confirm-WindowsOpenSsh \{\r?\n[\s\S]*?^\}/m)?.[0];
const windowsOnly = { skip: process.platform !== 'win32' };
const systemRoot = process.env.SystemRoot || 'C:\\Windows';
const powershell = path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const ssh = path.join(systemRoot, 'System32/OpenSSH/ssh.exe');
const quote = value => "'" + value.replaceAll("'", "''") + "'";

function runProbe({ mock = '', legacy = false, executable = ssh } = {}) {
  // Spaces in the log directory also exercise redirection path handling.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent ssh probe '));
  try {
    assert.ok(probe, 'canonical probe function must exist');
    const prefix = path.join(directory, 'ssh');
    const child = path.join(directory, 'probe.ps1');
    const body = legacy
      ? `$p = Start-Process -FilePath ${quote(ssh)} -ArgumentList '-V' -NoNewWindow -Wait -PassThru`
      : `Confirm-WindowsOpenSsh ${quote(executable)} ${quote(prefix)}`;
    fs.writeFileSync(child, `$ErrorActionPreference = 'Stop'\nfunction Write-Log { param([string]$Message) Write-Output $Message }\n${probe}\n${mock}\ntry {\n${body}\nWrite-Output 'PROBE_COMPLETED'\nexit 0\n} catch {\nWrite-Output ("PROBE_ERROR: " + $_.Exception.Message)\nexit 11\n}\n`);
    // Reproduce the actual VS Code caller: PS 5.1 + Stop + merged child streams.
    const wrapper = `$ErrorActionPreference = 'Stop'; try { $output = @(& ${quote(powershell)} -NoLogo -NoProfile -NonInteractive -File ${quote(child)} 2>&1); $code = $LASTEXITCODE; $output | ForEach-Object { Write-Output ([string]$_) }; exit $code } catch { Write-Output ('WRAPPER_ERROR: ' + $_.FullyQualifiedErrorId); exit 92 }`;
    const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', wrapper], {
      encoding: 'utf8', timeout: 30000, windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return {
      status: result.status, stdout: result.stdout, stderr: result.stderr,
      probeStderr: fs.existsSync(prefix + '.stderr.log') ? fs.readFileSync(prefix + '.stderr.log', 'utf8') : null,
      probeStdout: fs.existsSync(prefix + '.stdout.log') ? fs.readFileSync(prefix + '.stdout.log', 'utf8') : null,
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function startProcessMock(body) {
  return `function Start-Process {\nparam($FilePath, $ArgumentList, [switch]$NoNewWindow, [switch]$Wait, [switch]$PassThru, $RedirectStandardOutput, $RedirectStandardError)\n${body}\n}`;
}

test('canonical worker redirects both SSH streams and fails closed on unknown/nonzero exit', () => {
  assert.ok(probe);
  assert.match(probe, /-RedirectStandardOutput \$stdout -RedirectStandardError \$stderr/);
  assert.match(probe, /\$null -eq \$process\.ExitCode -or \$process\.ExitCode -ne 0/);
  assert.match(probe, /Get-Content -LiteralPath \$stderr, \$stdout -ErrorAction Stop/);
  assert.doesNotMatch(probe, /ErrorActionPreference\s*=\s*['"](?:Continue|SilentlyContinue)|ExecutionPolicy\s+Bypass/);
  assert.match(worker, /Confirm-WindowsOpenSsh \$windowsSsh \(Join-Path \$LogDirectory "ssh-\$runId"\)/);
});

test('legacy inherited stderr reproduces the PS 5.1 NativeCommandError', windowsOnly, () => {
  const result = runProbe({ legacy: true });
  assert.equal(result.status, 92, JSON.stringify(result));
  assert.match(result.stdout, /WRAPPER_ERROR: NativeCommandError/);
});

test('real Windows SSH probe survives a strict PS 5.1 caller and retains its banner', windowsOnly, () => {
  const result = runProbe();
  assert.equal(result.status, 0, JSON.stringify(result));
  assert.equal(result.stderr, '');
  assert.equal(result.probeStdout, '');
  assert.match(result.probeStderr, /OpenSSH_for_Windows/);
  assert.match(result.stdout, /Windows OpenSSH probe passed \(exit 0\): OpenSSH_for_Windows/);
  assert.match(result.stdout, /PROBE_COMPLETED/);
  assert.doesNotMatch(result.stdout, /WRAPPER_ERROR|PROBE_ERROR/);
});

for (const [name, body, expected] of [
  ['nonzero exit', 'return @{ ExitCode = 23 }', /Exit: 23/],
  ['missing exit code', 'return @{}', /returned no exit code/],
  ['missing process result', 'return $null', /returned no exit code/],
  ['launch failure', "throw 'Simulated access denied'", /failed to start.*Simulated access denied/],
]) {
  test(`SSH probe stops on ${name}`, windowsOnly, () => {
    const result = runProbe({ mock: startProcessMock(body) });
    assert.equal(result.status, 11, JSON.stringify(result));
    assert.match(result.stdout, expected);
    assert.match(result.stdout, /PROBE_ERROR:/);
    assert.doesNotMatch(result.stdout, /probe passed|PROBE_COMPLETED|WRAPPER_ERROR/);
  });
}

test('SSH probe stops on a missing executable before starting a process', windowsOnly, () => {
  const result = runProbe({ executable: path.join(os.tmpdir(), 'absent-bootstrap-ssh', 'ssh.exe'), mock: startProcessMock("throw 'Unexpected launch'") });
  assert.equal(result.status, 11, JSON.stringify(result));
  assert.match(result.stdout, /Expected Windows OpenSSH/);
  assert.doesNotMatch(result.stdout, /Unexpected launch|PROBE_COMPLETED|WRAPPER_ERROR/);
});
