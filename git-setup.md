---
permalink: /git-setup/
---

# Windows Git setup

This is the Git prerequisite handoff from [Agent-assisted setup](https://bjornmv.github.io/servicenow-fluent-agent/setup/). Git is **not required** to read these instructions or download the worker. Do not clone a repository to bootstrap missing Git. If HTML extraction is incomplete, read the complete [plain-text Git guide](https://bjornmv.github.io/servicenow-fluent-agent/git-setup.txt); the current setup manifest records `gitSetup.sha256` and `gitWorker.sha256`. During full setup, require these to match the saved Git guide and worker as well as the expected worker digest below.

The authoritative installation rules are in the **[win-git-bootstrap skill](https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/tools/win-git-bootstrap/SKILL.md)** ([repository copy](https://github.com/bjornmv/servicenow-fluent-agent/blob/main/tools/win-git-bootstrap/SKILL.md)). Read that document completely first. The executable implementation is its adjacent `scripts/Ensure-MinGit254.ps1`; this page adds only the pre-clone HTTPS handoff, not another installer implementation.

## 1. Decide whether installation is needed

Follow the discovery result from `setup.md` step 1. Only `GIT_EXE=none` reaches this page.

| Situation | Action |
| --- | --- |
| A Git **>=2.54.0** runs anywhere (PATH, per-user, Program Files, registered) | Not this page. Select it by absolute path; do not install a second copy. |
| No Git at all | Install the pinned MinGit (below). |
| Only blocked, broken or older copies (`GIT_UNUSABLE=`) | Install the pinned MinGit **side by side** in the per-user target (below). The other copies stay installed, untouched and unselected. |
| `%LOCALAPPDATA%\Programs\Git` exists without a usable Git | Stop and ask. Never overwrite, repair or upgrade it. |

Side-by-side is not a policy bypass. The new copy runs under the same application-control policy; the worker checks the security logs for blocks on it and fails closed. If the organization blocks it too, stop and ask IT for an approved Git; setup can then select that copy by absolute path. Run only as the intended non-elevated Windows x64 user, with Windows PowerShell 5.1, Windows `tar.exe` and Windows OpenSSH available. If they are missing or blocked, stop: do not install Windows features or change policy.

## 2. Obtain and review the worker without Git

If you already have a reviewed repository/source-ZIP checkout, you may use its `tools\win-git-bootstrap\scripts\Ensure-MinGit254.ps1`. Otherwise download this site's copy over HTTPS. It is copied byte-for-byte from the canonical payload script in the same Pages build as this document.

[Download the PowerShell worker](https://bjornmv.github.io/servicenow-fluent-agent/downloads/Ensure-MinGit254.ps1)

Run this **download-and-verify block only**, in non-elevated Windows PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$BootstrapUrl = 'https://bjornmv.github.io/servicenow-fluent-agent/downloads/Ensure-MinGit254.ps1'
$ExpectedBootstrapSha256 = 'ABA785D774837C83D2168780148CEA0C30AAA28EE614370400019CA378414F56'
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

Read the saved script before executing it, using a file-reading tool with bounded ranges rather than dumping it into the terminal. In PowerShell diagnostics, assume ConstrainedLanguage: use cmdlets and plain strings, not `[pscustomobject]` construction or non-core static methods. Do not repeatedly pass the whole script to `Select-String -InputObject`; each match can echo the whole file and bury the result. If using a checkout copy instead, set `$BootstrapPath` to its absolute path and compare it with the same expected script hash. A mismatch is a stop/review condition, not a reason to skip validation.

If the URL is unavailable, the download fails, or the hash mismatches, stop. Do not silently substitute another Git release, installer, script or download source. If execution policy (`Restricted`, `AllSigned`, or `RemoteSigned` with Mark-of-the-Web) or application control prevents execution, the worker never ran and wrote no log; request the organization's approval/signing process. Do not remove the zone marker (`Unblock-File`), run `Set-ExecutionPolicy` at any scope, pass `-ExecutionPolicy`, elevate, or retry through another interpreter. Exception: when this repository itself was installed from a downloaded ZIP, the user (not the agent) may run `Unblock-File` on that ZIP and extract it again, as the installer error says. Never unblock individual scripts, and never do it for a policy or application-control block.

## 3. Run the reviewed script in setup mode

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

The worker repeats discovery (per-user target first, then PATH, registrations and Program Files) and logs `SKIP:` with `SELECTED_GIT=` if a usable Git exists. Otherwise it installs only the pinned MinGit **2.54.0.windows.1** ZIP into the absent per-user target, with Unix `find.exe` and `sort.exe` omitted **before extraction**, and logs `SIDE-BY-SIDE SETUP:` when unusable copies were found. It keeps Windows OpenSSH, Schannel/certificate verification and deployment-path security checks. Never pass `-ReplaceFullGit` during setup; staging-only modes are not installation success.

## 4. Verify, then return to setup

Read `%LOCALAPPDATA%\Git254Bootstrap\logs\mingit-*.log` and distinguish `SKIP` from `SUCCESS`. A zero exit code alone does not identify which action occurred. A nonzero exit with `FAILED:` does not prove nothing changed: if `%LOCALAPPDATA%\Programs\Git\cmd\git.exe` now exists, Git was deployed and a later step failed; do not re-run `-InstallIfMissing` (it would only log `SKIP`), follow the skill's verification section.

After an actual fresh install:

```powershell
$GitExe = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
& $GitExe --version
& $GitExe config --system --get http.sslBackend
& $GitExe config --system --get core.sshCommand
```

Require successful commands, exact `git version 2.54.0.windows.1`, `schannel`, the Windows OpenSSH path, and absence of `usr\bin\find.exe` and `usr\bin\sort.exe` beneath the managed Git directory. On any failure or relevant security block, stop and report it rather than relaxing the checks.

If the worker reports `SKIP`, set `$GitExe` to the logged `SELECTED_GIT=` path, not the per-user managed path. Use `$GitExe` for all subsequent clone/pull commands. Parent processes can retain stale PATH; do not reinstall to fix that.

A fresh install registers Git in Windows **user PATH** and requests native environment propagation (PATH itself never goes through `setx`). Machine PATH precedes user PATH, so a `SHADOWED:` line means another `git.exe` (typically the blocked one) still wins for bare `git` in new processes. That is expected: setup step 5 selects this Git for VS Code with a `git` function beside `now-sdk` in the SDK profile, a `terminal.integrated.env.windows` prefix and `git.path`. Outside VS Code, use the absolute path.

Then return to **step 1 of `setup.md`**, rerun discovery and continue. Report the version, verified path, whether Git was preserved/installed, unusable copies left untouched, and the worker result/log path. Do not claim private authentication or ServiceNow connectivity.

## Evidence

Test history, including the selective-extraction rationale and fresh-install terminal results, is in the [validation record](https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/tools/win-git-bootstrap/references/validation.md). It is not permission to weaken security policy or a guarantee of notification-free behavior on every machine.
