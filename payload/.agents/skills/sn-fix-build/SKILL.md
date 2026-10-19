---
name: sn-fix-build
description: Maps now-sdk build diagnostics to causes and fixes. Use when a build fails with TS or Fluent compile errors in a .now.ts file; not install failures (sn-build-install) or Vite bundling (sn-ui-page-vite).
argument-hint: <paste the full now-sdk build output, or leave blank to run the build>
compatibility: ServiceNow Fluent project (now.config.json); project-compatible now-sdk and Node; VS Code terminal with the now-sdk function (PowerShell on Windows, bash on Linux).
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 build output, every table row reproduced; on another SDK version match the quoted message text, not the number.

Fix a Fluent build failure. Run `now-sdk` directly in the VS Code terminal (PowerShell on Windows; bash with the now-sdk function on Linux) from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md). Print each command before running it. Terse output, no emojis.

Use pasted output only if it is the complete output of a build of the current source; otherwise run `now-sdk build` first and keep its full output and native exit status.

## Steps

1. Triage. These are not Fluent compile errors:
   - `Could not find package.json` (build still exits 0): wrong directory. Confirm the project directory; edit nothing.
   - `TS2307: Cannot find module '@servicenow/sdk/core'` with `TS2708: Cannot use namespace 'Now' as a value`: dependencies not installed. Do not edit source; follow Package managers in the command policy.
   - A diagnostic in a file under `src/server/`: ordinary TypeScript; fix it as TypeScript. The Fluent rules and the table do not apply.
   - Lux/AIUX or Vite UI bundling: **sn-lux-build** / **sn-ui-page-vite**. Install errors: **sn-build-install**.
2. Group the output into defects, each with file + line + message:
   - `Node kind "X" is not allowed in Fluent files`, `Declaration kind ...`, `Inline functions are not valid` or `Table definition should be exported` is the primary. `Unsupported variable initializer`, `Failed to parse property` and `Unsupported statement in Fluent source file.` on the same statement, and `TS6133` on the same declaration, are echoes of it. When only echoes print, use the `TS226` / `TS303` rows.
   - `[now-sdk] ERROR: Plugin "<X>Plugin" failed to transform ... (source: <file>): <reason>` has no line number. It normally comes with a `TS2345` / `TS2322` / `TS27xx` diagnostic for the same record; treat both as one defect.
   - Parser codes below about 400 (`TS57`, `TS226`, `TS303` ...) are node-kind numbers that repeat across messages and shift with the bundled TypeScript: match the quoted text. tsc codes (`TS2xxx`, `TS6133`) are stable.
   - `Found N diagnostic error(s)` counts diagnostics, not defects.
