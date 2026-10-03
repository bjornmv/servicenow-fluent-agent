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

Set up the ServiceNow Fluent agent on this Windows machine. Work through the steps in order, report each result, and stop at the first blocking failure. The only missing prerequisite you may install is Git, through the linked procedure in step 1. Do not install other missing prerequisites, use elevation, handle credentials, authenticate to ServiceNow, or deploy an application.

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

Install or update the ServiceNow SDK globally:

```powershell
$NodeExe = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$NpmCli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $NpmCli)) { throw 'Locate the approved npm JavaScript entry point before continuing.' }
& $NodeExe $NpmCli install -g "@servicenow/sdk@latest"
if ($LASTEXITCODE -ne 0) { throw 'SDK installation failed; stop setup.' }
```

Stop if this command fails. Do not use `--force` or administrator elevation.

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

This installs the payload, registers the verified Git directory in **Windows user PATH**, requests native environment propagation, and configures the SDK-only terminal profile. Git availability does not depend on that profile. Known legacy Git profile overrides/startup blocks from earlier versions are removed conservatively; unrelated settings and startup commands are preserved with backups. No Git reinstall, machine PATH or security-policy change is performed. `--no-vscode-settings` skips VS Code/SDK-profile configuration, not Windows Git environment registration.

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

Save work, then fully restart affected terminal applications from a refreshed Windows launcher. **Developer: Reload Window** is not a guaranteed environment refresh. Do not launch the restarted application from an old shell with stale PATH. Create genuinely new terminals (not a restored/reconnected terminal).

Verify plain `git --version` across the actual hosts/shells the user uses, including an ordinary terminal outside the SDK profile. In PowerShell, `Get-Command git` should identify the verified executable. Do not launch CMD/batch or another prohibited shell merely to test it; report policy-restricted cases as untested. Then use the SDK profile for its separate SDK verification. From the agent repository:

```powershell
Get-Command git
git --version
now-sdk --version
node bin/sn-fluent-agent.cjs verify
```

Require `Get-Command git` to identify an **Application** at the same absolute path verified in step 1, and require the bare `git --version` command to succeed with that version. If it fails, stop: an absolute-path Git probe, settings-file inspection, simulated child shell or payload verifier alone is **not** successful new-terminal verification. Report any inability to operate a real new VS Code terminal as an unverified step, not setup complete. Locally modified payload files must also be reported accurately; do not suppress a nonzero verifier result.

Report registration/notification success separately from live command-resolution success. If a host still retains its old environment after restart, stop and identify its launcher or explicit PATH override; do not claim that every terminal is verified. Signing out/in is the fallback for persistent stale process environments, not a substitute for testing the installer.

Report the Node.js and Git versions, verified Git executable path, whether Git was preserved or installed, Git bootstrap result/log path if used, SDK version, ServiceNowDocs path and branch, index path and benchmark result, agent repository path, installation result, and verification result. Do not claim authentication or instance connectivity; this procedure does not test either.