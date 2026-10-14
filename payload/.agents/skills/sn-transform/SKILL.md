---
name: sn-transform
description: Converts instance records or metadata XML into Fluent source and adds type definitions for other-scope records. Use when bringing in a flow, playbook or other record built on the instance; not a whole app (sn-download).
argument-hint: <--table/--id, --ids sys_ids, or local XML file/dir — e.g. --table sys_script --id abc123, --ids abc123, or --from metadata/update>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; authorized instance access unless using local XML.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 CLI source, bundled docs and local `--from`/`--table` runs; positional-ID rejection, the `--force` descendant error and output paths also reproduced on now-sdk 4.11.2. Instance-backed modes (`--auth`, `--id`, `--ids`) were read in source, not run.

Adopt existing ServiceNow records into this now-sdk app by converting their XML into Fluent `.now.ts` source. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md).

## Run the transform
Before any transform: `now-sdk build` must pass (transform compiles the project first and aborts with `Found N diagnostic error(s) while building the project`; fix with the **sn-fix-build** skill), local work must be committed or stashed, and project dependencies must be installed: without `node_modules/@servicenow/sdk` a transform still exits 0 but writes `.now.ts` files with no `import` lines and removes the source XML from `metadata/` (see **sn-download**). `transform` has no scope argument, no positional argument and no prompt; the app is always the one in `now.config.json`. Pick ONE mode:

1. Local XML (no instance call; `--from` and `--auth` are mutually exclusive): `now-sdk transform --from <xml file or dir>`. For XML already in the project's `metadata/` folder (for example after `init --from`), use `now-sdk transform --from metadata`, or one file such as `--from metadata/update/<table>_<sys_id>.xml`. The SDK removes XML it converts from inside `metadata/`; XML converted from any other path is left in place, so keep such source directories outside the project. Use `--format=false` to skip auto-formatting if it mangles output.
2. One record from the instance: `now-sdk transform --auth <alias> --table <metadata_table> --id <sys_id>` (for example `--table sys_script --id <sys_id>`). Fetches that record with its related records. `--id` requires `--table` and cannot be combined with `--from`.
3. Several records by sys_id: `now-sdk transform --auth <alias> --ids <sys_id> <sys_id>`. The instance is asked to unload them for this app's scope; if none are returned the command fails with `No records found on instance in scope for provided sysIds`, and a partial miss is only a WARN (`Failed to download records for the following IDs`). `--ids` cannot be combined with `--table` or `--id`.
4. Whole-app sync: `now-sdk transform --auth <alias>` with no other selector. This is NOT interactive: it downloads the complete app and updates every matching `.now.ts`, overwriting local changes to the records it updates. Run it only when the user explicitly asks for a full sync. `// @fluent-disable-sync` above a statement (or `// @fluent-disable-sync-for-file` at the top of a file) keeps `transform` from overwriting it.

- `--id` and `--ids` are hidden options: `now-sdk transform --help` lists neither (it mentions `--id` only inside the `--table` description). Their absence from help does not mean they are unsupported; prefer the `--table`/`--id` form when the metadata table is known.
- Do not pass sys_ids as positional arguments; the SDK rejects them with `Unknown command: <sys_id>`.
- Output lands in `src/fluent/generated/<area>/<kind>/<table>_<sys_id>.now.ts` (the generated directory is configurable in `now.config.json`), and `generated/keys.ts` is updated. Extracted scripts are written next to the `.now.ts` (for example `./sys_script_<sys_id>.server.js`) and wired with `Now.include('./...')`; nothing is written to `src/scripts/` or `src/ui/`. Keep those adjacent paths per the [scripts instructions](../../instructions/scripts.instructions.md).

### `--table` without `--id` — a LOCAL filter, not an instance pull
`--table <metadata_table>` without `--id` never contacts the instance. It filters local XML to records of that metadata table (for example `sys_script` or `sys_ui_policy`, not rows of a data table) plus its child tables in the SDK relationship graph. Comma-separate multiple tables.

**Never run `--table` without either `--id` or `--from <xml file or dir>`.** With neither, the SDK scans the whole project directory for `*.xml`, including `dist/` build output, and copies every non-matching file into `metadata/`; it still exits 0 with `Transform completed successfully`, and later builds warn `is defined N times in the project` because that XML duplicates the Fluent source.

Even with `--from`, each XML file with no record in the filtered tables is copied into `metadata/` (`The entire file is preserved as XML in the metadata directory`), where `now-sdk build` packages it and it wins over a matching `.now.ts`. Point `--from` at the narrowest file or directory.
```powershell
now-sdk transform --from metadata --table sys_script
now-sdk transform --from metadata --table 'sys_script,sys_ui_policy'
now-sdk transform --auth <alias> --table sys_script --id <sys_id>
```
Quote a comma-separated list: PowerShell turns an unquoted `a,b` into an array and passes two arguments.

### `--force` — descendant table without parent hierarchy
`--force` is valid only with `--table` and only affects the local filter above (it is ignored with `--id`). A descendant is a child metadata table in the SDK's record-relationship graph (for example `sys_ui_policy_action` under `sys_ui_policy`), not a table that extends another. Without `--force` the SDK stops with `Cannot transform descendant tables directly ... "<table>" is a descendant of: <root>`. It is **not** an overwrite or re-transform flag.

Prefer `--table <root>` using the root table named in that error. Otherwise explain that the child records will be transformed without the parent record they belong to, and use `now-sdk transform --from <xml file or dir> --table <descendant> --force` only after explicit confirmation.

