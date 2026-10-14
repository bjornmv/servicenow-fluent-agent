---
name: sn-new-app
description: Scaffolds a new scoped Fluent app with now-sdk init. Use when starting an app in an empty folder; not Lux or AIUX apps (sn-lux) or adopting an instance app (sn-download).
argument-hint: <app name, scope feature suffix, template, confirmed instance and alias>
compatibility: Installed now-sdk and a Node version that satisfies its engine; empty target directory; authorized ServiceNow instance and OAuth alias.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 and 4.11.2 `init`, run locally; wrong-prefix install outcome not re-verified.

Scaffold a new scoped ServiceNow Fluent app. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md).

Collect, asking for anything missing: app name; npm package name (lowercase, hyphens; propose one from the app name); scope feature suffix; template; the confirmed instance and its auth alias. `init` takes no description (it writes an empty one) — do not collect one.

## Prereqs
- **Empty target directory — check, do not assume:** `Get-ChildItem -Force -Name`.
  - `now.config.json` exists → stop: this is not a new app.
  - `package.json` exists → stop and ask: `init` replaces it.
  - Anything else → ask before continuing. Read [references/non-empty-directory.md](references/non-empty-directory.md) when the directory is not empty.
- `init` runs on the installed global SDK and pins that exact version as `@servicenow/sdk`. `node --version` must satisfy that SDK's `engines.node` (`>=20.18.0` at verification). Do not upgrade the SDK merely to scaffold; an upgrade needs explicit approval.
- No working OAuth alias for the confirmed instance → run **sn-auth** first. `init` creates local files only and scaffolds even with a wrong or missing alias, so a clean `init` does not prove the scope is valid or available.

## Steps
1. **Resolve the vendor prefix first.** Scope is `x_<vendor_prefix>_<feature>`: lowercase letters, digits, underscores. **The prefix is instance-bound, NOT freely chosen** (numeric on a personal developer instance). A wrong prefix scaffolds and builds, then may fail at install (observed: "application was null"). Read it via the **sn-rest** helper (read-only):
   ```powershell
   node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<alias>" --instance "https://<instance>.service-now.com" "/api/now/appcreator/app/vendorprefix"
   ```
   - The prefix is `result.result` in the `--agent` envelope, with `x_` and the trailing underscore; the scope MUST start with it exactly.
   - Request fails or value empty → stop and ask for the prefix. Never guess or reuse a sample prefix (`x_acme_*` below is illustrative).
   - **Scope max 18 characters** including the prefix. Count before `init`; if over, ask for a shorter suffix — do not truncate.
2. **Run `init` non-interactively** — all four of `--template`, `--appName`, `--packageName` and `--scopeName` are required to skip the prompts. Print the command first:
   ```powershell
   now-sdk init --template typescript.basic --auth <alias> --appName "My App" --packageName my-app --scopeName x_acme_my_app --noUpdate
   ```
   - `--template` — ask if not stated: `typescript.basic` / `javascript.basic` (Fluent-only), `javascript.react` / `typescript.react` / `typescript.vue` (adds a sample full-stack UI page) or `base` (config files only). Read [references/templates.md](references/templates.md) when the user is unsure which to choose. `javascript.aiux` / `javascript.aiux-extension` → stop and use **sn-lux** for scaffold AND install.
   - `--scopeName global` is a one-way decision outside this skill — stop and confirm with the user.
   - `--auth <alias>` — always pass the confirmed alias; omitted, `init` uses the default stored alias, possibly another instance.
   - `--noUpdate` skips the newer-SDK check. An "a new version … is available" warning is not an instruction to upgrade.
   - `init` still asks the npm registry which templates are available, with no timeout of its own. Where Node cannot reach the registry directly (for example behind a corporate proxy), it prints `Bootstrapping a new ServiceNow application project…` and then nothing for up to about 5 minutes, with the folder still empty, and then scaffolds normally (observed: 303 s). Run it with a timeout of at least 6 minutes and wait for the native exit; do not stop or re-run it. If it is still running after 6 minutes, stop it, report UNKNOWN and check the folder before any retry.
   - Do not add `--from`: it converts an existing app (see **sn-download**) and conflicts with `--appName`/`--scopeName`.
   - **If any prompt appears, do not answer it** (Enter on `Select a template:` picks `base`). Cancel, fix the flags, re-run in a still-empty directory.
3. **Confirm success — exit code 0 is not enough.** A rejected input prints an `ERROR:` line (e.g. `scopeName Invalid scope: must be less than 19 characters`), writes nothing and exits 0. Success requires `Application created successfully.` AND a new `now.config.json`. On `ERROR:`, fix the input and re-run; do not install dependencies without `package.json`.
   - A warning that the scope "does not start with your instance's vendor prefix" is a STOP: correct the scope before any build or install (with user approval, re-scaffold in a clean folder or edit `scope` in `now.config.json`; react/vue samples also embed it). No warning is NOT proof — it needs a resolving alias; step 1 is the check.
4. **Install dependencies with the project's package manager** (`init` does not). Honor `packageManager` and the lockfile; review installs and lifecycle scripts through the normal approval workflow. For npm, resolve its JavaScript CLI per the command policy; use `ci` with a valid npm lockfile, `install` for a new manifest without one:
   ```powershell
   node "<resolved-npm-cli.js>" install
   ```
   `now-sdk` then prefers the project's `node_modules/@servicenow/sdk` over the global SDK. Do not replace a pnpm lockfile with an npm lockfile.
5. **Verify (done criteria):**
   - `now.config.json` `scope` and `name` match the chosen values (`scopeId` is generated locally, not by the instance).
   - The layout matches the template: `*.basic` → `src/fluent/` + `src/server/`; `*.react`/`*.vue` → `src/client/` + `src/fluent/ui-pages/`; `base` → no `src/`. A mismatch means the wrong template was applied — stop. Missing `src/scripts/` and `src/ui/` is normal.
   - **The templates ship live sample records** (on `incident`; details in [references/templates.md](references/templates.md)). Tell the user and get a decision — remove (`example.now.ts` together with the script it imports) or keep deliberately — before any build or install.
   - `node_modules/@servicenow/sdk/bin/index.js` exists.
6. **Report** `now.config.json` contents, the `src/` layout and samples kept or removed. Do NOT author records here: hand off to **sn-add-record** or the GraphQL, Playbook and ATF suite skills. Vite/HMR UI Page → **sn-ui-page-vite**; do not invent `vite.config.*` or assume a template includes the SDK Vite integration.
