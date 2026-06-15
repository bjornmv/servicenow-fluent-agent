---
name: sn-transform
description: Pull existing instance (or local XML) records into Fluent .now.ts source via now-sdk transform, then clean the generated output to obey the Fluent rules. Use when adopting/converting records that already exist on the instance into editable Fluent — do NOT hand-write those.
argument-hint: <scope, --ids sys_ids, --table/--id, or local XML dir — e.g. x_acme_demo, --ids abc123, or ./xml>
---
Adopt existing ServiceNow records into this now-sdk app by converting their XML into Fluent `.now.ts` source. Examples below show `node "$NowSdk" <cmd>` — define `$NowSdk` on the same PowerShell line as each command: `$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>`.

## Run the transform
1. From the instance (downloads + converts in one step):
   - `node "$NowSdk" transform --auth <alias>` — interactive; pick scope/records.
   - Or pass direct metadata sys_ids: `node "$NowSdk" transform --auth <alias> --ids <sys_id> <sys_id>`.
   - Or pass one record with its table context: `node "$NowSdk" transform --auth <alias> --table <table> --id <sys_id>`.
   - Do not pass sys_ids as positional arguments; SDK 4.7.x ignores positional IDs for `transform`.
2. From local XML (no instance call): `node "$NowSdk" transform --from ./xml`. Use `--format=false` to skip auto-formatting if it mangles output.
3. Output lands in `src/fluent/**/*.now.ts`; referenced scripts go under `src/scripts/` + `src/ui/`.

### `--table` — transform a whole table hierarchy or one table-scoped record
`--table <name>` (comma-separated for multiples) pulls every record in that table plus its parents/children rather than asking for individual sys_ids. Useful for adopting all rows of a custom table or a settings table without listing each row. Pair `--table <table>` with `--id <sys_id>` when you need one record with table context.
```
node "$NowSdk" transform --auth <alias> --table x_acme_demo_widget
node "$NowSdk" transform --auth <alias> --table x_acme_demo_widget --id <sys_id>
node "$NowSdk" transform --auth <alias> --table x_acme_demo_widget,x_acme_demo_settings
```

## Pair with download for raw metadata
`node "$NowSdk" download <dir> --auth <alias>` pulls raw app metadata XML (`--incremental` for deltas). Inspect it to understand what `transform` produced, or feed a local dir into `transform --from`.

## Sibling: `now-sdk dependencies`
`transform` brings records INTO this app. `dependencies` pulls **types and metadata for OTHER scopes** so this app can reference them at build time — it does NOT copy the foreign records into your source.

- `node "$NowSdk" dependencies --auth <alias>` — re-downloads everything listed under `dependencies` in `now.config.json` plus the platform `glide.*.d.ts` typings.
- `node "$NowSdk" dependencies --auth <alias> --type-defs-only` — just the platform `.d.ts` files; useful after an SDK upgrade.
- `node "$NowSdk" dependencies --auth <alias> --fluent-only` — just the Fluent types for already-declared dependencies, no script `.d.ts`.
- `node "$NowSdk" dependencies --auth <alias> --add <table-name> --scope <scope> <sys_id...>` — registers a new dependency (e.g. `--add actions --scope global <sys_id>`) and updates `now.config.json`.

Use `dependencies --add` to type-reference an OOB Action / Trigger / ACL / table you don't own; use `transform` only when you need to OWN the record in this app.

## Review and clean — generated Fluent is NOT trusted
Classify generated automation before generic cleanup. Do **not** apply the hard Fluent cleanup rules below to `Flow(...)`, `Subflow(...)`, or `Action(...)` files under `src/fluent/generated/automation/flow/`; those files use SDK automation callback syntax and are governed by the deletion / `--skip-flow-activation` guardrail below.

For all other generated `.now.ts` files, open each file and apply the [Fluent rules](../../instructions/fluent.instructions.md). Transform output frequently violates them:
- Inline function bodies → externalize via `Now.include` with a path relative to the `.now.ts` file, e.g. `Now.include('../../scripts/foo.js')` from `src/fluent/<folder>/foo.now.ts`.
- `||` `&&` `?:` and `+`-concat in property values → precompute into a `const`.
- No `if`/`for`/`while`/`switch`, no `var`, no `new` in `.now.ts`.
- Booleans/numbers primitive (`true`/`100`). Choices `{ label }` not `{ text }`.
- `Table({...})` needs a named export matching the table name; `SPPage` uses `pageId`. Drop unused consts (TS6133).

Before fixing any record type, run `node "$NowSdk" explain <type>-api --format raw`; add the matching `-guide` only for net-new or complex composition (the **sn-explain** skill).

## Confirm before deleting flows, subflows, custom actions
**Fluent install breaks transformed flows on every install** (resets to `draft / active:false`, can write invalid snapshot pointers). After `transform`, find the following and ask for explicit confirmation before deleting them:

- `src/fluent/**/sys_hub_flow_*.now.ts` (flows + subflows)
- `src/fluent/**/sys_hub_action_type_definition_*.now.ts` (custom action types)
- All referenced `.js` files under the same `scripts/` folder
- The matching XML files under `metadata/` (so a re-transform doesn't recreate them)

These records stay on the instance only; edit them in Flow Designer. Only flows/actions hand-authored fresh in Fluent (never round-tripped through `transform`) are safe to install. If the user explicitly insists on keeping a transformed flow in source, warn loudly per the **Flow and Action Guardrail** (canonical in the ServiceNow Fluent agent / now-sdk baseline instructions), and install with `--skip-flow-activation` (`node "$NowSdk" install --auth <alias> --skip-flow-activation`) so the post-install publish step is skipped and the existing published flow on the instance is preserved.

## Verify
Run `node "$NowSdk" build` first. Before any install, use the **sn-build-install** pre-install flow/action scan. If transformed `sys_hub_flow_*` or `sys_hub_action_type_definition_*` source remains, do NOT run a plain install; either remove those generated records with explicit user confirmation, or, if the user explicitly keeps them for this install, run `node "$NowSdk" install --auth <alias> --skip-flow-activation`. Report build/install output + any rule violations you fixed.
