# Verify results

Outcomes of the SKILL.md Verify read (`sn-rest.js` against `sys_user`) other than exit 0 with `ok:true`.

- `ok:false` with `status` 401, or stderr `Refresh failed (400)` / `Refresh failed (401)` → the stored token is dead; repeat the setup steps with the user's approval.
- `Refresh failed` with another status → check that the instance is reachable (hibernation, proxy page) before re-authenticating.
- `ok:false` with `status` 403 → the token works but that user cannot read `sys_user`. Report the denied operation and request an authorized least-privilege resolution. Do not grant roles or switch identities merely to make the check pass.
- `Alias not found in keychain: <alias>` with `Available aliases: ...` → no credential is stored under that name. Do not switch to a listed alias; confirm the alias with the user.
- `No credentials in keychain` → the helper found no SDK credential entry at all; it does not negate the configured target.
- `--instance ... does not match the instance stored for alias` → nothing was sent; confirm alias and instance with the user.
- `No OAuth access token for alias` → the alias is basic-auth or incomplete; this check cannot test it.
- `Cannot load @napi-rs/keyring` → a toolchain finding, not an auth result.
