---
name: sn-auth
description: Connects the now-sdk to an instance. Use when logging in, fixing auth errors or managing aliases; not CI credentials (sn-cicd).
argument-hint: <user-confirmed ServiceNow instance URL and alias>
compatibility: Project-compatible now-sdk and Node; interactive user terminal and browser for OAuth; authorized ServiceNow instance; sn-skill (else node "<user-profile>/.agents/tools/sn-skill.cjs") for Verify.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `auth --help`, CLI source and bundled guides; the OAuth instance prerequisite and the Windows keychain migration come from the official ServiceNow SDK documentation and release notes.

Configure authentication only for the user-confirmed instance and alias; never infer a target or default to a placeholder URL. Run `now-sdk` directly in the VS Code terminal (PowerShell on Windows; bash with the `now-sdk` function on Linux) from the confirmed project directory (project `cwd`), or, before a project exists (first-time setup before **sn-new-app**), from the user's current terminal directory with the global SDK. See the [SDK command policy](../../reference/sdk-commands.md). On a Node/engine error from `now-sdk auth`, compare `node --version` with `engines.node` in the launched SDK's `package.json`; do not upgrade Node or the SDK as a repair.

Login and consent stay in the interactive parent/user terminal. Authentication does not authorize deployment, role changes or other instance writes. Codes, passwords, MFA codes and the authorization URL never go on a command line or into chat.

## Add an OAuth alias
1. Use the user-confirmed alias; if none was given, propose a short instance-derived alias and wait for confirmation. Run `now-sdk auth --list` once and note the default (`*[alias]`, `default = Yes`) and whether the alias name exists. A successful `auth --add` makes the alias the SDK default, and reusing a name replaces its stored credentials: tell the user and get approval when either applies.
2. The user runs, in their own **PowerShell with now-sdk** terminal (on Linux: their VS Code bash terminal; the same command works there):
   ```powershell
   now-sdk auth --add "https://<confirmed-host>" --type oauth --alias "<confirmed-alias>"
   ```
   Pass the `https://` origin with no path or trailing slash (a bare name expands to `https://<name>.service-now.com`). If the user asks you to start it, run it once in a visible terminal without a short timeout, send no keystrokes, and do not restart it while it waits.
3. The SDK logs `Opening web browser to authenticate with <host>, or visit <url> to continue OAuth...`. If no browser or the wrong profile opens, the user opens that URL manually. On a remote or headless host (VS Code server, SSH, container) no browser opens on the server: the user copies the URL into their own browser; the code page is served by the instance, not localhost. The user logs in (SSO/MFA) and clicks **Accept**.
4. The user pastes the displayed code at `Copy the code from the browser and paste it here:` in the same run. The prompt shows `[input is masked]` and echoes nothing; a blank prompt is not a failed paste. A code is valid only for the run that produced it.
5. For OAuth, exit code 0 does not mean success: a failed login logs `Access Token Error` and `Login to instance <host> failed`, exits 0 and leaves the store unchanged. Require this line from THIS run (user report or terminal): `Successfully stored credentials for instance "<url>" with alias <alias>.` Then run Verify.

OAuth uses the ServiceNow IDE application's built-in public PKCE client: NO Application Registry record, NO `client_secret`. The instance needs ServiceNow IDE 1.1 or later (default from Zurich) or the SDK's OAuth XML configuration imported. If the browser shows an OAuth error instead of the Accept page, report this prerequisite for an instance admin; do not switch to basic to get past it.

Credentials live in the OS keychain (Windows Credential Manager), not the project; the bundled guide's `.now-sdk/` storage note is wrong. Do not inspect Windows Credential Manager directly. On Linux the store is the Secret Service (gnome-keyring); if `auth --add` or **sn-rest** reports `Platform secure storage failure`, or stored aliases vanish after a restart, report a host finding and do not re-run auth ([Linux notes](../../reference/sdk-commands.md#linux-and-vs-code-server-bash)).

- Read [Basic auth and CI variables](references/basic-and-ci.md) when the user needs `--type basic` (avoid where OAuth works) or asks how headless CI authenticates.
- Read [Keychain migration](references/keychain-migration.md) when a previously working alias is missing right after an SDK upgrade. Ordinary SDK upgrades do not automatically require reauthentication.

## Session and CI overrides
If `SN_SDK_SESSION_TOKEN` or `SN_SDK_SESSION_BEARER_TOKEN` is set, or `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL`, every now-sdk command ignores `--auth <alias>` and the keychain, logging `Using pre-authenticated session for instance ...` or `Running in CI mode, using instance ...`. On a developer machine that line is a stop signal: report it. `--output json` and `--select` suppress it, so check variable names first, never values: `Get-ChildItem Env:SN_SDK_* | Select-Object -ExpandProperty Name` (PowerShell) / `compgen -e | grep '^SN_SDK_'` (bash; exit 1 with no output means none set). Verify tests stored aliases only.

## Manage aliases
- `now-sdk auth --list` — list aliases; the default is `*[alias]` / `default = Yes`.
- `now-sdk auth --use <alias>` — set the default alias.
- `now-sdk auth --delete <alias>` — remove one alias. An unknown alias logs `No credentials found for alias` and exits 0. Deleting the default leaves no default until `--use` or `--add`. NEVER pass `all` as the value: `auth --delete all` removes every stored credential, so do not name an alias `all`.
- `now-sdk auth --print` — NEVER run it, in any `--format`. It writes a live token or session cookie to stdout and is not a connection test.

`--add`, `--use` and `--delete` change which credential later commands use; each needs explicit approval for changing an authentication alias. Other skills pass `--auth <alias>` explicitly; do not rely on the default.

`auth --list` is SDK-profile inventory, not a connection test. Run it only for an explicit authentication troubleshooting task (this skill's setup steps included). An empty store prints `No credentials found`; blank output is a launcher or terminal problem. Neither proves that the target instance is absent or another integration is disconnected, nor, unless the command completed without launcher or terminal errors, that an alias is unavailable.

## Verify
An **sn-rest** read (OAuth aliases only) proves the stored bearer reaches the instance (no app needed):
```
sn-skill rest --agent --alias '<confirmed-alias>' --instance 'https://<confirmed-host>' '/api/now/table/sys_user?sysparm_fields=user_name&sysparm_limit=1'
```
- Final stderr line `sn-skill: rest exit=<N>` = native exit evidence; none → UNKNOWN. Exit 0 with `ok:true` → stored token works; done. The returned `user_name` is an arbitrary row, not the login identity.
- Re-added existing alias → also require that run's `Successfully stored credentials` line; a failed `auth --add` keeps the old token, so a passing read does not prove the new login was stored.
- `status` 401, or stderr `Refresh failed (400)` / `Refresh failed (401)` → token dead; repeat setup with the user's approval.
- Any other result: read [Verify results](references/verify-results.md) before acting. Never switch alias, identity or roles to make the check pass.

Never use `--raw` or `--dump`. Do NOT verify auth with `install --info`: it only prints the Upgrade History URL (see **sn-build-install**).
