---
permalink: /setup/
---

# Agent-Assisted Installation

```text
SETUP_PROTOCOL_VERSION=0.3.8
```

Give a new agent this release-specific prompt (not the unversioned `/setup/` URL):

```text
Read https://bjornmv.github.io/servicenow-fluent-agent/releases/0.3.8/setup.txt and follow its instructions to perform the full ServiceNow Fluent agent setup.
```

If web extraction is incomplete, download that exact text file over HTTPS and read the saved file in bounded ranges, or read this file from a reviewed local repository. Do not require a Git clone to install missing Git. A policy denial is a stop condition, not a reason to change transport. A version mismatch or missing content must be resolved before executing anything.

## Instructions for the Agent

Set up the ServiceNow Fluent agent on this Windows machine. Work through the steps in order, report each result, and stop at the first blocking failure. Node.js must already be installed. This procedure authorizes only the prescribed missing-Git bootstrap, the global SDK package install/update, the two repository checkouts, agent configuration and documentation indexing. Do not install other prerequisites, use elevation, handle credentials, authenticate to ServiceNow, or deploy an application.

### 0. Confirm the guide before execution

Report the guide source and protocol version, and read through its final end marker. Require version **0.3.8**, all steps 1–7, the saved `Invoke-SdkSetup.ps1` launch and the `-WaitSeconds` recovery option. A web tool's “relevant context” response containing omitted sections or ellipses is NOT the complete guide. In a local checkout, compare `VERSION` with the guide before proceeding. If versions differ, stop and obtain the intended complete release; never reconstruct missing commands from memory or blend releases.

The release-specific text and worker are published together under `/releases/0.3.8/`, with a `manifest.json` containing their SHA-256 digests. The unversioned page is for discovery; a successful fetch alone does not establish freshness. If the requested release is unavailable, stop and report it rather than silently using another one.

### Execution discipline

- Use the permitted native executables/Node JavaScript entry points from the outset. Do not invoke CMD, `.cmd`/`.bat` launchers, or probe `now-sdk.cmd`. A policy block must be reported and reviewed, not worked around with another launcher or weaker policy.
- Assume Windows PowerShell 5.1 **ConstrainedLanguage**. Keep diagnostics to cmdlets, hashtables and plain strings; avoid `[pscustomobject]` construction and non-core static calls such as `[IO.Path]::GetFullPath` or `[Diagnostics.FileVersionInfo]::GetVersionInfo`. Use `(Resolve-Path -LiteralPath $ExistingPath).Path` for existing paths and `$PSVersionTable.PSVersion` for the current host version.
- Use file-reading tools with bounded ranges for source/log review. Do not dump whole scripts into the interactive terminal, or run `Select-String -InputObject $WholeScript` repeatedly: each match can print the entire script. Prefer `Select-String -LiteralPath $File -Pattern ...` when needed.
- Keep setup execution in the parent agent; do not delegate installation or recovery to an execution subagent that rewrites commands or loses completion state. Use the reviewed saved workers and the short launch commands exactly. Never append `exit` to a command in a shared interactive terminal: it closes the host and can destroy the runner's completion result. The only planned terminal retirement is the separate, guarded final-step action in step 7, after all installation results are saved. Use `throw` for a blocking failure. Do not bypass script policy.
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

