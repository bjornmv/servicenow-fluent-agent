---
name: sn-auth
description: Use when setting up or repairing the now-sdk connection to a user-authorized ServiceNow instance, such as a first OAuth login with auth --add, listing, switching or deleting aliases, and 401, refresh-failed or missing-credential errors.
argument-hint: <user-confirmed ServiceNow instance URL and alias>
compatibility: Project-compatible now-sdk and Node; interactive user terminal and browser for OAuth; authorized ServiceNow instance.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `auth --help`, CLI source and bundled guides (`developing-apps-guide`, `auth-token-guide`, `ci-integration`); the OAuth instance prerequisite and the Windows keychain migration come from the official ServiceNow SDK documentation and release notes.

Configure now-sdk authentication only for the user-confirmed instance and alias. Do not infer a target or use a placeholder URL as a default. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). If no project exists yet (first-time setup before **sn-new-app**), run from the user's current terminal directory; the installed global SDK is then used. See the [SDK command policy](../../reference/sdk-commands.md). If `now-sdk auth` fails to start with a Node/engine error, compare `node --version` with `engines.node` in the launched SDK's `package.json` before retrying; do not upgrade Node or the SDK as a repair.

Use interactive OAuth for the confirmed ServiceNow instance, subject to its supported configuration and the user's authorization. Keep login and consent in the interactive parent/user terminal; authentication does not authorize deployment, role changes, or other instance writes.

1. Use the user-confirmed alias. If none was given, propose a short instance-derived alias and wait for confirmation. As part of this auth task, run `now-sdk auth --list` once and note the current default (`*[alias]`, `default = Yes`) and whether the alias name already exists. A successful `auth --add` makes the added alias the SDK default, and reusing a name replaces that alias's stored credentials, so tell the user both effects and get approval when either applies (see Manage aliases).
2. The user runs this in their own **PowerShell with now-sdk** terminal; passing both flags skips the type menu and the free-text alias prompt:
   ```powershell
   now-sdk auth --add "https://<confirmed-host>" --type oauth --alias "<confirmed-alias>"
   ```
   Pass the instance as its `https://` origin with no path or trailing slash (a bare name is expanded to `https://<name>.service-now.com`). If the user asks you to start it, run it once in a visible terminal without a short timeout, send no keystrokes, and do not restart it while it waits.
3. The SDK logs `Opening web browser to authenticate with <host>, or visit <url> to continue OAuth...` and opens the browser. If the browser does not open or opens the wrong profile, the user opens that URL manually (the SDK also tries to copy it to the clipboard). The user logs in (satisfies SSO/MFA) and clicks **Accept**.
4. The user copies the displayed code and pastes it at `Copy the code from the browser and paste it here:` in the same terminal run. The prompt shows `[input is masked]` and echoes nothing; a blank prompt is not a failed paste. A code is only valid for the run that produced it. The code, the authorization URL and passwords never go into chat.
5. For OAuth, exit code 0 does not mean success: a failed login logs `Access Token Error` and `Login to instance <host> failed`, exits 0 and leaves the store unchanged. Require this line from THIS run, reported by the user or read from the terminal: `Successfully stored credentials for instance "<url>" with alias <alias>.` Then run Verify.

## OAuth vs basic
- Use OAuth. Built-in public PKCE client shipped with the ServiceNow IDE application — NO Application Registry record, NO `client_secret`. The instance must have ServiceNow IDE 1.1 or later installed (default from the Zurich release) or the SDK's OAuth XML configuration imported. If the browser shows an OAuth error instead of the Accept page, report this prerequisite for an instance admin to check; do not switch to basic to get past it.
- `basic` (`--type basic`, user + password): avoid where OAuth works. On an MFA instance the CLI prompts `Enter MFA code (6 digits):` (authenticator-app TOTP, masked, submits on the sixth digit, 3 attempts, each code single-use) on every command that authenticates, not only `auth --add`; without an interactive terminal it fails with `MFA code required but no interactive terminal is available`. A failed basic `auth --add` exits 1. Never put a password or MFA code on a command line or in chat. The **sn-rest** helper does not support basic aliases.
- In headless CI set `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL`. Prefer `SN_SDK_AUTH_TYPE=oauth` with `SN_SDK_INSTANCE_URL`, `SN_SDK_OAUTH_CLIENT_ID`, and `SN_SDK_OAUTH_CLIENT_SECRET` stored in the CI secret store. The OAuth client-credentials setup requires an Application Registry and mapped service user; it is different from the interactive PKCE client. Basic CI instead uses `SN_SDK_USER` / `SN_SDK_USER_PWD`. Instance setup details: `now-sdk explain ci-integration --format raw`; pipeline rules: **sn-cicd**.
- Never commit CI variables, print their values, or persist secrets with `SETX`. Use the CI provider's protected secret store.
- If `SN_SDK_SESSION_TOKEN` or `SN_SDK_SESSION_BEARER_TOKEN` is set, or `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL`, every now-sdk command ignores `--auth <alias>` and the keychain and logs `Using pre-authenticated session for instance ...` or `Running in CI mode, using instance ...`. On a developer machine treat that log line as a stop signal and report it. Commands run with `--output json` or `--select` (every `cicd` example) suppress it, so check variable names first, never values: `Get-ChildItem Env:SN_SDK_* | Select-Object -ExpandProperty Name`; Verify below tests stored aliases only.
- Credentials stored in the OS keychain (Windows Credential Manager), not in the project; the bundled guide's `.now-sdk/` storage note is wrong.

