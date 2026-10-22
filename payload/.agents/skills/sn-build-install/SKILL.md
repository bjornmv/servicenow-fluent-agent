---
name: sn-build-install
description: Builds a Fluent app and installs it to the developer's own dev instance or sandbox. Use when building, deploying, or checking whether a failed, hung or unclear install landed; not compile errors (sn-fix-build).
argument-hint: '[optional: records/tables to verify]'
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; installation requires an authorized target and OAuth alias; sn-skill (else node "<user-profile>/.agents/tools/sn-skill.cjs").
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6; on another version confirm flags with `now-sdk build --help` / `now-sdk install --help` first.

Build the current app and, only when deployment was requested, install it to the user-confirmed auth alias and development instance (scope from `now.config.json`) and verify it. For a build-only request, stop after section 1 and report. Run `now-sdk` directly in the VS Code terminal (PowerShell on Windows; bash with the now-sdk function on Linux) from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md). Print each command before running it.

## Automation ownership

Classify every Flow/Subflow/Action before editing or installing it.
- **Fluent-locked** (transformed, carries instance-managed state): source under `src/fluent/generated/automation/flow/` (SDK default; `now.config.json` can move it), source with matching `metadata/update/sys_hub_*.xml`, or any `Flow(...)`, `Subflow(...)` or `Action(...)` call with a `masterSnapshot` property. Make runtime edits to these in Flow Designer, not as hand-authored Fluent.
- Hand-authored automation (none of the above) may be edited after checking its exact SDK API/guide.
- Stop and ask if build output contains transformed automation not authored in the current session; it expands the deployment beyond the reviewed change.
- Obtain explicit approval before deleting generated source or its matching XML. Deleting it does not leave the record instance-only: its `keys.ts` entry makes the next install DELETE it (see [Transformed flows](../sn-transform/SKILL.md#transformed-flows-subflows-custom-actions)).
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

### Install target: development only

`now-sdk install` deploys only to the developer's own development instance or Developer Sandbox (SDK SDLC guide, `now-sdk explain sdlc-guide`). Test, QA/UAT, staging and production instances install a published version from the Application Repository: `cicd publish` from the validated dev instance, then `cicd install` through ReleaseOps or a CI pipeline (**sn-cicd**). That path gives a versioned artifact, App Repo rollback and an audit trail; a direct install gives none of them.
- Refuse a direct install to a test or production target, even when asked or approved; explain the App Repository path instead.
- Confirm the target's role with the user. Treat an alias or host whose name contains test, qa, uat, stag (stage, staging) or prod as a test/production target until the user confirms it is their development instance.

Before installing:
- A clean build of the current source. `now-sdk install` does not build; it packs and uploads the existing `dist/app`, so rebuild after any source edit.
- The pre-install scans below (flow/action and delete).
- State the project directory, scope, auth alias, instance host (confirmed as a development instance or sandbox) and the change being deployed; obtain explicit approval for that exact target.

Rules:
- Always pass `--auth <alias>`; without it the SDK uses its default alias.
- Demo data installs by default; add `--demoData=false` when the user does not want it.
- Do NOT use `--reinstall` (destructive) without confirming first.
- Install is slow: let it finish; don't retry on a hang. Its errors are instance-side (auth, scope conflict, activation), not Fluent syntax. Stale auth: re-run **sn-auth** (on Linux a keyring failure is a host finding; see [bash notes](../../reference/sdk-commands.md#linux-and-vs-code-server-bash)).

### Pre-install flow/action scan — REQUIRED BEFORE COMMAND

Before every install, after the final build, check all three:
- Source: any `.now.ts` under `src/fluent/generated/automation/flow/`, any `src/fluent/**/sys_hub_flow_*.now.ts` or `src/fluent/**/sys_hub_action_type_definition_*.now.ts`, and any Flow/Subflow/Action source containing `masterSnapshot`.
- Kept XML: `metadata/**/sys_hub_*.xml`.
- Build output: `sys_hub_*.xml` under `dist/app/`. A `<master_snapshot>` element there means transformed automation is in the package:
```powershell
Get-ChildItem -Path dist\app -Recurse -Filter 'sys_hub_*.xml' | Select-String -SimpleMatch -Pattern '<master_snapshot>' -List | Select-Object -ExpandProperty Path
```
bash (Linux, VS Code server):
```bash
grep -rlF --include='sys_hub_*.xml' '<master_snapshot>' dist/app; echo "exit=$?"
```
In bash `exit=1` with no paths means none found; `exit=2` (for example no `dist/app`) is an error, not a clean result. A command error in either shell is not a clean result.
Inspect `dist/app/`, not `target/`: `now-sdk build` deletes `target/`, and the zip exists only after `now-sdk pack` or `now-sdk install`.

If any are present:
- The build XML ships every Flow/Subflow/Action as `status` draft / `active` false; only the post-install activation call publishes them. For a transformed record (`masterSnapshot`) the package also holds a draft snapshot stub that can overwrite the published snapshot and header, breaking the flow ("inputs incorrect", `[<table> - null]`).
- `--skip-flow-activation` skips that activation for every flow, subflow and action in the package, hand-authored and new ones included. It does not stop the upload rewriting them and does not keep a flow published; they stay as uploaded until published in Flow Designer.
- If Fluent-locked records are present, STOP and explain the removal/retention options in **sn-transform** before requesting explicit confirmation.
- If the user explicitly approves keeping transformed flows in source for this install, use the `--skip-flow-activation` pattern. Say beforehand that those flows may be left draft/inactive and must be checked and re-published in Flow Designer, and that no other flow in the package is activated either.

No transformed flow/action records: use the normal pattern.

### Pre-install delete scan — REQUIRED BEFORE COMMAND

In a package project every `keys.ts` entry without matching source becomes a delete record (`deleted: true` in `src/fluent/generated/keys.ts`), and `Now.del()` adds more; the install DELETES those records on the instance, flows included. After the final build, run:
```
sn-skill deletes "<absolute-project-root>"
```
`exit=0` and `deletes=0`: none. `exit=1`: each `DELETE <table> <sys_id> key=<key>` line is a record the install deletes. `exit=2` or no exit line: not a clean result. The summary's `keys=<path>` is the keys file to diff.
- Check the target, not Git history: a committed deletion may never have been installed (an earlier agent, a teammate's change, a commit made before install). Per table, one narrow **sn-rest** read with the confirmed alias and host, at most 20 ids each: `/api/now/table/<table>?sysparm_query=sys_idIN<id>,<id>&sysparm_fields=sys_id&sysparm_limit=20&sysparm_no_count=true`.
- A row is already applied only when that read exited 0 without returning it AND its deletion is already committed (`git diff -- <keys path>`, or the source diff for `Now.del()`, shows no change to it); report their count. Every other row is a new deletion: the read returned it, the read was not clean (an error or 403 is UNKNOWN, not absent), the deletion was added in this change, or there is no usable diff (not a Git repository, keys file untracked, git error).
- New deletion: STOP. Name each record (table, sys_id, key) and obtain explicit approval to delete it from the instance.
- Unintended (source deleted to "clean up", or `sys_hub_*` from removed transformed automation): do not install. Restore the source and rebuild (the flags revert), or follow [Transformed flows](../sn-transform/SKILL.md#transformed-flows-subflows-custom-actions) to keep the record instance-only; then rerun this scan.

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
bash (Linux, VS Code server):
```bash
out=$(now-sdk install --auth <alias> 2>&1); rc=$?
printf '%s\n' "$out"; echo "exit=$rc"
if [ "$rc" -ne 0 ] || grep -qE '\[now-sdk\][[:space:]]+ERROR:|Could not determine app installation status' <<<"$out"; then echo "FAILED: now-sdk install failed or reported an error (exit $rc). Read the execution tracker URL in the output, if any, and Upgrade History via sn-rest before retrying."
elif ! grep -qE 'Installation completed\. Access the application at:|Changes installed successfully to update set:' <<<"$out"; then echo "UNKNOWN: now-sdk install printed no completion line (exit $rc). Recover the original output and read Upgrade History via sn-rest before retrying."; fi
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
bash (Linux, VS Code server):
```bash
out=$(now-sdk install --auth <alias> --skip-flow-activation 2>&1); rc=$?
printf '%s\n' "$out"; echo "exit=$rc"
if [ "$rc" -ne 0 ] || grep -qE '\[now-sdk\][[:space:]]+ERROR:|Could not determine app installation status' <<<"$out"; then echo "FAILED: now-sdk install failed or reported an error (exit $rc). Read the execution tracker URL in the output, if any, and Upgrade History via sn-rest before retrying."
elif ! grep -qE 'Installation completed\. Access the application at:|Changes installed successfully to update set:' <<<"$out"; then echo "UNKNOWN: now-sdk install printed no completion line (exit $rc). Recover the original output and read Upgrade History via sn-rest before retrying."; fi
```

Install evidence, all required: exit 0, no `[now-sdk] ERROR:` line, and the line `Installation completed. Access the application at: <url>`. A tracked install also prints `Rollback (undo installation): <host>/sys_rollback_context.do?sys_id=<id>`; record it in the report and do not act on it without separate explicit approval.

Flow activation never changes the exit code. If the package contains Flow/Subflow/Action records and `--skip-flow-activation` was not passed, look for `Flow activation complete: <n>/<n> succeeded`. Partial failures print `Failed: <flow>` and `Flow activation complete: <s>/<t> succeeded, <f> failed`; a total failure or missing activation endpoint is logged only at debug level. Without the all-succeeded line, activation is NOT confirmed: read the flow headers (see [verify-fields.md](references/verify-fields.md#flows-and-custom-actions)) and report it.

Failed, hung or UNKNOWN install: no further build or install until it is settled; read [install-failures.md](references/install-failures.md) for the failure lines and the Upgrade History read. `now-sdk install --info --auth <alias>` only PRINTS the Upgrade History URL; it does not read history or test the token.

## 3. Verify on the instance

Confirm the records actually landed (targets from the argument, if given). Build success and install output are not content proof.
- **`sys_updated_on` / `sys_mod_count` are NOT proof of install for any record**; they can stay days old after a successful write.
- Proof is a narrow read of the changed field on the live record showing a literal that exists only in the new version (the marker), picked from the changed source; no extra edit is needed. Read [verify-fields.md](references/verify-fields.md) when choosing the field for a record type (flows/actions, playbooks, GraphQL and UI pages differ).
- Deleting local source is not proof that a live record was deleted. Verify an approved deletion with a narrow `sn-rest` read.

Example marker check (literal, case-sensitive match; pick a marker literal with no quote marks that does not start with `-`, per the [quoting rule](../../reference/sdk-commands.md#skill-helpers-sn-skill)):
```
sn-skill rest --agent --alias '<confirmed-alias>' --instance 'https://<confirmed-host>' '/api/now/table/sp_widget?sysparm_query=id=<widget-id>&sysparm_fields=template&sysparm_limit=2&sysparm_no_count=true' --expect-field template --expect-contains '<new-marker-string>'
```
Keep `sysparm_fields` to the one content field, or the marker can false-positive on a `sys_id`, audit field or name. Read `expect` in the JSON and the final `sn-skill: rest exit=<N>` line:
- `exit=0`, `ok:true`, `expect` `rows:1` `present:true` `contains:true`: that field holds the new content.
- `rows:1` `present:true` `contains:false`: the install did not update that record; do not claim success.
- `rows:0` (wrong id, scope or ACL), `rows:2` (more than one match), `present:false` or no `present` (field name wrong or hidden), no `expect`, `ok:false` or a non-zero exit: UNKNOWN, not proof either way.

A marker only proves the record was written. For end-to-end proof, exercise the feature through the user's trigger, then read `syslog` / `sys_flow_context` / `sys_flow_log`.

User-facing UI: before claiming it runtime-smoked, working, verified or complete, also confirm in a browser that it mounted, its ready content appeared, required reads succeeded and no new uncaught console error occurred. React UI Pages: follow the **sn-ui-page-vite** conditional target-runtime compatibility slice. On a remote host (VS Code server) the agent cannot use the user's browser: ask the user to open the page and report, or use a permitted headless browser; until then the UI is not verified.

## 4. Source control after install

`now-sdk install` does NOT record the change in Git. Which reminder applies depends on the project's model ([source control reference](../../reference/servicenow-source-control.md)):
- **Local Git (recommended, default for SDK projects):** if `git -C <project> rev-parse` succeeds, remind the user to review the diff and commit/push through their own Git tooling. Do not commit on your own initiative — only when the user asks; pushing also needs a configured GitHub connection.
- **Studio Source Control (legacy, instance-bound):** if the scope has a `sys_repo_config` row, after a successful install + verify **remind the user to run Studio → Source Control → Commit Changes** to push to the bound branch (typically `sn_instances/<instance>`). If the project is also a local Git repository, report both and ask which path is authoritative.
- Reuse a verified binding fact for the same project, scope, instance and alias. Keep it in the workspace's memory facility or evidence location (no specific memory tool or path is required), else in the conversation; do not create an arbitrary memory directory.
- Recheck after a target/scope/alias change, a reported binding change or evidence that the cached result is stale.
- With no applicable fact, run the two-call lookup in [Detect SC binding](../../reference/servicenow-source-control.md#detect-sc-binding-for-the-current-app) and record the binding, branch, target and date without credentials. A failed call or blank output is UNKNOWN; say so instead of reporting unbound.

SC is outbound from the instance: it does not block or alter `now-sdk install`, so do not chase install failures through the binding.

## Report

Terse, stages reached only: build pass evidence; delete-scan result and any approved deletions; install output AND exit code, completion and rollback lines, any flow-activation line; content-marker check per changed record type; runtime evidence if exercised; outstanding manual steps (Playbook Designer activation, flows left draft by `--skip-flow-activation`); the source-control reminder that applies (Git commit, or Studio commit if SC-bound).
