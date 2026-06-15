---
name: sn-fix-build
description: Diagnose a now-sdk build failure and apply the Fluent fix — maps each TS/parser error code to its Fluent cause + correction. Use whenever `now-sdk build` fails or a .now.ts compile error appears.
argument-hint: <paste the now-sdk build error, or leave blank to use the last terminal output>
---
Diagnose and fix a build failure in this Fluent project. Examples below show `node "$NowSdk" <cmd>` — define `$NowSdk` on the same PowerShell line as each command: `$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>`.

Use the build error from the argument, or the last terminal output if none was pasted.

## Steps
1. Parse the TS/parser error code(s) + the offending `.now.ts` file + line.
2. Map each code to its Fluent cause + fix (table below). See [Fluent rules](../../instructions/fluent.instructions.md).
3. If the record type is involved, run `node "$NowSdk" explain <recordtype>-api --format raw` to confirm the correct shape before editing (the **sn-explain** skill).
4. Apply ONE coherent fix in the offending `.now.ts` (move scripts/logic to `src/scripts/**` via `Now.include`; compose strings as template-literal `const`s; resolve conditions to literals — operators are banned file-wide, so a "precomputed" `const` with `||`/`?:`/`+` fails identically).
5. Rebuild: `node "$NowSdk" build`. Report the new output. If it still fails, repeat with the next error.

## Error → cause → fix

| Error code / token | Fluent cause | Fix |
|---|---|---|
| `TS2322` (type not assignable) | Boolean/numeric field given a string: `'true'` / `'100'` | Use the primitive: `true` / `100`. Also check `{ label: '...' }` not `{ text: '...' }` on choices. |
| `TS2304` (cannot find name `X`) | Symbol referenced but not imported — usually after splitting a record into multiple files or pasting an example without its imports | Add the missing import from the path shown by `node "$NowSdk" explain <recordtype>-api --format raw` (typically `@servicenow/sdk/core`). Do NOT hand-guess the import path — it can shift between SDK majors. |
| `TS2305` / `TS2459` / missing table export | `Table({...})` has no named export, or export name ≠ table name | Add `const x_acme_foo = Table({...}); export { x_acme_foo };` — name must equal the table name. |
| `TS2739` / `TS2740` (missing required properties) | Record literal missing a property the type marks required (e.g. `Table` without `name`, `BusinessRule` without `table`/`when`) | Re-read the explain output; add every required property as a primitive. Don't guess — `explain --format raw` shows which fields are required. |
| `TS2345` / `Failed to determine ID` | Record missing `$id: Now.ID['<stable_key>']` — required on `BusinessRule` and most non-Table records (typed `WithID`) | Add `$id: Now.ID['<stable_key>']` as the first property; the key is the record's stable identity in `keys.ts` (see `explain keys-file`). `Table` uses the named export instead; `SPPage` uses `pageId`. |
| `TS6133` (declared but never read) | Unused helper `const` in the `.now.ts` | Delete it, or reference it. No dangling consts. |
| `TS57` `BarBarToken` / `TS227` `ConditionalExpression` | `\|\|`, `&&`, or `?:` used ANYWHERE in the `.now.ts` — the ban is file-wide; a `const active = flagA \|\| flagB` initializer fails with the SAME error | Do NOT precompute a `const` — it reproduces the error. Resolve the condition to a literal at authoring time (`active: true`), or move the decision into the external script referenced via `Now.include`. |
| `TS226` `Unsupported variable initializer` / `+` concat rejected | String built with `+` anywhere in the file, including `const` initializers | Rewrite as a template literal: `` const tableName = `${prefix}_table`; `` — template literals are the only in-file string composition that compiles. |
| Parser error / unexpected syntax kind (`FunctionExpression`, `IfStatement`, `ForStatement`, `VariableStatement`, `NewExpression`) | Inline `function(){...}` body, `var`, `if`/`for`/`while`/`switch`, or `new` inside `.now.ts` | Move hand-authored executable logic to `src/scripts/foo.js` and reference it with `Now.include` using a path relative to the `.now.ts` file (see the depth-by-layout table in `~/.agents/instructions/fluent.instructions.md` → "Per-record recipe" step 2). For `src/fluent/generated/**`, preserve existing adjacent transform paths unless you intentionally move files and recompute the path. Use `const`, never `var`. No control flow / `new` in ordinary `.now.ts`. |
| `TS305` `SpreadAssignment` / `Identifier expected` / unexpected `...` | Object spread (`...someObj`) used anywhere in the `.now.ts` — banned file-wide, `const` initializers included | There is no in-file merge. Write the merged object out literally in the record, or build it in an external script. Do NOT move the spread to a `const` — it fails identically. |
| `SPPage` / `$id` rejected on page | `SPPage` given `$id` | Use `pageId` on `SPPage`; `$id` is only valid on inner containers/rows/columns. |

## Rules
- One coherent change per turn. Print each command before running it. Terse output, no emojis.
