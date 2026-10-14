---
name: win-git-bootstrap
description: Use when performing authorized Windows agent setup, or when the user explicitly asks to install missing Git or to repair user PATH registration for an existing Git that new terminals cannot find; not for routine Git commands or Git errors met during other work. Preserves existing Git and installs genuinely missing Git only through the pinned MinGit 2.54.0.windows.1 worker.
argument-hint: <authorized setup or explicit bootstrap problem and observed evidence>
compatibility: Windows x64, non-elevated user, Windows PowerShell 5.1 with an execution policy that permits this local unsigned script, Windows tar.exe and Windows OpenSSH. No Node dependency for deployment.
metadata:
  version: '1'
---

# Windows Git bootstrap

Use this skill only during authorized Windows agent setup or explicit Git bootstrap troubleshooting. Routine Git-dependent work does not trigger this skill or authorize bootstrap probes/installations. Do not probe/install on unrelated turns. If Git is found missing during other work, report the exact error and ask whether the user wants this bootstrap. This is the user-approved missing-Git setup method, not permission to replace existing software or bypass corporate controls.

## Decision rule

For the explicitly requested [VS Code-only Git repair](https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/fix-vscode-git.md), use the scoped workflow below and the guide's single non-fatal preflight first; do not run this ordinary inventory before that check. All other setup retains this absent-only decision rule.

1. Run `git.exe --version` in the approved terminal, or with the harness's approved direct-process tool. If PATH lookup fails, check `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`, `Git\cmd\git.exe` under `%ProgramFiles%` and `%ProgramFiles(x86)%`, and the `Software\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1` registrations (HKCU, HKLM and HKLM `Software\WOW6432Node`); the bundled worker also checks these.
2. A working stable Git **>=2.54.0** is left unchanged. If it is only missing from the current process PATH, use its verified absolute path rather than installing a second copy.
3. If Git is **genuinely absent** and installation is authorized (full agent setup, or the user approved installing MinGit in this conversation), run the bundled worker with **`-InstallIfMissing`**. Wait for completion before using Git. A troubleshooting request alone authorizes only the checks in rules 1-2: report the finding, state the download URL, target directory and user-PATH change, and ask.
4. If an executable exists but cannot run, registration exists without a verified executable, the target directory already exists, or an older Git is installed, **stop and explain/ask**. A permission error, EPERM, spawn failure or application-control block is not "not installed". Do not retry through another launcher or automatically upgrade, downgrade, repair, uninstall or migrate it. No worker mode upgrades or replaces a Git outside `%LOCALAPPDATA%\Programs\Git`; for an older Git elsewhere, report its path and version and leave the upgrade to whoever manages that installation.

A newer working version satisfies the requested minimum-version check, but the worker warns that it is not the pinned build; this does not imply application-control approval. Never download another/newer version as a fallback.

## Explicit VS Code-only installation

First follow the repair guide's **one bounded, non-fatal Git version check**. A responding Git means finish without installation, configuration changes or a restart request; do not enforce the pinned version on an already working copy. A missing/failed probe is captured as a diagnostic result and the agent continues the authorized repair, not an uncaught error or automatic end of the task. Do not relaunch a denied executable through another launcher. Unknown completion must be recovered before deployment.

For that repair branch, use **`-InstallForVSCode`** alone. This supported opt-in mode selects only `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`; keep an existing exact pinned copy, or install when that target is genuinely absent. A blocked/different selected executable, occupied target or associated per-user registration remnant still stops deployment safely. The worker itself does not execute or alter unselected system Git; a failed preflight never authorizes overwriting it or bypassing security policy.

The mode retains the fixed ZIP/hash, extraction exclusions, non-elevated execution, lock, staging/final checks, Windows SSH/Schannel and security checks. It does **not** register Windows PATH or publish an environment update. Configure the VS Code terminal environment and `git.path` as described in the repair guide; this explicitly approved workflow permits its Git function beside `now-sdk`. Finish installation and pre-restart checks in the current session. The user's final restart is only for refreshing existing hosts, not an agent follow-up session.

