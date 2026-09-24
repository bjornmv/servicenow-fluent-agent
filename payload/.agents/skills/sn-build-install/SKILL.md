---
name: sn-build-install
description: Build, install, and verify a Fluent app on the instance — small build cycles, map build errors to Fluent rules, then install + verify records landed. Use when deploying authored changes to the PDI, or after editing any .now.ts.
argument-hint: [optional: records/tables to verify]
---
Build, install, and verify the current now-sdk app against the detected auth alias and project scope. Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md). All install approvals and verification gates below still apply.

## 1. Build
Run `now-sdk build` — compiles `src/fluent/**/*.now.ts` → `dist/app`. Fast (~10s); install is the slow step, so iterate on build first.

`TSxxxx` / parser errors are BUILD errors (Fluent shape), not install errors. Classify the file before applying a generic fix. ATF `Test(...)`, hand-authored automation, and Playbook callbacks are documented DSL syntax and must not be externalized merely because they are functions. `GraphQLApi(...)` resolver scripts use named imported server functions (preferred) or `Now.include`; inline resolver functions are invalid.

For ordinary declarative records, map each error to [Fluent rules](../../instructions/fluent.instructions.md) or **sn-fix-build**:
- `BarBarToken` / unexpected `||` `&&` `?:` → resolve an ordinary property to a literal or move runtime logic to an external script; moving the same expression to a scalar `const` fails identically.
- Inline ordinary record script rejected → externalize with the API-supported form, usually `Now.include` with a path relative to the `.now.ts` file.
- String `+` concat in an ordinary record → template literal.
- Arbitrary runtime control flow in an ordinary record → external module. Never use `new TestSuite()` or `new GraphQLApi()`; both are direct calls.
- `TS2322` on `'true'`/`'100'` → primitive `true` / `100`. Choice `{ text: }` → `{ label: }`.
- `TS2305` / `TS2459` / missing or duplicate export on a `Table()` → named export matching the table name. `TS6133` unused → delete/reference. `SPPage` `$id` → `pageId`.

When unsure of shape, run `now-sdk explain <recordtype>-api --format raw` first; add `-guide` only for net-new or complex composition. ONE coherent fix → rebuild → repeat in small cycles until clean. Do not touch install until build passes.

### SDK 4.11 choice compatibility
Normal v4 build output uses additive `sys_choice_v2` merging. `now-sdk build --legacyChoices` restores v3 `sys_choice_set` wrapper behavior, which can destructively replace choices. Never use it as a generic parser/build fix. Use only for a confirmed legacy-choice migration requirement after showing the affected choice fields and obtaining explicit confirmation; report that compatibility mode was used.

## 2. Install
Install only after the build is clean AND the pre-install flow/action scan below is complete. Local `now-sdk install` is for development/test deployment; production promotion should use the App Repository workflow in **sn-cicd**, with target and version approvals. SLOW step (uploads + activates) — let it finish, don't retry on a hang. Install errors are instance-side (auth, scope conflict, activation), not Fluent syntax. Stale auth → re-run **sn-auth**. Do NOT use `--reinstall` (destructive) without confirming first.

### Pre-install flow/action scan — REQUIRED BEFORE COMMAND
Before every install, scan source for `src/fluent/**/sys_hub_flow_*.now.ts` and `src/fluent/**/sys_hub_action_type_definition_*.now.ts`. If any are present:
- These will be reset to `draft / active: false` on the instance and may need a manual Flow Designer re-publish after install.
- Worse, the install may write an invalid `master_snapshot` pointer, breaking the flow with errors like "inputs incorrect" or `[<table> - null]`.
- Classify per the agent's Flow guardrail: anything under `src/fluent/generated/automation/flow/` or with a matching `metadata/update/sys_hub_*.xml` is **Fluent-locked** (originated from `transform`). STOP and recommend removing those from source per the **sn-transform** skill. Don't proceed without explicit user confirmation.
- If the user must keep the transformed flows in source for this install, pass `--skip-flow-activation` to the install (`now-sdk install --auth <alias> --skip-flow-activation`). The records still upload but the post-install publish step is skipped, avoiding the draft-reset + bad `master_snapshot` failure mode. The flow stays in its current published state on the instance.
- If you need to confirm what the build actually packaged, unzip `target/<app>.zip` and look for `sys_hub_flow_*.xml` / `sys_hub_action_type_definition_*.xml` entries.

After the scan:
- If no transformed flow/action records are present, install with the normal command.
- If transformed flow/action records remain only because the user explicitly approved keeping them for this install, install with `--skip-flow-activation`.

**Capture exit code AND output — the install can silently fail.** The patterns below are for VS Code PowerShell. In Pi, use `now_sdk` and inspect its captured exit status/output; do not recreate the shell wrapper. A launcher failure is inconclusive even if an earlier command left a zero exit code. Normal pattern:
```powershell
$out = now-sdk install --auth <alias> 2>&1
$commandOk = $?
$exit = $LASTEXITCODE
$out
$failed = -not $commandOk -or $exit -ne 0 -or (($out | Out-String) -cmatch '(?m)^\[now-sdk\]\s+ERROR:|Could not determine app installation status')
if ($failed) { throw "now-sdk install failed or reported an error (exit $exit). Check Upgrade History (install --info prints the URL; read rows via sn-rest) before retrying." }
```

