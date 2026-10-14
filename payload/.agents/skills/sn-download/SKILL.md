---
name: sn-download
description: Pulls a whole existing instance app into a now-sdk project. Use when adopting an instance-built app or resyncing it; not single records such as one flow or playbook (sn-transform).
argument-hint: <app name, scope or 32-character sys_id — leave blank to list and pick>
compatibility: Project-compatible now-sdk and Node; authorized instance and OAuth alias; empty folder for adoption.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `init --help`, `download --help`, `transform --help` and `now-sdk explain developing-apps-guide` (historical; confirm flags against the project's SDK help before use).
Bring an EXISTING instance application onto this machine as a now-sdk Fluent project, or refresh one you already have. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md), including package-manager launchers that preserve the project lockfile.

Prereq: use the user-confirmed instance and OAuth alias. Do not run `auth --list` as a routine probe; the step-1 read is the connection evidence. For an authentication error, stop and use **sn-auth** in the interactive parent.

This skill ends at a local project. Do NOT run `now-sdk install` as part of it; installing is a separate, approved **sn-build-install** task.

now-sdk has **no list-apps command**, so step 1 looks the app up over REST via the **sn-rest** skill helper (its bounds and pagination rules apply).

## 1. Resolve the app's sys_id (skip only if you already have the 32-character sys_id)
`init --from` accepts only the 32-hex `sys_id` of the app record; any other value (a scope, a name) is treated as a local directory path and fails with `Failed to find a sys app xml file`. If the user gave a scope or name, filter first (`scope=<scope>` or `nameLIKE<text>`):
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<alias>" --instance "https://<instance>.service-now.com" "/api/now/table/sys_app?sysparm_fields=sys_id,name,scope,version&sysparm_query=scope=<scope>&sysparm_limit=10&sysparm_no_count=true"
```
With nothing to filter on, page the list instead: `sysparm_query=ORDERBYname%5EORDERBYsys_id&sysparm_limit=20`, continuing with `sysparm_offset=<nextOffset>` while `hasMore` is true. Show a numbered list of `name — scope — version`; capture the chosen `sys_id` + `scope`. (`sys_app` holds custom apps built on, or installed with the SDK onto, this instance. If the app is not there, look it up in `sys_scope` by scope and tell the user that adopting a Store-installed app with `init --from` is unverified.)

## 2a. Adopt into a NEW local project (first time on this machine)
Confirm the absolute target folder with the user first: `init` writes into the current directory and does not create a subfolder. The folder must be EMPTY. STOP if it contains `now.config.json` (then `init` switches to its apply-template flow and ignores `--from`) or `package.json` (its `name` overrides `--packageName`).
```powershell
now-sdk init --from <sys_id> --auth <alias> --packageName my-app
```
- `--packageName` (npm naming: lowercase, hyphens) is the only value `init --from` asks for; pass it and the command runs without prompts. Without it — including the bare `init --from <sys_id>` shown in the SDK guide — it stops at an `NPM package name:` prompt.
- Do NOT add `--appName` or `--scopeName`: the CLI rejects them with `--from` (`Arguments from and scopeName are mutually exclusive`, exit 1). Name and scope come from the instance app. `--template` is ignored in this flow.

Result: `now.config.json` (`scope`, `scopeId`, `name` of the app), `package.json`, `.gitignore`, `.vscode/` and the app's records as raw XML under `metadata/` (`update/`, `dictionary/`, `author_elective_update/`, `sys_app_<sys_id>.xml`). It creates NO `src/` — that is normal, not a failed scaffold. `src/fluent/` appears on the first `now-sdk build` or `transform`.

## 2b. Install dependencies — REQUIRED before any `transform`
`init --from` writes `package.json` but installs nothing. Follow the dependency-install step of **sn-new-app** (project package manager, lockfile and launcher per the command policy), then confirm `node_modules/@servicenow/sdk/bin/index.js` exists.

Never run `transform` without it: the command still exits 0 with `Transform completed successfully`, but the generated `.now.ts` files have no `import` lines, the source XML is removed from `metadata/`, and `now-sdk build` then fails (TS2708 and similar). Installing afterwards does not repair the files; recovery is re-adopting into a fresh folder.

## 3. Convert to editable Fluent (optional)
The XML is already local, so convert it offline — whole app, or one file at a time:
```powershell
now-sdk transform --from metadata
now-sdk transform --from metadata/update/<file>.xml
```
Converted records land in `src/fluent/generated/**/*.now.ts` and their XML is removed from `metadata/`. Do NOT use `now-sdk transform --auth <alias>` for this first conversion: records still held as XML in `metadata/` stay XML and the command reports success anyway. Then follow the **sn-transform** skill's review, cleanup and flow/action confirmation rules — adopted flows, subflows and custom actions are Fluent-locked (see **sn-build-install** → Automation ownership).

## 4. Refresh an app you ALREADY have locally
From inside the existing, already converted project (has `now.config.json`), with dependencies installed (2b):
```powershell
now-sdk transform --auth <alias>
```
With no `--from` this downloads the CURRENT project's app and updates its Fluent source in place; it does not pick an arbitrary app (use 2a for a different one). It **overwrites local changes** to every record it updates — get the user's go-ahead and have uncommitted work committed or backed up first. To pull only specific records, use the `--table` / `--id` forms in **sn-transform**.

`now-sdk download <dir> --auth <alias>` is NOT a refresh: it only unpacks the app's raw XML into `<dir>` and changes nothing under `src/` or `metadata/`. Never pass `.` or a folder inside the project — with `.` the XML lands in the project root, where the build ignores it. Use it only to inspect raw XML, with an empty scratch folder outside the project, run from the project directory (the app comes from the project's `now.config.json`):
```powershell
now-sdk download "<empty-scratch-dir-outside-the-project>" --auth <alias>
```
`--auth` works on `download` although `download --help` does not list it. `--incremental` requests the instance's incremental packaging mode; the CLI sends no last-download timestamp, so do not treat the result as "changes since your last download". Where `--help` lists `--timeout <seconds>` (default 3600) for `download`/`transform`, set the terminal timeout to match rather than killing a slow run.

## 5. Verify
A green `now-sdk build` alone proves nothing — it also passes on a project holding none of the app's metadata. Check what actually changed:
- 2a: `now.config.json` `scope`/`scopeId` match the chosen app, and `metadata/update/` contains XML files.
- 2b: `node_modules/@servicenow/sdk/bin/index.js` exists.
- 3 / 4: `src/fluent/generated/` contains the expected `.now.ts` files and they start with an `import … from '@servicenow/sdk/core'` line; files without imports mean transform ran without dependencies. After 4, review the changed files with the user.
- `now-sdk build` succeeds. While raw XML remains, a warning about a static `sys_app` XML file in the metadata directory is expected.
- Spot-check one record against the instance with the **sn-rest** skill.

Report the files created or changed. Before any later install, the **sn-build-install** pre-install flow/action scan is mandatory.
