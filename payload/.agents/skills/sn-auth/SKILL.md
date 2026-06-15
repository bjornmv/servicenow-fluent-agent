---
name: sn-auth
description: Configure now-sdk auth to a ServiceNow PDI using OAuth (built-in PKCE client — no Application Registry, survives SSO/MFA). Use when there is no auth alias yet, when commands fail with an auth error, or after an SDK upgrade invalidates stored credentials.
argument-hint: <instance url, e.g. https://devXXXXXX.service-now.com>
---
Configure now-sdk authentication to the target instance (from the argument, default `https://devXXXXXX.service-now.com`). Examples below show `node "$NowSdk" <cmd>` — define `$NowSdk` on the same PowerShell line as each command: `$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>`.

Use OAuth (default and only reliable choice on a Zurich PDI).

1. Run `node "$NowSdk" auth --add <instance>`.
2. When prompted for type, choose `oauth`.
3. Set the alias to the user-named alias, or a short instance-derived alias if none was provided.
4. A browser window opens — log in (satisfies SSO/MFA), then click **Accept**.
5. Copy the displayed code and paste it back into the terminal.

## OAuth vs basic
- Use OAuth. Built-in public PKCE client shipped with the ServiceNow IDE plugin — NO Application Registry record, NO `client_secret`.
- `basic` (`--type basic`, user + password) DIES under MFA. Only for a non-MFA/CI account; prefer the `SN_SDK_CI_INSTALL` env-var path for CI (set via `.vscode/settings.json`, not `SETX`).
- Credentials stored in the OS keychain (Windows Credential Manager).

## Manage aliases
- `node "$NowSdk" auth --list` — list configured aliases.
- `node "$NowSdk" auth --use <alias>` — set the default alias.
- `node "$NowSdk" auth --delete <alias>` — remove one alias. (Per `auth --help`, only single-alias delete is documented; to wipe everything, delete each alias by name.)

## After an SDK upgrade that changes the keychain library
The keychain library changed once at SDK 4.3 and may change again on future majors — re-run `node "$NowSdk" auth --add <instance>` ONCE after the upgrade to re-store the credential, or every command fails to read auth. If the project has `node_modules/@servicenow/sdk`, upgrade that local SDK first with `npm.cmd install "@servicenow/sdk@latest"`; the resolver prefers project-local SDKs, so a global upgrade alone can leave auth running against the old keychain library.

## Verify
1. `node "$NowSdk" auth --list` — confirm the alias is present.
2. Make a cheap authenticated REST read — proves the OAuth bearer reaches the instance without needing an app to be installed yet:
   ```powershell
   $SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=user_name"
   ```
   Expect a JSON result with one `user_name`. `HTTP 401` → token bad, re-run `auth --add`. `HTTP 403` → the OAuth user lacks read access on the target table (most common on `alm_asset` / `cmdb_ci_*` from a non-asset role); grant the role (`asset`, `admin`, table-specific) or use a different alias. `No credentials in keychain` → alias is missing for this Windows user. Do NOT use `install --info` to verify auth — it makes no network call at all (it only resolves the alias from the keychain and prints the instance's Upgrade History URL), so it proves nothing about the token. THIS REST health check is the auth verifier; `install --info` is just a link-printer for post-install triage (see the **sn-build-install** skill).
