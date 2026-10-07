# Manually uninstall components

You can remove the agent without removing its supporting tools. **Choose only the components you no longer need.** Nothing in this guide deletes your PDI, deployed applications or project source code.

| Component | Remove it when… |
| --- | --- |
| [Agent files](#2-remove-the-agent-files) | You no longer want the ServiceNow Fluent agent, instructions and skills. |
| [Saved PDI credentials](#1-optional-remove-saved-pdi-credentials) | You want to remove selected SDK connections from this computer. |
| [Global now-sdk](#3-optional-remove-the-global-now-sdk) | No other work needs this global SDK installation. |
| [VS Code settings](#4-clean-up-vs-code-settings) | The agent's locations or terminal configuration are no longer needed. |
| [Offline documentation](#5-optional-remove-offline-documentation) | You no longer need the local ServiceNow docs and search index. |
| [Git](#6-optional-remove-git-installed-by-setup) | Setup installed it and nothing else needs it. Usually, **keep Git**. |
| [Local state, backups and checkout](#7-optional-remove-leftover-state-backups-and-checkout) | Uninstallation is complete and you no longer need these files for recovery. |

## Before you start

- Save your work. Stop agent tasks and close only terminals/processes that you know have finished using the components being removed.
- Back up any custom skills, instructions and VS Code settings you want to keep. Review uncommitted work before removing Git or any checkout.
- In File Explorer, open `%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json`. Note its **repoRoot** and keep a copy of the receipt. This identifies the installed agent's checkout and managed files.
- **Do not delete the entire `.agents` or `.copilot` folders.** They may contain other agents and your own work. Do not remove `.pi` or project folders.
- If removing everything, remove selected credentials **before** the SDK, and delete the checkout **last**. Keep Node.js installed until the command-line steps are finished.

If you use custom documentation paths, record them before removing the agent files. In **Terminal -> New Terminal**, this read-only command reports the configured paths:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" paths
```

## 1. Optional: remove saved PDI credentials

Do this while `now-sdk` still works. Open **Terminal -> New Terminal** in VS Code and list the saved aliases:

```powershell
now-sdk auth --list
```

Delete only the alias you intend to remove. Replace `my-pdi` with that alias:

```powershell
now-sdk auth --delete my-pdi
```

Run `now-sdk auth --list` again to confirm it is no longer listed. Repeat only for other aliases you deliberately want to remove.

This removes locally saved credentials; it does **not** delete the PDI, its user or applications, sign you out of the browser, or guarantee server-side token revocation. Use the instance's authorized administration process if revocation is required. Do not clear Windows Credential Manager wholesale. Removing the SDK package alone does not remove its saved credentials.

## 2. Remove the agent files

Open the checkout identified by **repoRoot** in VS Code, then choose **Terminal -> New Terminal**. Run from that checkout's root—the folder containing `bin\sn-fluent-agent.cjs`.

Other agents may use these same installed skills/instructions. Keep them installed, or preserve the ones you still need, before proceeding.

Preview first:

```powershell
node bin/sn-fluent-agent.cjs uninstall --dry-run
```

Review the output. During a dry run, `removed` and `backups` are **planned counts**, not completed changes. Then remove the managed files:

```powershell
node bin/sn-fluent-agent.cjs uninstall
```

The uninstaller:

- Backs up and removes files that still match their install-receipt hashes.
- Preserves locally modified files and reports them as **skipped modified**.
- Removes the install receipt only when no modified files were skipped.
- Leaves empty folders, VS Code settings, SDK, credentials, Git, documentation and project files alone.

**If modified files are skipped:** inspect and back them up before deciding whether to delete those exact files manually. Do not add `--force` just to clear the warning. An exit code of 0 alone does not mean every file was removed—check the skipped count.

Backups are under `%USERPROFILE%\.agents\_backups\servicenow-fluent-agent\uninstall-<timestamp>`.

**If the checkout or receipt is missing:** do not rerun installation merely to uninstall. With a saved receipt, use its file list to review and remove only this agent's files in File Explorer. Without ownership evidence, identify individual files before deleting them; do not delete whole shared skill/instruction folders. An uninstaller message saying there is no receipt is not proof that no files remain.

## 3. Optional: remove the global now-sdk

**Keep it if other ServiceNow work still needs it.** Removing the global SDK does not remove SDK dependencies inside individual projects. Leave project `package.json`, lockfiles and `node_modules` alone unless you separately intend to change that project.

The standard setup installs the global SDK under `%APPDATA%\npm`. The following commands target **that prefix only**, using npm's JavaScript entry rather than restricted shell shims.

In a new VS Code terminal, locate npm and inspect the package:

```powershell
$ErrorActionPreference = 'Stop'
$NodeExe = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$NpmCli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\npm\bin\npm-cli.js'
$SdkPrefix = Join-Path $env:APPDATA 'npm'
if (-not (Test-Path -LiteralPath $NpmCli -PathType Leaf)) { throw 'Locate the approved npm CLI before continuing.' }
& $NodeExe $NpmCli ls --global --prefix $SdkPrefix --depth=0 @servicenow/sdk
```

Confirm this is the installation you mean to remove. If you use a different prefix or Node manager, stop and identify that installation instead of guessing.

Then, in the **same terminal**:

```powershell
& $NodeExe $NpmCli uninstall --global --prefix $SdkPrefix @servicenow/sdk --ignore-scripts
Write-Output "sdk-uninstall-exit=$LASTEXITCODE"
```

Wait for completion and check that the reported exit is **0**. This path should then be absent:

```powershell
Test-Path -LiteralPath (Join-Path $SdkPrefix 'node_modules\@servicenow\sdk\package.json')
```

Expected: **False**. Do not delete the entire `%APPDATA%\npm` folder or remove its PATH entry; other global tools may still use it. A remaining project-local SDK or terminal function does not mean the global package uninstall failed.

## 4. Clean up VS Code settings

The agent-file uninstaller intentionally leaves settings unchanged.

1. Open **Preferences: Open User Settings (JSON)** from the Command Palette. Back up the file first.
2. In `chat.agentFilesLocations`, `chat.instructionsFilesLocations` and `chat.skillsFilesLocations`, remove only location entries that are no longer needed. Entries may use `~` or absolute user-profile paths.
3. Keep locations still used by other agents. Do not remove the whole `chat.*` configuration or disable shared settings such as `chat.promptFiles` or `github.copilot.chat.codeGeneration.useInstructionFiles` merely because this agent is gone.
4. If you no longer need the SDK terminal configuration, choose another default using **Terminal: Select Default Profile**, then remove only **PowerShell with now-sdk** from `terminal.integrated.profiles.windows`. Ensure `terminal.integrated.defaultProfile.windows` no longer names the removed profile. Keep this profile if you still use the SDK.
5. Check workspace settings for overrides you added yourself; preserve unrelated settings and JSON comments. Reload VS Code after saving.

Settings backups created by this installer are named `settings.json.servicenow-fluent-agent.<timestamp>.bak` alongside the settings file. Use them to compare previous values; do not overwrite current settings wholesale with an old backup.

## 5. Optional: remove offline documentation

In File Explorer, remove only the confirmed documentation checkout/index you no longer need. Standard locations are:

- `%LOCALAPPDATA%\SNDocs\repo` — downloaded ServiceNow documentation source.
- `%LOCALAPPDATA%\SNDocs\index` — generated search index.

Use the paths recorded before uninstalling if you configured alternatives. Preserve any local edits in the docs checkout first. Do not delete similarly named caches or application repositories on assumption.

If you personally configured `SN_DOCS_HOME` or `SN_DOC_MD_INDEX`, remove those user environment variables only when nothing else uses them. Removing agent files does not automatically delete documentation or these variables.

## 6. Optional: remove Git installed by setup

**Git is shared with VS Code and other projects. Keeping it is normally the right choice.** If Git was present before agent setup, leave it installed unless you separately intend to uninstall Git itself.

For the portable MinGit created by this setup:

1. Confirm `%LOCALAPPDATA%\Programs\Git` is the setup-created installation. Its ownership marker is `.mingit254-bootstrap.json`. If the marker is missing, the folder is unfamiliar, or other work uses it, stop and review rather than deleting it.
2. Save work and close applications using that installation. Do not force-kill user processes to unlock files.
3. Delete that specific installation folder in File Explorer.
4. Search Windows for **Edit environment variables for your account**. In your **user Path**, remove only the entry pointing to the deleted Git directory, normally `%LOCALAPPDATA%\Programs\Git\cmd` or its expanded equivalent. Preserve all other entries and the system PATH; do not restore an old full PATH snapshot over newer changes.
5. The setup notification variable `SN_FLUENT_ENV_REFRESH` may also be removed if its value starts with `Git254Bootstrap:` and you no longer use this setup integration. Leave unfamiliar values alone.
6. Restart affected applications. Existing terminals can retain stale environment values.

For a separately installed full Git for Windows, use its normal **Windows Settings -> Apps -> Installed apps** uninstaller only if you intend to remove that shared installation. Do not treat it as portable MinGit or delete it by following the folder instructions above. Leave your user-level `.gitconfig` and `.ssh` files alone; other repositories and connections may need them.

## 7. Optional: remove leftover state, backups and checkout

Only after reviewing the uninstall results, you may remove these exact items if you no longer want them:

| Item | Purpose / caution |
| --- | --- |
| `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json` | Update decisions, skipped releases and reminder dates. Deleting it loses those choices. |
| `%USERPROFILE%\.agents\.servicenow-fluent-agent-update-check.stamp` | Shared startup-check timestamp. Removing just this file is not an uninstall. |
| `%USERPROFILE%\.agents\_backups\servicenow-fluent-agent` | Backups of changed/removed agent files. Keep until recovery is no longer needed. |
| `%LOCALAPPDATA%\SNSetup` | SDK/setup run evidence. Preserve logs for incomplete or disputed operations. |
| `%LOCALAPPDATA%\Git254Bootstrap` | Git setup cache/logs. Do not remove during an active setup operation. |
| The agent checkout recorded as `repoRoot` | Delete last, only if no uncommitted work or backups are needed. This is not your ServiceNow application project. |

If an install receipt remains, first review the modified files it still tracks. Keep or archive that receipt until the remaining files have been accounted for.

**Leave Node.js, npm, VS Code, Python and any separate `SN_AGENT_HOME` backend installed** unless you independently want to remove those shared tools. VS Code/Copilot extensions and chat history are separate and are not removed by the agent uninstaller. Agent removal does not remove ServiceNow applications from an instance.

## Final check

Reload VS Code and start a new chat. If you removed all agent files, **ServiceNow Fluent** should no longer appear as an available custom agent. If it still appears, check for a deliberately retained edited agent file or another configured location before deleting anything else.

Confirm only the components you chose are gone. You do not need to reinstall the agent or run its installation verifier to prove an uninstall.

[Back to the README](../README.md) · [Connect a PDI](connect-pdi.md)