Only this VS Code mode accepts the agent host's indexed `safe.bareRepository=explicit`, `credential.interactive=never` and `core.fsmonitor=false` settings. It validates the count/pairs and preserves them unchanged; unknown, malformed or weaker settings stop for review without logging values. Do not clear arbitrary `GIT_*` variables to make installation pass. Other override checks and default-mode behavior remain unchanged.

Do not combine this mode with `-InstallIfMissing`, staging, migration, environment-refresh or `-GitExecutable` flags. A worker from an older release (for example the copy earlier versions installed under `~/.agents/skills/`) might not support it: use the guide's hash-verified worker rather than inventing flags or editing the installed script. Never bypass a denied selected executable.

## Run the bundled worker

This procedure is setup-only and is not installed into the agent profile. Use the worker obtained under step 2 of the [Windows Git setup procedure](../../git-setup.md): the hash-verified download, or [`tools\win-git-bootstrap\scripts\Ensure-MinGit254.ps1`](scripts/Ensure-MinGit254.ps1) in a reviewed checkout of this repository, compared with the same expected script hash. Never use a copy from the project cwd or Downloads that has not passed that check.

PowerShell terminal command (run as the intended user, not Administrator/SYSTEM):

```powershell
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Worker = '<absolute path of the hash-verified Ensure-MinGit254.ps1>'
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $Worker -InstallIfMissing
Write-Host "Ensure-MinGit254 exit code: $LASTEXITCODE"
```

Run the block as one command so the exit code belongs to this run. Use the approved VS Code terminal, allow at least 15 minutes and wait for native completion. If the tool returns first, completion is UNKNOWN: do not start a second run; read the newest `mingit-*.log` and check whether the worker's `powershell.exe` is still running. With an approved direct-process tool, pass the absolute executable and an argument array with environment-variable paths already resolved; do not assume shell-expression expansion. This runs synchronously without an installer UI. Do not pass `-ExecutionPolicy Bypass`, use CMD/batch launchers, or start a background job and assume it succeeded.

The worker is an unsigned local script. If execution policy, Mark-of-the-Web or application control refuses to start it, the worker never ran and wrote no log for this run: this is a policy block, not a Git failure. Stop under rule 4, quote the error and ask the user to obtain the organization's approval/signing. Do not use `Unblock-File`, `Set-ExecutionPolicy` at any scope, `-ExecutionPolicy`, `-Command`/`-EncodedCommand`/stdin launching, another interpreter or elevation.

