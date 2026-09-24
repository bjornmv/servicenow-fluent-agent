---
applyTo: "**/*.now.ts"
description: Fluent .now.ts syntax rules, including documented callback-based SDK DSL exceptions
---
# Fluent .now.ts — hard rules and SDK DSL exceptions

`.now.ts` files are parsed by the Fluent compiler, not as unrestricted TypeScript. Apply the ordinary-record rules below to declarative record expressions and record script fields. Do not mechanically apply them to callback/helper positions that the exact SDK API documents as part of a Fluent DSL.

BEFORE authoring or editing a record type, run `now-sdk explain <recordtype>-api --format raw` using the host routing below. Run the matching `-guide` for net-new records or complex composition. Treat the installed SDK 4.11+ explain output as authoritative; use `.d.ts` files only as a supplement.

## Documented SDK DSL exceptions — classify first

A callback is not automatically a record script. Preserve callbacks and constructor/helper assignments when the exact API or guide requires them:

- ATF `Test({...}, (atf) => { ... })` test-step callbacks.
- Hand-authored `Flow(...)`, `Subflow(...)`, and `Action(...)` automation callbacks.
- `PlaybookDefinition(...)`, `wfa.playbook.*`, permissions, trigger-mapper, lanes, and activities callbacks.
- Other SDK DSL positions explicitly shown by the installed `explain` API/guide.

These callbacks and SDK constructor/helper calls stay in `.now.ts`; do not move them to `Now.include` merely because they are functions or call expressions. Use only syntax and helpers shown by the exact API/guide—this exception is not permission to add arbitrary runtime JavaScript.

`GraphQLApi(...)` has a different rule: resolver and type-resolver `script` values must be named functions imported from a server module (preferred) or `Now.include(...)`. Inline function expressions are a build error. `TestSuite(...)` and `GraphQLApi(...)` are function calls, never `new TestSuite(...)` or `new GraphQLApi(...)`.

Transformed/generated `Flow(...)`, `Subflow(...)`, and `Action(...)` under `src/fluent/generated/automation/flow/` are governed by the **Flow and Action Guardrail** in the ServiceNow Fluent agent and now-sdk baseline. Do not edit-build-install those generated records as though they were hand-authored DSL.

## SDK commands

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. Follow the [SDK command policy](../reference/sdk-commands.md) for host routing and the permitted missing-function fallback. Do not prepend a resolver to each command.

## The 12 ordinary-record rules

1. **NEVER** put an inline function body in an ordinary record `script` property. Externalize executable record logic with the API-supported form.
   - Most record scripts: `script: Now.include('../../scripts/before_insert.js')` from `src/fluent/<folder>/foo.now.ts`.
   - GraphQL resolver scripts: import a named function from `src/server` (preferred), or use `Now.include`.
   - Documented ATF/automation/Playbook DSL callbacks are construction syntax and are exempt as described above.

2. For ordinary declarative records, **NEVER** use `||`, `&&`, `?:`, or object spread (`...`) anywhere in the file. The parser reports errors such as TS57 `BarBarToken`, TS227 `ConditionalExpression`, or TS305 `SpreadAssignment`, including when the expression is moved to a scalar `const`. Resolve it to a literal at authoring time or move runtime logic into an external script. In a documented SDK DSL file, use an operator only where the exact API/guide shows that syntax is supported.

3. For ordinary declarative records, **NEVER** concatenate strings with `+`, including in scalar `const` initializers. Use a template literal.
   - NO: `const tableName = prefix + '_table'`
   - YES: `` const tableName = `${prefix}_table`; ``

4. **NEVER** add arbitrary `if` / `for` / `while` / `switch` runtime logic to an ordinary record file. Put runtime logic in an external module. Documented ATF/automation/Playbook callback bodies use only their supported DSL grammar.

5. **NEVER** use `var`. Use `const` (or a documented SDK example's exact binding form).

6. **NEVER** use `new SomeClass()` in `.now.ts` unless the installed SDK API explicitly requires it. Current `TestSuite(...)`, `GraphQLApi(...)`, records, and automation helpers are direct function calls.

7. Boolean and numeric fields **MUST** be primitives, never quoted (TS2322).
   - NO: `active: 'true'`, `max_length: '100'`
   - YES: `active: true`, `max_length: 100`

8. Choice configs **MUST** use `{ label: '...' }`, never `{ text: '...' }` (ChoiceColumn and variable choices).

9. `Table({...})` **MUST** have a named export matching the table name.
   - YES: `const x_acme_foo = Table({ ... }); export { x_acme_foo };`

10. `SPPage` **MUST** use `pageId`, never `$id`; `$id` is for containers, rows, and columns inside the page.

11. **NEVER** leave an unused binding. Unused variables fail the build (TS6133). SDK constructor/DSL assignments are valid when they are exported, returned, referenced, or otherwise consumed as the API requires.

12. Most non-Table records (`BusinessRule`, `ClientScript`, `Acl`, `CatalogItem`, `Record`, `TestSuite`, `GraphQLApi`, …) require `$id: Now.ID['<stable_key>']`. `Table` uses the named export; `SPPage` uses `pageId`. Confirm exceptions with `explain keys-file` and the record API.

## Per-record recipe

1. Run `now-sdk explain <recordtype>-api --format raw`; add the matching guide for net-new or complex composition.
2. Classify the file as an ordinary declarative record, a documented SDK callback DSL, GraphQL, or transformed/Fluent-locked automation.
3. For ordinary record script properties, externalize executable logic. Include paths are relative to the `.now.ts` file: directly under `src/fluent/` = `../scripts/<file>.js`; under `src/fluent/<folder>/` = `../../scripts/<file>.js`; under `src/fluent/<area>/<kind>/` = `../../../scripts/<file>.js`. Preserve adjacent transform-generated paths unless intentionally moving the file. For GraphQL, prefer a named import from `src/server`.
4. Scalar helper `const`s used as ordinary property values may hold plain literals or template literals. This restriction does not prohibit API-documented assignments such as `const table = Table(...)`, `const test = Test(...)`, `const gate = Acl(...)`, or Playbook lane/activity helpers.
5. Run `now-sdk build`. Use normal v4 additive choice handling by default; `--legacyChoices` restores v3 destructive choice-set behavior and requires explicit confirmation.
6. To install and verify, run **sn-build-install**; it owns the pre-install automation scan and content-marker verification.
