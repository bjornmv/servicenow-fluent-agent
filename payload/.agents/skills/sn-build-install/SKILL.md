---
name: sn-build-install
description: Builds a Fluent app and installs it to a dev or test instance. Use when building, deploying, or checking whether a failed, hung or unclear install landed; not compile errors (sn-fix-build).
argument-hint: '[optional: records/tables to verify]'
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; installation requires an authorized target and OAuth alias.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 CLI help, bundled docs, SDK source and local build output (install flags and output lines, flow activation, choice default). On another SDK version, confirm flags with `now-sdk build --help` / `now-sdk install --help` first.
Build and, when deployment was requested, install and verify the current now-sdk app against the user-confirmed auth alias and instance and the scope in `now.config.json`. If the user asked only to build, stop after section 1 and report; do not install. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md). The agent's approval gates and every install and verification gate below still apply.

## Automation ownership

- Classify every Flow/Subflow/Action before editing or installing it, because transformed automation can carry instance-managed state.
- Source under `src/fluent/generated/automation/flow/` or with matching `metadata/update/sys_hub_*.xml` is **Fluent-locked** after transformation. That folder is the SDK default for transformed flows, subflows and custom actions (`now.config.json` can move it); a `masterSnapshot` property in a `Flow(...)`, `Subflow(...)` or `Action(...)` call marks transformed automation wherever the file lives.
- Make runtime edits to those transformed records in Flow Designer rather than treating them as hand-authored Fluent.
- Hand-authored automation outside those paths, with no `masterSnapshot` and no matching transformed metadata, may be edited after checking its exact SDK API/guide.
- Stop and ask if build output contains transformed automation not authored in the current session, because it expands the deployment beyond the reviewed change.
- Obtain explicit approval before deleting generated source or its matching XML.
- Apply the pre-install scan below even when the intended change does not concern automation, because the archive may still contain it.

## 1. Build
Run `now-sdk build` — compiles `src/fluent/**/*.now.ts` → `dist/app` (the `appOutputDir` default; where `now.config.json` sets it, use that path wherever this skill names `dist/app`; for an `aiux.json` project also apply **sn-lux-build**). Fast (~10s); install is the slow step, so iterate on build first.

The build passed only with native exit 0 AND the line `Build completed successfully` AND no `[now-sdk] ERROR:` line. Exit code alone is not enough: run from a directory without `package.json`, build prints `ERROR: Could not find package.json` and still exits 0. A passing build proves the Fluent source compiled; it is not evidence that anything was installed or works on the instance.

`TSxxxx` / parser errors are BUILD errors (Fluent shape), not install errors. Classify the file before applying a generic fix. ATF `Test(...)`, hand-authored automation, and Playbook callbacks are documented DSL syntax and must not be externalized merely because they are functions. `GraphQLApi(...)` resolver scripts use named imported server functions (preferred); `Now.include` there must point at a raw resolver script, not an `export function` module; inline resolver functions are invalid.

Map each Fluent compile error with the error table in **sn-fix-build** (it also triages non-Fluent failures and classifies DSL, GraphQL and locked-automation files) and the [Fluent rules](../../instructions/fluent.instructions.md) instead of guessing. When unsure of shape, run `now-sdk explain <recordtype>-api --format raw` first; for net-new or complex composition find the guide with `now-sdk explain --list "<keyword>" --format raw` (guide topic names do not always follow the `-api` name). ONE coherent fix → rebuild → repeat in small cycles until clean. Do not touch install until build passes.

### Choice compatibility
Choice output depends on `legacyChoices` (`now.config.json`, or `--legacyChoices` / `--legacyChoices=false` on `now-sdk build`). The default is `true`: version 3 `sys_choice_set` XML, which is destructive (delete-all-then-insert), so choices for that field that are not in source are removed on install. `legacyChoices: false` emits version 4 `sys_choice_v2` (additive merge); instances without the v4 loader skip that record without error (`now-sdk explain choiceset-guide` lists supported releases). Passing `--legacyChoices` only restates the default and is never a parser/build fix. Before installing a change to a field's choices, show the affected choice fields and the mode in effect and obtain explicit confirmation of the destructive replacement; switching a project's mode also needs explicit confirmation. Report which mode was used.

