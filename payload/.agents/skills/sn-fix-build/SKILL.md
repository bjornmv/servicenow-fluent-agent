---
name: sn-fix-build
description: Diagnose a now-sdk build failure and apply the Fluent fix — maps each TS/parser error code to its Fluent cause + correction. Use whenever `now-sdk build` fails or a .now.ts compile error appears.
argument-hint: <paste the now-sdk build error, or leave blank to use the last terminal output>
---
Diagnose and fix a build failure in this Fluent project. Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

Use the build error from the argument, or the last terminal output if none was pasted.

## Steps
1. Parse the TS/parser error code(s) + the offending `.now.ts` file + line.
2. Classify the file before mapping the error: ordinary declarative record, documented ATF/automation/Playbook callback DSL, GraphQL imported-script form, or transformed/Fluent-locked automation. See [Fluent rules](../../instructions/fluent.instructions.md).
3. Run `now-sdk explain <recordtype>-api --format raw` to confirm the exact shape before editing (the **sn-explain** skill).
4. Apply ONE coherent fix. Do not externalize a documented `Test(...)`, automation, or Playbook builder callback. For ordinary record script fields, move executable logic to an external module. For GraphQL, use a named imported server function (preferred) or `Now.include`; inline resolver functions are invalid.
5. Rebuild: `now-sdk build`. Report the new output. If it still fails, repeat with the next error. Use `--legacyChoices` only for an explicitly confirmed legacy-choice migration, never as a parser-error workaround.

## Error → cause → fix

| Error code / token | Fluent cause | Fix |
|---|---|---|
| `TS2322` (type not assignable) | Boolean/numeric field given a string: `'true'` / `'100'` | Use the primitive: `true` / `100`. Also check `{ label: '...' }` not `{ text: '...' }` on choices. |
| `TS2304` (cannot find name `X`) | Symbol referenced but not imported — usually after splitting a record into multiple files or pasting an example without its imports | Add the missing import from the path shown by `now-sdk explain <recordtype>-api --format raw` (typically `@servicenow/sdk/core`). Do NOT hand-guess the import path — it can shift between SDK majors. |
| `TS2305` / `TS2459` / missing table export | `Table({...})` has no named export, or export name ≠ table name | Add `const x_acme_foo = Table({...}); export { x_acme_foo };` — name must equal the table name. |
| `TS2739` / `TS2740` (missing required properties) | Record literal missing a property the type marks required (e.g. `Table` without `name`, `BusinessRule` without `table`/`when`) | Re-read the explain output; add every required property as a primitive. Don't guess — `explain --format raw` shows which fields are required. |
| `TS2345` / `Failed to determine ID` | Record missing `$id: Now.ID['<stable_key>']` — required on `BusinessRule` and most non-Table records (typed `WithID`) | Add `$id: Now.ID['<stable_key>']` as the first property; the key is the record's stable identity in `keys.ts` (see `explain keys-file`). `Table` uses the named export instead; `SPPage` uses `pageId`. |
| `TS6133` (declared but never read) | Unused helper `const` in the `.now.ts` | Delete it, or reference it. No dangling consts. |
| `TS57` `BarBarToken` / `TS227` `ConditionalExpression` | `\|\|`, `&&`, or `?:` in an unsupported ordinary-record position; moving it to a scalar `const` reproduces the error | Resolve the ordinary property to a literal at authoring time, or move runtime logic into an external script. For a documented DSL file, compare the exact failing shape with its API/guide instead of applying this row mechanically. |
| `TS226` `Unsupported variable initializer` / `+` concat rejected | String built with `+` in an unsupported ordinary-record position, including scalar `const` initializers | Rewrite ordinary string composition as a template literal. Preserve API-documented DSL helper assignments. |
| Parser error / unexpected syntax kind (`FunctionExpression`, `IfStatement`, `ForStatement`, `VariableStatement`, `NewExpression`) | Either unsupported executable syntax in an ordinary record, or a documented DSL callback was authored in the wrong shape | Classify first. Preserve exact API-documented ATF/automation/Playbook callbacks. For an ordinary record script, externalize with the API-supported form. GraphQL uses a named imported server function or `Now.include`. Use `const`, never `var`; current `TestSuite` and `GraphQLApi` are direct calls, not `new` expressions. |
| `TS305` `SpreadAssignment` / `Identifier expected` / unexpected `...` | Object spread in an unsupported ordinary-record position | Write the ordinary record object explicitly or move runtime assembly to an external script. For a documented DSL, follow its exact supported shape; do not assume arbitrary spread is accepted. |
| `SPPage` / `$id` rejected on page | `SPPage` given `$id` | Use `pageId` on `SPPage`; `$id` is only valid on inner containers/rows/columns. |

## Rules
- One coherent change per turn. Print each command before running it. Terse output, no emojis.
