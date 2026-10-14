---
name: sn-download
description: Pulls a whole existing instance app into a now-sdk project. Use when adopting an instance-built app or resyncing it; not single records such as one flow or playbook (sn-transform).
argument-hint: <app name, scope or 32-character sys_id — leave blank to list and pick>
compatibility: Project-compatible now-sdk and Node; authorized instance and OAuth alias; empty folder for adoption.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `init`, `download` and `transform` help; confirm flags against the project's SDK help.

Bring an existing instance app into a local now-sdk Fluent project, or refresh one. Run `now-sdk` in VS Code PowerShell from the confirmed project directory (project `cwd`), per the [SDK command policy](../../reference/sdk-commands.md).

- Use the user-confirmed instance and OAuth alias. Do not run `auth --list` as a probe; the step-1 read is the connection evidence. On an authentication error, stop and use **sn-auth** in the interactive parent.
- This skill ends at a local project. Do NOT run `now-sdk install`; installing is a separate, approved **sn-build-install** task.
- If `--help` lists `--timeout <seconds>` (default 3600) for `download`/`transform`, set the terminal timeout to match rather than killing a slow run.

## 1. Resolve the app's sys_id
Skip if you have the 32-character sys_id. `init --from` accepts only that; a scope or name is treated as a local path and fails with `Failed to find a sys app xml file`. now-sdk has **no list-apps command**, so filter `sys_app` by `scope=<scope>` or `nameLIKE<text>` with the **sn-rest** helper (its bounds and pagination rules apply):
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<alias>" --instance "https://<instance>.service-now.com" "/api/now/table/sys_app?sysparm_fields=sys_id,name,scope,version&sysparm_query=scope=<scope>&sysparm_limit=10&sysparm_no_count=true"
```
Read [references/find-app.md](references/find-app.md) when there is nothing to filter on or the app is not in `sys_app`.

## 2a. Adopt into a new local project
Confirm the absolute target folder with the user; `init` writes into the current directory, not a subfolder. The folder must be EMPTY. STOP if it contains `now.config.json` (`init` then ignores `--from`) or `package.json` (its `name` overrides `--packageName`).
```powershell
now-sdk init --from <sys_id> --auth <alias> --packageName my-app
```
- `--packageName` (lowercase, hyphens) prevents the `NPM package name:` prompt.
- Do NOT add `--appName` or `--scopeName` (`Arguments from and scopeName are mutually exclusive`, exit 1). Name and scope come from the instance app.

Result: `now.config.json`, `package.json`, `.gitignore`, `.vscode/` and the app's raw XML under `metadata/`. No `src/` yet is normal; `src/fluent/` appears on the first `now-sdk build` or `transform`.

## 2b. Install dependencies — REQUIRED before any `transform`
`init --from` installs nothing. Follow the dependency-install step of **sn-new-app**, then confirm `node_modules/@servicenow/sdk/bin/index.js` exists.

Without it, `transform` still exits 0 with `Transform completed successfully` but writes `.now.ts` files with no `import` lines and removes the source XML from `metadata/`; `now-sdk build` then fails (TS2708 and similar). Installing afterwards does not repair this; recovery is re-adopting into a fresh folder.

## 3. Convert to editable Fluent (optional)
```powershell
now-sdk transform --from metadata
now-sdk transform --from metadata/update/<file>.xml
```
Records land in `src/fluent/generated/**/*.now.ts`; their XML is removed from `metadata/`. Do NOT use `now-sdk transform --auth <alias>` for this first conversion: records held as XML stay XML and it reports success anyway. Then apply **sn-transform**'s review, cleanup and flow/action confirmation rules; adopted flows, subflows and custom actions are Fluent-locked (see **sn-build-install** → Automation ownership).

## 4. Refresh an app you already have
From the existing converted project, with dependencies installed:
```powershell
now-sdk transform --auth <alias>
```
- It syncs the CURRENT project's app only; for a different app use 2a.
- It **overwrites local changes** to every record it updates: get the user's go-ahead and have uncommitted work committed or backed up first.
- For specific records, use the `--table` / `--id` forms in **sn-transform**.

`now-sdk download` is NOT a refresh. Read [references/raw-download.md](references/raw-download.md) only when you need the app's raw XML for inspection.

## 5. Verify
A green `now-sdk build` alone proves nothing; it also passes with none of the app's metadata. Check:
- 2a: `now.config.json` `scope`/`scopeId` match the chosen app; `metadata/update/` contains XML.
- 2b: `node_modules/@servicenow/sdk/bin/index.js` exists.
- 3 / 4: the expected `.now.ts` files exist under `src/fluent/generated/` and start with an `import … from '@servicenow/sdk/core'` line (no imports = transform ran without dependencies). After 4, review the changed files with the user.
- `now-sdk build` succeeds. While raw XML remains, a warning about a static `sys_app` XML file in the metadata directory is expected.
- Spot-check one record against the instance with **sn-rest**.

Report the files created or changed. Before any later install, the **sn-build-install** pre-install flow/action scan is mandatory.
