---
applyTo: "**/src/scripts/**,**/src/ui/**"
description: src/scripts and src/ui are FULL TypeScript/JS/HTML/CSS — normal code, not Fluent
---
# src/scripts/** and src/ui/** — full code, not Fluent

These files are NOT parsed by the Fluent AST parser. They are ordinary TypeScript / JavaScript / HTML / CSS, referenced from `.now.ts` records via `Now.include` with a path relative to the `.now.ts` file. Path depth by layout:

- Directly under `src/fluent/` (e.g. `src/fluent/foo.now.ts`) → `../scripts/<file>.js` or `../ui/<file>.js`.
- Under `src/fluent/<folder>/` (e.g. `src/fluent/admin/foo.now.ts`) → `../../scripts/<file>.js` or `../../ui/<file>.js`.
- Under `src/fluent/<area>/<kind>/` — depth-3 hand-authored category layout (e.g. `src/fluent/server-development/business-rule/foo.now.ts`) → `../../../scripts/<file>.js` or `../../../ui/<file>.js`.
- Under `src/fluent/generated/**` — preserve transform-generated adjacent paths such as `./sys_script_*.server.js` or `./scripts/*.js`; if you intentionally move a file to root `src/scripts/` or `src/ui/`, recompute the relative path from the actual `.now.ts` depth.

So here, **the Fluent `.now.ts` restrictions do NOT apply**:
- Normal control flow is fine: `if` / `for` / `while` / `switch`, `||` / `&&` / `?:`, string `+`, `new`, `var` (prefer `const`/`let`).
- Write the actual logic here — keep `.now.ts` files declarative and push every function body into one of these files.

Conventions:
- Server scripts run in ServiceNow's server JS engine (Rhino-class): use `GlideRecord`, `gs`, `current`, `previous`, etc. No Node/npm runtime APIs. Match the surface the record type exposes (e.g. a business rule's `current`/`previous`/`gs`).
- Client/UI scripts run in the browser: `g_form`, `g_list`, DOM. No server globals.
- One script file per record. Name it after the record it backs (e.g. `set_priority_on_insert.js`).
- If a script needs to be shared, make it a Script Include and reference it — don't `Now.include` the same file into two records.

Before writing a server script for a given record type, check what globals/signature that record exposes via `node "$NowSdk" explain <recordtype>-api --format raw` and the matching `-guide` (define `$NowSdk` on the same PowerShell line: `$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>`).

## Service Portal widget gotchas

- **AngularJS dropdown + `ng-blur` close**: the input's blur fires when the user clicks the dropdown's scrollbar (no `mousedown` on an item). A short `$timeout` in blur will still kill the dropdown mid-scroll. Guard with a hover flag (`ng-mouseenter`/`ng-mouseleave` on the dropdown) and skip the close when hover=true. Do NOT remove that hover flag thinking it's dead code — `ng-mousedown` on items alone isn't enough.
- After install, SP caches widget HTML/JS aggressively. Tell users to hard refresh (Ctrl+F5).