Transformed-flow approved pattern:
```powershell
$out = now-sdk install --auth <alias> --skip-flow-activation 2>&1
$commandOk = $?
$exit = $LASTEXITCODE
$out
$failed = -not $commandOk -or $exit -ne 0 -or (($out | Out-String) -cmatch '(?m)^\[now-sdk\]\s+ERROR:|Could not determine app installation status')
if ($failed) { throw "now-sdk install failed or reported an error (exit $exit). Check Upgrade History (install --info prints the URL; read rows via sn-rest) before retrying." }
```

Known failure modes that print mostly-success output but exit non-zero:
- `[now-sdk] ERROR: Could not determine app installation status.` — status check failed; the upload may have applied partially or not at all. Investigate via the instance's Upgrade History before any further build/install. `now-sdk install --info --auth <alias>` only PRINTS the Upgrade History URL (`<host>/sys_upgrade_history_list.do`) — it is a static link-printer: no network call, works with or without install history, does not verify auth, and ignores `-b`/`--open-browser`. Read the actual rows headlessly via **sn-rest** on `sys_upgrade_history` (newest first; if the instance REST-blocks that table, dot-walk from `sys_upgrade_history_task`). To confirm the alias is alive, use the `sn-rest` health check from **sn-auth**.
- Long hang with no output past `Starting installation...` and a non-zero exit — check the upgrade history table for the actual error.

## 3. Verify on the instance
Confirm the records actually landed (targets from the argument, if given).

**`sys_updated_on` / `sys_mod_count` are NOT proof of install for any record.** `now-sdk install` carries XML audit fields verbatim, so the on-instance timestamp can stay days old even after a successful write. Confirmed for `sys_hub_action_type_definition`, `sys_hub_flow`, `sp_widget`, `sp_ui_page`, `sp_css`, `sys_script_include`, and likely most platform tables.

The ONLY reliable proof of install is to read the actual content field of the record and grep for a marker string you put into the new version:
- Server scripts: `script` on `sys_script`, `sys_script_include`, `sys_ui_action`, etc.
- ACLs: `script` / `condition` on `sys_security_acl`.
- Email notifications: `message_html` / `subject` on `sysevent_email_action`.
- Service Portal: `template` / `script` / `client_script` / `css` on `sp_widget`; `html` on `sp_header_footer`; `value` on `sp_css`.
- Flows / custom actions: content lives in a gzipped+base64 `values` blob — do NOT try to fetch from the live instance. Instead unpack `target/<app>.zip` and grep the build XML; that's what was uploaded.

Example marker check:
```powershell
$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sp_widget?sysparm_query=id=<widget-id>&sysparm_fields=template" | Select-String -Pattern '<new-marker-string>'
```
Always restrict `sysparm_fields` to the single content field you are verifying — otherwise the marker can false-positive against a `sys_id`, audit field, or name in the payload. If the marker is missing, the install did not actually update that record — do not claim success.

For end-to-end verification (does the feature actually work?), exercise it through the same trigger the user does, then read `syslog` / `sys_flow_context` / `sys_hub_action_status` for runtime evidence. "Marker present in content field" only proves the record was written.

For user-facing UI artifacts, browser checks do not replace content-marker verification, but they are required before claiming the UI is runtime-smoked, working, verified, or complete. Confirm the deployed UI mounted, its ready content appeared, required reads succeeded, and no new uncaught console error occurred. For Vite UI Pages, follow the **sn-ui-page-vite** conditional target-runtime compatibility slice: run the small target slice only for an unvalidated runtime boundary, cache a passing stack, and do not add a separate upload for routine follow-up changes on that validated architecture.

## 4. Source Control commit (if app is SC-bound)
`now-sdk install` does NOT push to git. If the app on the instance is bound to a remote repo (`sys_repo_config` row exists for the scope), after a successful install + verify, **remind the user to run Studio → Source Control → Commit Changes** to push the new revision to the bound branch (typical naming: `sn_instances/<instance>`).

Detect SC binding ONCE per project, then cache the result — do not re-query on every install. Check `/memories/repo/` first for a previously stored binding fact for this scope+instance; if present, use it. If absent, run the two REST calls below, then record the outcome (bound + branch URL, OR unbound) under `/memories/repo/` so subsequent installs skip the lookup. Re-check only when the user changes auth alias, instance, or scope.

The lookup (two REST calls — the first resolves the `sys_app` row from the project scope in `now.config.json`):
```powershell
$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'
# 1. Look up the sys_app sys_id from the project's scope
node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sys_app?sysparm_query=scope=<scope>&sysparm_fields=sys_id,name"
# 2. Plug the sys_id from step 1 into the SC binding query
node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sys_repo_config?sysparm_query=sys_app=<sys_app_sys_id>&sysparm_fields=url,current_branch,current_ref"
```
Empty result on step 2 = unbound (no commit step). Row present = bound (mention commit step).

SC is OUTBOUND from the instance — it does NOT block or alter `now-sdk install`. Do NOT chase install failures through the SC binding. See `~/.agents/reference/servicenow-source-control.md`.

Report build output, install output AND exit code, content-marker check, (if you exercised it) runtime evidence, AND if SC-bound, the commit-step reminder. Print each command before running it. Terse.
