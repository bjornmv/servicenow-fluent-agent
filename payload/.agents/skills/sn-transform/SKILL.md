---
name: sn-transform
description: Pull existing instance (or local XML) records into Fluent .now.ts source via now-sdk transform, then clean the generated output to obey the Fluent rules. Use when adopting/converting records that already exist on the instance into editable Fluent — do NOT hand-write those.
argument-hint: <scope, --ids sys_ids, --table/--id, or local XML dir — e.g. x_acme_demo, --ids abc123, or ./xml>
---
Adopt existing ServiceNow records into this now-sdk app by converting their XML into Fluent `.now.ts` source. Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

## Run the transform
1. From the instance (downloads + converts in one step):
   - `now-sdk transform --auth <alias>` — interactive; pick scope/records.
   - Or pass direct metadata sys_ids: `now-sdk transform --auth <alias> --ids <sys_id> <sys_id>`.
   - Or pass one record with its table context: `now-sdk transform --auth <alias> --table <table> --id <sys_id>`.
   - Do not pass sys_ids as positional arguments; SDK 4.7.x ignores positional IDs for `transform`.
2. From local XML (no instance call): `now-sdk transform --from ./xml`. Use `--format=false` to skip auto-formatting if it mangles output.
3. Output lands in `src/fluent/**/*.now.ts`; referenced scripts go under `src/scripts/` + `src/ui/`.

### `--table` — transform a whole table hierarchy or one table-scoped record
`--table <name>` (comma-separated for multiples) pulls every record in that table plus its parents/children rather than asking for individual sys_ids. Useful for adopting all rows of a custom table or a settings table without listing each row. Pair `--table <table>` with `--id <sys_id>` when you need one record with table context.
```
now-sdk transform --auth <alias> --table x_acme_demo_widget
now-sdk transform --auth <alias> --table x_acme_demo_widget --id <sys_id>
now-sdk transform --auth <alias> --table x_acme_demo_widget,x_acme_demo_settings
```

### SDK 4.11 `--force` — descendant table without parent hierarchy
`--force` is valid only with `--table`. It allows transformation of a descendant/extended table without also pulling its parent hierarchy. It is **not** an overwrite or re-transform flag.

Before using it, identify the requested table's parent and explain that the generated source can depend on parent metadata/types not being adopted into this app. Prefer the complete hierarchy. Use `now-sdk transform --auth <alias> --table <descendant> --force` only after explicit confirmation.

## Pair with download for raw metadata
`now-sdk download <dir> --auth <alias>` pulls raw app metadata XML (`--incremental` for deltas). Inspect it to understand what `transform` produced, or feed a local dir into `transform --from`.

## Sibling: `now-sdk dependencies`
`transform` brings records INTO this app. `dependencies` pulls **types and metadata for OTHER scopes** so this app can reference them at build time — it does NOT copy the foreign records into your source.

- `now-sdk dependencies --auth <alias>` — re-downloads everything listed under `dependencies` in `now.config.json` plus the platform `glide.*.d.ts` typings.
- `now-sdk dependencies --auth <alias> --type-defs-only` — just the platform `.d.ts` files; useful after an SDK upgrade.
- `now-sdk dependencies --auth <alias> --fluent-only` — just the Fluent types for already-declared dependencies, no script `.d.ts`.
- `now-sdk dependencies --auth <alias> --add <table-name> --scope <scope> <sys_id...>` — registers a new dependency (e.g. `--add actions --scope global <sys_id>`) and updates `now.config.json`.

Use `dependencies --add` to type-reference an OOB Action / Trigger / ACL / table you don't own; use `transform` only when you need to OWN the record in this app.

## Review and clean — generated Fluent is NOT trusted
Classify every generated file before generic cleanup:

- Transformed `Flow(...)`, `Subflow(...)`, or `Action(...)` under `src/fluent/generated/automation/flow/`: preserve SDK callback syntax and apply the deletion / `--skip-flow-activation` guardrail below.
- `Test(...)`, `PlaybookDefinition(...)`, and `wfa.playbook.*`: preserve callbacks and helper assignments documented by their exact SDK API/guide; they are DSL construction syntax, not ordinary record script bodies.
- `GraphQLApi(...)`: resolver scripts must be named imported server functions (preferred) or `Now.include`; an inline resolver function expression is invalid.
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
- All referenced `.js` files under the same `scripts/` folder
- The matching XML files under `metadata/` (so a re-transform doesn't recreate them)

These records stay on the instance only; edit them in Flow Designer. Only flows/actions hand-authored fresh in Fluent (never round-tripped through `transform`) are safe to install. If the user explicitly insists on keeping a transformed flow in source, warn loudly per the **Flow and Action Guardrail** (canonical in the ServiceNow Fluent agent / now-sdk baseline instructions), and install with `--skip-flow-activation` (`now-sdk install --auth <alias> --skip-flow-activation`) so the post-install publish step is skipped and the existing published flow on the instance is preserved.

## Verify
Run `now-sdk build` first. Before any install, use the **sn-build-install** pre-install flow/action scan. If transformed `sys_hub_flow_*` or `sys_hub_action_type_definition_*` source remains, do NOT run a plain install; either remove those generated records with explicit user confirmation, or, if the user explicitly keeps them for this install, run `now-sdk install --auth <alias> --skip-flow-activation`. Report build/install output + any rule violations you fixed.