## Manage aliases
- `now-sdk auth --list` — list configured aliases; the default is marked `*[alias]` / `default = Yes`.
- `now-sdk auth --use <alias>` — set the default alias.
- `now-sdk auth --delete <alias>` — remove one alias. An unknown alias logs `No credentials found for alias` and still exits 0. Deleting the default leaves no default until `--use` or a new `--add`. NEVER pass `all` as the value: `auth --delete all` removes every stored credential, so do not name an alias `all`.
- `now-sdk auth --print` — NEVER run it, in any `--format`. It writes a live token or session cookie to stdout and is not a connection test.

`--add` (always sets the default; replaces a same-named alias), `--use` and `--delete` change which credential later commands use; each needs the agent's explicit approval for changing an authentication alias. Other skills pass `--auth <alias>` explicitly; do not rely on the default.

`auth --list` is SDK-profile inventory, not a connection test. Run it only for an explicit authentication troubleshooting task (this skill's setup steps included). An empty store prints `No credentials found`; truly blank output is a launcher or terminal problem. Neither result proves that the configured target instance is absent, that another ServiceNow integration is disconnected, or that an alias is unavailable until the SDK command has completed without launcher or terminal errors. Do not inspect Windows Credential Manager directly.

## After an SDK upgrade that changes the keychain library
The keychain library has changed historically and may change again: on Windows, upgrading to SDK 4.3 or later dropped the Keytar store, so earlier credentials must be added again. Treat a migration as confirmed only when a previously working alias is missing right after an approved SDK upgrade (`Could not find stored credentials for alias: <alias>`, or `No credentials found` from a cleanly completed `auth --list`); then, with the user's approval, repeat the setup steps ONCE to re-store the credential. Ordinary SDK upgrades do not automatically require reauthentication. If an SDK upgrade is approved, use the permitted launcher for the project's package manager and agreed version. Project-local SDKs take precedence, so a global upgrade alone does not update the local SDK. Do not upgrade packages as a launcher repair.

## Verify
Make a cheap authenticated REST read with the user-confirmed alias and instance, using the **sn-rest** helper (OAuth aliases only) — this proves the stored OAuth bearer reaches the instance without needing an app to be installed yet:
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_user?sysparm_fields=user_name&sysparm_limit=1"
```
- Exit 0 with an `ok:true` envelope → the stored token works. The returned `user_name` is an arbitrary row, not the authenticated user; do not report it as the login identity.
- When re-adding an existing alias, a passing read does not prove the new login was stored (a failed `auth --add` keeps the old token); the `Successfully stored credentials` line from that run is also required.
- `ok:false` with `status` 401, or stderr `Refresh failed (400)` / `Refresh failed (401)` → the stored token is dead; repeat the setup steps with the user's approval. `Refresh failed` with another status → check that the instance is reachable (hibernation, proxy page) before re-authenticating.
- `ok:false` with `status` 403 → the token works but that user cannot read `sys_user`; report the denied operation and request an authorized least-privilege resolution. Do not grant roles or switch identities merely to make the check pass.
- `Alias not found in keychain: <alias>` with `Available aliases: ...` → no credential is stored under that name. Do not switch to a listed alias; confirm the alias with the user.
- `No credentials in keychain` → the helper found no SDK credential entry at all; it does not negate the configured target.
- `--instance ... does not match the instance stored for alias` → nothing was sent; confirm alias and instance with the user.
- `No OAuth access token for alias` → the alias is basic-auth or incomplete; this check cannot test it. `Cannot load @napi-rs/keyring` is a toolchain finding, not an auth result.

Never use the helper's `--raw` or `--dump`. Do NOT use `install --info` to verify auth — it only prints the Upgrade History URL and never tests the stored token (see the **sn-build-install** skill). THIS REST health check is the verifier for stored aliases.
