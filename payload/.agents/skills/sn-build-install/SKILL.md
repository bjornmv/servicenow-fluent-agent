---
name: sn-build-install
description: Builds a Fluent app and installs it to a dev or test instance. Use when building, deploying, or checking whether a failed, hung or unclear install landed; not compile errors (sn-fix-build).
argument-hint: '[optional: records/tables to verify]'
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; installation requires an authorized target and OAuth alias.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6; on another version confirm flags with `now-sdk build --help` / `now-sdk install --help` first.

Build the current app and, only when deployment was requested, install it to the user-confirmed auth alias and instance (scope from `now.config.json`) and verify it. For a build-only request, stop after section 1 and report. Run `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md). Print each command before running it.

## Automation ownership

Classify every Flow/Subflow/Action before editing or installing it.
- **Fluent-locked** (transformed, carries instance-managed state): source under `src/fluent/generated/automation/flow/` (SDK default; `now.config.json` can move it), source with matching `metadata/update/sys_hub_*.xml`, or any `Flow(...)`, `Subflow(...)` or `Action(...)` call with a `masterSnapshot` property. Make runtime edits to these in Flow Designer, not as hand-authored Fluent.
- Hand-authored automation (none of the above) may be edited after checking its exact SDK API/guide.
- Stop and ask if build output contains transformed automation not authored in the current session; it expands the deployment beyond the reviewed change.
- Obtain explicit approval before deleting generated source or its matching XML.
- Run the pre-install scan even when the change is not about automation; the archive may still contain it.

## 1. Build

Run `now-sdk build`. Output goes to `dist/app` (the `appOutputDir` default; if `now.config.json` sets it, read that path wherever this skill says `dist/app`). For an `aiux.json` project also apply **sn-lux-build**.

The build passed only with native exit 0 AND the line `Build completed successfully` AND no `[now-sdk] ERROR:` line. Exit 0 alone is not enough: from a directory without `package.json`, build prints `ERROR: Could not find package.json` and exits 0. A passing build proves compilation, not installation.

`TSxxxx` / parser errors are build errors, not install errors: fix them with **sn-fix-build** (diagnostic table and file classification) and the [Fluent rules](../../instructions/fluent.instructions.md). One coherent fix, then rebuild. Do not install until the build passes.

### Choice compatibility

`legacyChoices` (`now.config.json`, or `--legacyChoices` / `--legacyChoices=false` on `now-sdk build`) selects the choice output. The default is `true`: version 3 `sys_choice_set` XML, which is destructive (delete-all-then-insert): a field's choices missing from source are removed on install. `legacyChoices: false` emits version 4 `sys_choice_v2` (additive merge); instances without the v4 loader skip that record without error (`now-sdk explain choiceset-guide` lists supported releases). `--legacyChoices` only restates the default and is never a parser/build fix.
- Before installing a choice change, show the affected fields and the mode in effect, and obtain explicit confirmation of the destructive replacement. Switching a project's mode also needs explicit confirmation.
- Report which mode was used.

## 2. Install

Before installing:
- A clean build of the current source. `now-sdk install` does not build; it packs and uploads the existing `dist/app`, so rebuild after any source edit.
- The pre-install scan below.
- State the project directory, scope, auth alias, instance host and the change being deployed; obtain explicit approval for that exact target.

Rules:
- Always pass `--auth <alias>`; without it the SDK uses its default alias.
- Local install is for dev/test. Production promotion uses the App Repository workflow in **sn-cicd**, with target and version approvals.
- Demo data installs by default; add `--demoData=false` when the user does not want it.
- Do NOT use `--reinstall` (destructive) without confirming first.
- Install is slow: let it finish; don't retry on a hang. Its errors are instance-side (auth, scope conflict, activation), not Fluent syntax. Stale auth: re-run **sn-auth**.

### Pre-install flow/action scan — REQUIRED BEFORE COMMAND

Before every install, after the final build, check all three:
- Source: any `.now.ts` under `src/fluent/generated/automation/flow/`, any `src/fluent/**/sys_hub_flow_*.now.ts` or `src/fluent/**/sys_hub_action_type_definition_*.now.ts`, and any Flow/Subflow/Action source containing `masterSnapshot`.
- Kept XML: `metadata/**/sys_hub_*.xml`.
- Build output: `sys_hub_*.xml` under `dist/app/`. A `<master_snapshot>` element there means transformed automation is in the package:
```powershell
Get-ChildItem -Path dist\app -Recurse -Filter 'sys_hub_*.xml' | Select-String -SimpleMatch -Pattern '<master_snapshot>' -List | Select-Object -ExpandProperty Path
```
Inspect `dist/app/`, not `target/`: `now-sdk build` deletes `target/`, and the zip exists only after `now-sdk pack` or `now-sdk install`.

If any are present:
- The build XML ships every Flow/Subflow/Action as `status` draft / `active` false; only the post-install activation call publishes them. For a transformed record (`masterSnapshot`) the package also holds a draft snapshot stub that can overwrite the published snapshot and header, breaking the flow ("inputs incorrect", `[<table> - null]`).
- `--skip-flow-activation` skips that activation for every flow, subflow and action in the package, hand-authored and new ones included. It does not stop the upload rewriting them and does not keep a flow published; they stay as uploaded until published in Flow Designer.
- If Fluent-locked records are present, STOP and explain the removal/retention options in **sn-transform** before requesting explicit confirmation.
- If the user explicitly approves keeping transformed flows in source for this install, use the `--skip-flow-activation` pattern. Say beforehand that those flows may be left draft/inactive and must be checked and re-published in Flow Designer, and that no other flow in the package is activated either.

No transformed flow/action records: use the normal pattern.

### Run and capture

**Capture exit code AND output — the install can silently fail.** Missing exit evidence or unrelated/delayed output makes completion UNKNOWN; a launcher failure is inconclusive even if an earlier command left exit 0. Recover the original run's evidence before any retry. The install is asynchronous by default: the SDK polls an execution tracker with no timeout, logging `App install pending: <N>% complete, <message>` about every 30 seconds, but the capture shows nothing until exit.

Normal pattern:
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

Install evidence, all required: exit 0, no `[now-sdk] ERROR:` line, and the line `Installation completed. Access the application at: <url>`. A tracked install also prints `Rollback (undo installation): <host>/sys_rollback_context.do?sys_id=<id>`; record it in the report and do not act on it without separate explicit approval.

Flow activation never changes the exit code. If the package contains Flow/Subflow/Action records and `--skip-flow-activation` was not passed, look for `Flow activation complete: <n>/<n> succeeded`. Partial failures print `Failed: <flow>` and `Flow activation complete: <s>/<t> succeeded, <f> failed`; a total failure or missing activation endpoint is logged only at debug level. Without the all-succeeded line, activation is NOT confirmed: read the flow headers (see [verify-fields.md](references/verify-fields.md#flows-and-custom-actions)) and report it.

Failed, hung or UNKNOWN install: no further build or install until it is settled; read [install-failures.md](references/install-failures.md) for the failure lines and the Upgrade History read. `now-sdk install --info --auth <alias>` only PRINTS the Upgrade History URL; it does not read history or test the token.

## 3. Verify on the instance

Confirm the records actually landed (targets from the argument, if given). Build success and install output are not content proof.
- **`sys_updated_on` / `sys_mod_count` are NOT proof of install for any record**; they can stay days old after a successful write.
- Proof is a narrow read of the changed field on the live record showing a literal that exists only in the new version (the marker), picked from the changed source; no extra edit is needed. Read [verify-fields.md](references/verify-fields.md) when choosing the field for a record type (flows/actions, playbooks, GraphQL and UI pages differ).
- Deleting local source is not proof that a live record was deleted. Verify an approved deletion with a narrow `sn-rest` read.

Example marker check (literal, case-sensitive match; double any `'` inside the marker):
```powershell
$r = node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sp_widget?sysparm_query=id=<widget-id>&sysparm_fields=template&sysparm_limit=1&sysparm_no_count=true"
$exit = $LASTEXITCODE
$j = ($r | Out-String) | ConvertFrom-Json
$rows = @($j.records).Count
"exit=$exit ok=$($j.ok) rows=$rows marker=$($rows -eq 1 -and ([string]$j.records[0].template).Contains('<new-marker-string>'))"
```
Keep `sysparm_fields` to the one content field, or the marker can false-positive on a `sys_id`, audit field or name. Results:
- `ok=True rows=1 marker=True`: that field holds the new content.
- `rows=1 marker=False`: the install did not update that record; do not claim success.
- `rows=0` (wrong id, scope or ACL), a missing `ok=True` or a non-zero exit: UNKNOWN, not proof either way.

