# ServiceNow Fluent Agent

Team distribution package for the **ServiceNow Fluent** VS Code custom agent, its instruction files, and its ServiceNow skills.

The package is designed for locked-down Windows machines where Node, npm, and VS Code are available, but PowerShell/cmd scripts may be restricted. Missing Git can be provisioned through the pinned selective MinGit procedure below. The Agent-file installer is a dependency-free Node program; it does not bypass policy.

## Agent-assisted setup

Read [setup.md](setup.md) for the overall sequence. Its Git prerequisite step links to the separate [Windows Git setup procedure](git-setup.md), which reuses the packaged `win-git-bootstrap` skill and worker. Working Git is preserved; only genuinely missing Git is installed, using pinned MinGit 2.54.0.windows.1 with blocked Unix find/sort omitted before extraction.

The Git page provides a directly downloadable, SHA-256-checked worker, so no Git clone is required to bootstrap Git. The Pages workflow publishes both pages and copies the canonical payload script to `/downloads/Ensure-MinGit254.ps1` in the same deployment. These URLs become available after the change is pushed and Pages deployment succeeds.

Maintainers: run the `test:setup` command from `package.json` before publishing (Windows runtime tests skip on other platforms). If the worker changes, review it and update the **worker script** hash in `git-setup.md`; the worker's separate pinned **MinGit ZIP** hash must not be confused with it. Publication fails if the script and page digest disagree. Do not duplicate the worker at the repository root.

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

## Shell-independent Windows Git PATH

On Windows, installation verifies Git >=2.54.0, registers its directory in **Windows user PATH**, and requests native Windows environment propagation. It does not add Git to any PowerShell/VS Code profile, shell startup script, function or alias. Use `install --git-exe "C:\\path\\to\\git.exe"` to retain the exact executable selected during prerequisites. The Node installer never downloads/reinstalls Git.

Raw PATH and its registry type are backed up and preserved, including long values and `%VARIABLE%` references. `reg.exe` reads the raw value; a typed Windows registry-provider write preserves quotes and the original type. Windows `setx.exe` receives **only** a short owned `SN_FLUENT_ENV_REFRESH` notification marker, never PATH. A missing/blocked native updater or failed readback stops setup. No elevation, machine PATH or policy changes are used. See Microsoft's [setx documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/setx) for future-process behavior and its value-length limit.

For environment repair only, without Git/payload reinstallation:

```text
node bin/sn-fluent-agent.cjs configure-git --git-exe "C:\\path\\to\\git.exe"
```

Known legacy Git profile overrides/startup blocks are removed conservatively, with settings backups. Other profiles and custom settings are preserved. `configure-terminal` now configures only the SDK profile; Git works independently of it. `--no-vscode-settings` does not skip the Windows user environment operation.

Save work and restart affected terminal applications from a refreshed launcher, then verify bare `git --version` in the actual hosts/shells you use. Existing processes cannot be forced to adopt new environments by a registry update or broadcast. Do not claim all terminals are verified from a simulated test, absolute-path probe or successful native-update request.

## Documentation paths

Windows setup and the documentation lookup CLI share these defaults:

```text
%LOCALAPPDATA%\SNDocs\repo
%LOCALAPPDATA%\SNDocs\index
```

Explicit CLI paths take precedence over `SN_DOCS_HOME` / `SN_DOC_MD_INDEX`, then these defaults. The lookup CLI's `paths` command only reports locations. Installing/updating skill files does not download, move or index docs; the full setup procedure clones and indexes them in its dedicated steps. Existing checkouts elsewhere are left alone, with no silent fallback.

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

Before modifying VS Code settings, the installer creates a backup next to `settings.json`. On Windows it also configures the SDK profile separately from shell-independent Git user PATH registration, as described above. Edits are surgical rather than reformatting the entire JSONC document.

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
