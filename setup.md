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
npm install -g "@servicenow/sdk@latest"
```

Stop if this command fails. Do not use `--force` or administrator elevation.

### 3. Configure the VS Code terminal profile

Open the VS Code user `settings.json`. Preserve its existing JSONC settings and terminal profiles. Add or update the following profile, then set it as the default Windows profile:

```jsonc
"terminal.integrated.profiles.windows": {
  "PowerShell with now-sdk": {
    "path": "${env:windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "args": [
      "-NoLogo",
      "-NoProfile",
      "-NoExit",
      "-Command",
      "function global:now-sdk { $sdk = '.\\node_modules\\@servicenow\\sdk\\bin\\index.js'; if (!(Test-Path $sdk)) { $sdk = Join-Path $env:APPDATA 'npm\\node_modules\\@servicenow\\sdk\\bin\\index.js' }; & node.exe $sdk @args }"
    ]
  }
},
"terminal.integrated.defaultProfile.windows": "PowerShell with now-sdk"
```

Do not remove unrelated settings or profiles. Ensure `settings.json` remains valid JSONC.

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

Open the repository folder in VS Code. Run **Terminal: Run Task** and select **Install/Update ServiceNow Fluent Agent**. If VS Code task execution is unavailable, run this equivalent command from the repository root:

```powershell
node bin/sn-fluent-agent.cjs install
```

Stop if the installation reports a failure.

### 6. Reload and verify

Reload VS Code with **Developer: Reload Window**. Then open a new **PowerShell with now-sdk** integrated terminal and run:

```powershell
now-sdk --version
node bin/sn-fluent-agent.cjs verify
```

Report the Node.js and Git versions, verified Git executable path, whether Git was preserved or installed, Git bootstrap result/log path if used, SDK version, ServiceNowDocs path and branch, agent repository path, installation result, and verification result. Do not claim authentication or instance connectivity; this procedure does not test either.