## 2. Install
Install only after a clean build of the current source AND the pre-install flow/action scan below. `now-sdk install` does not build: it packs the existing `dist/app` and uploads it, so rebuild after any source edit. Before the command, state the project directory, scope, auth alias, instance host and the change being deployed, and obtain explicit approval for that exact target; always pass `--auth <alias>`, because without it the SDK uses its default alias. Local `now-sdk install` is for development/test deployment; production promotion should use the App Repository workflow in **sn-cicd**, with target and version approvals. Demo data installs by default; add `--demoData=false` when the user does not want it. SLOW step (uploads + activates) — let it finish, don't retry on a hang. Install errors are instance-side (auth, scope conflict, activation), not Fluent syntax. Stale auth → re-run **sn-auth**. Do NOT use `--reinstall` (destructive) without confirming first.

### Pre-install flow/action scan — REQUIRED BEFORE COMMAND
Before every install, after the final build, check all three:
- Source: any `.now.ts` under `src/fluent/generated/automation/flow/`, any `src/fluent/**/sys_hub_flow_*.now.ts` or `src/fluent/**/sys_hub_action_type_definition_*.now.ts`, and any Flow/Subflow/Action source containing `masterSnapshot`.
- Kept XML: `metadata/**/sys_hub_*.xml`.
- Build output: `sys_hub_*.xml` under `dist/app/`. A `<master_snapshot>` element there means transformed automation is in the package:
```powershell
Get-ChildItem -Path dist\app -Recurse -Filter 'sys_hub_*.xml' | Select-String -SimpleMatch -Pattern '<master_snapshot>' -List | Select-Object -ExpandProperty Path
```
Inspect `dist/app/`, not `target/`: `now-sdk build` deletes `target/`, and the zip (`target/<name>_<version>.zip`) exists only after `now-sdk pack` or `now-sdk install`.

