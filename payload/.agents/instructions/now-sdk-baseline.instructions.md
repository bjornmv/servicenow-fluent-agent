---
applyTo: "**/now.config.json,**/aiux.json,**/*.now.ts,**/metadata/**/*.xml"
description: "Compact ServiceNow now-sdk / Fluent fallback baseline for non-agent chats: SDK commands, explain-first, Lux/AIUX routing, transformed automation guardrail, build/install verification."
---
# ServiceNow now-sdk Baseline

Fallback rules for non-agent chats that touch now-sdk project files. The **ServiceNow Fluent** custom agent and `sn-*` skills own the detailed workflows; keep this file focused on high-risk defaults.

> Mirror of `~/.copilot/agents/ServiceNow Fluent.agent.md` (the "ServiceNow Fluent" custom mode). Keep the two in lock-step — every edit here that changes a rule, command, or guardrail must be applied to the agent file too.

Tone: terse, imperative, high signal. Print commands before running. Make one coherent change per turn.

## SDK and REST Commands

Use the canonical [SDK command policy](../reference/sdk-commands.md); do not duplicate resolver scripts in skills.

- In VS Code's **PowerShell with now-sdk** terminal, run `now-sdk <command>` directly. In Pi, use the `now_sdk` tool with an argument array and project `cwd`. Use the documented permitted fallback only when the function is unavailable, never to bypass a refusal.
- For a simple command check, run the requested command without subagents, auth probes, recursive searches or installs. A launcher/terminal error makes the result inconclusive.
- Respect the project's SDK version, engine requirements, package manager and lockfile. Package-manager JavaScript CLIs through Node are allowed when permitted; no CMD, batch shims or policy bypass. Do not upgrade tools automatically.
- Use OAuth/PKCE; basic auth fails under SSO/MFA.
- Use `node` for gzip/base64/binary/large JSON work; avoid PowerShell/.NET stream APIs.
- Resolve `sn-rest` from `$env:USERPROFILE`; do not trust injected `SN_REST_BIN`.

REST helper:

```powershell
$SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "<path>"
```

Project-local SDK wins. Upgrade `@servicenow/sdk` only when requested/approved, using the permitted project package-manager launcher and agreed version; a global upgrade does not update the project's SDK pin. Rerun `auth --add` once only after an SDK upgrade that crosses a keychain-library change — that happened once, at 4.3 (keytar → @napi-rs/keyring), and the library has been stable since; ordinary upgrades past 4.3 do NOT need re-auth.

## Connection Evidence

Keep these states separate:

- `now.config.json` and repository memory identify a configured target instance; this does not prove authentication.
- `auth --list` inventories profiles visible to the exact SDK process. Use it only while troubleshooting an explicitly requested SDK auth issue. Do not run it as a default project probe and do not infer that an instance or alias is absent from blank output.
- A successful, read-only `sn-rest` request using a user-confirmed alias and instance proves a usable connection. Only this permits claims such as "connected", "authenticated", or "not connected".

Before relying on output from any SDK command, confirm that the SDK command completed without shell, terminal-integration, or command-not-found errors. Any such error makes the result inconclusive. When asked whether an instance is connected, report the configured target first and offer the read-only health check; do not inspect Windows Credential Manager.

## Terminal Discipline

No probe commands. Do not send `echo`, `Write-Host`, `Write-Output`, `pwd`, `Get-Location`, or bare `Get-ChildItem` merely to wait, poll, or confirm prior state. Sync commands return when complete; async commands notify automatically. Use `get_terminal_output` for running terminals, an empty `send_to_terminal` only for interactive prompts, and `read_file` / `list_dir` / REST for actual verification.

If a command appears prefixed with literal `^U`, the prior terminal was busy. Wait for output or use a fresh terminal; do not kill it or add a leading `#`.

## Authoring Defaults

Before authoring or editing any Fluent record, run `now-sdk explain <recordtype>-api --format raw`. Use the matching `-guide` only for net-new records or complex composition. Use `explain --list <keyword>` and `--peek --format raw` when the topic name is unclear. Treat explain snippets as authoritative shape references.

Classify before cleanup. Ordinary record script fields externalize executable logic, usually with `Now.include`. Documented SDK builder callbacks are different: ATF `Test(...)`, hand-authored `Flow(...)`/`Subflow(...)`/`Action(...)`, `PlaybookDefinition(...)`, and `wfa.playbook.*` callbacks remain in `.now.ts`. Do not "fix" them into includes. `GraphQLApi(...)` resolver scripts use named imported server functions (preferred) or `Now.include`; inline resolver functions are invalid. `TestSuite(...)` and `GraphQLApi(...)` are direct calls, never `new` expressions.

Follow `fluent.instructions.md` for the exact ordinary-record rules and documented DSL exceptions. Generated `Flow(...)`, `Subflow(...)`, and `Action(...)` under `src/fluent/generated/automation/flow/` remain governed by the Flow and Action Guardrail.

Executable code rules (`src/scripts/**`, `src/server/**`, `src/ui/**`) live in `scripts.instructions.md`; `Now.include` paths are relative to the `.now.ts` file (depth table in `fluent.instructions.md`).

For existing instance/XML records, use `transform`; do not hand-write them.

## now-sdk 4.11 Workflows

