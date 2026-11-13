---
title: ServiceNow Fluent - PowerShell Error Fix
subtitle: Windows user guide
category: Troubleshooting
audience: ServiceNow Fluent users in VS Code
last_reviewed: 13 November 2026
---

## When to use this guide

Use this guide if ServiceNow Fluent repeatedly shows this error in VS Code:

> Cannot invoke method. Method invocation is supported only on core types in this language mode.

Check whether the failing line mentions **`$host.SetShouldExit(...)`**. If it does, the problem is a known Copilot command-wrapper incompatibility with restricted PowerShell. A command may have completed before the wrapper reports an error. Other failing methods need separate investigation.

**The workaround:** start a new chat using VS Code's **Local** chat engine (also called a harness), then select **ServiceNow Fluent**. You do not need to reinstall ServiceNow, the SDK or Git.

:::{warning} Before you start
Let running installs, builds and deployments finish. Save your work and keep the old chat and its results. Do not repeat an operation just because the wrapper reported an error.
:::

## 1. Update your VS Code settings

1. Press **Ctrl+Shift+P** to open the Command Palette.
2. Select **Preferences: Open User Settings (JSON)**. Use User Settings, not Default Settings or Workspace Settings.
3. Make a backup copy of the file before editing it.
4. Inside the existing outer `{ }`, add or update these three entries:

```json
"chat.editor.localAgent.enabled": true,
"chat.editor.preferCopilotHarness": false,
"chat.defaultToCopilotHarness": false
```

If an entry already exists, change its value; do not add it twice. Keep all other settings. Separate entries with commas, including a comma after the last line above if another setting follows. Save the file and check that VS Code reports no JSON errors.

These are **user-wide preferences** for the active VS Code settings profile, not just this project. They make Local available and prevent automatic promotion into the newer Copilot SDK chat engine. Corporate policy still takes precedence.

## 2. Start a new Local chat

1. In the normal VS Code window, create a **new chat**. Keep your existing conversation for reference.
2. In the chat-engine/harness picker, choose **Local**. This is separate from the model and custom-agent pickers; labels and placement can vary by VS Code version.
3. Select **ServiceNow Fluent** as the custom agent, and choose an available model.

An existing SDK-backed chat does not change engines when you edit settings. You must use a new chat.

If Local is missing, wait until all operations finish, then run **Developer: Reload Window** from the Command Palette. Create another new chat and check again.

## 3. Verify the fix

Send this request to the **new Local chat**:

```text
Using your integrated-terminal tool, run:
Write-Output 'LOCAL_TERMINAL_OK'
Report whether it completed successfully and whether any errors appeared.
```

You should see **LOCAL_TERMINAL_OK**, successful completion and no `SetShouldExit` error. Running the command yourself in a terminal does not verify which tool the chat uses.

Before resuming ServiceNow work, confirm the correct project folder and intended instance. If the agent cannot find `now-sdk` or `sn-skill`, open a new **PowerShell with now-sdk** terminal; do not reinstall packages merely because an old terminal lacks the functions.

## If something still does not work

| Problem | What to do |
| --- | --- |
| Local is still missing or disabled | Check the active User settings and any conflicting workspace settings. If policy prevents Local, contact IT or your team maintainer. Do not override policy. |
| The same wrapper error continues | Confirm that you are using a new Local chat, not the old conversation, and that it uses the integrated-terminal tool. |
| ServiceNow Fluent or your model is missing | Ask your team maintainer to check agent discovery or model availability. This is a separate issue. |
| PowerShell reports ConstrainedLanguage | That is expected on many managed machines. Do not disable it. |

For support, provide your VS Code version, the selected chat engine, the exact failing line and whether the harmless test passed. Remove credentials, tokens and private project data from screenshots or logs.

## Automatic setup and undoing the change

**The automatic Windows setup fix and the `configure-chat` repair command are included in the proposed pull request (PR), pending merge and release.** Until your installed version includes the change, use the manual steps above. Once you update to a version containing the fix, Windows setup applies these preferences with a backup; existing users can use the settings-only repair command. A new Local chat is still required.

To undo the change, restore only these three entries to their previous values, or remove them if they were previously absent. Preserve any later unrelated edits. Start a new chat afterwards; the wrapper error may return.

## Compatibility and references

Local resolved this issue in a user-confirmed test on **VS Code 1.143.1 / Copilot SDK 1.0.100-1**. Other versions and corporate policies require their own verification. Do not change execution policy or patch vendor files to address this error.

- Copilot issue: https://github.com/github/copilot-cli/issues/4683
- VS Code issue: https://github.com/microsoft/vscode/issues/343124