If any are present:
- The build XML ships every Flow/Subflow/Action as `status` draft / `active` false; only the post-install activation call publishes them. A transformed record with `masterSnapshot` also makes the package contain a draft snapshot stub at that sys_id and the upload can overwrite the published snapshot and header on the instance, breaking the flow with errors like "inputs incorrect" or `[<table> - null]`.
- `--skip-flow-activation` only skips that activation call, for every flow, subflow and action in the package, hand-authored and new ones included. It does not stop the upload from rewriting those records and does not keep a flow published; skipped records stay as uploaded until someone publishes them in Flow Designer.
- Apply [Automation ownership](#automation-ownership) above. If Fluent-locked records are present, STOP and explain the removal/retention options in **sn-transform** before requesting explicit confirmation.
- If the user must keep the transformed flows in source for this install, pass `--skip-flow-activation` to the install (`now-sdk install --auth <alias> --skip-flow-activation`) so the SDK does not publish a transformed definition automatically. Say beforehand that those flows may be left draft/inactive and must be checked and re-published in Flow Designer, and that no other flow in the package is activated either.

After the scan:
- If no transformed flow/action records are present, install with the normal command.
- If transformed flow/action records remain only because the user explicitly approved keeping them for this install, install with `--skip-flow-activation`.

**Capture exit code AND output — the install can silently fail.** The patterns below are for VS Code PowerShell. Require attributable native completion evidence; missing exit evidence or unrelated/delayed output makes completion UNKNOWN. Recover the original run's evidence before any retry. A launcher failure is inconclusive even if an earlier command left a zero exit code. The install is asynchronous by default (`--async`, default true): the SDK polls an instance execution tracker with no timeout of its own and logs `App install pending: <N>% complete, <message>` about every 30 seconds; the capture below shows nothing until the command exits. Normal pattern:
```powershell
$out = now-sdk install --auth <alias> 2>&1
$commandOk = $?
$exit = $LASTEXITCODE
$out
$failed = -not $commandOk -or $exit -ne 0 -or (($out | Out-String) -cmatch '\[now-sdk\]\s+ERROR:|Could not determine app installation status')
if ($failed) { throw "now-sdk install failed or reported an error (exit $exit). Read the execution tracker URL in the output, if any, and Upgrade History via sn-rest before retrying." }
if (($out | Out-String) -cnotmatch 'Installation completed\. Access the application at:|Changes installed successfully to update set:') { throw "now-sdk install printed no completion line (exit $exit): outcome UNKNOWN. Recover the original output and read Upgrade History via sn-rest before retrying." }
```

Transformed-flow approved pattern:
```powershell
$out = now-sdk install --auth <alias> --skip-flow-activation 2>&1
$commandOk = $?
$exit = $LASTEXITCODE
$out
$failed = -not $commandOk -or $exit -ne 0 -or (($out | Out-String) -cmatch '\[now-sdk\]\s+ERROR:|Could not determine app installation status')
if ($failed) { throw "now-sdk install failed or reported an error (exit $exit). Read the execution tracker URL in the output, if any, and Upgrade History via sn-rest before retrying." }
if (($out | Out-String) -cnotmatch 'Installation completed\. Access the application at:|Changes installed successfully to update set:') { throw "now-sdk install printed no completion line (exit $exit): outcome UNKNOWN. Recover the original output and read Upgrade History via sn-rest before retrying." }
```

Install evidence, all required: exit 0, no `[now-sdk] ERROR:` line, and the line `Installation completed. Access the application at: <url>`. A tracked install also prints `Rollback (undo installation): <host>/sys_rollback_context.do?sys_id=<id>`; record that URL in the report and do not act on it without separate explicit approval.

Flow activation never changes the exit code. If the package contains Flow/Subflow/Action records and `--skip-flow-activation` was not passed, look for `Flow activation complete: <n>/<n> succeeded`. Partial failures print `Failed: <flow>` warnings and `Flow activation complete: <s>/<t> succeeded, <f> failed`; a total failure or a missing activation endpoint is logged only at debug level. Without the all-succeeded line, activation is NOT confirmed: read the flow rows in section 3 and report it.

Known failure modes:
- `<message>. See execution details at <host>/sys_execution_tracker.do?sys_id=<id>` — the instance reported the install as failed. Read that tracker and Upgrade History before any further build/install.
- `Unable to track app install status due to a connection error. Monitor progress and verify the outcome at <tracker URL>` — polling broke; the install may still be running or may have completed. Outcome UNKNOWN; do not retry.
- `[now-sdk] ERROR: Could not determine app installation status.` — synchronous fallback only (the instance returned no execution tracker, or `--async=false`): no new finished Upgrade History row appeared in 30 one-second polls. The upload may have applied partially or not at all. Investigate via Upgrade History before any further build/install.
- `The install request was redirected away from the upload endpoint ... The app was not installed.` — session or authentication conflict; nothing was uploaded. Go to **sn-auth**; Upgrade History has nothing to show.
- Long run with no new output past `Starting installation with SDK <version>...` — the tracker loop does not time out. Do not start a second install; check Upgrade History for the actual state.

Upgrade History: `now-sdk install --info --auth <alias>` only PRINTS the Upgrade History URL (`<host>/sys_upgrade_history_list.do`) — it is a static link-printer: it does not read install history or test the stored token, and it ignores `-b`/`--open-browser`. Read the actual rows headlessly via **sn-rest**, using the selector the SDK itself polls:
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_upgrade_history?sysparm_query=to_version=<scope>%5EORDERBYDESCupgrade_started&sysparm_fields=sys_id,to_version,upgrade_started,upgrade_finished&sysparm_limit=3&sysparm_no_count=true"
```
A row for this scope that started after the install began and has `upgrade_finished` populated shows the instance finished processing a package, not that every record applied. Per-record detail is in `sys_upgrade_history_log`; if the instance REST-blocks that table, dot-walk `upgrade_detail.*` from `upgrade_history_task`. To confirm the alias is alive, use the `sn-rest` health check from **sn-auth**.

## 3. Verify on the instance
Confirm the records actually landed (targets from the argument, if given). Build success and install output are not content proof.

- Deleting local source is not proof that a live record was deleted, because source cleanup and instance deletion are separate operations.
- Verify the live outcome of an approved record deletion through a narrow `sn-rest` read rather than inferring it from missing local files.

**`sys_updated_on` / `sys_mod_count` are NOT proof of install for any record.** The on-instance timestamp can stay days old even after a successful write. Observed for `sys_hub_action_type_definition`, `sys_hub_flow`, `sp_widget`, `sp_css` and `sys_script_include`; assume it for every table.

Proof of install is a narrow read of the changed field on the live record showing a literal that exists only in the new version (the marker). Pick the marker from the changed source; no extra edit is needed:
- Server scripts: `script` on `sys_script`, `sys_script_include`, `sys_ui_action`, etc.
- ACLs: `script` / `condition` on `sys_security_acl`.
- Email notifications: `message_html` / `subject` on `sysevent_email_action`.
- Service Portal: `template` / `script` / `client_script` / `css` on `sp_widget` and on `sp_header_footer` (inherited from `sp_widget`); `css` on `sp_css`.
- UI Pages: `html` / `client_script` / `processing_script` on `sys_ui_page`. For a built React page `html` holds only the built HTML entry; see **sn-ui-page-vite** for where bundled TSX text lands.
- GraphQL: `schema` on `sys_graphql_schema`, `path` on `sys_graphql_resolver_mapping`; for an imported server function the resolver `script` is only a generated `require(...)` shim and the body is in `content` on `sys_module` (see **sn-add-graphql-api**).
- Playbooks: `label` / `status` on `sys_pd_process_definition`. Build and install never activate a playbook; report Playbook Designer activation as an outstanding manual step (see **sn-add-playbook**).
- Records with no script body (properties, columns, modules, roles, choices): read the changed field itself, for example `value` on `sys_properties` by `name`, and compare it with the new source value.
- Flows / custom actions: step content is a gzipped+base64 `values` blob on the instance AND in the build XML, so no marker search works in either place. Read the header instead: `status,active,master_snapshot,latest_snapshot` on `sys_hub_flow` (`state,active,master_snapshot,latest_snapshot` on `sys_hub_action_type_definition`) by the sys_id in `src/fluent/generated/keys.ts`. A flow is published only when the live row shows `status` published and `active` true; report the values read, and prove behaviour by exercising the flow.

Example marker check (the match is literal and case-sensitive; double any `'` inside the marker):
```powershell
$r = node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sp_widget?sysparm_query=id=<widget-id>&sysparm_fields=template&sysparm_limit=1&sysparm_no_count=true"
$exit = $LASTEXITCODE
$j = ($r | Out-String) | ConvertFrom-Json
$rows = @($j.records).Count
"exit=$exit ok=$($j.ok) rows=$rows marker=$($rows -eq 1 -and ([string]$j.records[0].template).Contains('<new-marker-string>'))"
```
Always restrict `sysparm_fields` to the single content field you are verifying — otherwise the marker can false-positive against a `sys_id`, audit field, or name in the payload. Read the result strictly: `ok=True rows=1 marker=True` proves that field holds the new content. `rows=1 marker=False` means the install did not update that record — do not claim success. `rows=0` means the record was not found or is not readable (wrong id, scope or ACL), and a missing `ok=True` or non-zero exit means the read failed; both are UNKNOWN, not proof either way.

For end-to-end verification (does the feature actually work?), exercise it through the same trigger the user does, then read `syslog` / `sys_flow_context` / `sys_flow_log` for runtime evidence. "Marker present in content field" only proves the record was written.

For user-facing UI artifacts, browser checks do not replace content-marker verification, but they are required before claiming the UI is runtime-smoked, working, verified, or complete. Confirm the deployed UI mounted, its ready content appeared, required reads succeeded, and no new uncaught console error occurred. For React UI Pages, follow the **sn-ui-page-vite** conditional target-runtime compatibility slice: run the small target slice only for an unvalidated runtime boundary, cache a passing stack, and do not add a separate upload for routine follow-up changes on that validated architecture.

## 4. Source Control commit (if app is SC-bound)
`now-sdk install` does NOT push to git. If the app on the instance is bound to a remote repo (`sys_repo_config` row exists for the scope), after a successful install + verify, **remind the user to run Studio → Source Control → Commit Changes** to push the new revision to the bound branch (typical naming: `sn_instances/<instance>`).

- Reuse a verified source-control binding fact for the same project, scope, instance and alias to avoid repeated discovery.
- Use the workspace's available memory facility or existing evidence location; no specific memory tool or path is required.
- If neither is available, retain the fact in the current conversation rather than creating an arbitrary memory directory.
- When no applicable fact exists, run the bounded lookup below and record the observed binding, branch, target and date without credentials.
- Recheck after a target/scope/alias change, a reported binding change or evidence that the cached result is stale.

The lookup (two REST calls — the first resolves the `sys_app` row from the project scope in `now.config.json`; run each as its own command):
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_app?sysparm_query=scope=<scope>&sysparm_fields=sys_id,name&sysparm_limit=1&sysparm_no_count=true"
```
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_repo_config?sysparm_query=sys_app=<sys_app_sys_id>&sysparm_fields=url,current_branch,current_ref&sysparm_limit=1&sysparm_no_count=true"
```
Plug the `sys_id` from the first result into the second. Second call `ok` true with `count` 0 = no binding visible to this user (no commit step). Row present = bound (mention commit step). A failed first call, `ok` false or blank output = UNKNOWN; say so instead of reporting unbound.

SC is OUTBOUND from the instance — it does NOT block or alter `now-sdk install`. Do NOT chase install failures through the SC binding. See the [source-control reference](../../reference/servicenow-source-control.md).

## Report
Report only the stages reached: build output and pass evidence; install output AND exit code, the completion and rollback lines, and any flow-activation line; content-marker check per changed record type; (if you exercised it) runtime evidence; AND if SC-bound, the commit-step reminder. Print each command before running it. Terse.
