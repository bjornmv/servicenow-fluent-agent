---
permalink: /git-setup/
---

# Windows Git setup

This is the Git prerequisite handoff from [Agent-assisted setup](https://bjornmv.github.io/servicenow-fluent-agent/setup/). Git is **not required** to read these instructions or download the worker. Do not clone a repository to bootstrap missing Git.

The authoritative installation rules are in the **[win-git-bootstrap skill](https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/payload/.agents/skills/win-git-bootstrap/SKILL.md)** ([repository copy](https://github.com/bjornmv/servicenow-fluent-agent/blob/main/payload/.agents/skills/win-git-bootstrap/SKILL.md)). Read that document completely first. The executable implementation is its adjacent `scripts/Ensure-MinGit254.ps1`; this page adds only the pre-clone HTTPS handoff, not another installer implementation.

## 1. Decide whether installation is needed

- Verify Node.js first as required by `setup.md`. Do not install other missing prerequisites automatically.
- Preserve a working stable Git **>=2.54.0**. If only PATH is stale, use the verified executable's absolute path rather than adding a second installation.
- Use the skill's standard-path and registry checks before treating Git as absent.
- Stop if Git is older, registered but broken, or present but unable to run. Do not upgrade, repair, downgrade or migrate it automatically.
- Run only as the intended non-elevated Windows x64 user. Windows PowerShell 5.1, Windows `tar.exe` and Windows OpenSSH must be available. If they are missing or policy blocks them, stop for review; do not install Windows features or change policy.

Only genuinely missing Git proceeds below. The worker's **`-InstallIfMissing`** mode repeats the checks and refuses to replace an existing installation.

## 2. Obtain and review the worker without Git

If you already have the installed skill or a reviewed repository/source-ZIP checkout, use its adjacent worker. Otherwise download this site's copy over HTTPS. It is copied byte-for-byte from the canonical payload script in the same Pages build as this document.

[Download the PowerShell worker](https://bjornmv.github.io/servicenow-fluent-agent/downloads/Ensure-MinGit254.ps1)

Run this **download-and-verify block only**, in non-elevated Windows PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$BootstrapUrl = 'https://bjornmv.github.io/servicenow-fluent-agent/downloads/Ensure-MinGit254.ps1'
$ExpectedBootstrapSha256 = 'E2A24CA68E668638C46A43DCABFD90E12B30289B2B480F2EB1E15B15E78AC89C'
$RunId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$BootstrapDirectory = Join-Path $env:LOCALAPPDATA "Git254Bootstrap\bootstrap\$RunId"
New-Item -ItemType Directory -Path $BootstrapDirectory -Force -ErrorAction Stop | Out-Null
$BootstrapPath = Join-Path $BootstrapDirectory 'Ensure-MinGit254.ps1'
Invoke-WebRequest -Uri $BootstrapUrl -OutFile $BootstrapPath -UseBasicParsing -TimeoutSec 120
if ((Get-FileHash -LiteralPath $BootstrapPath -Algorithm SHA256).Hash -ne $ExpectedBootstrapSha256) {
    throw 'Bootstrap script hash mismatch. Do not execute the downloaded file.'
}
```

The value above authenticates the **worker script bytes**, not the MinGit ZIP. The worker separately checks the pinned MinGit ZIP SHA-256 from the skill before extraction. A downloaded HTML error page or altered script must fail this check.

Read the saved script before executing it. If using a local payload/installed-skill copy instead, set `$BootstrapPath` to its absolute path and compare it with the same expected script hash. A mismatch is a stop/review condition, not a reason to skip validation.

If the URL is unavailable, the download fails, or the hash mismatches, stop. Do not silently substitute another Git release, installer, script or download source. If `RemoteSigned`, Mark-of-the-Web or application control prevents execution, request the organization's approval/signing process. Do not remove the zone marker, pass `-ExecutionPolicy Bypass`, elevate, or retry through another interpreter.

## 3. Run the reviewed script in absent-only mode

After the hash check and source review, run it synchronously and wait:

```powershell
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $BootstrapPath -InstallIfMissing
if ($LASTEXITCODE -ne 0) {
    throw 'Git bootstrap failed. Review its log and stop setup.'
}
```

Use the command as shown; do not add a `2>&1` capturing wrapper around child PowerShell with `$ErrorActionPreference = 'Stop'`. Windows PowerShell 5.1 can misinterpret native stderr as a terminating error before `$LASTEXITCODE` is checked. The worker captures the normal Windows OpenSSH version banner in per-run `ssh-*.stdout.log` / `ssh-*.stderr.log` files and checks the probe's exit code. Do not interpret the banner alone as an SSH failure, or suppress actual launch/exit-code failures.

In an agent harness, use the approved direct-process tool with an absolute executable and argument array. Environment variables in tool arguments must be resolved to real paths; do not use a CMD/batch launcher. Do not start a detached job and assume success.

The worker installs only the pinned MinGit **2.54.0.windows.1** ZIP, with Unix `find.exe` and `sort.exe` omitted **before extraction**. It keeps Windows OpenSSH, Schannel/certificate verification and deployment-path security checks. Never pass `-ReplaceFullGit` during setup; staging-only modes are not installation success.

## 4. Verify, then return to setup

Read `%LOCALAPPDATA%\Git254Bootstrap\logs\mingit-*.log` and distinguish `SKIP` from `SUCCESS`. A zero exit code alone does not identify which action occurred.

After an actual fresh install:

```powershell
$GitExe = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
& $GitExe --version
& $GitExe config --system --get http.sslBackend
& $GitExe config --system --get core.sshCommand
```

Require successful commands, exact `git version 2.54.0.windows.1`, `schannel`, the Windows OpenSSH path, and absence of `usr\bin\find.exe` and `usr\bin\sort.exe` beneath the managed Git directory. On any failure or relevant security block, stop and report it rather than relaxing the checks.

If the worker reports `SKIP`, verify the existing executable at the path it found and set `$GitExe` to **that** path; do not assume it is the per-user managed path. Use `$GitExe` for all subsequent clone/pull commands. Parent processes can retain stale PATH; do not reinstall to fix that.

Only then return to **step 2 of `setup.md`**. Report the version, verified path, whether Git was preserved/installed, and the worker result/log path. Do not claim private authentication or ServiceNow connectivity.

## Scope and evidence

The reduced MinGit staging copy passed native init/add/commit/branch/merge/local push/clone/fetch/status and public HTTPS tests. The excluded Unix utilities were never written, and no new Defender ASR or executable/code-integrity blocks were found in that test window. PowerShell constrained-language script-policy records can still occur.

Custom hooks/scripts requiring the omitted utilities and private authentication are not certified. A fresh-install attempt stopped before deployment because the PowerShell caller misinterpreted the SSH version banner on stderr. The corrected probe passed isolated Windows PowerShell 5.1 regression tests; successful final fresh-install promotion/PATH registration still awaits a user retest. See the canonical [validation record](https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/payload/.agents/skills/win-git-bootstrap/references/validation.md). This is not permission to weaken security policy or a guarantee of notification-free behavior on every machine.
