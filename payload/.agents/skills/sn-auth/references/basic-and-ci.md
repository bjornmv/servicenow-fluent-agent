# Basic auth and CI variables

## Basic auth
- `--type basic` (user + password): avoid where OAuth works.
- On an MFA instance the CLI prompts `Enter MFA code (6 digits):` (authenticator-app TOTP, masked, submits on the sixth digit, 3 attempts, each code single-use) on every command that authenticates, not only `auth --add`. Without an interactive terminal it fails with `MFA code required but no interactive terminal is available`.
- A failed basic `auth --add` exits 1.
- Never put a password or MFA code on a command line or in chat.
- The **sn-rest** helper does not support basic aliases, so the SKILL.md Verify read cannot test one.

## Headless CI
- Set `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL`. Prefer `SN_SDK_AUTH_TYPE=oauth` with `SN_SDK_INSTANCE_URL`, `SN_SDK_OAUTH_CLIENT_ID` and `SN_SDK_OAUTH_CLIENT_SECRET` stored in the CI secret store.
- The OAuth client-credentials setup requires an Application Registry and a mapped service user; it is different from the interactive PKCE client.
- Basic CI instead uses `SN_SDK_USER` / `SN_SDK_USER_PWD`.
- Instance setup details: `now-sdk explain ci-integration --format raw`; pipeline rules: **sn-cicd**.
- Never commit CI variables, print their values, or persist secrets with `SETX`. Use the CI provider's protected secret store.
- On a developer machine these variables override `--auth <alias>`; see Session and CI overrides in SKILL.md.
