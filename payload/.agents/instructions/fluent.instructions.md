---
applyTo: "**/*.now.ts"
description: Fluent .now.ts hard syntax rules (custom AST parser, not full TypeScript)
---
# Fluent .now.ts — hard rules

`.now.ts` files are parsed by a custom Fluent AST parser, NOT full TypeScript. Violations fail the build (~10s) + waste a ~15s install. Enforce every rule below for hand-authored Fluent and generated non-automation records.

Exception: transformed/generated automation files under `src/fluent/generated/automation/flow/` that contain `Flow(...)`, `Subflow(...)`, or `Action(...)` use the SDK automation DSL. Do not apply the hard cleanup rules in this file to those files; classify them with the **Flow and Action Guardrail** (canonical in the ServiceNow Fluent agent and the now-sdk baseline instructions; applied operationally by the **sn-transform** and **sn-build-install** skills). The "NEVER" rules below are absolute within the scoped records above.

BEFORE authoring or editing a record type: run `node "$NowSdk" explain <recordtype>-api --format raw` (define `$NowSdk` once per shell line — see the resolver block below). Skim `node_modules/@servicenow/sdk-core/dist/<area>/<Type>.d.ts` only as a supplement when the explain output is sparse. Run the matching `-guide` only for net-new records or complex composition.

## SDK command resolver — define once per line

```powershell
$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>
```

## The 12 rules

1. **NEVER** put an inline function body in a record script. **MUST** externalize via `Now.include`.
   - NO: `script: function () { current.update(); }`
   - YES: `script: Now.include('../../scripts/before_insert.js')` from `src/fluent/<folder>/foo.now.ts`; include paths are relative to the `.now.ts` file. Depth-3 hand-authored category records (e.g. `src/fluent/server-development/business-rule/foo.now.ts`) need `../../../scripts/<file>.js`. Generated transform records may live under `src/fluent/generated/**` and can use adjacent `./...` include paths; preserve those unless you move the script file.

2. **NEVER** use `||`, `&&`, `?:`, or object spread (`...`) ANYWHERE in a `.now.ts` file — the ban is FILE-WIDE (TS57 `BarBarToken` / TS227 `ConditionalExpression` / TS305 `SpreadAssignment`), including `const` initializers: `const active = flagA || flagB` fails with the SAME error as the inline form. Resolve the value before it reaches the file — hardcode the resolved literal, or move the decision into an external script via `Now.include`.
   - NO: `active: flagA || flagB`
   - NO: `const active = flagA || flagB;` then `active: active` — fails identically (file-wide ban)
   - YES: `active: true` — resolve the condition at authoring time

3. **NEVER** concatenate strings with `+` anywhere in a `.now.ts` file — including `const` initializers (`const tableName = prefix + '_table'` fails TS226 `Unsupported variable initializer`). **MUST** use a template literal — the ONLY in-file string composition that compiles.
   - NO: `name: prefix + '_table'` and `const tableName = prefix + '_table';`
   - YES: `const tableName = \`${prefix}_table\`;` then `name: tableName`

4. **NEVER** use `if` / `for` / `while` / `switch` anywhere in a `.now.ts` file. Control flow lives in external `.js`/`.ts` referenced via `Now.include`.

5. **NEVER** use `var`. **MUST** use `const`.

6. **NEVER** use `new SomeClass()` anywhere in a `.now.ts` file. Use a supported Fluent helper/type shape instead, or move executable runtime logic to `src/scripts/**` / `src/ui/**` and reference it with `Now.include`.

7. Boolean and numeric fields **MUST** be primitives, never quoted (TS2322).
   - NO: `active: 'true'`, `max_length: '100'`
   - YES: `active: true`, `max_length: 100`

8. Choice configs **MUST** use `{ label: '...' }`, never `{ text: '...' }` (ChoiceColumn + variable choices).
   - NO: `{ value: 'open', text: 'Open' }`
   - YES: `{ value: 'open', label: 'Open' }`

9. `Table({...})` **MUST** have a named export matching the table name (TS2305 / TS2459 otherwise).
   - YES: `const x_acme_foo = Table({ ... }); export { x_acme_foo };`

10. `SPPage` **MUST** use `pageId`, never `$id` ($id is for containers/rows/columns inside the page).
    - NO: `SPPage({ $id: 'my_page', ... })`
    - YES: `SPPage({ pageId: 'my_page', ... })`

11. **NEVER** declare a `const` you do not reference — unused variables fail the build (TS6133).

12. Most non-Table records (`BusinessRule`, `ClientScript`, `Acl`, `CatalogItem`, `Record`, …) **REQUIRE** `$id: Now.ID['<stable_key>']` — the record's stable identity key (see `explain keys-file`). Missing `$id` fails the build (TS2345 / "Failed to determine ID"). `Table` uses the named export instead (rule 9); `SPPage` uses `pageId` (rule 10).
    - YES: `BusinessRule({ $id: Now.ID['br_set_priority'], name: 'set_priority', table: 'incident', ... })`

## Per-record recipe

1. Run `node "$NowSdk" explain <recordtype>-api --format raw`; add the matching `-guide` only for net-new records or complex composition. Skim the `.d.ts` only as supplemental detail.
2. Externalize all hand-authored scripts via `Now.include('<relative path to src/scripts>/<file>.js')`. Include paths are relative to the `.now.ts` file. Path depth by layout: directly under `src/fluent/` = `../scripts/<file>.js`; under `src/fluent/<folder>/` = `../../scripts/<file>.js`; under `src/fluent/<area>/<kind>/` (depth-3 hand-authored category layout) = `../../../scripts/<file>.js`. For transform-generated files under `src/fluent/generated/**`, preserve adjacent `./...` include paths unless you intentionally move the script.
3. `const`s above the record literal may hold ONLY plain literals or template literals — any operator (`||`, `&&`, `?:`, `+`), spread, or call expression in a `const` initializer fails the build file-wide. Compose strings with template literals; resolve conditions to literals at authoring time; put real logic in external scripts via `Now.include`.
4. `node "$NowSdk" build` to verify the change compiles. To install/verify on the instance, run the **sn-build-install** skill — it owns the pre-install flow/action scan and the content-marker verification.