---
applyTo: "**/now.config.json,**/*.now.ts,**/metadata/**/*.xml"
description: "Compact ServiceNow now-sdk / Fluent fallback baseline for non-agent chats: resolver, explain-first, transformed automation guardrail, build/install verification."
---
# ServiceNow now-sdk Baseline

Fallback rules for non-agent chats that touch now-sdk project files. The **ServiceNow Fluent** custom agent and `sn-*` skills own the detailed workflows; keep this file focused on high-risk defaults.

> Mirror of `~/.copilot/agents/ServiceNow Fluent.agent.md` (the "ServiceNow Fluent" custom mode). Keep the two in lock-step — every edit here that changes a rule, command, or guardrail must be applied to the agent file too.

Tone: terse, imperative, high signal. Print commands before running. Make one coherent change per turn.

## Command Resolver

Assume corporate-locked Windows PowerShell:

- Never call bare `now-sdk`; the `.ps1` and `.cmd` shims may be blocked.
- Use `npm.cmd`, not `npm`, for installs.
- Use OAuth/PKCE; basic auth fails under SSO/MFA.
- Use `node` for gzip/base64/binary/large JSON work; avoid PowerShell/.NET stream APIs.
- Ignore injected `NOW_SDK_BIN` / `SN_REST_BIN`; resolve from `$env:APPDATA` / `$env:USERPROFILE` inline.

Define the resolver on the same PowerShell line as the command:

```powershell
$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>
$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "<path>"
```

Project-local SDK wins. To upgrade, run `npm.cmd install -g "@servicenow/sdk"`; if the project pins `node_modules/@servicenow/sdk`, upgrade inside the project too. Rerun `auth --add` once only after an SDK upgrade that crosses a keychain-library change — that happened once, at 4.3 (keytar → @napi-rs/keyring), and the library has been stable since; ordinary upgrades past 4.3 do NOT need re-auth.

## Terminal Discipline

No probe commands. Do not send `echo`, `Write-Host`, `Write-Output`, `pwd`, `Get-Location`, or bare `Get-ChildItem` merely to wait, poll, or confirm prior state. Sync commands return when complete; async commands notify automatically. Use `get_terminal_output` for running terminals, an empty `send_to_terminal` only for interactive prompts, and `read_file` / `list_dir` / REST for actual verification.

If a command appears prefixed with literal `^U`, the prior terminal was busy. Wait for output or use a fresh terminal; do not kill it or add a leading `#`.

## Authoring Defaults

Before authoring or editing any Fluent record, run `node "$NowSdk" explain <recordtype>-api --format raw`. Use the matching `-guide` only for net-new records or complex composition. Use `explain --list <keyword>` and `--peek --format raw` when the topic name is unclear. Treat explain snippets as shape references; externalize executable logic with `Now.include`.

For hand-authored and generated non-automation `*.now.ts`, `fluent.instructions.md` is canonical: custom parser, no inline functions/control flow/`new`, no `||`/`&&`/`?:`/`+`-concat/spread anywhere in the file (const initializers included — template literals are the only in-file composition), primitive booleans/numbers, `{ label }` choices, matching table exports, `SPPage.pageId`, and no unused consts. Generated `Flow(...)`, `Subflow(...)`, and `Action(...)` files under `src/fluent/generated/automation/flow/` are governed by the Flow and Action Guardrail instead of the hard cleanup rules.

Executable code rules (`src/scripts/**`, `src/ui/**`) live in `scripts.instructions.md`; `Now.include` paths are relative to the `.now.ts` file (depth table in `fluent.instructions.md` → "Per-record recipe" step 2).

For existing instance/XML records, use `transform`; do not hand-write them.

## Flow and Action Guardrail

Before touching or installing any `Flow(...)`, `Subflow(...)`, or `Action(...)`, classify it:

- Transformed / Fluent-locked: under `src/fluent/generated/automation/flow/` or matching `metadata/update/sys_hub_*.xml`. Do not edit-build-install; runtime fixes belong in Flow Designer. Removing source requires explicit confirmation.
- Hand-authored: outside `generated/` and no matching metadata XML. Safe to edit after `explain`.

If transformed flow/action XML not authored this session appears in build output, stop and ask before install. If the user proceeds while keeping transformed automation, pass `--skip-flow-activation`.

## Build, Install, Verify

Build before install. Capture both install output and exit code; non-zero exit or output containing a case-sensitive `[now-sdk] ERROR:` line or `Could not determine app installation status` is failure. On failure, check the instance's Upgrade History before retrying: `install --info --auth <alias>` only prints the Upgrade History URL (a static link — no network call, works regardless of install history, does not verify auth, ignores `-b`); read the actual rows via `sn-rest` on `sys_upgrade_history`. To confirm the alias is alive, use the `sn-rest` health check from the **sn-auth** skill.

`sys_updated_on` is not install proof. Verify by reading content fields and matching a marker from the new version: `script`, `condition`, `template`, `client_script`, `css`, `html`, `value`, `message_html`, or equivalent. For flow/action `values` blobs, inspect the built XML in `target/<app>.zip`, not the live record.

For user-facing artifacts such as Service Portal pages/widgets or other UI-rendered output, browser checks are optional secondary verification only. Use them for smoke validation after content-marker verification, not as the sole proof that install succeeded.

Stop and ask before `install --reinstall`, switching auth alias, installing to an unconfirmed target, deleting source, or removing transformed flow/action files.

## Memory

Use `/memories/repo/` for workspace facts: scope, auth alias, instance URL, source-control binding, verified build/install quirks, cached explain summaries.

## App and Source Control Facts

now-sdk has no list-apps command. A project is one app: `now.config.json` scope plus `package.json` name/version. List instance apps over REST on `sys_app` using `sn-rest`.

now-sdk install does not push to git. If the app is bound to `sys_repo_config`, remind the user after successful install that Studio source control commit is still required.
