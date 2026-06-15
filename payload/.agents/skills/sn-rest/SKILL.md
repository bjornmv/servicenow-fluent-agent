---
name: sn-rest
description: Make an authenticated ServiceNow REST call by reusing the OAuth token now-sdk already stored — no separate credentials. Bundles sn-rest.js. Use to list instance apps (sys_app), verify a record landed after install, look up sys_ids, or any ad-hoc /api/now read/write.
argument-hint: <REST path — e.g. /api/now/table/sys_app?sysparm_fields=name,scope,sys_id&sysparm_limit=50>
---
Make a ServiceNow REST call **reusing the token `now-sdk auth` already stored** — no separate credentials, no Application Registry. Backed by `sn-rest.js` in this skill folder — the script itself is pure Node (invoked via the standard PowerShell one-liner like every other command here; its only non-Node touch is a last-resort `npm.cmd root -g` shell-out when locating the keyring module).

## How it works
`sn-rest.js` reads the OAuth token now-sdk saved in the OS keychain (service `ServiceNow`, account `now-sdk`, via `@napi-rs/keyring`), calls the instance with `Authorization: Bearer <token>`, refreshes proactively when `expires_at` is within 60 s, and falls back to a refresh-on-401 retry. Refreshed `access_token` / rotated `refresh_token` / new `expires_at` are written back to the keychain so subsequent `sn-rest` and `now-sdk` calls see the fresh token. It acts as **your** user at the SDK OAuth client's scope — same identity that ran `now-sdk auth`.

## Run
Run with `node` from any directory using the deterministic resolver. Define `$SnRest` in the same PowerShell command before calling `node`:
- Read (default GET): `$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "<path>"`
- Print redacted token metadata JSON for the stored now-sdk token (no REST call, no alias filter — there is only one keychain entry per Windows user): `$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest"`
- Debug only, print JUST the access token (no JSON wrapper — this exposes the bearer; confirm before using directly): `$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --raw`
- Debug only, inspect token / keystore shape (exposes raw keychain JSON; confirm before using directly): `$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --dump`
- Write, short JSON: `$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com --method POST --body '{"short_description":"x"}' /api/now/table/incident`
- Write, complex JSON: `$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com --method POST --body-file payload.json /api/now/table/incident`

Print the command before running; parse the JSON and report only the fields asked for. Never paste the output of `--raw` or `--dump` into chat — both expose secrets. Treat both modes as local debugging escape hatches, not normal workflow commands. `--raw` refreshes a near-expiry token before printing when the instance URL is known, but it still exposes the bearer. If `--alias <alias>` is supplied and the alias is not found, the helper exits instead of falling back to another stored credential.

## PowerShell JSON-body trap (writes only)
PowerShell 5.1's native-call layer mangles `--body` arguments in two ways: it splits on internal spaces, and it does NOT interpret backslash-escaped quotes (`\"`) inside single-quoted strings — `\"` arrives as two literal characters (`\` + `"`), producing `Unexpected token \\ in JSON` or `HTTP 400 The payload is not valid JSON`. Use ONE of these reliable forms:

- **Inline, single-quoted JSON, double quotes inside** — simplest for short payloads. No backslash escaping needed because the outer single quotes make the whole thing a literal string:
  ```powershell
  $SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com --method POST --body '{"key":"value","k2":"v2"}' /api/now/table/incident
  ```
- **Body from JSON file** — safest for anything with spaces, newlines, embedded quotes, or nested structures. Create `payload.json` with the editor/file tools, then pass it with `--body-file` so PowerShell never has to preserve the JSON as one argv token:
  ```powershell
  $SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'
  node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com --method POST --body-file payload.json /api/now/table/incident
  ```
  Avoid `Get-Content -Raw payload.json` + `--body "$b"` — that path re-splits on internal spaces in PS 5.1. Do not use `--%` with PowerShell variables; it prevents variable expansion and can send literal `$payload`.

