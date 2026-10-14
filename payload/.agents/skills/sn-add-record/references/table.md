# Table and column traps

Authoring reminders; where they differ from the project's `now-sdk explain` output, the explain output wins.

- Read `table-api`; add `table-guide` for a new table and `table-augments-guide` when adding columns to a table another scope owns (for example `incident`). For non-trivial columns, read the corresponding API: `choicecolumn-api`, `referencecolumn-api`, `conditionscolumn-api`, `slushbucketcolumn-api`, `recordscolumn-api`, `documentidcolumn-api`, `overridecolumn-api`. Skip a separate simple-column lookup only when the current table example already documents the needed shape.
- Place the file next to the project's existing hand-authored tables and follow their naming. Use `src/fluent/data/table/<tableName>.now.ts` only when the project has no hand-authored `.now.ts` layout yet or already uses that one; do not move transformed records out of their generated layout to follow it.
- The named export must equal the table name: `const x_acme_demo_widget = Table({...}); export { x_acme_demo_widget }` (a mismatch or missing export is TS213).
- Columns on a table the scope does not own: `Table({ augments: '<table>', schema: {...} })` with no `name`; the export must equal the augmented table name (`export const incident = ...`) and every column name carries the scope prefix (`x_acme_demo_note`).
- Boolean/numeric values are primitives, not `'true'` or `'100'`. Choice entries use `{ label: '...' }`, not `{ text: '...' }` (TS2353).
- Cross-scope `actions` uses the object form (`actions: { read: true, create: true }`). The array form still compiles, but `actions: ['read']` writes `false` for every action it omits.
- Default form view: when the project's `table-guide` requires one for a new table (it exempts `augments` and a layout the user specified), it is a second record built from `form-layout-guide`. Include it when the request is for a usable table; when the request is strictly schema-only, tell the user the guide calls for one and ask. Do not add or omit it silently.
- Select columns/imports from the actual API output. Do not guess the import path or constructor options. The [Fluent rules](../../../instructions/fluent.instructions.md) for ordinary records apply to const initializers too (for example no `||`, `&&`, `?:`, object spread, string `+` composition, runtime control flow or unused consts).

Example (built as written on the verified SDK; adapt only after confirming the exact API):

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

Return to [sn-add-record](../SKILL.md) for build and deployment routing.
