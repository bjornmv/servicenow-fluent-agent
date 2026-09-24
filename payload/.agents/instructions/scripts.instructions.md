---
applyTo: "**/src/scripts/**,**/src/server/**,**/src/ui/**"
description: src/scripts, src/server, and src/ui are full TypeScript/JS/HTML/CSS — normal code, not Fluent
---
# src/scripts/**, src/server/**, and src/ui/** — full code, not Fluent

These files are not ordinary Fluent record declarations. They are TypeScript / JavaScript / HTML / CSS. Most record scripts are referenced from `.now.ts` with `Now.include`; API-specific modules can instead be imported as documented. In now-sdk 4.11, `GraphQLApi` prefers named resolver functions imported from `src/server`, while `Now.include` remains supported. Path depth by layout:

- Directly under `src/fluent/` (e.g. `src/fluent/foo.now.ts`) → `../scripts/<file>.js` or `../ui/<file>.js`.
- Under `src/fluent/<folder>/` (e.g. `src/fluent/admin/foo.now.ts`) → `../../scripts/<file>.js` or `../../ui/<file>.js`.
- Under `src/fluent/<area>/<kind>/` — depth-3 hand-authored category layout (e.g. `src/fluent/server-development/business-rule/foo.now.ts`) → `../../../scripts/<file>.js` or `../../../ui/<file>.js`.
- Under `src/fluent/generated/**` — preserve transform-generated adjacent paths such as `./sys_script_*.server.js` or `./scripts/*.js`; if you intentionally move a file to root `src/scripts/` or `src/ui/`, recompute the relative path from the actual `.now.ts` depth.

So here, **the Fluent `.now.ts` restrictions do NOT apply**:
- Normal control flow is fine: `if` / `for` / `while` / `switch`, `||` / `&&` / `?:`, string `+`, `new`, `var` (prefer `const`/`let`).
- Write ordinary record runtime logic here. Keep API-documented ATF, automation, and Playbook builder callbacks in `.now.ts`; those callbacks are Fluent construction DSL, not external runtime scripts.

Conventions:
- Server scripts run in ServiceNow's server runtime: use only platform APIs available to that record/module. No Node runtime APIs. Match the surface the record type exposes (for example, a business rule's `current`/`previous`/`gs`, or a GraphQL resolver's `env`).
- GraphQL resolver/type-resolver modules under `src/server` export named functions. Resolver `env` supports `getArguments()` and `getSource()`; type-resolver `env` supports `getArguments()`, `getObject()`, and `getTypeName()`. Do not assume browser or Node globals.
- Client/UI scripts run in the browser: `g_form`, `g_list`, DOM. No server globals.
- One script file per record. Name it after the record it backs (e.g. `set_priority_on_insert.js`).
- If a script needs to be shared, make it a Script Include and reference it — don't `Now.include` the same file into two records.

Before writing a server script for a given record type, check what globals/signature that record exposes via `now-sdk explain <recordtype>-api --format raw` and the matching `-guide`. Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. Follow the [SDK command policy](../reference/sdk-commands.md); do not prepend a resolver to each command.

## Service Portal widget gotchas

- **AngularJS dropdown + `ng-blur` close**: the input's blur fires when the user clicks the dropdown's scrollbar (no `mousedown` on an item). A short `$timeout` in blur will still kill the dropdown mid-scroll. Guard with a hover flag (`ng-mouseenter`/`ng-mouseleave` on the dropdown) and skip the close when hover=true. Do NOT remove that hover flag thinking it's dead code — `ng-mousedown` on items alone isn't enough.
- After install, SP caches widget HTML/JS aggressively. Tell users to hard refresh (Ctrl+F5).