In an install run the worker also stops, before any download, if a process named `git`, `ssh`, `git-bash` or `git-cmd` is running (it never kills applications; ask the user to close them; it checks again before deployment), if `GIT_SSH`, `GIT_SSH_COMMAND`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_COUNT` or `GIT_SSL_NO_VERIFY` is set (report the names, not the values; do not clear them to proceed without the user; `-InstallForVSCode` accepts only the indexed agent-host settings described above), or if the session is elevated.

Use the invocation shown above rather than adding a `2>&1` capture around child PowerShell with `$ErrorActionPreference = 'Stop'`: Windows PowerShell 5.1 can treat native stderr as a terminating `NativeCommandError` before the caller reads `$LASTEXITCODE`. The worker redirects the expected `ssh -V` banner to per-run `ssh-*.stdout.log` / `ssh-*.stderr.log` files, checks the exit code, and records success in the main log. A banner on stderr alone is not an SSH failure. Launch errors and missing/nonzero exit codes still stop deployment; do not suppress real failures or change security policy.

Ordinary absent-only setup runs the worker with `-InstallIfMissing`; only the explicitly approved VS Code-only workflow uses `-InstallForVSCode`. Never run the worker with no mode switch; that path omits the absent-only guards.

## Pinned package and extraction requirements

- Artifact: `MinGit-2.54.0-64-bit.zip` from release **`v2.54.0.windows.1`** only.
- URL: `https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/MinGit-2.54.0-64-bit.zip`
- Required SHA-256: `04F937E1F0918B17B9BE6F2294CB2BB66E96E1D9832D1C298E2DE088A1D0E668`.
- Verify the archive hash before extraction, including cached copies.
- Use Windows `%WINDIR%\System32\tar.exe` with **`--exclude=usr/bin/find.exe`** and **`--exclude=usr/bin/sort.exe`** before `-xf`.
- Verify the filtered archive list before writing and confirm excluded paths are absent afterward.
- Never use unfiltered `Expand-Archive`, extract-then-delete, a full Git EXE installer, a "latest" URL, winget/chocolatey defaults, or renaming blocked binaries as a fallback.
- Deploy only into `%LOCALAPPDATA%\Programs\Git`; ordinary setup adds only its `cmd` directory to user PATH. Explicit `-InstallForVSCode` leaves Windows PATH unchanged.
- Select Windows OpenSSH explicitly through `core.sshCommand`; use `http.sslBackend=schannel` with certificate verification enabled. Do not invoke bundled SSH or curl utilities.

If the download fails (proxy, blocked host, timeout), stop and report the `FAILED:` line; do not try another URL, tool or mirror. The only supported offline route is for the user or their IT to place the official file at exactly `%LOCALAPPDATA%\Git254Bootstrap\cache\MinGit-2.54.0-64-bit.zip`: the worker verifies its SHA-256 and then skips the download. `-StageOnly` hash-checks such a pre-seeded ZIP without deploying.

These constraints are implemented in the bundled script; do not improvise another installer. Omission of optional utilities avoids attempting their installation; it is not a security-policy exemption or permission to execute them elsewhere.

## Shell-independent Windows environment

A fresh installation registers the Git cmd directory in **Windows user PATH** and requests native Windows environment propagation before logging `SUCCESS`. It preserves and verifies the raw PATH and registry type, including long values and `%VARIABLE%` references, with an `environment-before-*.json` backup. No machine PATH is changed.

The native Windows `setx.exe` updater receives **only** a short owned `SN_FLUENT_ENV_REFRESH` marker. `reg.exe` reads raw PATH with exact separators; a typed registry-provider write preserves embedded quotes, whitespace and the original registry type. PATH is never written with `setx`, avoiding truncation/reference expansion. The marker is non-secret notification metadata. Unknown existing marker values, unavailable/blocked updater execution, concurrent PATH edits and failed readback stop the operation. No Add-Type/PInvoke, alternate-interpreter or policy fallback is used.

For an explicitly requested environment-only repair of a verified existing Git, run the same worker with `-RefreshEnvironment -GitExecutable <absolute git.exe path>` in place of `-InstallIfMissing`. The path must be an already resolved drive-letter path whose file name is `git.exe`, without `%`, `;` or line breaks (assign it to a variable such as `$GitExe` and pass that, not `%LOCALAPPDATA%\...` text); the Git must be >=2.54.0 and the session non-elevated. The `configure-git` command of the Agent distribution checkout does the same and also removes known legacy profile workarounds, but it is not part of the installed profile: do not search for or clone a checkout to use it. This does not download/extract/reinstall Git or alter Git configuration. Do not combine it with installation/staging/migration switches. The full Agent installer performs this environment step automatically and removes known legacy Git-specific profile workarounds with a settings backup.

Outside the explicitly approved VS Code-only repair above, do not add Git PATH code, aliases or overrides to a particular shell/profile. Native update success does not prove that every running host adopted the environment: save work and restart affected applications from a refreshed launcher. Verify bare `git --version` in the actual terminal hosts used; do not label a simulated shell or absolute-path check as universal acceptance.

## Verification and reporting

- Capture the worker's exit code **and** log result (if the worker started). Exit 0 does not identify the outcome; find the marker in the worker output or log and report it: `SKIP:` existing Git kept, nothing changed; `SUCCESS:` fresh install (one advisory line follows it); `ENVIRONMENT UPDATED` PATH registration only; `STAGED:` / `VALIDATED STAGING ONLY:` not an install; `FAILED:` with exit 1 means stop and quote the message. `ABSENT-ONLY SETUP:` and `WARNING:` are progress lines, not outcomes.
- Exit 1 does not prove nothing changed. Deployment into `%LOCALAPPDATA%\Programs\Git` happens before final verification, PATH registration and the last security-log check. If `FAILED:` comes after `Staged native Git version/init/status passed`, check whether `cmd\git.exe` exists there; if so report "deployed; post-deployment step failed" with the `FAILED:` line. Do not re-run `-InstallIfMissing` (it would only log `SKIP:` without registering PATH). For a security-block failure, stop. For an environment-registration failure, the repair is `-RefreshEnvironment -GitExecutable <that path>` after the user confirms.
- A `FAILED:` error about `Git254Bootstrap\deployment.lock` already existing means an earlier run was interrupted or is still running. Confirm no worker is active and ask the user before removing only that lock directory.
- After `SUCCESS:`, verify with the absolute executable:

  ```powershell
  $GitExe = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
  & $GitExe --version
  & $GitExe config --system --get http.sslBackend
  & $GitExe config --system --get core.sshCommand
  Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\Git\usr\bin\find.exe')
  Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\Git\usr\bin\sort.exe')
  ```

  Require `git version 2.54.0.windows.1`, `schannel`, the `System32\OpenSSH\ssh.exe` path under the Windows directory written with forward slashes, and `False` for both excluded utilities.
- The worker checks deployment-path Defender/AppLocker/Code Integrity blocks and fails closed if those logs cannot be inspected. On a block, stop; do not change exclusions/policies or retry via another executable without review.
- Optional network smoke test, with certificate verification **on** and only credential helpers off: `& $GitExe -c credential.helper= -c http.sslVerify=true ls-remote https://github.com/git-for-windows/git.git HEAD`. Never set `http.sslVerify=false`. A pass is not proof of private SSH/HTTPS authentication.
- Parent processes can retain a stale PATH. Use the absolute executable immediately; restart the relevant parent application or sign out/in for a guaranteed refresh. Do not repeatedly reinstall to fix stale PATH.
- Logs: `%LOCALAPPDATA%\Git254Bootstrap\logs\mingit-*.log`. The cached ZIP (`cache\MinGit-2.54.0-64-bit.zip`) and staging directories are under the same `Git254Bootstrap` root.
- PowerShell may log AppLocker script-policy records while running in ConstrainedLanguage. Do not describe that as full-language approval or promise zero security notifications on every machine.