A marker only proves the record was written. For end-to-end proof, exercise the feature through the user's trigger, then read `syslog` / `sys_flow_context` / `sys_flow_log`.

User-facing UI: before claiming it runtime-smoked, working, verified or complete, also confirm in a browser that it mounted, its ready content appeared, required reads succeeded and no new uncaught console error occurred. React UI Pages: follow the **sn-ui-page-vite** conditional target-runtime compatibility slice.

## 4. Source Control commit (if app is SC-bound)

`now-sdk install` does NOT push to git. If the scope has a `sys_repo_config` row, after a successful install + verify **remind the user to run Studio → Source Control → Commit Changes** to push to the bound branch (typically `sn_instances/<instance>`).
- Reuse a verified binding fact for the same project, scope, instance and alias. Keep it in the workspace's memory facility or evidence location (no specific memory tool or path is required), else in the conversation; do not create an arbitrary memory directory.
- Recheck after a target/scope/alias change, a reported binding change or evidence that the cached result is stale.
- With no applicable fact, run the two-call lookup in [Detect SC binding](../../reference/servicenow-source-control.md#detect-sc-binding-for-the-current-app) and record the binding, branch, target and date without credentials. A failed call or blank output is UNKNOWN; say so instead of reporting unbound.

SC is outbound from the instance: it does not block or alter `now-sdk install`, so do not chase install failures through the binding.

## Report

Terse, stages reached only: build pass evidence; install output AND exit code, completion and rollback lines, any flow-activation line; content-marker check per changed record type; runtime evidence if exercised; outstanding manual steps (Playbook Designer activation, flows left draft by `--skip-flow-activation`); the SC commit reminder if bound.
