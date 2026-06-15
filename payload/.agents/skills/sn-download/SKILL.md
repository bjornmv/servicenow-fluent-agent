---
name: sn-download
description: Adopt or refresh an EXISTING instance app as a local Fluent project. Lists instance apps over REST (now-sdk has no list-apps command), then scaffolds via init --from or refreshes via download. Use when bringing an app that already lives on the instance onto this machine, or pulling the latest metadata for the current project.
argument-hint: <app scope or sys_id — leave blank to list and pick>
---
Bring an EXISTING instance application onto this machine as a now-sdk Fluent project, or refresh one you already have. Examples below show `node "$NowSdk" <cmd>` — define `$NowSdk` on the same PowerShell line as each command: `$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>`. Use `npm.cmd` for package installs in PowerShell.

now-sdk has **no list-apps command**, so step 1 lists them over REST via the **sn-rest** skill helper.

## 1. Pick the app (if not already given)
```powershell
$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sys_app?sysparm_fields=name,scope,sys_id,version&sysparm_query=ORDERBYname&sysparm_limit=200"
```
Show a numbered list of `name — scope — version`; capture the chosen `sys_id` + `scope`. (Scoped apps are in `sys_app`; use `sys_scope` for global/plugin scopes.)

## 2a. Adopt into a NEW local project (first time on this machine)
Run in an EMPTY target folder — `init --from` scaffolds the project AND pulls the app's metadata:
```powershell
node "$NowSdk" init --from <sys_id> --auth <alias>
```
Creates `now.config.json` (scope = the app's scope) and `src/fluent/`, and downloads the app's records. It does NOT create `src/scripts/`/`src/ui/` — those are this bundle's convention for `Now.include`'d scripts, created on first use; the SDK's own example code lands in `src/server/` (and `src/client/` in react/vue templates).

**Skip the prompts with flags** — pass `--appName`, `--packageName`, `--scopeName` (and optionally `--template`) up front and `init --from` runs non-interactively:
```powershell
node "$NowSdk" init --from <sys_id> --auth <alias> --appName "My App" --packageName my-app --scopeName x_acme_my_app
```
`--packageName` must follow npm naming (lowercase, hyphens). `--scopeName` is capped at 18 chars and must use the vendor prefix. If you omit any flag, `init` prompts interactively; in that case use sync terminal mode with a generous timeout and answer one prompt at a time with `send_to_terminal`, reading the next prompt before sending the next answer.

## 2b. Refresh an app you ALREADY have locally
From inside the existing project (has `now.config.json`):
```powershell
node "$NowSdk" download . --auth <alias>              # full refresh
node "$NowSdk" download . --auth <alias> --incremental  # deltas only
```
`download` updates the CURRENT project — it does not pick an arbitrary app. Use 2a for a different one.

## 3. Convert to editable Fluent (optional)
`download`/`init --from` give metadata; for editable `.now.ts`, run the **sn-transform** skill (`node "$NowSdk" transform --auth <alias>`), then apply the Fluent rules.

## 4. Verify
- `now.config.json` scope matches the chosen app · `node "$NowSdk" build` succeeds · spot-check a record with the **sn-rest** skill.

Prereq: an OAuth alias must exist — run `auth --list` to check, run **sn-auth** if empty.
