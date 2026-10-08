---
name: sn-new-app
description: Use when scaffolding (creating, starting, bootstrapping) a brand-new scoped ServiceNow Fluent application in an empty folder with now-sdk init; not for adopting an existing instance app (sn-download) or Lux/AIUX apps (sn-lux).
argument-hint: <app name, scope feature suffix, template, confirmed instance and alias>
compatibility: Installed now-sdk and a Node version that satisfies its engine; empty target directory; authorized ServiceNow instance and OAuth alias.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 and 4.11.2 `init`, run locally (flags, prompts, exit codes, per-template layout). Instance-side behaviour (install outcome of a wrong-prefix scope) was not re-verified.

Scaffold a new scoped ServiceNow Fluent app. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md).

Collect from the argument/conversation, asking for anything missing: app name; npm package name (lowercase, hyphens — propose one from the app name); scope feature suffix (the prefix comes from the instance, step 1); template (step 2); the confirmed instance and its auth alias. `init` has no description flag or prompt and writes an empty description — do not collect one for it.

## Prereqs
- **Empty target directory — check, do not assume.** List it first (`Get-ChildItem -Force -Name`). If `now.config.json` exists, `init` does NOT scaffold: it switches to apply-template mode for that existing project (only `partial.*` templates; `--appName`/`--scopeName` ignored) — stop, this is not a new app. If `package.json` exists, `init` replaces it (existing dependencies, scripts and version are lost) and uses its `name` instead of `--packageName` — stop and ask. `init` also overwrites an existing `.gitignore` and `.vscode/extensions.json`; other files (`.git`, README) are left alone. Ask before continuing in any non-empty directory.
- In an empty directory there is no project-local SDK yet, so `init` runs on the installed global SDK and pins that exact version as `@servicenow/sdk` in the new `package.json`. `node --version` must satisfy `engines.node` in that SDK's `package.json` (`>=20.18.0` at verification). Do not upgrade the SDK merely to scaffold; an upgrade needs explicit approval per the command policy.
- A confirmed instance and a working OAuth alias for it are needed for the prefix lookup in step 1 and for the later install; if no alias exists, run the **sn-auth** skill first. `init` itself creates local files only: it does not reserve the scope on the instance and scaffolds even when the alias is missing or wrong, so a clean `init` is not evidence that the scope is valid or available.

