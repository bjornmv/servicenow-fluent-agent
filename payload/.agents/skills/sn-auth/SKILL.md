---
name: sn-auth
description: Configure now-sdk auth to a ServiceNow PDI using OAuth (built-in PKCE client — no Application Registry, survives SSO/MFA). Use when there is no auth alias yet, when commands fail with an auth error, or after an SDK upgrade invalidates stored credentials.
argument-hint: <instance url, e.g. https://devXXXXXX.service-now.com>
---
Configure now-sdk authentication to the target instance (from the argument, default `https://devXXXXXX.service-now.com`). now-sdk 4.11 requires Node `>=20.18.0`. Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

Use OAuth (default and only reliable choice on a Zurich PDI).

1. Run `now-sdk auth --add <instance>`.
2. When prompted for type, choose `oauth`.
3. Set the alias to the user-named alias, or a short instance-derived alias if none was provided.
4. A browser window opens — log in (satisfies SSO/MFA), then click **Accept**.
5. Copy the displayed code and paste it back into the terminal.

## OAuth vs basic
- Use OAuth. Built-in public PKCE client shipped with the ServiceNow IDE plugin — NO Application Registry record, NO `client_secret`.
- `basic` (`--type basic`, user + password) dies under MFA. Only for a non-MFA service account.
- In headless CI set `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL`. Prefer `SN_SDK_AUTH_TYPE=oauth` with `SN_SDK_INSTANCE_URL`, `SN_SDK_OAUTH_CLIENT_ID`, and `SN_SDK_OAUTH_CLIENT_SECRET` stored in the CI secret store. The OAuth client-credentials setup requires an Application Registry and mapped service user; it is different from the interactive PKCE client. Basic CI instead uses `SN_SDK_USER` / `SN_SDK_USER_PWD`.
- Never commit CI variables, print their values, or persist secrets with `SETX`. Use the CI provider's protected secret store.
- Credentials stored in the OS keychain (Windows Credential Manager).

## Manage aliases
- `now-sdk auth --list` — list configured aliases.
- `now-sdk auth --use <alias>` — set the default alias.
- `now-sdk auth --delete <alias>` — remove one alias. (Per `auth --help`, only single-alias delete is documented; to wipe everything, delete each alias by name.)

`auth --list` is SDK-profile inventory, not a connection test. Run it only for an explicit authentication troubleshooting task. A blank result does not prove that the configured target instance is absent, that another ServiceNow integration is disconnected, or that an alias is unavailable until the SDK command has completed without launcher or terminal errors. Do not inspect Windows Credential Manager directly.

## After an SDK upgrade that changes the keychain library
The keychain library changed once at SDK 4.3 and may change again on future majors — re-run `now-sdk auth --add <instance>` ONCE after a confirmed keychain-library migration to re-store the credential. Ordinary SDK upgrades do not automatically require reauthentication. If an SDK upgrade is approved, use the permitted launcher for the project's package manager and agreed version. Project-local SDKs take precedence, so a global upgrade alone does not update the local SDK. Do not upgrade packages as a launcher repair.

## Verify
1. Make a cheap authenticated REST read with the user-confirmed alias — this proves the OAuth bearer reaches the instance without needing an app to be installed yet:
   ```powershell
   $SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=user_name"
   ```
   Expect a JSON result with one `user_name`. `HTTP 401` → token bad, re-run `auth --add`. `HTTP 403` → the OAuth user lacks read access on the target table (most common on `alm_asset` / `cmdb_ci_*` from a non-asset role); grant the role (`asset`, `admin`, table-specific) or use a different alias. `No credentials in keychain` from this completed request means the named SDK alias is unavailable to that SDK process; it does not negate the configured target. Do NOT use `install --info` to verify auth — it makes no network call at all (it only resolves the alias from the keychain and prints the instance's Upgrade History URL), so it proves nothing about the token. THIS REST health check is the auth verifier; `install --info` is just a link-printer for post-install triage (see the **sn-build-install** skill).