3. Classify the file: ordinary declarative record, documented ATF/automation/Playbook callback DSL, GraphQL imported-script form, or transformed/Fluent-locked automation (see [Fluent rules](../../instructions/fluent.instructions.md)).
   - Do not externalize a documented `Test(...)`, automation, or Playbook builder callback; follow its exact API-documented shape.
   - Ordinary record script fields: move executable logic to an external module.
   - GraphQL: use a named imported server function (preferred); `Now.include` only for a raw resolver script file, never an `export function` module; inline resolver functions are invalid.
   - Transformed/Fluent-locked automation: do not hand-edit or delete generated source to satisfy the compiler. Stop, report the file and diagnostic, and follow [Automation ownership](../sn-build-install/SKILL.md#automation-ownership).
4. When the fix touches a record's properties, imports or `$id`, confirm the shape with `now-sdk explain <topic> --format raw` for the failing constructor, usually lowercased plus `-api` (`BusinessRule` → `businessrule-api`); on `No matching topics`, find it with `now-sdk explain --list "<keyword>" --format raw` (see [sn-explain](../sn-explain/SKILL.md)). Skip this for pure syntax fixes (unused binding, `+`, `||`, `var`).
5. Apply ONE coherent fix for one defect, from the table below. Read [more-diagnostics.md](references/more-diagnostics.md) when a diagnostic matches no row here.
6. Rebuild with `now-sdk build`, only after the previous build's completion is attributable (command policy; UNKNOWN is a stop, not a retry). Report the new output. The build passed only with native exit 0 AND the line `Build completed successfully` AND no `[now-sdk] ERROR:` line. If it still fails, repeat from step 2 with the next defect.

Stop and report instead of guessing when a diagnostic matches no row (here or in the reference) and `explain` does not settle it, or the same diagnostic (same file and message) survives two fix attempts. Never change `legacyChoices` / `--legacyChoices` as a parser-error workaround; the default is already the legacy v3 output (see **sn-build-install** Choice compatibility).

## Error → cause → fix

Match the quoted text. "DSL" means a documented ATF/automation/Playbook callback: follow its exact API/guide shape instead of applying a row mechanically.

| Diagnostic | Cause | Fix |
|---|---|---|
| `TS2322` `Type 'string' is not assignable to type 'boolean'` / `'number'` | Quoted boolean/number: `'true'` / `'100'` | Use the primitive: `true` / `100`, unless the diagnostic says the position expects a string (e.g. Playbook `launcherInputs ... must be a string value`). Column `maxLength: '100'` and a quoted Boolean/Integer column `default` build clean, so a passing build does not prove primitives are right. |
| `TS2353` `Object literal may only specify known properties, and '<x>' does not exist in type ...` | Unknown property: `{ text: '...' }` on a choice, `$id` on `SPPage`, a misspelt or invented name | Choice: `{ label: '...' }`. `SPPage`: remove `$id`, use `pageId`; `$id` belongs on its containers, rows, columns and widget instances. Otherwise use the name from the explain output. |
| `TS2304` `Cannot find name 'X'` | Missing import | Import from the path the explain output shows (typically `@servicenow/sdk/core`; `@servicenow/sdk/automation` for the Flow and Playbook DSL). Do NOT guess; it can shift between SDK majors. |
| `TS213` `Table definition should be exported as a named export with the name '<table>'` (often with `TS6133` on the same `const`); `TS2459` / `TS2305` in a file importing the table | `Table({...})` not exported, or export name ≠ table name | `const x_acme_foo = Table({...}); export { x_acme_foo };` or `export const x_acme_foo = Table({...})`. Do not delete the `const` to silence the `TS6133`. |
| `TS2345` `Argument of type ... is not assignable to parameter of type '<Record>'` with a nested `Property '<x>' is missing ... but required` | Missing required top-level property (`Table` without `name`, `BusinessRule` without `table`, `SPPage` without `pageId`) | Add `<x>` as a primitive; explain shows the required set. If `<x>` is `$id`, use the next row. |
| `Failed to determine ID for "<table>" record` (plugin line) with `Property '$id' is missing` under `TS2345` (top-level) or `TS2322` (nested, e.g. an `SPPage` container/row/column/instance) | Missing `$id`, required on `BusinessRule` and most non-Table records (typed `WithID`) | Add `$id: Now.ID['<stable_key>']` to that object; the key is the record's stable identity in `keys.ts` (see `explain keys-file`). `Table` uses the named export; `SPPage` uses `pageId`. |
| `TS6133` `'<name>' is declared but its value is never read` | Unused helper `const` or import specifier | Delete it or reference it. Exceptions: a `Table` `const` with `TS213` → export it; a parameter of an inline `function` property → externalize (`TS303` row). |
| `Node kind "BarBarToken"` (`TS57`) / `"AmpersandAmpersandToken"` (`TS56`) / `"ConditionalExpression"` (`TS227`) `is not allowed in Fluent files` | `\|\|`, `&&` or `?:` in an ordinary-record position; moving it to a scalar `const` reproduces the error | Resolve to a literal at authoring time, or move runtime logic into an external script. |
| `TS226` `Unsupported variable initializer` on a `const` (arithmetic also prints a `Node kind "AsteriskToken"`-style line; `+` prints none) | `+` concatenation or arithmetic in a `const` initializer | Template literal for strings; write an arithmetic result as the literal. Preserve API-documented DSL helper assignments. |
| `TS303` `Failed to parse property` + `TS244` `Unsupported statement in Fluent source file.` with no more specific line | Inline `function (...) {...}` property value (often with `TS6133` on its parameters), or a `+` expression | Ordinary record script: externalize (`Now.include` or a named function imported from `src/server`). `+`: template literal. |
| `TS219` `Inline functions are not valid. Use a named function imported from a server module in 'src/server', a string literal, or with Now.include().` | Arrow function as a property value or `const` initializer | As the message says. GraphQL: named imported server function; `Now.include` only for a raw resolver script file. |
| `TS80` `Unable to resolve the reference, ensure the imported module is within the src/server directory.` | `script` references a function declared in the same `.now.ts` (with `TS262` `Unsupported statement`) or imported from a path that does not resolve (with `TS2307`) | Put the function in a module under `src/server` and import it by the correct relative path. |
| `TS11` `Failed to include file. Reason: No file found at path: <path>` | `Now.include` path does not exist; it resolves relative to the `.now.ts` file | Correct the path or create the file at the printed path. |
| `Declaration kind "var"` (`TS115`) / `"let"` (`TS121`) `is not supported. Only const variables are supported.` | `var` / `let` | Use `const`. |
| `Node kind "IfStatement"` / `"ForStatement"` / `"ForOfStatement"` / `"WhileStatement"` / `"SwitchStatement"` / `"NewExpression"` `is not allowed in Fluent files` | Runtime syntax in an ordinary record, or a DSL callback in the wrong shape | Ordinary record: move runtime logic to an external module. `TestSuite` and `GraphQLApi` are direct calls, not `new` expressions. |
| `Node kind "SpreadAssignment"` (`TS305`) / `"ShorthandPropertyAssignment"` (`TS304`), both with `Only property assignments are allowed`, / `"SpreadElement"` (`TS230`) `is not allowed in Fluent files` | Object spread (`{ ...base }`), shorthand property (`{ a }`, also in a DSL callback's returned object) or array spread (`[...list, 'x']`) | Shorthand: `{ a: a }`. Write the object or array explicitly, or assemble it at runtime in an external script. Do not assume a DSL accepts arbitrary spread. |