## Scope limits and explicit modes

- `-InstallForVSCode`: explicit approved per-user installation/selection at the exact pin; unselected system Git and Windows PATH remain untouched. See the exception above.
- `-StageOnly`: download (or reuse the cached ZIP) and hash-check only; no deployment.
- `-ValidateOnly`: selectively extract/configure/test a separate stage; no uninstall, promotion or PATH changes.
- `-ReplaceFullGit`: only for a per-user full Git registered under HKCU and installed at `%LOCALAPPDATA%\Programs\Git`; after staging MinGit it runs that Git's signed uninstaller. It cannot handle a machine-wide (Program Files/HKLM) or otherwise located Git. **Never use this for automatic setup. Requires separate explicit user approval.**
- `-RefreshEnvironment -GitExecutable <path>`: explicit user PATH registration/native update for existing verified Git; no installation or Git configuration changes.
- The modes are mutually exclusive, and the worker is never run without one. Authorized missing-Git installation always uses `-InstallIfMissing`; the full Agent installer separately performs its documented environment-registration step.
- No repositories or user/global Git configuration are modified. No security exclusions, mitigation changes, auto-updater or reboot are introduced.
- This is a reduced MinGit deployment, not the entire upstream distribution. Unix scripts/hooks requiring find/sort, LFS, private authentication, signing and arbitrary shell utilities are outside the validated base feature set. Do not substitute Windows find/sort for their Unix counterparts.

Read the [validation record](references/validation.md) when troubleshooting (its first section is safe failure handling) or reviewing the test evidence. Run only the worker adjacent to this skill or, during pre-install setup, the hash-verified copy the Git setup guide saves under `%LOCALAPPDATA%\Git254Bootstrap\bootstrap\`. Do not depend on a Downloads copy.
