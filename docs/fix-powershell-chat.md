# Fix repeated PowerShell errors in VS Code chat (Windows)

If ServiceNow Fluent repeatedly reports:

> Cannot invoke method. Method invocation is supported only on core types in this language mode.

look at the failing line. If it contains **`$host.SetShouldExit(...)`**, this is a known Copilot SDK command-wrapper incompatibility with PowerShell **ConstrainedLanguage**, not necessarily a failed ServiceNow command. Ordinary commands may finish before the wrapper reports failure. Other method-invocation errors can be real script failures; do not classify them all as harmless.

**Recommended Windows setup: use VS Code's Local chat harness with ServiceNow Fluent.** Local uses the integrated-terminal tools rather than that SDK wrapper. This was user-confirmed to resolve the repeated errors on Windows with VS Code **1.143.1** (Copilot SDK **1.0.100-1**) on 13 November 2026. It is not a guarantee for every VS Code version, model or organizational policy.

## New installations

The Windows installer sets these ordinary **User settings**, in addition to the existing agent locations and terminal profile:

```json
{
  "chat.editor.localAgent.enabled": true,
  "chat.editor.preferCopilotHarness": false,
  "chat.defaultToCopilotHarness": false
}
```

These preferences affect **all new chats using that VS Code settings profile**, not just ServiceNow Fluent. They intentionally replace conflicting user preferences and opt out of rollout defaults that promote Local into the Copilot SDK harness. Linux/macOS installation does not change these preferences. `install --no-vscode-settings` skips them with the other VS Code settings.

Settings are backed up and edited without replacing the rest of the JSONC file. Organizational policy still takes precedence. The installer does not detect effective policy or prove that Local is available. It does not change existing conversations, close terminals, reload VS Code or weaken security settings.

## Existing installations: repair settings only

Use a checkout containing the `configure-chat` command. Do **not** rerun full setup or reinstall Git/the SDK to fix this wrapper. If your checkout is older, review and approve its update first.

From that checkout in an ordinary, idle terminal:

```text
node bin/sn-fluent-agent.cjs configure-chat --dry-run
node bin/sn-fluent-agent.cjs configure-chat
```

The command only sets the three preferences above. It prints the target and backup path, makes no change when they already match, and stops on invalid JSONC, duplicate keys being edited, or a concurrent edit. Git and the SDK are neither required nor launched. Dry-run creates no backup or settings file. Non-Windows execution is refused.

The default target is `%APPDATA%\Code\User\settings.json`. For VS Code Insiders or a named settings profile, first identify its actual **User Settings (JSON)** file, then explicitly select it:

```text
node bin/sn-fluent-agent.cjs configure-chat --settings-file "C:\absolute\path\to\settings.json" --dry-run
node bin/sn-fluent-agent.cjs configure-chat --settings-file "C:\absolute\path\to\settings.json"
```

Alternatively, back up **Preferences: Open User Settings (JSON)** and merge the three entries manually, replacing existing values rather than adding duplicate keys. Keep other settings and comments. Use this manual route before installation if the checkout/command is not yet available.

## Activate and verify

1. **Let running operations finish first.** Preserve the current chat and any original operation logs/results. A wrapper error is not permission to repeat an install or deployment.
2. Open a **new chat in the normal VS Code window**. Select the **Local** harness, then the **ServiceNow Fluent** custom agent. The harness picker is separate from the custom-agent/model picker. An existing SDK-backed conversation cannot switch execution tools in place.
3. If Local is missing, verify the three values in the active settings profile, check for conflicting workspace settings, and, only when operations are finished, use **Developer: Reload Window** and open another new chat. Saved settings alone are not proof of the effective runtime.
4. If Local is still unavailable, disabled, automatically replaced, or prohibited by managed policy, **stop and ask your administrator** about an approved compatible harness or vendor fix. Do not change managed settings, use the hidden `chat.temporaryDefaultToLocalHarness` policy escape hatch, disable a required sandbox, or downgrade binaries to evade policy.
5. Ask the new chat to run this harmless check through its **integrated-terminal tool**, not the Copilot SDK `powershell` tool:

   ```powershell
   Write-Output 'LOCAL_TERMINAL_OK'
   $ExecutionContext.SessionState.LanguageMode
   ```

   Require the marker, successful command completion and no `$host.SetShouldExit` error. **ConstrainedLanguage is fine**; do not try to turn it off. Then check `Get-Command now-sdk -CommandType Function` and `Get-Command sn-skill -CommandType Function` in a new **PowerShell with now-sdk** terminal. Full setup still requires its remaining terminal/version checks. Reconfirm the project directory and intended instance before resuming mutation work.

If the needed model or custom agent is unavailable in Local, report that separate limitation rather than claiming setup is complete. `verify` checks installed payload files, not the active chat harness.

## What does not fix this error

- `chat.agentHost.customTerminalTool.enabled: true` is **ignored on Windows in VS Code 1.143.1**, despite appearing in settings. It remains useful for supported non-Windows agent hosts; there is no need to remove an existing value.
- Changing the integrated terminal profile does not change the SDK's separate `powershell` tool. Launching Node inside that tool still retains its outer PowerShell wrapper.
- Reinstalling the ServiceNow SDK or switching PowerShell versions is not a demonstrated fix for the wrapper. Do not patch vendor binaries, suppress all errors, change execution policy or use alternate launchers to get around a denial.

## Rollback

When an existing settings file changes, the command prints an exact backup beside it. A new file or unchanged run has no backup; for a new file, remove the three added preferences while preserving any later edits. Restore **only these three preferences** to their previous values (remove a key if it was previously absent). Do not overwrite later unrelated changes by blindly restoring the whole backup. If nothing else has changed since the repair, restoring the complete backup is also an option. Settings are intentionally left in place by agent uninstall because they are shared with other chats. Start a new chat after changing them; the known SDK-wrapper issue may return.

## Upstream tracking

- [Copilot CLI: SetShouldExit is not permitted under ConstrainedLanguage](https://github.com/github/copilot-cli/issues/4683)
- [VS Code: PowerShell interactions report errors in ConstrainedLanguage](https://github.com/microsoft/vscode/issues/343124)

Both were open when investigated on 13 November 2026. Recheck vendor support before removing the compatibility defaults in a future release.
