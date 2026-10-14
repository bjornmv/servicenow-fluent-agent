---
name: sn-cicd
description: Runs ATF tests and App Repository promotion with now-sdk cicd. Use when running tests or reading ATF results and logs, publishing, installing or rolling back app versions, or setting up CI; not local installs (sn-build-install).
argument-hint: <test/testsuite/publish/install/rollback + confirmed target alias and version>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; authorized CI/CD targets and protected credentials.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `cicd` help, CLI source and bundled `ci-integration` / `sdlc-guide` docs.

`now-sdk cicd` calls `sn_cicd` APIs: it executes tests and mutates application versions on instances. Run `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md). Only the interactive parent can obtain the approvals below.

## Required preflight

1. `now-sdk cicd publish --help` must list `--app-sys-id`; an SDK without `cicd` prints its general help and still exits 0. If the option is missing, stop and report the project's SDK version; do not upgrade or switch SDKs for this skill. Check the SDK's declared Node engine.
2. Read `now.config.json` (scope, `scopeId`) and `package.json` (version). The auth alias and instance host for each stage (source, test, target) come from the user; ask if one is missing. Always pass `--auth <alias>`, or the SDK uses its default alias.
3. List credential variable names only: `Get-ChildItem Env:SN_SDK_* | Select-Object -ExpandProperty Name`. If `SN_SDK_NODE_ENV`, `SN_SDK_SESSION_TOKEN` or `SN_SDK_SESSION_BEARER_TOKEN` is listed, stop and report it without values: the SDK then ignores `--auth`, targets `SN_SDK_INSTANCE_URL`, and machine output (`--output json` or `--select`) says nothing about it.
4. Confirm before running ATF on an instance, naming the alias and instance host: ATF steps can create/update/delete test data.
5. Stop and obtain explicit approval before every `cicd publish`, `cicd install`, or `cicd rollback`. State the source/target alias and instance host, app sys_id or scope, the version currently on the target (read it first, see [Verify versions](#verify-versions); it is the expected rollback version), and the target version.
6. Never use local `now-sdk install` as a production promotion path; production change management, approvals and rollback depend on App Repo installs. Build/install to dev/test with **sn-build-install**, validate, publish to App Repo, then `cicd install` downstream through normal approvals.

## Run and read the result

End every call with the exit report; do not add `2>&1` (it mixes stderr into the JSON):

```powershell
now-sdk cicd testsuite run --auth <test-alias> --test-suite-sys-id <sys_id> --output json; "exit=$LASTEXITCODE"
```

- Machine output prints nothing until the command ends, up to the poll timeout (no progress, target or defaults notice).
- Success: exit 0, `{"ok":true,"result":...,"progress":...}`. `result` is only the dispatch response; the outcome is `progress` (`successful`; `status` `0` pending, `1` running, `2` successful, `3` error, `4` canceled) and, for ATF, `interpretedResult.summary` (result id, status, counts).
- Failure: exit 1, only `{"ok":false,"error":{"message":"..."}}`; for ATF it holds status, output or counts and a `Details:` link when available. An argument error prints help on stderr and no JSON.
- `Timed out after <ms>ms waiting on progress '<id>'` means only the client stopped polling (default `--poll-timeout` 900000 ms, 15 minutes). Completion is UNKNOWN: keep the message verbatim (it holds the progress id) and do not re-run a publish, install or rollback. Read `/api/sn_cicd/progress/<id>` with **sn-rest** (`result.status`), then verify versions.
- `--wait=false` returns the progress id at `result.links.progress.id`; use it only for ATF with a later `watch`, never for publish, install or rollback.

## ATF gates

```powershell
now-sdk cicd testsuite run --auth <test-alias> --test-suite-name "Regression Suite" --output json; "exit=$LASTEXITCODE"
now-sdk cicd test run --auth <test-alias> --test-name "Critical test" --output json; "exit=$LASTEXITCODE"
```

- These run what is already on the instance; install a locally authored suite or test first (**sn-build-install** or App Repo), or the previous version runs.
- `--test-name` fails on zero or several matches. `--test-suite-name` is sent unchecked: confirm it is unique with an **sn-rest** read of `sys_atf_test_suite` (`name=<name>`, fields `sys_id,name`, limit 2), or pass `--test-suite-sys-id` / `--test-sys-id`.
- Execution needs `sn_atf.runner.enabled` (off by default); UI steps need a client test runner or `--run-in-cloud`. Otherwise the run may sit pending until the poll timeout. Changing that property is a separate approved write.
- A failed test exits non-zero; never infer success from dispatch. `testsuite result` / `test result` only fetch the record and exit 0 for a failed run too: read the returned status.
- Read [references/run-options.md](references/run-options.md) for browser/OS/performance/node-log or poll-timeout options, `watch`, `result`, test `logs`, or `--scope` and base-app install flags.

## App Repo promotion

`cicd publish` uploads nothing local: the version comes from the app's current state on the source instance, so publish only from an instance where this exact source was installed and validated. Repository versions are immutable and republishing one fails; confirm `package.json` carries the new version, and on a version conflict, stop.

Inside the project, `--app-sys-id` defaults from `now.config.json.scopeId` and, for publish/install, `--app-version` from `package.json.version`; rollback never defaults the version. Machine output hides applied defaults: show the resolved values before approval and pass them explicitly.

```powershell
now-sdk cicd publish --auth <validated-source-alias> --app-sys-id <sys_id> --app-version <version> --dev-notes "<notes>" --output json; "exit=$LASTEXITCODE"
now-sdk cicd install --auth <target-alias> --app-sys-id <sys_id> --app-version <version> --output json; "exit=$LASTEXITCODE"
```

After a successful install, report `result.rollback_version`; it should equal the pre-install version. A failed or timed-out install prints no `result`, leaving the pre-install read as the only rollback record. Verify the installed version; dispatch alone is not success.

## Verify versions

Before approval and after every publish, install or rollback, read with **sn-rest** on the same alias and instance: `/api/now/table/sys_scope?sysparm_query=scope=<scope>&sysparm_fields=sys_id,scope,version,sys_class_name&sysparm_limit=2`. `sys_scope` is the parent of `sys_app` and `sys_store_app` (repository installs); `sys_class_name` shows which. No row means not installed or not readable, not proven absence.

## Rollback

Destructive. `--app-version` is the version expected after rollback, not the one removed. It works only for App Repo installs within a fixed time window. Take the version from the install's `result.rollback_version` or the pre-install read; otherwise ask the user and mark it unverified in the approval request.

```powershell
now-sdk cicd rollback --auth <target-alias> --app-sys-id <sys_id> --app-version <expected-previous-version> --output json; "exit=$LASTEXITCODE"
```

Obtain separate explicit approval immediately before rollback. Verify the resulting installed version.

## CI pipelines

`SN_SDK_*` credentials belong in a pipeline's protected secret store, never a developer terminal; never commit, print, or `SETX` secrets. Read [references/ci-pipeline.md](references/ci-pipeline.md) before writing a pipeline, configuring CI auth or adding the `--frozenKeys` pre-merge check.

Report each command, target, exit code, final interpreted outcome, and verified version. Terse.
