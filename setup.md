---
permalink: /setup/
---

# Agent-Assisted Installation

Give a new agent this short prompt:

```text
Read https://bjornmv.github.io/servicenow-fluent-agent/setup and perform the full ServiceNow Fluent agent setup.
```

If the agent cannot access the URL, read the [raw setup document](https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/setup.md), or download the repository source ZIP and read this file locally. Do not require a Git clone to install missing Git.

## Instructions for the Agent

Set up the ServiceNow Fluent agent on this Windows machine. Work through the steps in order, report each result, and stop at the first blocking failure. Node.js must already be installed. This procedure authorizes only the prescribed missing-Git bootstrap, the global SDK package install/update, the two repository checkouts, agent configuration and documentation indexing. Do not install other prerequisites, use elevation, handle credentials, authenticate to ServiceNow, or deploy an application.

### Execution discipline

- Use the permitted native executables/Node JavaScript entry points from the outset. Do not invoke CMD, `.cmd`/`.bat` launchers, or probe `now-sdk.cmd`. A policy block must be reported and reviewed, not worked around with another launcher or weaker policy.
- Assume Windows PowerShell 5.1 **ConstrainedLanguage**. Keep diagnostics to cmdlets, hashtables and plain strings; avoid `[pscustomobject]` construction and non-core static calls such as `[IO.Path]::GetFullPath` or `[Diagnostics.FileVersionInfo]::GetVersionInfo`. Use `(Resolve-Path -LiteralPath $ExistingPath).Path` for existing paths and `$PSVersionTable.PSVersion` for the current host version.
- Use file-reading tools with bounded ranges for source/log review. Do not dump whole scripts into the interactive terminal, or run `Select-String -InputObject $WholeScript` repeatedly: each match can print the entire script. Prefer `Select-String -LiteralPath $File -Pattern ...` when needed.
- Keep setup execution in the parent agent; do not delegate installation or recovery to an execution subagent that rewrites commands or loses completion state. Use the reviewed saved workers and the short launch commands exactly. Never append `exit` to a command in a shared interactive terminal: it closes the host and can destroy the runner's completion result. Use `throw` for a blocking failure. Do not bypass script policy.
- A timeout, spinner or truncated transcript means **completion unknown**, not failure or permission to repeat an install/clone/build. Inspect that operation's existing logs and process/terminal state; wait for it or report the unresolved result. Do not start a second copy or kill applications automatically.
- Keep stdout, stderr and exit status. Never discard native output with `*> $null`, hide exceptions in empty catch blocks, or merge native stderr into a strict PowerShell error pipeline. Warnings alone are not nonzero exit codes; genuine launch failures, missing exit status and policy blocks remain failures.

### 1. Check prerequisites and ensure Git

Before changing anything, verify Node.js:

```powershell
Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
node.exe --version
```

If Node.js is missing or fails, report it and stop without installing anything or making partial configuration changes.

Then check Git availability and its version. Keep a working stable Git **>=2.54.0** unchanged. If it is not on PATH, check known installation locations/registration before declaring it absent. An older Git, an executable that cannot run, or a broken registration requires review; it is **not** permission to reinstall, upgrade or bypass policy.

