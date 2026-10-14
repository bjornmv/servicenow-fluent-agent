---
name: sn-transform
description: Converts instance records or metadata XML into Fluent source and adds type definitions for other-scope records. Use when bringing in a flow, playbook or other record built on the instance; not a whole app (sn-download).
argument-hint: <--table/--id, --ids sys_ids, or local XML file/dir — e.g. --table sys_script --id abc123, --ids abc123, or --from metadata/update>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; authorized instance access unless using local XML.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 source, bundled docs and local `--from`/`--table` runs; instance-backed modes (`--auth`, `--id`, `--ids`) were read in source, not run.

Convert existing ServiceNow records into Fluent `.now.ts` source in this app. Run `now-sdk` in VS Code PowerShell from the confirmed project directory (project `cwd`), per the [SDK command policy](../../reference/sdk-commands.md). `transform` never changes record ownership on the instance (see Record reassignment in that policy). To reference records you do not own (OOB Action / Trigger / ACL / table) without adopting them, or to refresh other-scope or platform type definitions (`now-sdk dependencies`), read [references/dependencies.md](references/dependencies.md); use `transform` only to OWN a record in this app.

## Before any transform
- `now-sdk build` passes. Transform compiles first and aborts with `Found N diagnostic error(s) while building the project`; fix with **sn-fix-build**.
- Local work is committed or stashed, so the transform's changes can be reviewed and undone. If the project is not a Git repository (`git -C <project> rev-parse` fails), stop and ask; with approval, `git init` and commit a baseline first, or copy the project folder as a backup. Do not transform without one of these.
- Project dependencies are installed. Without `node_modules/@servicenow/sdk` a transform still exits 0 but writes `.now.ts` files with no `import` lines and removes the source XML from `metadata/` (see **sn-download**).

`transform` has no scope argument, positional argument or prompt; the app is always the one in `now.config.json`. Do not pass sys_ids as positional arguments; the SDK rejects them with `Unknown command: <sys_id>`.

## Pick ONE mode
1. **Local XML** (no instance call; `--from` and `--auth` are mutually exclusive): `now-sdk transform --from <xml file or dir>`. For XML in the project's `metadata/` folder (e.g. after `init --from`): `now-sdk transform --from metadata` or `--from metadata/update/<table>_<sys_id>.xml`. Converted XML is removed only from inside `metadata/`; keep other source directories outside the project. `--format=false` skips auto-formatting if it mangles output.
2. **One record**: `now-sdk transform --auth <alias> --table <metadata_table> --id <sys_id>` (e.g. `--table sys_script --id <sys_id>`). Fetches the record with its related records. `--id` requires `--table` and cannot be combined with `--from`.
3. **Several records**: `now-sdk transform --auth <alias> --ids <sys_id> <sys_id>`. The instance unloads them for this app's scope; none returned fails with `No records found on instance in scope for provided sysIds`, a partial miss is only a WARN (`Failed to download records for the following IDs`). Cannot be combined with `--table` or `--id`.
4. **Whole-app sync**: `now-sdk transform --auth <alias>` with no other selector. NOT interactive: it downloads the complete app and overwrites local changes to every record it updates. Run it only when the user explicitly asks for a full sync. `// @fluent-disable-sync` above a statement (or `// @fluent-disable-sync-for-file` at the top of a file) keeps `transform` from overwriting it.

`--id` and `--ids` are hidden options (absent from `transform --help`) but supported; prefer `--table`/`--id` when the metadata table is known.

Output: `src/fluent/generated/<area>/<kind>/<table>_<sys_id>.now.ts` (directory configurable in `now.config.json`), plus `generated/keys.ts`. Extracted scripts sit next to the `.now.ts` (e.g. `./sys_script_<sys_id>.server.js`) wired with `Now.include('./...')`; keep those adjacent paths per the [scripts instructions](../../instructions/scripts.instructions.md).

