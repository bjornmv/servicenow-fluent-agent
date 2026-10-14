---
name: sn-cicd
description: Runs ATF tests and App Repository promotion with now-sdk cicd. Use when running tests on an instance, publishing, installing or rolling back app versions, or setting up CI; not local installs (sn-build-install).
argument-hint: <test/testsuite/publish/install/rollback + confirmed target alias and version>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; authorized CI/CD targets and protected credentials.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `cicd` help, CLI source and bundled `ci-integration` / `sdlc-guide` docs; the help is the same as now-sdk 4.11 except for the added `cicd test logs`.
Use `now-sdk cicd` for ATF gates and App Repo promotion. These commands call `sn_cicd` APIs and can execute tests or mutate application versions on instances.

Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md). All approvals below still apply; only the interactive parent can obtain them, a headless child cannot.

## Required preflight

1. Confirm the project's SDK has the command: `now-sdk cicd publish --help` must list `--app-sys-id`. An SDK without `cicd` prints its general command list and still exits 0, so the exit status proves nothing. If the option is missing, stop and report the project's SDK version; do not upgrade or switch SDKs merely to satisfy this skill. Check the SDK's declared Node engine.
2. Read `now.config.json` (scope, `scopeId`) and `package.json` (version). Neither file names an alias or instance: the auth alias and instance host for each stage (source, test, target) come from the user; if one is missing, ask. Always pass `--auth <alias>`, because without it the SDK uses its default alias.
3. Check the terminal for SDK credential variables, names only: `Get-ChildItem Env:SN_SDK_* | Select-Object -ExpandProperty Name`. If `SN_SDK_NODE_ENV`, `SN_SDK_SESSION_TOKEN` or `SN_SDK_SESSION_BEARER_TOKEN` is listed, stop and report it without printing values: the SDK then ignores `--auth` and targets `SN_SDK_INSTANCE_URL`, and with `--output json` or `--select` it prints no notice of that.
4. Confirm before running ATF on an instance: ATF steps can create/update/delete test data. Name the alias and instance host in that confirmation.
5. Stop and obtain explicit approval before every `cicd publish`, `cicd install`, or `cicd rollback`. State the source/target alias and instance host, app sys_id or scope, the version currently installed on the target (read it first, see [Verify versions](#verify-versions); it is the expected rollback version), and the target version.
6. Never use local `now-sdk install` as a production promotion path, because production change management, approvals and rollback depend on App Repo installs. Build/install to dev/test with **sn-build-install**, validate, publish to App Repo, then use `cicd install` downstream through normal approvals.

## Run and read the result

Append the exit report to the same call, and do not add `2>&1` (it would mix stderr into the JSON):

```powershell
now-sdk cicd testsuite run --auth <test-alias> --test-suite-sys-id <sys_id> --output json; "exit=$LASTEXITCODE"
```

- With `--output json` or `--select` the SDK logs nothing else: no progress lines, no target notice, no "defaulted from" notice. The command is silent until it ends, up to the poll timeout.
- Success is exit 0 with `{"ok":true,"result":...,"progress":...}`. `result` is the initial dispatch response, not the outcome; the outcome is `progress` (`successful`; `status` `0` pending, `1` running, `2` successful, `3` error, `4` canceled) and, for ATF, `interpretedResult.summary` (result id, status, counts).
- Any failure is exit 1 with only `{"ok":false,"error":{"message":"..."}}`; `result` and `progress` are not printed. For ATF the message carries the status, the output or pass/fail counts, and a `Details:` link when available. An argument error prints help on stderr and no JSON.
- Exit 1 does not always mean the operation failed. `Timed out after <ms>ms waiting on progress '<id>'` means only the client stopped polling (default `--poll-timeout` 900000 ms, 15 minutes); the operation may still be running on the instance. Completion is then UNKNOWN: keep the message verbatim (it holds the progress id) and do not re-run a publish, install or rollback. Read `/api/sn_cicd/progress/<id>` with **sn-rest** (`result.status`, codes as above), then verify versions.
- `--wait=false` returns after dispatch with the progress id at `result.links.progress.id`. Use it for ATF only when a later `watch` step will consume that id. Do not use it for publish, install or rollback: they have no `watch` subcommand.

## ATF gates

```powershell
now-sdk cicd testsuite run --auth <test-alias> --test-suite-name "Regression Suite" --output json; "exit=$LASTEXITCODE"
now-sdk cicd test run --auth <test-alias> --test-name "Critical test" --output json; "exit=$LASTEXITCODE"
```

- `testsuite run` / `test run` execute what is already on the instance: a suite or test authored locally must first be installed there (**sn-build-install**, or App Repo promotion), otherwise the previous version runs.
- `--test-name` is resolved by the CLI and fails if it matches zero or several tests. `--test-suite-name` is sent to the instance unchecked: confirm it is unique with an **sn-rest** read of `sys_atf_test_suite` (`name=<name>`, fields `sys_id,name`, limit 2), or pass `--test-suite-sys-id` / `--test-sys-id`.
- Test execution must be enabled on the instance (`sn_atf.runner.enabled`, off by default), and UI steps need a client test runner or `--run-in-cloud`. A run that never starts may sit pending until the poll timeout. `testsuite run` also takes `--browser-name`, `--browser-version`, `--os-name`, `--os-version` and `--is-performance-run`; `test run` takes `--capture-node-logs`. Changing an instance property is a separate approved write, not part of this skill.
- Use `--poll-timeout <ms>` deliberately. After a timeout or `--wait=false`, re-attach with `testsuite watch` / `test watch` and `--progress-id`.
- `testsuite result` / `test result` take `--result-id` and only fetch the record: they exit 0 for a failed run too, so read the returned status.
- `test logs --result-id <sys_atf_test_result sys_id> [--pattern <regex>] [--limit <n>]` (present in 4.13.6, absent in older SDKs; confirm `now-sdk cicd test --help` lists `logs`) returns a single test result's log lines, 100 by default, pattern matched case-insensitively. There is no suite equivalent. After a failed run the envelope has no summary; take the result id from the `Details:` link or find the record with **sn-rest**.
- A failed test exits non-zero. Capture the exit code and machine JSON; do not infer success from the initial dispatch response.

## App Repo promotion

`cicd publish` uploads nothing local: it sends the app identifier, version and notes, and the repository version is taken from the app's current state on the source instance. Publish only from an instance where this exact source was installed and validated. Per the SDK's `sdlc-guide`, repository versions are immutable and publishing an existing version fails, so confirm `package.json` carries the new version; on a version conflict, stop.

From inside the Fluent project, `publish`/`install`/`rollback` default `--app-sys-id` from `now.config.json.scopeId`, and `publish`/`install` default `--app-version` from `package.json.version`; `rollback` never defaults the version. Machine mode does not print which defaults were applied, so resolve and display those values before approval and pass them explicitly.

```powershell
now-sdk cicd publish --auth <validated-source-alias> --app-sys-id <sys_id> --app-version <version> --dev-notes "<notes>" --output json; "exit=$LASTEXITCODE"
now-sdk cicd install --auth <target-alias> --app-sys-id <sys_id> --app-version <version> --output json; "exit=$LASTEXITCODE"
```

`--scope <scope>` can replace `--app-sys-id` (mutually exclusive). `install` also takes `--base-app-version` and `--auto-upgrade-base-app` for app customizations; read `now-sdk cicd install --help` before using them.

After a successful install, preserve `result.rollback_version` from the machine envelope in the report; it should equal the version read before the install. A failed or timed-out install prints no `result`, so that pre-install read is then the only record of the rollback version. Verify the installed app/version on the target instance rather than claiming success from dispatch alone.

## Verify versions

Before approval and after every publish, install or rollback, read the app record with **sn-rest** using the same alias and instance: `/api/now/table/sys_scope?sysparm_query=scope=<scope>&sysparm_fields=sys_id,scope,version,sys_class_name&sysparm_limit=2`. The SDK help labels `--app-sys-id` as `sys_app`, but an app installed from a repository may be a `sys_store_app` row; `sys_scope` is the parent of both and `sys_class_name` shows which one holds it. No row means not installed or not readable, not proven absence.

## Rollback

Rollback is destructive and requires `--app-version`, meaning the version expected after rollback—not the version being removed. Per the SDK's `sdlc-guide` it is available only for App Repo installs and only within a fixed time window. Take the version from the earlier install's `result.rollback_version` or the pre-install read; if neither is available, ask the user and mark the value unverified in the approval request.

```powershell
now-sdk cicd rollback --auth <target-alias> --app-sys-id <sys_id> --app-version <expected-previous-version> --output json; "exit=$LASTEXITCODE"
```

Obtain separate explicit approval immediately before rollback. Verify the resulting installed version.

## CI authentication

These variables belong in a pipeline job, never in a developer terminal. Use the CI provider's protected secret store. `SN_SDK_NODE_ENV=SN_SDK_CI_INSTALL` makes every now-sdk command read credentials from the environment: `--auth` and the keychain are ignored and the target is `SN_SDK_INSTANCE_URL`. `SN_SDK_AUTH_TYPE=oauth` is required for `SN_SDK_OAUTH_CLIENT_ID` and `SN_SDK_OAUTH_CLIENT_SECRET` to be read; unset means basic (`SN_SDK_USER` / `SN_SDK_USER_PWD`). Export one environment's variables per job or step (source for publish, target for ATF, install and rollback), omit `--auth`, and treat that step's `SN_SDK_INSTANCE_URL` as the approved target. CI OAuth is a client-credentials grant that needs instance setup: `now-sdk explain ci-integration --format raw`; alias and login problems go to **sn-auth**. Never commit, print, or write secrets with `SETX`. SDK telemetry for `cicd` commands includes the instance hostname; `NO_TELEMETRY=1` turns SDK telemetry off where that is not acceptable.

Run `now-sdk build --frozenKeys` as a pre-merge check, before any install step: it fails with `Keys file is out-of-date` when the committed `src/fluent/generated/keys.ts` is stale. The fix is `now-sdk build` locally, then commit the file. To write a pipeline definition, first read `now-sdk explain ci-integration --format raw` and `now-sdk explain sdlc-guide --format raw` from the project's SDK.

Report each command, target, exit code, final interpreted outcome, and verified version. Terse.