## Steps
1. Scope naming: enforce `x_<vendor_prefix>_<feature>` — lowercase letters, digits and underscores only. **The vendor prefix is instance-bound, NOT freely chosen** (on a personal developer instance it is a numeric code). A wrong-prefix scope scaffolds AND builds fine, then may fail much later at install with an obscure error (observed: "application was null"). Resolve the prefix FIRST with a read-only request through the **sn-rest** helper (the same endpoint `init` uses for its own check):
   ```powershell
   node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<alias>" --instance "https://<instance>.service-now.com" "/api/now/appcreator/app/vendorprefix"
   ```
   The prefix is the string at `result.result` in the `--agent` envelope (the API's own `result` value), complete with `x_` and the trailing underscore; the scope MUST start with that string exactly. If the request fails or that value is empty, stop and ask the user for the prefix — do not guess, and never reuse a sample prefix. **Scope is capped at 18 characters total** including the prefix: count the length before running `init`, and if it is over, ask the user for a shorter feature suffix rather than truncating. The `x_acme_*` values in the examples below are illustrative only. Validate + fix before proceeding.
2. **Non-interactive `init`** — all four of `--template`, `--appName`, `--packageName` and `--scopeName` are required to skip the prompts. Print the command first:
   ```powershell
   now-sdk init --template typescript.basic --auth <alias> --appName "My App" --packageName my-app --scopeName x_acme_my_app --noUpdate
   ```
   - `--template` — ask the user if not stated. `typescript.basic` or `javascript.basic` suit a Fluent-only app; `javascript.react`, `typescript.react` and `typescript.vue` add a sample full-stack UI page; `base` writes config files only. `javascript.aiux` / `javascript.aiux-extension` are Lux/AIUX → stop and use **sn-lux** for scaffold AND install (different install rules; `aiux-extension` prompts for extra parameters).
   - `--packageName` follows npm naming (lowercase, hyphens).
   - `--scopeName` is the `x_<vendor_prefix>_<feature>` value from step 1. `--scopeName global` is accepted by `init` but is a one-way decision outside this skill — stop and confirm with the user.
   - `--appName` is the human-readable name.
   - `--auth <alias>` — always pass the confirmed alias; omitted, `init` uses the default stored alias, which may be a different instance. `init` uses it only to read the vendor prefix and warn on a mismatch.
   - `--noUpdate` skips the npm-registry check for a newer SDK. An "a new version … is available" warning is informational, not an instruction to upgrade.
   - Do not add `--from`: it converts an existing app (see **sn-download**) and conflicts with `--appName`/`--scopeName`.
   - **If any prompt appears, do not answer it.** Pressing Enter on `Select a template:` picks the highlighted empty boilerplate (`base`). Cancel the command, fix the flags and re-run in a still-empty directory.
3. **Confirm `init` succeeded before doing anything else — exit code 0 is not enough.** When `init` rejects an input (e.g. the scope or package name) it prints an `ERROR:` line (e.g. `scopeName Invalid scope: must be less than 19 characters`), writes nothing and still exits 0. Success requires the line `Application created successfully.` AND a new `now.config.json`. On `ERROR:`, fix the input and re-run; do not continue to the dependency install in a directory without `package.json`.
   - If `init` warns the scope "does not start with your instance's vendor prefix", treat it as a STOP condition even though the project was created: correct the scope before any build or install (with user approval, re-scaffold in a clean folder or edit `scope` in `now.config.json`; the react/vue samples also embed the scope). The warning appears only when the alias resolves and the instance answers — no warning is NOT proof the prefix is right; step 1 is the check.
4. **Install dependencies with the project's package manager** — `init` writes `package.json` but does not install. Honor `packageManager` and the lockfile; review required installs and lifecycle scripts through the normal approval workflow. For npm, resolve its permitted JavaScript CLI per the command policy, then use `ci` with a valid npm lockfile or `install` for a new manifest without one. Example for the latter (replace the path placeholder):
   ```powershell
   node "<resolved-npm-cli.js>" install
   ```
   This populates `node_modules/@servicenow/sdk`, which `now-sdk` will prefer over the global SDK. Do not replace a pnpm lockfile with an npm lockfile.
5. Verify the scaffold landed:
   - `now.config.json` exists at root; its `scope` and `name` match the chosen values (`scopeId` is generated locally, not issued by the instance).
   - The layout matches the template that was requested: `*.basic` → `src/fluent/` and `src/server/`; `*.react`/`*.vue` → `src/client/` and `src/fluent/ui-pages/`; `base` → config files only, no `src/`. A missing `src/` after asking for any other template means the wrong template was applied — stop, do not treat it as normal.
   - NO template creates `src/scripts/` or `src/ui/` — their absence after `init` is NORMAL, not a failed scaffold. They are this bundle's convention for `Now.include`'d record scripts: create them on first use (`mkdir` when first externalizing a script).
   - **The templates ship live sample records.** `*.basic` writes `src/fluent/example.now.ts` (an active onLoad Client Script and an after-update Business Rule, both on `incident`) plus the `src/server/script.ts`/`.js` it imports; `*.react`/`*.vue` write a sample incident-manager UI page under `src/fluent/ui-pages/` and `src/client/`. Tell the user and get a decision — remove them (the example and the script it imports together) or keep them deliberately — before any build or install, so they are not deployed by accident.
   - `node_modules/@servicenow/sdk/bin/index.js` exists (proves the install ran).
6. Report `now.config.json` contents + the created `src/` layout, including any sample files kept or removed. Do NOT author records yet—use **sn-add-record** for ordinary records or the specialized GraphQL, Playbook and ATF suite skills. If the requested app is a Vite/HMR UI Page, use **sn-ui-page-vite** after scaffold; do not invent `vite.config.*` or assume a generic template includes the documented SDK Vite integration.