### `--table` without `--id` is a LOCAL filter
It never contacts the instance. **Never run `--table` without either `--id` or `--from <xml file or dir>`**: it then scans the whole project (including `dist/`), copies XML into `metadata/` and still reports success. Read [references/table-filter.md](references/table-filter.md) before any `--table` filter run.

### `--force` — descendant table without parent hierarchy
`--force` (with `--table` only) lets you transform a child metadata table without its parent. It is **not** an overwrite or re-transform flag. Prefer `--table <root>` using the root table named in the `Cannot transform descendant tables directly` error. Otherwise explain that the child records will be transformed without the parent record they belong to, and use `now-sdk transform --from <xml file or dir> --table <descendant> --force` only after explicit confirmation.

To inspect raw XML or refresh a whole project, use **sn-download**.

## Review and clean — generated Fluent is NOT trusted
Classify every generated file before cleanup, using [Automation ownership](../sn-build-install/SKILL.md#automation-ownership):
- `Flow(...)`, `Subflow(...)`, `Action(...)` under `src/fluent/generated/automation/flow/`: preserve SDK callback syntax; apply the deletion rules below.
- `Test(...)`, `PlaybookDefinition(...)`, `wfa.playbook.*`: preserve callbacks and helper assignments documented by their SDK API/guide (DSL syntax, not record script bodies). A playbook that transforms to `Record(...)` instead of `PlaybookDefinition(...)` has activities Fluent cannot represent (Questionnaire or non-Core): do not hand-convert it; it is managed in Workflow Studio (`playbook-unsupported-features-guide`).
- `GraphQLApi(...)`: resolver scripts may be a named imported server function (preferred), `Now.include(...)`, or a string; only an inline function expression is a build error.
- Ordinary declarative records: apply every [Fluent rule](../../instructions/fluent.instructions.md); transform output commonly breaks them (inline script bodies, banned operators or concatenation, quoted booleans/numbers, missing `$id`, unused bindings).

Before fixing a record type, run `now-sdk explain <type>-api --format raw`; add the `-guide` only for net-new or complex composition (**sn-explain**).

## Confirm before deleting flows, subflows, custom actions
**Fluent install breaks transformed flows on every install** (resets to `draft / active:false`, can write invalid snapshot pointers). After every transform, find these and ask for explicit confirmation before deleting them:
- `src/fluent/**/sys_hub_flow_*.now.ts` (flows + subflows)
- `src/fluent/**/sys_hub_action_type_definition_*.now.ts` (custom action types)
- The script files they reference (follow each `Now.include`)
- Matching `sys_hub_*` XML still under `metadata/` (build packages it, it wins over the `.now.ts`, and a later `transform --from metadata` re-converts it)

A later whole-app sync regenerates deleted files, so repeat the scan. These records stay instance-only; edit them in Flow Designer. Only flows/actions hand-authored in Fluent (never round-tripped through `transform`) are safe to install.

If the user explicitly keeps a transformed flow, explain the risks in [the pre-install flow/action scan](../sn-build-install/SKILL.md#pre-install-flowaction-scan--required-before-command). `--skip-flow-activation` (Verify step 3) only stops the SDK publishing the transformed definition: the upload still rewrites the flow header and snapshot as draft, so the flow must be re-published in Flow Designer, and every other flow in the package stays unactivated.

## Verify
1. `Transform completed successfully` (exit 0) is not proof: an empty `--from` directory or a `--table` filter matching nothing reports the same. Check the expected `<table>_<sys_id>.now.ts` files exist under `src/fluent/generated/`, read every WARN line, and look for XML newly copied into `metadata/`.
2. Run `now-sdk build`. Treat `is defined N times in the project` warnings as a failed transform (XML and Fluent both define the record) even though the build exits 0.
3. Before any install, hand off to **sn-build-install** and complete its pre-install flow/action scan. If transformed `sys_hub_flow_*` or `sys_hub_action_type_definition_*` source remains, do NOT run a plain install; either remove those records with explicit user confirmation, or, if the user explicitly keeps them for this install, run `now-sdk install --auth <alias> --skip-flow-activation`. Report build/install output and any rule violations you fixed.