Use the canonical [saved SDK worker](https://bjornmv.github.io/servicenow-fluent-agent/releases/0.3.8/Invoke-SdkSetup.ps1) (`tools/Invoke-SdkSetup.ps1` in this repository), not an improvised multiline terminal command. It runs Node's `npm-cli.js` with separate stdout/stderr files and records `npm.exit-code.txt` plus `sdk.result.json` after package verification. A child script ends without closing the calling terminal.

Download and hash-check **without executing**, then read the saved file using a file-reading tool:

```powershell
$ErrorActionPreference = 'Stop'
$ExpectedSdkSetupSha256 = '36B853602579A70E4D675B698294D431B2A860A467DD0DB584548C4A43ECC54E'
$SdkRunId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$SdkWorkerDir = Join-Path $env:LOCALAPPDATA "SNSetup\workers\$SdkRunId"
New-Item -ItemType Directory -Path $SdkWorkerDir -ErrorAction Stop | Out-Null
$SdkWorker = Join-Path $SdkWorkerDir 'Invoke-SdkSetup.ps1'
Invoke-WebRequest -Uri 'https://bjornmv.github.io/servicenow-fluent-agent/releases/0.3.8/Invoke-SdkSetup.ps1' -OutFile $SdkWorker -UseBasicParsing -TimeoutSec 120
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

**If the runner returns early or loses its completion result:** an empty transcript or `SDK_LOG_DIR` alone is not completion. Do not send diagnostic commands into the same still-busy terminal; they can queue behind npm and also return no output. Poll the original tool operation, or use file-reading tools to re-read this run's `npm.exit-code.txt` and `sdk.result.json` every 10–15 seconds for up to **5 minutes**. A missing marker in one early sample only means “not finished yet”. Re-read at the end of the wait budget before reporting status; do not base a final failure report on an old snapshot.

For a deterministic recovery check in a **separate idle terminal or approved direct-process tool**, use the SAME saved worker and exact recorded run directory, **without `-Install`**. `-WaitSeconds 180` waits read-only for the original run's exit marker; it does not install anything. It also understands 0.3.4 logs. Do not guess the newest directory, use package presence alone, or start a new install:

```powershell
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $SdkWorker -RunDirectory $SdkLogDir -WaitSeconds 180
if ($LASTEXITCODE -ne 0) { throw 'SDK recovery is unresolved or failed; inspect the original operation and stop.' }
```

The worker prints `SDK_WORKER_VERSION=0.3.8`; an unexpected version is a stop/review condition. Wait-budget expiry means **completion still unknown**, not that npm failed; report the exact run and latest evidence without retrying. Recovery checks the recorded npm exit, both logs, current package metadata and SDK entry file without running npm or the SDK. `SDK_PACKAGE_VERIFIED=true` and a zero recovery exit authorize **continuing at step 3**, not repeating step 2. Missing/unreadable/malformed/nonzero evidence is not success; wait for the original operation if unfinished. Do not wrap recovery in `SilentlyContinue` or replace it with `[pscustomobject]` diagnostics.

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

### 7. Open a fresh agent terminal and verify (final step)

The installing agent performs this check itself, after steps 1–6 finish. Use the existing terminal tools; do not install an extension, add a task or simulate a terminal with a child PowerShell process. The intended profile is **PowerShell with now-sdk**. Existing terminals do not retroactively gain its function; a different profile, standalone shell or restored terminal is not equivalent.

#### Prepare the terminal handoff

- Require confirmed completion of every installation/clone/index operation and save their results, including the exact SDK run directory and exit/result files. No pending/background operations, running jobs or unresolved completion may remain in the terminal being retired.
- Record the verified Git absolute path/version, SDK package version and agent repository absolute path in the agent's notes, not just shell variables. Those variables and the old working directory will not survive.
- Check the effective default terminal profile is **PowerShell with now-sdk**, including applicable user/workspace settings. Copilot's `chat.tools.terminal.terminalProfile.windows` can override that default: report an incompatible override for review, rather than silently replacing it. Settings inspection is only a precondition, not runtime acceptance.
- Establish that the current terminal is the agent's own idle, disposable setup terminal. Do not close a user/shared terminal, lose user work or interrupt any process. If ownership, idleness or profile selection is uncertain, stop this handoff and report the verification gap.
- In a completed `run_in_terminal` call with `mode: "sync"`, capture the old shell PID:

```powershell
Write-Output "SETUP_TERMINAL_PID=$PID"
```

#### Retire only that terminal, then let the tool create a new one

Send the following as its **own separate** `run_in_terminal` call (`mode: "sync"`), never appended to an installer, worker, diagnostic or verification command:

```powershell
exit
```

This intentionally ends only the confirmed idle agent-owned shell. A terminal-closed result is expected; it does not invalidate the already-saved installation results. Do not interpret it as npm failure, reinstall anything, or repeatedly send exit. If closure remains unresolved, report that instead of guessing.

Make the next `run_in_terminal` call in normal synchronous mode, not background mode:

```powershell
Write-Output "VERIFICATION_TERMINAL_PID=$PID"
Get-Location
```

In the inspected VS Code implementation, `run_in_terminal` detects an exited/disposed cached shell and creates a new real integrated terminal using the current profile. **Require a different PID** from the recorded setup PID before continuing; a missing/unchanged PID is not fresh-terminal evidence. This lifecycle is source-confirmed, not yet end-to-end tested in Copilot. Record the actual result of this run; never infer success from that implementation alone. A harness with different behavior must report the gap, not bypass its tool restrictions.

Use `Set-Location -LiteralPath` with the recorded agent repository absolute path. Do not assume `$GitExe`, other old variables or the previous working directory survived. Start from the agent repository so another project's local SDK does not mask the global package. Do not define `now-sdk`, inject PATH or copy startup commands into the new terminal to make the test pass; its configured startup must provide the function unaided.

#### Verify commands in the fresh terminal

Require normal command resolution to find the **Function** before invoking the SDK:

```powershell
$ErrorActionPreference = 'Stop'
$GitCommand = Get-Command git -ErrorAction Stop
$GitCommand | Select-Object CommandType, Source
if ($GitCommand.CommandType -ne 'Application') { throw 'Expected Git to resolve to an application.' }
git --version
if ($LASTEXITCODE -ne 0) { throw 'Git terminal verification failed.' }
$SdkCommand = Get-Command now-sdk -ErrorAction Stop
$SdkCommand | Select-Object CommandType, Name
if ($SdkCommand.CommandType -ne 'Function') { throw 'Expected the SDK profile function. Check the selected profile/new terminal; do not run a shim or reinstall the package.' }
now-sdk --version
if ($LASTEXITCODE -ne 0) { throw 'SDK function verification failed; report the actual error and stop.' }
node bin/sn-fluent-agent.cjs verify
if ($LASTEXITCODE -ne 0) { throw 'Agent payload verification failed.' }
```

Require Git's reported **Application** path/version to match the recorded step-1 values and the SDK version to match the verified global package. Preserve the command output and explicit exit results. If any comparison fails, report the mismatch, not a pass. Locally modified payload files and nonzero verifier results must also be reported accurately.

If the function is missing, review the selected profile and preserved custom startup arguments without overwriting them. Report real policy blocks for review; do not try alternative launchers or rerun npm. An absolute-path probe, settings-file inspection, package version, simulated child shell or payload verifier alone is **not** successful new-terminal verification.

If this harness cannot safely perform the handoff, report **Installation complete; fresh-terminal integration check pending** only when installation completion is established. The manual fallback is **Terminal: Create New Terminal (With Profile)** → **PowerShell with now-sdk**, followed by the same checks. Do not label the installation failed or fully verified merely because this final check is unavailable.

#### Other hosts and final report

A new shell does not necessarily refresh a stale VS Code host environment. For Git propagation, save work and restart affected hosts from a refreshed launcher only if needed. **Developer: Reload Window** is not a guaranteed environment refresh. Do not close applications automatically or launch a restarted host from an old shell with stale PATH. Create genuinely new terminals (not a restored/reconnected terminal).

Verify plain `git --version` across the actual hosts/shells the user uses, including an ordinary terminal outside the SDK profile. Do not launch CMD/batch or another prohibited shell merely to test it. Report untested hosts separately; the agent-terminal check does not certify every terminal. If a host remains stale after restart, identify its launcher/explicit PATH override; signing out/in is the fallback, not a substitute for testing or a reason to reinstall.

Report the Node.js/Git/SDK versions, verified Git path and preservation/bootstrap result/logs, SDK run directory, docs path/branch, index path/benchmark, agent repository/install/payload result, old/new terminal PIDs and fresh-terminal command results. Separate installation completion, environment registration and live terminal acceptance. Do not claim authentication or instance connectivity; this procedure tests neither.

```text
SETUP_GUIDE_END=0.3.8
```