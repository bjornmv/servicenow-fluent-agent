---
name: sn-add-table
description: Author a new Fluent table with columns (explain-first, correct column types + named export). Use when adding a table/data model to a now-sdk app.
argument-hint: <table name, e.g. x_acme_demo_widget>
---
Author a new Fluent table (named from the argument) in the current project scope from `now.config.json`. Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

1. FIRST run `now-sdk explain table-api --format raw`. Then run `now-sdk explain <type>column-api --format raw` ONLY for non-trivial column types you plan to use: `choicecolumn-api`, `referencecolumn-api`, `conditionscolumn-api`, `slushbucketcolumn-api`, `recordscolumn-api`, `documentidcolumn-api`, `overridecolumn-api`. Skip explain for trivial types (`StringColumn`, `IntegerColumn`, `BooleanColumn`, `DateTimeColumn`, `DecimalColumn`, `FloatColumn`, `UrlColumn`, `EmailColumn`, `HtmlColumn`, `JsonColumn`) — shape is obvious from name + `table-api` example. (Or run the **sn-explain** skill.) If `/memories/repo/table-api.md` does not yet exist, cache a 5–10 line summary of the explain output there — required/optional fields, the column-type catalogue, the import line — so the next table in this project skips the explain round-trip.
2. Create `src/fluent/data/table/<tableName>.now.ts` with `Table({...})` + columns — this follows the data/table category layout for hand-authored tables. Do not put new hand-authored tables under `src/fluent/generated/`; leave round-tripped transform files there. Honor the [Fluent rules](../../instructions/fluent.instructions.md):
   - Named export MUST equal the table name: `const x_acme_demo_widget = Table({...}); export { x_acme_demo_widget }`.
   - Booleans/numbers are PRIMITIVES (`true`, `100`), never `'true'`/`'100'`.
   - Choice configs use `{ label: '...' }`, never `{ text: '...' }`.
   - Pick column types from the `explain` output — do not guess. No `||`/`&&`/`?:`/`+`-concat, no control flow, `const` only, no unused consts.
3. Minimal correct example:
   ```ts
   import { Table, StringColumn, IntegerColumn, BooleanColumn, ChoiceColumn } from '@servicenow/sdk/core'

   const x_acme_demo_widget = Table({
       name: 'x_acme_demo_widget',
       label: 'Widget',
       schema: {
           name: StringColumn({ label: 'Name', maxLength: 100 }),
           quantity: IntegerColumn({ label: 'Quantity', default: 0 }),
           active: BooleanColumn({ label: 'Active', default: true }),
           status: ChoiceColumn({ label: 'Status', choices: { new: { label: 'New' }, done: { label: 'Done' } } }),
       },
   })

   export { x_acme_demo_widget }
   ```
   Adjust imports to the exact column types you use (verify against `explain`). The `@servicenow/sdk/core` import path can shift between SDK majors — always trust the import line shown by `now-sdk explain table-api --format raw` over this example.
4. Then run `now-sdk build` to verify it compiles. Report the build output; fix any Fluent syntax errors before stopping. For install/deploy, use the **sn-build-install** skill — it owns the pre-install flow/action scan, captured install exit code/output, and content-marker verification. Do NOT run `install` directly from this skill.
