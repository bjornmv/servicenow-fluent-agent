# Agent-Assisted Installation

Give a new agent this short prompt:

```text
Read https://github.com/bjornmv/servicenow-fluent-agent/raw/main/setup.md and perform the full ServiceNow Fluent agent setup.
```

If the agent cannot access the URL, clone the repository first and ask it to read this file from the local checkout.

## Instructions for the Agent

Set up the ServiceNow Fluent agent on this Windows machine. Work through the steps in order, report each result, and stop at the first blocking failure. Do not install missing prerequisites, use elevation, handle credentials, authenticate to ServiceNow, or deploy an application.

### 1. Check prerequisites

Before changing anything, verify that Node.js and Git are both available:

```powershell
Get-Command node -ErrorAction SilentlyContinue
Get-Command git -ErrorAction SilentlyContinue
node --version
git --version
```

If either command is missing or fails, report the failed prerequisite and stop. Do not make partial configuration changes.

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
git clone --depth 1 --single-branch --branch australia https://github.com/ServiceNow/ServiceNowDocs.git
```

If `ServiceNowDocs` already exists, verify that its `origin` is `https://github.com/ServiceNow/ServiceNowDocs.git` and its checked-out branch is `australia` before running:

```powershell
git pull --ff-only
```

Stop rather than modifying an unexpected existing directory.

### 5. Clone and install this agent

In the same source directory, clone this repository:

```text
https://github.com/bjornmv/servicenow-fluent-agent.git
```

If it already exists, verify that its `origin` matches that URL before updating it with `git pull --ff-only`.

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

Report the Node.js and Git versions, SDK version, ServiceNowDocs path and branch, agent repository path, installation result, and verification result. Do not claim authentication or instance connectivity; this procedure does not test either.