If Git is genuinely absent, follow the separate **[Windows Git setup procedure](https://bjornmv.github.io/servicenow-fluent-agent/git-setup/)** (local file: `git-setup.md`). It reuses the `win-git-bootstrap` skill and hash-verified script, downloads only MinGit **2.54.0.windows.1**, excludes the two blocked Unix utilities **before extraction**, and runs only `-InstallIfMissing`. The document and script are available over HTTPS without cloning this repository.

Wait for completion and verify the result before continuing to step 2. Record the verified **absolute** Git executable path in `$GitExe` and use it for all remaining Git commands; a newly installed user PATH may not be visible to this session. For a fresh managed install this is `$env:LOCALAPPDATA\Programs\Git\cmd\git.exe`. Stop on any bootstrap or security-policy failure. Never invoke migration/replacement modes as part of setup.

### 2. Install now-sdk

This step installs the **package**, not the VS Code shell function. Do not run bare `now-sdk` yet: the installer creates the **PowerShell with now-sdk** profile in step 5, and its function is available only in newly created terminals using that profile. CLI acceptance belongs to step 7, not this step.

Use the canonical [saved SDK worker](https://bjornmv.github.io/servicenow-fluent-agent/downloads/Invoke-SdkSetup.ps1) (`tools/Invoke-SdkSetup.ps1` in this repository), not an improvised multiline terminal command. It runs Node's `npm-cli.js` with separate stdout/stderr files and records `npm.exit-code.txt` plus `sdk.result.json` after package verification. A child script ends without closing the calling terminal.

Download and hash-check **without executing**, then read the saved file using a file-reading tool:

```powershell
$ErrorActionPreference = 'Stop'
$ExpectedSdkSetupSha256 = '9BCC0FFD8848EAF5442EF644A9E8CCC11F76570C922DB915E856330F35F6D7A0'
$SdkRunId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$SdkWorkerDir = Join-Path $env:LOCALAPPDATA "SNSetup\workers\$SdkRunId"
New-Item -ItemType Directory -Path $SdkWorkerDir -ErrorAction Stop | Out-Null
$SdkWorker = Join-Path $SdkWorkerDir 'Invoke-SdkSetup.ps1'
Invoke-WebRequest -Uri 'https://bjornmv.github.io/servicenow-fluent-agent/downloads/Invoke-SdkSetup.ps1' -OutFile $SdkWorker -UseBasicParsing -TimeoutSec 120
if ((Get-FileHash -LiteralPath $SdkWorker -Algorithm SHA256).Hash -ne $ExpectedSdkSetupSha256) { throw 'SDK worker hash mismatch; do not execute.' }
$SdkLogDir = Join-Path $env:LOCALAPPDATA "SNSetup\$SdkRunId"
Write-Output "SDK_LOG_DIR=$SdkLogDir"
```

A reviewed local repository copy can be used instead, with the same hash check. Stop on download/hash/signing or policy failure; no alternate interpreter, zone-marker removal or policy override. Record the exact `$SdkLogDir` **before** starting. Do not create it yourself; the worker refuses an existing run directory to prevent a duplicate install.

Launch exactly once in a child process and retain the same terminal/tool operation until completion (allow several minutes; poll the original operation if it becomes backgrounded):

```powershell
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $SdkWorker -RunDirectory $SdkLogDir -Install
if ($LASTEXITCODE -ne 0) { throw 'SDK worker stopped; inspect this run, do not reinstall.' }
```

Do not append `exit`, merge child stderr into a strict error pipeline, or translate the worker back into inline commands. In a direct-process tool, use the same executable and argument array with resolved absolute paths.

**If the runner loses its completion result:** use the SAME saved worker and exact recorded run directory, **without `-Install`**. This read-only check also understands the 0.3.4 log format. Do not guess the newest directory, use package presence alone, or start a new install:

```powershell
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $SdkWorker -RunDirectory $SdkLogDir
if ($LASTEXITCODE -ne 0) { throw 'SDK recovery is unresolved or failed; inspect the original operation and stop.' }
```

Recovery checks the recorded npm exit, both logs, current package metadata and SDK entry file without running npm or the SDK. `SDK_PACKAGE_VERIFIED=true` and a zero recovery exit authorize **continuing at step 3**, not repeating step 2. Missing/unreadable/malformed/nonzero evidence is not success; wait for the original operation if unfinished. Do not wrap recovery in `SilentlyContinue` or replace it with `[pscustomobject]` diagnostics.

Require an explicit zero npm exit and valid package metadata before continuing. The default profile expects the standard per-user npm prefix under `%APPDATA%\npm`; a customized prefix requires review, not silent installation into a second location. Do not use `--force`, suppress lifecycle scripts to hide a failure, or elevate.

Report deprecation warnings and failed optional dependencies separately from package installation success. For example, an optional native add-on failure with npm exit 0 does not prove the SDK is unusable, but affected features remain unverified. Consult the saved stderr and npm debug log; do not automatically install build tools or retry the install. Package presence alone is not CLI/runtime acceptance.

### 3. Keep Git shell-independent

Continue using `$GitExe` while setup runs. An existing PowerShell, VS Code or Windows Terminal process may still have its old environment; do not repair that by adding Git to a particular terminal profile, shell startup script, function or alias.

The fresh Git bootstrap registers the directory in **Windows user PATH** and requests normal Windows environment propagation. Step 5 also performs this environment-only operation for an existing verified Git. The raw PATH and registry type are preserved and backed up; only a short owned `SN_FLUENT_ENV_REFRESH` marker is passed through Windows `setx.exe` to request its native environment update. PATH itself is never passed through `setx`, which can truncate long values. No machine PATH, security policy or Git installation/configuration is changed by the environment-only operation.

This applies independently of shell type. It cannot rewrite every already-running application's environment. Restart affected terminal **hosts** from a refreshed launcher after setup, rather than repeatedly reinstalling Git or editing each new terminal's PATH. Do not kill applications or discard work automatically.

### 4. Clone ServiceNowDocs

Use the same short, per-user defaults on every Windows machine:

```text
Docs:  %LOCALAPPDATA%\SNDocs\repo
Index: %LOCALAPPDATA%\SNDocs\index
```

Resolve these once, retaining optional environment overrides (use absolute paths for full setup):

```powershell
$Docs  = if ($env:SN_DOCS_HOME) { $env:SN_DOCS_HOME } else { Join-Path $env:LOCALAPPDATA 'SNDocs\repo' }
$Index = if ($env:SN_DOC_MD_INDEX) { $env:SN_DOC_MD_INDEX } else { Join-Path $env:LOCALAPPDATA 'SNDocs\index' }
```

For a missing `$Docs`, create its parent and clone the Australia documentation branch into that exact destination:

```powershell
New-Item -ItemType Directory -Path (Split-Path -Parent $Docs) -Force | Out-Null
& $GitExe clone --depth 1 --single-branch --branch australia https://github.com/ServiceNow/ServiceNowDocs.git "$Docs"
if ($LASTEXITCODE -ne 0) { throw 'Documentation clone failed; stop setup.' }
```

If `$Docs` already exists, require it to be the repository root, verify its `origin` is `https://github.com/ServiceNow/ServiceNowDocs.git`, its checked-out branch is `australia`, and its working tree is clean before updating:

```powershell
& $GitExe -C "$Docs" pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Documentation update failed; stop setup.' }
```

Stop rather than modifying an unexpected existing directory. Do not discover, move, delete or silently reuse an old checkout/index elsewhere. Merely configuring these defaults must not create directories or populate them; cloning and indexing belong to an authorized full installation.

### 5. Clone and install this agent

Use a normal source directory such as `$HOME\source` for the agent repository, separate from `$Docs` and `$Index`. Clone this repository there:

```powershell
& $GitExe clone https://github.com/bjornmv/servicenow-fluent-agent.git
```

If it already exists, verify that its `origin` matches that URL before updating it with `& $GitExe pull --ff-only`.

Open the repository folder in VS Code. From the repository root, pass the verified Git executable explicitly to the installer:

```powershell
node bin/sn-fluent-agent.cjs install --git-exe "$GitExe"
if ($LASTEXITCODE -ne 0) { throw 'Agent installation failed; stop setup.' }
```

This installs the payload, registers the verified Git directory in **Windows user PATH**, requests native environment propagation, and configures the SDK-only terminal profile. The **PowerShell with now-sdk** profile defines a `now-sdk` function that invokes Node with the project-local SDK entry when present, otherwise the global entry. It deliberately does not invoke a batch shim. This is the intended setup from the outset, not a fallback after a policy denial. Git availability does not depend on that profile. Known legacy Git profile overrides/startup blocks from earlier versions are removed conservatively; unrelated settings and startup commands are preserved with backups. No Git reinstall, machine PATH or security-policy change is performed. `--no-vscode-settings` skips VS Code/SDK-profile configuration, not Windows Git environment registration.

The **Install/Update ServiceNow Fluent Agent** VS Code task remains available; without `--git-exe`, the installer verifies Git from its current PATH or standard locations, and stops if the selected executable is missing, older or blocked.

For Windows Git environment repair only (no Git or payload installation/removal), use `node bin/sn-fluent-agent.cjs configure-git --git-exe "$GitExe"`. It also removes known legacy profile workarounds, with a settings backup. Both commands support `--dry-run`. `configure-terminal` configures the SDK profile only; it is not a Git PATH repair. Stop on any failed native update or policy block; do not substitute another interpreter or weaken policy.

### 6. Build and verify the documentation index

After payload installation, use the installed lookup skill to build the index at the resolved `$Index`. Do not create the index directory beforehand:

```powershell
$Skill = Join-Path $env:USERPROFILE '.agents\skills\sn-doc-lookup'
node "$Skill\bin\sn-doc-md.js" build --docs "$Docs" --out "$Index" --family australia
if ($LASTEXITCODE -ne 0) { throw 'Documentation indexing failed; stop setup.' }
node "$Skill\test\run-tests.js" --index "$Index"
if ($LASTEXITCODE -ne 0) { throw 'Documentation lookup verification failed; stop setup.' }
```

For an existing recognized index, inspect its manifest (generator, family and docs root) first and use `--force` only for an approved rebuild. Never delete an unexpected directory or source checkout to make indexing succeed. Report benchmark failures rather than claiming success.

The CLI shares the same defaults and overrides for build/search/read/test. `node "$Skill\bin\sn-doc-md.js" paths` is a read-only way to inspect resolved paths; it does not download, move or index anything.

### 7. Restart affected hosts and verify

For SDK verification, use **Terminal: Create New Terminal (With Profile)** and select **PowerShell with now-sdk** after step 5. New default PowerShell terminals use this configured profile; existing terminals do not retroactively gain its function. A different profile, restored terminal or standalone PowerShell is not equivalent. Start from the agent repository so a different project's local SDK does not mask the global install.

For Git environment propagation, save work and fully restart affected terminal hosts from a refreshed launcher only if needed. **Developer: Reload Window** is not a guaranteed environment refresh. Do not launch a restarted application from an old shell with stale PATH. Create genuinely new terminals (not a restored/reconnected terminal).

Verify plain `git --version` across the actual hosts/shells the user uses, including an ordinary terminal outside the SDK profile. Do not launch CMD/batch or another prohibited shell merely to test it. In the new SDK-profile terminal, require normal command resolution to find the **Function** before invoking it:

```powershell
Get-Command git
git --version
if ($LASTEXITCODE -ne 0) { throw 'Git terminal verification failed.' }
$SdkCommand = Get-Command now-sdk -ErrorAction Stop
if ($SdkCommand.CommandType -ne 'Function') { throw 'Expected the SDK profile function. Check the selected profile/new terminal; do not run a shim or reinstall the package.' }
now-sdk --version
if ($LASTEXITCODE -ne 0) { throw 'SDK function verification failed; report the actual error and stop.' }
node bin/sn-fluent-agent.cjs verify
if ($LASTEXITCODE -ne 0) { throw 'Agent payload verification failed.' }
```

Settings-file inspection and a package version are not substitutes for this live function check. If the new terminal lacks the function, review the selected profile and preserved custom startup arguments without overwriting them. Report real policy blocks for review; do not try alternative launchers. Do not rerun npm merely because an old terminal cannot resolve the function.

Require `Get-Command git` to identify an **Application** at the same absolute path verified in step 1, and require the bare `git --version` command to succeed with that version. If it fails, stop: an absolute-path Git probe, settings-file inspection, simulated child shell or payload verifier alone is **not** successful new-terminal verification. Report any inability to operate a real new VS Code terminal as an unverified step, not setup complete. Locally modified payload files must also be reported accurately; do not suppress a nonzero verifier result.

Report registration/notification success separately from live command-resolution success. If a host still retains its old environment after restart, stop and identify its launcher or explicit PATH override; do not claim that every terminal is verified. Signing out/in is the fallback for persistent stale process environments, not a substitute for testing the installer.

Report the Node.js and Git versions, verified Git executable path, whether Git was preserved or installed, Git bootstrap result/log path if used, SDK version, ServiceNowDocs path and branch, index path and benchmark result, agent repository path, installation result, and verification result. Do not claim authentication or instance connectivity; this procedure does not test either.