Do NOT use `cmd /c` workarounds — they have their own quoting issues.

## Bulk write pattern (multi-record writes)
Do not loop PATCH/POST/DELETE inline in a persistent PowerShell session. PS 5.1 buffers stdout from long scripts, and the terminal can fall into the `^U`-prefixed busy state. Externalize to a one-shot Node script under the project's `tmp/` and run it once with `node tmp/<task>.js`. The baseline rule already says: use `node` for large JSON / multi-step work, not PowerShell.

Pattern:

1. GET the target set with `sysparm_fields=sys_id,<state-fields-you-will-overwrite>`.
2. Write `tmp/<task>-before.json` with `{ sys_id, <prior-state> }` per record **before any write** — this is the audit trail and revert key.
3. Dry-run on one record first. Verify the change (and any sync side-effect from business rules) before looping the rest.
4. Loop the remainder, accumulating `{ ok, sys_id, http_status, error? }` per record.
5. Write `tmp/<task>-after.json` with the result array + counts. Print only the summary (totals + any failures) to stdout — do not echo the per-record array.

`sn-rest.js` is a CLI, not a library — no `module.exports`. Call it from the script with `child_process.spawnSync` so token refresh and keychain writeback still happen:

```js
// tmp/<task>.js
const cp = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SN_REST = path.join(os.homedir(), '.agents/skills/sn-rest/sn-rest.js');
const ALIAS = '<alias>';
const INSTANCE = 'https://<instance>.service-now.com';

function sn(method, restPath, body) {
  const args = ['--alias', ALIAS, '--instance', INSTANCE, '--method', method];
  if (body !== undefined) args.push('--body', JSON.stringify(body));
  args.push(restPath);
  const r = cp.spawnSync(process.execPath, [SN_REST, ...args], { encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, http_status: r.status, error: r.stderr || r.stdout };
  try { return { ok: true, data: JSON.parse(r.stdout) }; }
  catch { return { ok: true, raw: r.stdout }; }
}

// 1. GET target set → 2. write before.json → 3. dry-run one → 4. loop → 5. write after.json
```

Stop-and-ask discipline still applies: the Discipline section requires confirmation before a bulk write. Keep `before.json` / `after.json` until the change is confirmed; they are the revert input.

## Common uses
- **List instance apps** (now-sdk has NO list-apps command — this is the way):
  `$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sys_app?sysparm_fields=name,scope,sys_id,version&sysparm_query=ORDERBYname&sysparm_limit=200"`
- **Verify a record landed** after install (read it back by scope + name).
- **Look up sys_ids** to feed `now-sdk move --ids <id...>` or `now-sdk init --from <sys_id>`.

## Resolve / prerequisites
- Runs where `@napi-rs/keyring` resolves, in this order: the skill's own folder, the current working directory's `node_modules` (a now-sdk project dir — incl. `node_modules/@servicenow/sdk/node_modules`), the conventional `%APPDATA%\npm\node_modules` global path, then `npm.cmd root -g` discovery. So: run it from the project dir, or have `@servicenow/sdk` installed globally, or `npm.cmd install @napi-rs/keyring` once in the skill folder. No now-sdk project of its own required.
- `No credentials in keychain` → run the **sn-auth** skill first. Windows Credential Manager is per-Windows-user.

## Discipline
- Treat writes (POST/PUT/PATCH/DELETE) like any instance mutation — confirm scope + target first; stop and ask before a DELETE or bulk write. Never paste a raw token into chat (`--raw` / `--dump` are for local inspection only and should be used only after explicit confirmation or by trusted local helper code).

## Reference docs
- Platform banners (`sys_ux_banner_announcement`) — see `~/.agents/reference/platform-banners.md` for the modern table, "no `active` field", the `end`-in-past dismiss pattern, and the basic-auth restriction property.
- Source-control binding (`sys_repo_config`) — see `~/.agents/reference/servicenow-source-control.md` for the bound-app commit step and the two-call SC detection pattern.
