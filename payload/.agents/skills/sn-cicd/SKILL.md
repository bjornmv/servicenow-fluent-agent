---
name: sn-cicd
description: Run now-sdk 4.11 CI/CD operations safely—ATF test/testsuite gates plus Application Repository publish, install, and rollback. Use for pipeline promotion or ATF execution, not ordinary local dev installs.
argument-hint: <test/testsuite/publish/install/rollback + confirmed target alias and version>
---
Use `now-sdk cicd` for ATF gates and App Repo promotion. These commands call `sn_cicd` APIs and can execute tests or mutate application versions on instances.

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md). All approvals below still apply; headless children cannot authorize these operations.

## Required preflight

1. Require Node `>=20.18.0` and now-sdk `>=4.11.0`.
2. Read `now.config.json` and `package.json`; report scope, `scopeId`, package version, and the exact auth alias/instance.
3. Confirm before running ATF on an instance: ATF steps can create/update/delete test data.
4. Stop and obtain explicit approval before every `cicd publish`, `cicd install`, or `cicd rollback`. State the source/target instance, app sys_id or scope, current/target version, and expected rollback version.
5. Never use local `now-sdk install` as a production promotion path. Build/install locally to dev/test, validate, publish to App Repo, then use `cicd install` downstream through normal approvals.

## ATF gates

```powershell
now-sdk cicd testsuite run --auth <test-alias> --test-suite-name "Regression Suite" --output json
now-sdk cicd test run --auth <test-alias> --test-name "Critical test" --output json
```

- Prefer name only when unique; otherwise use `--test-suite-sys-id` / `--test-sys-id`.
- The default waits and polls (15-minute default timeout). Use `--poll-timeout <ms>` deliberately; use `--wait=false` only when a later `watch` step will consume the progress id.
- `testsuite watch` / `test watch` takes `--progress-id`; `testsuite result` / `test result` takes `--result-id`.
- A failed test exits non-zero. Capture the exit code and machine JSON; do not infer success from the initial dispatch response.

## App Repo promotion

From inside the Fluent project, `publish`/`install` can default `--app-sys-id` from `now.config.json.scopeId` and `--app-version` from `package.json.version`. Resolve and display those defaults before approval instead of relying on them silently.

```powershell
now-sdk cicd publish --auth <validated-source-alias> --app-sys-id <sys_id> --app-version <version> --dev-notes "<notes>" --output json
now-sdk cicd install --auth <target-alias> --app-sys-id <sys_id> --app-version <version> --output json
```

After install, preserve `result.rollback_version` from the machine envelope. Verify the installed app/version on the target instance rather than claiming success from dispatch alone.

## Rollback

Rollback is destructive and requires `--app-version`, meaning the version expected after rollback—not the version being removed.

```powershell
now-sdk cicd rollback --auth <target-alias> --app-sys-id <sys_id> --app-version <expected-previous-version> --output json
```

Obtain separate explicit approval immediately before rollback. Verify the resulting installed version.

## CI authentication

Use the CI provider's protected secret store. Set `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL`; prefer `SN_SDK_AUTH_TYPE=oauth` with `SN_SDK_INSTANCE_URL`, `SN_SDK_OAUTH_CLIENT_ID`, and `SN_SDK_OAUTH_CLIENT_SECRET`. Never commit, print, or write secrets with `SETX`. Run `build --frozenKeys` before deployment so stale `src/fluent/generated/keys.ts` fails the pipeline.

Report each command, target, exit code, final interpreted outcome, and verified version. Terse.
