# ServiceNow Fluent Agent

Team distribution package for the **ServiceNow Fluent** VS Code custom agent, its instruction files, and its ServiceNow skills.

The package is designed for locked-down Windows machines where Node, npm, Git, and VS Code are available, but PowerShell/cmd scripts may be restricted. The installer is a dependency-free Node program.

## Install with VS Code

VS Code can handle the Git clone.

1. Open Command Palette.
2. Run **Git: Clone**.
3. Paste:

   ```text
   https://github.com/bjornmv/servicenow-fluent-agent.git
   ```

4. Choose a normal local folder, for example `C:\Users\<you>\source`.
5. Open the cloned folder in VS Code.
6. Run **Terminal: Run Task** → **Install/Update ServiceNow Fluent Agent**.

Then restart VS Code, or reload the VS Code window.

## Install with terminal

Clone the repo somewhere normal, not directly into your user-profile agent folders:

```text
git clone https://github.com/bjornmv/servicenow-fluent-agent.git
cd servicenow-fluent-agent
node bin/sn-fluent-agent.cjs install
```

Then restart VS Code, or reload the VS Code window.

## Update with VS Code

1. Open this repo folder in VS Code.
2. Run **Git: Pull**.
3. Run **Terminal: Run Task** → **Install/Update ServiceNow Fluent Agent**.
4. Restart/reload VS Code.

## Update with terminal

```text
cd servicenow-fluent-agent
git pull --ff-only
node bin/sn-fluent-agent.cjs install
```

Restart/reload VS Code after updates.

## Verify

With VS Code: run **Terminal: Run Task** → **Verify ServiceNow Fluent Agent**.

With terminal:

```text
node bin/sn-fluent-agent.cjs verify
```

## Update Advisor

The installed agent makes one lightweight update check on the first eligible session at most every 48 hours. It is silent when no action is available. When an update exists, it offers only **Update**, **Remind me in 7 days**, or **Skip this release**.

The agent distribution is checked from this repository. A project's `@servicenow/sdk` is checked only while that project is active. A ServiceNowDocs checkout is checked only for documentation work or a manual request. No check installs packages, updates Git working copies, rebuilds indexes, changes authentication, or deploys anything.

Run an explicit agent-package check with VS Code task **Check ServiceNow Fluent Agent Updates**, or from a terminal:

```text
node bin/sn-fluent-agent.cjs check-updates --force
```

The advisor records its non-sensitive timing and decision state in `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json`.

## Installed locations

The installer copies files from `payload/` into the current user's profile:

```text
%USERPROFILE%\.copilot\agents\ServiceNow Fluent.agent.md
%USERPROFILE%\.agents\instructions\...
%USERPROFILE%\.agents\reference\...
%USERPROFILE%\.agents\skills\...
%USERPROFILE%\.agents\tools\...
```

It also attempts to add the required VS Code user settings:

```json
{
  "chat.promptFiles": true,
  "github.copilot.chat.codeGeneration.useInstructionFiles": true,
  "chat.agentFilesLocations": {
    "C:/Users/<you>/.copilot/agents": true
  },
  "chat.instructionsFilesLocations": {
    "C:/Users/<you>/.agents/instructions": true,
    ".github/instructions": true
  },
  "chat.skillsFilesLocations": {
    "C:/Users/<you>/.agents/skills": true
  }
}
```

Before modifying VS Code settings, the installer creates a backup next to `settings.json`.

## Useful commands

```text
node bin/sn-fluent-agent.cjs install
node bin/sn-fluent-agent.cjs install --dry-run
node bin/sn-fluent-agent.cjs install --force
node bin/sn-fluent-agent.cjs install --no-vscode-settings
node bin/sn-fluent-agent.cjs verify
node bin/sn-fluent-agent.cjs status
node bin/sn-fluent-agent.cjs uninstall
```

## Safety behavior

- Existing files are backed up before overwrite.
- Files changed locally after the last install are skipped unless `--force` is used.
- Obsolete managed files are removed only when unchanged from the last installed version.
- Install metadata is stored at `%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json`.

## Maintainer refresh

On the maintainer machine, after editing the live files under `%USERPROFILE%`, refresh the payload:

```text
node tools/refresh-payload.cjs
```

Then review the diff, update `VERSION` / `package.json`, commit, and push.

## Per-user ServiceNow auth

This package does **not** include ServiceNow credentials, OAuth tokens, now-sdk auth state, or personal VS Code session data. Each user must configure their own now-sdk auth alias.
