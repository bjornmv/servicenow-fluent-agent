# CI pipeline authentication and checks

Read before writing a pipeline definition, configuring CI authentication or adding the pre-merge keys check.

## Authentication

- Put these variables in a pipeline job, never in a developer terminal. Use the CI provider's protected secret store. Never commit, print, or write secrets with `SETX` (or `export` lines in a Linux shell profile such as `~/.bashrc`).
- `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL` makes every now-sdk command read credentials from the environment: `--auth` and the keychain are ignored and the target is `SN_SDK_INSTANCE_URL`.
- `SN_SDK_AUTH_TYPE=oauth` is required for `SN_SDK_OAUTH_CLIENT_ID` and `SN_SDK_OAUTH_CLIENT_SECRET` to be read; unset means basic (`SN_SDK_USER` / `SN_SDK_USER_PWD`).
- Export one environment's variables per job or step (source for publish, target for ATF, install and rollback), omit `--auth`, and treat that step's `SN_SDK_INSTANCE_URL` as the approved target.
- CI OAuth is a client-credentials grant that needs instance setup: `now-sdk explain ci-integration --format raw`. Alias and login problems go to **sn-auth**.
- SDK telemetry for `cicd` commands includes the instance hostname; `NO_TELEMETRY=1` turns SDK telemetry off where that is not acceptable.

## Pre-merge keys check

Run `now-sdk build --frozenKeys` before any install step: it fails with `Keys file is out-of-date` when the committed `src/fluent/generated/keys.ts` is stale. Fix it with `now-sdk build` locally, then commit the file.

## Pipeline definition

First read `now-sdk explain ci-integration --format raw` and `now-sdk explain sdlc-guide --format raw` from the project's SDK.
