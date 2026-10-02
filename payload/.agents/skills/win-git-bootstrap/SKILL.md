---
name: win-git-bootstrap
description: Check Git during Windows agent setup or before Git-dependent work. If genuinely absent, silently install pinned MinGit 2.54.0.windows.1 with SHA-256 verification and pre-extraction exclusions for blocked Unix find.exe/sort.exe. Preserve existing installations and stop on policy blocks.
compatibility: Windows x64, non-elevated user, Windows PowerShell 5.1, Windows tar.exe and Windows OpenSSH. No Node dependency for deployment.
---

# Windows Git bootstrap

Use this skill during Windows agent setup or when a task needs Git and it is missing. Do not probe/install on unrelated turns. This is the user-approved missing-Git setup method, not permission to replace existing software or bypass corporate controls.

## Decision rule

1. Check `git.exe --version` using a direct approved executable tool. If PATH lookup fails, check `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`, standard Program Files locations and Git uninstall registrations; the bundled worker also checks these.
2. A working stable Git **>=2.54.0** is left unchanged. If it is only missing from the current process PATH, use its verified absolute path rather than installing a second copy.
3. If Git is **genuinely absent**, run the bundled worker with **`-InstallIfMissing`**. Wait for completion before using Git.
4. If an executable exists but cannot run, registration exists without a verified executable, the target directory already exists, or an older Git is installed, **stop and explain/ask**. A permission error, EPERM, spawn failure or application-control block is not "not installed". Do not retry through another launcher or automatically upgrade, downgrade, repair, uninstall or migrate it.

A newer working version satisfies the requested minimum-version check, but the worker warns that it is not the pinned build; this does not imply application-control approval. Never download another/newer version as a fallback.

## Run the bundled worker

Resolve `scripts/Ensure-MinGit254.ps1` **relative to this skill directory**, not the project cwd or Downloads. On an installed profile it is:

```text
%USERPROFILE%\.agents\skills\win-git-bootstrap\scripts\Ensure-MinGit254.ps1
```

PowerShell terminal command (run as the intended user, not Administrator/SYSTEM):

```powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -File "$env:USERPROFILE\.agents\skills\win-git-bootstrap\scripts\Ensure-MinGit254.ps1" -InstallIfMissing
```

In Pi, use `win_process` with the absolute Windows PowerShell executable, the arguments above as an array, and a suitable timeout (up to 900000 ms). Resolve environment-variable paths before putting them into tool arguments; `win_process` does not expand shell expressions. This runs synchronously without an installer UI. Do not pass `-ExecutionPolicy Bypass`, use CMD/batch launchers, or start a background job and assume it succeeded.

Use the invocation shown above rather than adding a `2>&1` capture around child PowerShell with `$ErrorActionPreference = 'Stop'`: Windows PowerShell 5.1 can treat native stderr as a terminating `NativeCommandError` before the caller reads `$LASTEXITCODE`. The worker redirects the expected `ssh -V` banner to per-run `ssh-*.stdout.log` / `ssh-*.stderr.log` files, checks the exit code, and records success in the main log. A banner on stderr alone is not an SSH failure. Launch errors and missing/nonzero exit codes still stop deployment; do not suppress real failures or change security policy.

This skill is also usable directly from the Agent distribution payload before it is copied to the profile. Resolve the adjacent script, keeping `-InstallIfMissing`.

## Pinned package and extraction requirements

- Artifact: `MinGit-2.54.0-64-bit.zip` from release **`v2.54.0.windows.1`** only.
- URL: `https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/MinGit-2.54.0-64-bit.zip`
- Required SHA-256: `04F937E1F0918B17B9BE6F2294CB2BB66E96E1D9832D1C298E2DE088A1D0E668`.
- Verify the archive hash before extraction, including cached copies.
- Use Windows `%WINDIR%\System32\tar.exe` with **`--exclude=usr/bin/find.exe`** and **`--exclude=usr/bin/sort.exe`** before `-xf`.
- Verify the filtered archive list before writing and confirm excluded paths are absent afterward.
- Never use unfiltered `Expand-Archive`, extract-then-delete, a full Git EXE installer, a "latest" URL, winget/chocolatey defaults, or renaming blocked binaries as a fallback.
- Deploy only into `%LOCALAPPDATA%\Programs\Git`; add only its `cmd` directory to the user PATH.
- Select Windows OpenSSH explicitly through `core.sshCommand`; use `http.sslBackend=schannel` with certificate verification enabled. Do not invoke bundled SSH or curl utilities.

These constraints are implemented in the bundled script; do not improvise another installer. Omission of optional utilities avoids attempting their installation; it is not a security-policy exemption or permission to execute them elsewhere.

## Verification and reporting

- Capture the worker's exit code **and** log result. Exit 0 can mean skip, staging-only validation or actual installation: report the actual outcome.
- For an actual install, use `%LOCALAPPDATA%\Programs\Git\cmd\git.exe` directly to verify `git version 2.54.0.windows.1`, system Schannel and Windows SSH configuration. Verify the two excluded utilities are absent.
- The worker checks deployment-path Defender/AppLocker/Code Integrity blocks and fails closed if those logs cannot be inspected. On a block, stop; do not change exclusions/policies or retry via another executable without review.
- A public HTTPS `ls-remote` with certificate checking and credential helpers disabled is an optional network smoke test, not proof of private SSH/HTTPS authentication.
- Parent processes can retain a stale PATH. Use the absolute executable immediately; restart the relevant parent application or sign out/in for a guaranteed refresh. Do not repeatedly reinstall to fix stale PATH.
- Logs: `%LOCALAPPDATA%\Git254Bootstrap\logs\mingit-*.log`. Cached ZIP and staging directories are under the same `Git254Bootstrap` root.
- PowerShell may log AppLocker script-policy records while running in ConstrainedLanguage. Do not describe that as full-language approval or promise zero security notifications on every machine.

## Scope limits and explicit modes

- `-StageOnly`: download/hash-check only; no deployment.
- `-ValidateOnly`: selectively extract/configure/test a separate stage; no uninstall, promotion or PATH changes.
- `-ReplaceFullGit`: potentially uninstalls existing full Git. **Never use this for automatic setup. Requires separate explicit user approval.**
- The modes are mutually exclusive. Routine agent setup always uses `-InstallIfMissing`.
- No repositories or user/global Git configuration are modified. No security exclusions, mitigation changes, auto-updater or reboot are introduced.
- This is a reduced MinGit deployment, not the entire upstream distribution. Unix scripts/hooks requiring find/sort, LFS, private authentication, signing and arbitrary shell utilities are outside the validated base feature set. Do not substitute Windows find/sort for their Unix counterparts.

Read `references/validation.md` when reviewing the test evidence or troubleshooting. Source maintenance: keep this skill and its script in the Agent distribution's `payload/.agents/skills/win-git-bootstrap/`; install/copy that reviewed subtree to the live profile. Do not depend on a Downloads copy.
