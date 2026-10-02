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

### 3. Refresh the active setup terminal

A fresh terminal can inherit an old PATH from VS Code, Windows Terminal or Explorer. A registry update or **Reload Window** alone is not a guarantee that it can resolve Git. Add the **verified** Git directory to this setup session, without reinstalling Git or replacing the rest of PATH:

```powershell
$GitDirectory = Split-Path -Parent $GitExe
if (($env:Path -split ';') -notcontains $GitDirectory) {
    $env:Path = "$GitDirectory;$env:Path"
}
$ResolvedGit = Get-Command git -ErrorAction Stop
if ($ResolvedGit.CommandType -ne 'Application' -or $ResolvedGit.Source -ine $GitExe) {
    throw 'Bare git does not resolve to the verified executable; stop and review.'
}
git --version
if ($LASTEXITCODE -ne 0) { throw 'Git command resolution verification failed.' }
```

This is only the active shell refresh. In step 5 the installer automatically configures the **PowerShell with now-sdk** VS Code profile with an explicit Git directory in its `env.Path`, ahead of the inherited PATH. New terminals using that profile therefore do not depend on stale parent processes noticing a registry change. Existing arguments, environment settings, other profiles and JSONC comments are preserved; ambiguous or disabled PATH customizations stop for review. Do not skip this update just because the named profile already exists.

### 4. Clone ServiceNowDocs

Use a normal local source directory, such as `$HOME\source`. Clone the Australia documentation branch there:

```powershell
& $GitExe clone --depth 1 --single-branch --branch australia https://github.com/ServiceNow/ServiceNowDocs.git
```

If `ServiceNowDocs` already exists, verify that its `origin` is `https://github.com/ServiceNow/ServiceNowDocs.git` and its checked-out branch is `australia` before running:

```powershell
& $GitExe pull --ff-only
```

Stop rather than modifying an unexpected existing directory.

### 5. Clone and install this agent

In the same source directory, clone this repository:

```powershell
& $GitExe clone https://github.com/bjornmv/servicenow-fluent-agent.git
```

If it already exists, verify that its `origin` matches that URL before updating it with `& $GitExe pull --ff-only`.

Open the repository folder in VS Code. From the repository root, pass the verified Git executable explicitly to the installer:

```powershell
node bin/sn-fluent-agent.cjs install --git-exe "$GitExe"
if ($LASTEXITCODE -ne 0) { throw 'Agent installation failed; stop setup.' }
```

This installs the payload and automatically configures the default Windows terminal profile and its Git PATH. It backs up changed settings and makes surgical JSONC edits rather than rewriting unrelated settings. It does not reinstall Git or modify system/user PATH, PowerShell security policy or unrelated terminal profiles. `--no-vscode-settings` is not a complete setup.

The **Install/Update ServiceNow Fluent Agent** VS Code task remains available; without `--git-exe`, the installer verifies Git from its current PATH or standard locations, and stops if the selected executable is missing, older or blocked.

For terminal configuration only (no payload installation/removal), use `node bin/sn-fluent-agent.cjs configure-terminal --git-exe "$GitExe"`. Both commands support `--dry-run`. Stop on any failure.

### 6. Reload and verify

Reload VS Code with **Developer: Reload Window**. Kill the setup terminal, then create a **new** **PowerShell with now-sdk** integrated terminal (not a restored/reconnected terminal). From the agent repository, run:

```powershell
Get-Command git
git --version
now-sdk --version
node bin/sn-fluent-agent.cjs verify
```

Require `Get-Command git` to identify an **Application** at the same absolute path verified in step 1, and require the bare `git --version` command to succeed with that version. If it fails, stop: an absolute-path Git probe, settings-file inspection, simulated child shell or payload verifier alone is **not** successful new-terminal verification. Report any inability to operate a real new VS Code terminal as an unverified step, not setup complete. Locally modified payload files must also be reported accurately; do not suppress a nonzero verifier result.

The configured profile works without signing out. This does not refresh already-running shells or promise refreshed PATH in unrelated external terminal applications.

Report the Node.js and Git versions, verified Git executable path, whether Git was preserved or installed, Git bootstrap result/log path if used, SDK version, ServiceNowDocs path and branch, agent repository path, installation result, and verification result. Do not claim authentication or instance connectivity; this procedure does not test either.