## Pair with download for raw metadata
`now-sdk download <dir> --auth <alias>` unpacks the current app's raw metadata XML into `<dir>`; `--auth` works although `download --help` does not list it. `--incremental` requests the instance's incremental packaging mode, not the changes since your last download. To inspect what `transform` produced, download into an empty directory outside the project, never `.`. To refresh a project, follow the **sn-download** skill.

## Sibling: `now-sdk dependencies`
`transform` converts records into this app's source; it never changes record ownership on the instance (see Record reassignment in the [SDK command policy](../../reference/sdk-commands.md)). `dependencies` pulls **types and metadata for OTHER scopes** so this app can reference them at build time — it does NOT copy the foreign records into your source.

- `now-sdk dependencies --auth <alias>` — re-downloads everything listed under `dependencies` in `now.config.json` plus the platform `glide.*.d.ts` typings.
- `now-sdk dependencies --auth <alias> --type-defs-only` — just the platform `.d.ts` files; useful after an SDK upgrade.
- `now-sdk dependencies --auth <alias> --fluent-only` — just the Fluent types for already-declared dependencies, no script `.d.ts`.
- `now-sdk dependencies --auth <alias> --add <table-or-alias> --scope <scope> <sys_id...>` — registers a new dependency (e.g. `--add automation.actions --scope global <sys_id>`) and updates `now.config.json`. The only aliases are `tables`, `roles`, `automation.actions`, `automation.triggers` and `automation.subflows`; anything else is taken as a literal table name, including the `actions, triggers` wording in `dependencies --help`.

Use `dependencies --add` to type-reference an OOB Action / Trigger / ACL / table you don't own; use `transform` only when you need to OWN the record in this app.

## Review and clean — generated Fluent is NOT trusted
Classify every generated file before generic cleanup, using [Automation ownership](../sn-build-install/SKILL.md#automation-ownership) for flows and actions:

- Transformed `Flow(...)`, `Subflow(...)`, or `Action(...)` under `src/fluent/generated/automation/flow/`: preserve SDK callback syntax and apply the deletion / `--skip-flow-activation` guardrail below.
- `Test(...)`, `PlaybookDefinition(...)`, and `wfa.playbook.*`: preserve callbacks and helper assignments documented by their exact SDK API/guide; they are DSL construction syntax, not ordinary record script bodies. A playbook that transforms to `Record(...)` output instead of `PlaybookDefinition(...)` contains activities Fluent cannot represent (Questionnaire or non-Core): do not hand-convert it; it is managed in Workflow Studio (`playbook-unsupported-features-guide`).
- `GraphQLApi(...)`: resolver scripts may be a named imported server function (preferred), `Now.include(...)`, or a string; only an inline function expression is a build error.
- Ordinary declarative records: apply the ordinary [Fluent rules](../../instructions/fluent.instructions.md).

For ordinary records, transform output may need these fixes:
- Inline record script bodies → externalize with the API-supported form, usually `Now.include` with a path relative to the `.now.ts` file.
- Unsupported ordinary-property operators or concatenation → resolve to literals or documented template literals; moving a banned expression into a scalar `const` does not fix it.
- Arbitrary runtime control flow → external server/UI module.
- Primitive booleans/numbers, `{ label }` choices, matching Table export, `SPPage.pageId`, stable `$id`, and no unused bindings.

Before fixing any record type, run `now-sdk explain <type>-api --format raw`; add the matching `-guide` only for net-new or complex composition (the **sn-explain** skill).

## Confirm before deleting flows, subflows, custom actions
**Fluent install breaks transformed flows on every install** (resets to `draft / active:false`, can write invalid snapshot pointers). After `transform`, find the following and ask for explicit confirmation before deleting them:

- `src/fluent/**/sys_hub_flow_*.now.ts` (flows + subflows)
- `src/fluent/**/sys_hub_action_type_definition_*.now.ts` (custom action types)
- The script files those `.now.ts` files reference (follow each `Now.include` path; normally adjacent)
- Any matching `sys_hub_*` XML still under `metadata/` (transform removes XML it converts from there; XML left there is packaged by build, wins over the `.now.ts`, and is re-converted by a later `transform --from metadata`)

Deleting local files does not stop a later whole-app sync from regenerating them; repeat this scan after every transform.

These records stay on the instance only; edit them in Flow Designer. Only flows/actions hand-authored fresh in Fluent (never round-tripped through `transform`) are safe to install. If the user explicitly insists on keeping a transformed flow in source, explain the risks in [the pre-install flow/action scan](../sn-build-install/SKILL.md#pre-install-flowaction-scan--required-before-command), and install with `--skip-flow-activation` (`now-sdk install --auth <alias> --skip-flow-activation`) so the SDK does not publish the transformed definition automatically. The flag does not protect the published flow: the upload still rewrites the flow header and snapshot as draft, so the flow must be checked and re-published in Flow Designer, and every other flow in the package is left unactivated too.

## Verify
1. Confirm the transform itself. Exit 0 with `Transform completed successfully` is not proof that anything was adopted: an empty `--from` directory and a `--table` filter that matches nothing report the same. Check that the expected `<table>_<sys_id>.now.ts` files exist under `src/fluent/generated/`, read every WARN line, and look for XML newly copied into `metadata/`.
2. Run `now-sdk build`. Treat `is defined N times in the project` warnings as a failed transform (XML and Fluent both define the record) even though the build exits 0.
3. Before any install, hand off to the **sn-build-install** skill and complete its pre-install flow/action scan. If transformed `sys_hub_flow_*` or `sys_hub_action_type_definition_*` source remains, do NOT run a plain install; either remove those generated records with explicit user confirmation, or, if the user explicitly keeps them for this install, run `now-sdk install --auth <alias> --skip-flow-activation`. Report build/install output + any rule violations you fixed.