- Query: require an encoded query and bounded `--limit`; pass `--fields` and normally `--no-count`. `--select "records[0].sys_id" --output raw` extracts an unquoted value. `--select` selects from the output envelope; it does not replace `--fields`.
- Transform: `--force` is valid only with `--table` and permits a descendant table without its parent hierarchy. It is not an overwrite flag. Explain the missing-parent risk and get confirmation before using it.
- Build: normal v4 choice handling is additive (`sys_choice_v2`). `--legacyChoices` restores v3 destructive `sys_choice_set` behavior; never use it as a generic build fix and confirm before use.
- CI/CD: `cicd test/testsuite` runs ATF; `cicd publish/install/rollback` mutates App Repo or target instances. Use `sn-cicd`; confirm target, app sys_id/scope, version, and approvals. Do not use local `now-sdk install` as a production promotion path.
- Vite/HMR: only adapt the official `ServiceNow/sdk-examples` `react-ui-page-vite-sample`. It uses `now.dev.mjs`/`now.prebuild.mjs`, `@servicenow/isomorphic-rollup/vite`, `configFile: false`, and `now-sdk run dev`; do not invent `vite.config.*` or package development-server URLs into production artifacts. Use HMR first. Run a small target-instance compatibility slice only when crossing an unvalidated runtime boundary (new instance/release or hosting pattern, major SDK/UI dependency change, or first use of a runtime-dependent component family). Use the final page/endpoint, make one read-only representative check, cache a passing stack under `/memories/repo/`, and skip the extra upload for routine changes on that validated architecture.
- Typed records: field styles use `Record({ table: 'sys_ui_style', ... })`; schedule entries use the typed `cmn_schedule_span` target. Never bypass SDK typing with `any` or unsafe casts.

## Lux / AIUX Workflows

For Lux, AIUX, AI-UX or AI Experience UI requests, use `sn-lux` for setup/scaffolding/authoring and `sn-lux-build` for builds, deployment and runtime diagnosis. `aiux.json` identifies an AIUX pipeline; in mixed repositories confirm the requested surface before routing. This routing takes precedence over the generic new-app/UI workflow for actual Lux/AIUX surfaces. Official `aiux-build`, component discovery and accessibility guidance stay project-local; report missing packs and use the skill's approved dependency handoff rather than inventing APIs.

Before Lux UI planning, implementation or review, follow `sn-lux/references/official-skills.md`: resolve `ui-discovery` (older-pack fallback only if present), read the selected API references, and load task-matched Horizon compositions, patterns, component sheets and motion guidance. Installing or listing a pack is not consultation. Record the reference-informed decisions and gaps; keep small fixes narrow and preserve approval/runtime-verification gates.

Lux is the product-facing name; **AIUX** is the technical spelling. Preserve `@servicenow/aiux`, `@servicenow/agent-pack-aiux`, `aiux.json`, `AIUXElement` and `javascript.aiux*` identifiers. `now-sdk explain` covers Fluent topics, not the full Lux framework; load the matching official packs for UI guidance.

Lux/AIUX is Lit-based, not the React UI Page/Vite recipe. Its regular JS/decorators and external widget server functions are not `.now.ts` DSL; Fluent backend records retain Fluent rules. Keep source/dependencies/build/install/browser results separate. Respect lockfiles, engine requirements, lifecycle-script review and unresolved advisories.

Lux/AIUX deployment requires explicit approval. Inspect every install category for unexpected records/deletions, validate URL-valued asset paths and required-prefetch metadata, then verify deployed content and real hydration/RPC. Apply optional compatibility templates only to a confirmed issue; do not patch vendor packages, clear tombstones automatically, or force preference values. Hidden-window or incomplete mobile/keyboard checks are not passes.

## Flow and Action Guardrail

Before touching or installing any `Flow(...)`, `Subflow(...)`, or `Action(...)`, classify it:

- Transformed / Fluent-locked: under `src/fluent/generated/automation/flow/` or matching `metadata/update/sys_hub_*.xml`. Do not edit-build-install; runtime fixes belong in Flow Designer. Removing source requires explicit confirmation.
- Hand-authored: outside `generated/` and no matching metadata XML. Safe to edit after `explain`.

If transformed flow/action XML not authored this session appears in build output, stop and ask before install. If the user proceeds while keeping transformed automation, pass `--skip-flow-activation`.

## Build, Install, Verify

Build before install. Capture both install output and exit code; non-zero exit or output containing a case-sensitive `[now-sdk] ERROR:` line or `Could not determine app installation status` is failure. On failure, check the instance's Upgrade History before retrying: `install --info --auth <alias>` only prints the Upgrade History URL (a static link — no network call, works regardless of install history, does not verify auth, ignores `-b`); read the actual rows via `sn-rest` on `sys_upgrade_history`. To confirm the alias is alive, use the `sn-rest` health check from the **sn-auth** skill.

`sys_updated_on` is not install proof. Verify by reading content fields and matching a marker from the new version: `script`, `condition`, `template`, `client_script`, `css`, `html`, `value`, `message_html`, or equivalent. For flow/action `values` blobs, inspect the built XML in `target/<app>.zip`, not the live record.

For user-facing artifacts such as Service Portal pages/widgets or other UI-rendered output, browser checks do not replace content-marker verification and are not proof that install succeeded. They are nevertheless required before claiming the deployed UI is runtime-smoked, working, verified, or complete: confirm it mounted, ready content appeared, required reads succeeded, and no new uncaught console error occurred. Apply the Vite target-runtime slice conditionally as described above; do not add a target upload for every UI change.

Stop and ask before `install --reinstall`, `build --legacyChoices`, `transform --force`, switching auth alias, installing or running ATF on an unconfirmed target, any `cicd publish/install/rollback`, deleting source, or removing transformed flow/action files.

## Memory

Use `/memories/repo/` for workspace facts: scope, auth alias, instance URL, source-control binding, verified build/install quirks, cached explain summaries.

## App and Source Control Facts

now-sdk has no list-apps command. A project is one app: `now.config.json` scope plus `package.json` name/version. List instance apps over REST on `sys_app` using `sn-rest`.

now-sdk install does not push to git. If the app is bound to `sys_repo_config`, remind the user after successful install that Studio source control commit is still required.
