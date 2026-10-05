# Table and column traps

Preserved from the former standalone `sn-add-table` workflow. These are authoring reminders, not newly verified API shapes; the project's actual SDK documentation is authoritative.

- Read `table-api`. For non-trivial columns, read the corresponding API: `choicecolumn-api`, `referencecolumn-api`, `conditionscolumn-api`, `slushbucketcolumn-api`, `recordscolumn-api`, `documentidcolumn-api`, `overridecolumn-api`. Skip a separate simple-column lookup only when the current table example already documents the needed shape.
- Hand-authored convention: `src/fluent/data/table/<tableName>.now.ts`; do not move transformed records out of their generated layout merely to follow this convention.
- The named export must equal the table name: `const x_acme_demo_widget = Table({...}); export { x_acme_demo_widget }`.
- Boolean/numeric values are primitives, not `'true'` or `'100'`. Choice entries use `{ label: '...' }`, not `{ text: '...' }`.
- Select columns/imports from the actual API output. Do not guess the import path or constructor options. Ordinary-record restrictions apply to const initializers too: no `||`, `&&`, `?:`, string `+` composition, runtime control flow or unused consts.

Existing illustrative example (adapt only after confirming the exact API):

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
