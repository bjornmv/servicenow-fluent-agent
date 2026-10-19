---
name: sn-lux-build
description: Builds, previews, deploys and verifies Lux (AIUX) apps. Use when building or debugging one, or proving a deployed page renders; not page authoring (sn-lux).
argument-hint: "<Lux/AIUX build, deploy, verify or runtime problem>"
compatibility: AIUX project on Windows (PowerShell) or Linux (bash) with compatible dependencies; authorized OAuth target and browser access for deployed verification.
metadata:
  version: '1'
---
# Lux (AIUX) build and runtime workflow

For scaffolding/authoring, start with [sn-lux](../sn-lux/SKILL.md). [sn-build-install](../sn-build-install/SKILL.md) owns the shared install/auth/Flow guardrails. Do not apply the React UI Page/Vite recipe to an AIUX app. Read [validation and troubleshooting](references/validation-and-troubleshooting.md) before changing the pipeline.

This skill is not permission to deploy, reinstall, modify vendor apps, impersonate users or suppress security controls.

- Do not patch vendor packages as speculative fixes; that can change behaviour beyond the approved application boundary.
- Do not overwrite user preferences while diagnosing a failure; troubleshooting does not authorize changing stored user behaviour.

## 1. Establish the actual build state

Read the manifests, lockfile, scripts, output settings and installed versions. Report the stage reached: scaffold only; dependencies installed; syntax/mock tests passed; real SDK build/lint passed; installed content verified; live browser behaviour verified.

`Could not resolve aiux-sdk/build` (or `aiux-sdk/serve`) has two causes: a missing project AIUX dependency, or a global SDK running instead of the project's. Separate them with the [resolve diagnosis](references/validation-and-troubleshooting.md#could-not-resolve-aiux-sdk) before changing anything. Do not fabricate output, claim missing instance capability, install AIUX globally, or add guessed private fallback packages.

Use `now-sdk` directly in the VS Code terminal (PowerShell with now-sdk on Windows; bash with the now-sdk function on Linux) from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md) and its [bash notes](../../reference/sdk-commands.md#linux-and-vs-code-server-bash). Print commands before execution. From the app root, after dependencies exist:

```powershell
now-sdk build
```

bash (Linux, VS Code server):

```bash
now-sdk build
```

- Read the whole build output. `[metadata]` warnings (for example a global page with no `@acl` decorator, reachable without ACL restriction) do not fail the build; report them before any install.
- Run the lint/test checks the project's `package.json` scripts define, through Node where the script is a JavaScript CLI (for example `node node_modules/eslint/bin/eslint.js .` for `eslint .`). Add `--max-warnings=0` only if the project's script or CI does; otherwise report warning counts. Run `node --test` only if test files exist; with none it exits 0 with `tests 0`: "no tests", not "tests passed". Run an inline-environment script (`PORT=3000 ...`, POSIX syntax that fails on Windows) as its command directly; do not edit the script. In bash it runs as written.
- A normal AIUX starter needs neither React/Vite nor a custom prebuild hook; add one only for a confirmed customization/compatibility need.

## 2. Inspect output before installing

Read [output inspection](references/validation-and-troubleshooting.md#output-inspection) for output paths, the zip and the keys-file (tombstone) format.

- Inspect **all** install category folders under `appOutputDir` (default `dist/app`), including `author_elective_update`, and the AIUX JSON records (`dist-metadata/aiux-json` by default).
- Compare record types and ownership with the approved plan. Reject unexpected records, credentials, development URLs, unapproved `DELETE` instructions, and a source archive unless source packaging was approved.
- Scan `src/fluent/**` for `sys_hub_flow_*.now.ts` and `sys_hub_action_type_definition_*.now.ts`; apply the shared Flow guardrail. Never silently remove transformed automation.
- Do not automatically clear `deleted: true` registry entries in the generated keys file. Tombstones can delete real records; cleanup requires approval, backup, provenance that the entry is obsolete, and instance verification.
- Check that every generated `asset` value is a portable URL path. This lists files whose `asset` contains a backslash (no output from a directory that does contain `sys_aix_*.json` files means none):
```powershell
Get-ChildItem -Path <aiux-json-dir> -Filter '*.json' | Select-String -Pattern '\\"asset\\":\s*\\"[^"\\]*\\\\' -List | Select-Object -ExpandProperty Path
```
  bash (Linux, VS Code server):
```bash
grep -lE '\\"asset\\":[[:space:]]*\\"[^"\\]*\\\\' <aiux-json-dir>/*.json; echo "exit=$?"
```
  In bash, `exit=1` means no hits; `exit=2` is an error, not a clean result. On a hit, read the [Windows adapter](references/validation-and-troubleshooting.md#windows-asset-404) (templates [now.prebuild.mjs](assets/now.prebuild.mjs) and [normalize-aiux-assets.mjs](assets/scripts/normalize-aiux-assets.mjs)). Copying them into the app needs approval; the root hook is active as soon as it is copied.
- Verify server script/action boundaries in the generated code. With native gallery cards, verify `required_user_preferences` in the generated `sys_aix_widget`/`sys_aix_page` JSON ([native gallery prefetch](references/validation-and-troubleshooting.md#native-gallery-prefetch)); do not substitute preference writes.
- Dependency advisories and unsupported-engine warnings stay open findings even when compilation succeeds. No forced audit fixes or blanket native rebuilds.

## 3. Preview locally only when asked

The dev server runs project code unsandboxed, binds `0.0.0.0` and proxies to the instance with the alias's session, so starting it needs the user's go-ahead for that alias. On a shared or remote server, `0.0.0.0` also exposes it to that network; say so first. Read [local preview](references/validation-and-troubleshooting.md#local-preview) first.

```powershell
$env:PORT = '3000'
now-sdk run dev --auth <confirmed-alias>
```

bash (Linux, VS Code server):

```bash
export PORT=3000
now-sdk run dev --auth <confirmed-alias>
```

Remote server (VS Code server, SSH): the logged URL is server-local; the user's browser needs the HTTP port and HMR port 3101 forwarded (VS Code Ports view, `ssh -L`), or the user reports the check.

Do not open public tunnels/firewall exceptions or add credentials. A preview is not deployed-UI evidence.

## 4. Deploy only with explicit approval

- Confirm alias, target, custom scope and intended changes. Before the first install to a target, confirm the [sn-lux](../sn-lux/SKILL.md) capability preflight and [scope/route collision check](../sn-lux/references/preflight.md#scope-and-route-collisions) were done for it; otherwise run them or report them open. Do not touch installed Builder/AI Control Tower apps for a demo. Use existing SDK OAuth; never print/copy tokens or browser cookies.
- Run the matching capture pattern from sn-build-install section 2 (normal, or the `--skip-flow-activation` one when the Flow guardrail applies), adding `--demoData=false` unless demo data was approved (the SDK installs it by default). Its evidence rules and failure modes apply unchanged.
- Do not use `--reinstall`. The starter's `deploy` and `deploy:reinstall` scripts (`now-sdk install`, `now-sdk install --reinstall`) are not approval or a shortcut around this section.
- On non-zero/error output (a failed install prints an execution-tracker URL), inspect upgrade history before retrying; partial application is possible.
- Record the printed `Rollback (undo installation): <host>/sys_rollback_context.do?sys_id=<id>` URL with the install evidence; do not open or act on it without approval. It is not the App Repository `cicd rollback` in sn-cicd.
- Follow sn-build-install section 4 for the source-control binding; remind the user about a Studio commit only when bound.

## 5. Verify the deployed UI, not just the build

1. Read back **content fields** through `sn-rest` and match new markers, such as `component` or `required_user_preferences` on `sys_aix_widget` (names from the generated JSON). Timestamps/IDs are not proof. If content is unreadable, report that limit; do not change ACLs or assume success. An authenticated served-asset body can supply frontend evidence.
2. State the full URL before opening it: path from `aiux.json` (`basename`, `landing`) plus the page's route; instance base from the install output or the user, not a guess. In the user's normally logged-in browser, verify the asset response, custom-element registration/hydration, ready content, actual widget RPC and no new uncaught application errors.
3. Test the requested interactions, distinguishing local filtering from a new query, plus refresh, empty/error and permission paths where authorized. Never change roles or impersonate to complete a check.
4. Check visual rendering, keyboard access, narrow-screen reflow and high contrast in a **visible** window. A hidden/minimized window, screenshot timeout, unreliable trusted input or zero-width layout is not a pass; a DOM click tests the handler, not physical input. A headless agent browser on a server cannot pass these: record them as user-observed or **not tested**.
5. Keep browser/network reads bounded. An HTTP POST to an AIUX widget may run a read-only server function, so it is not proof of a record write; never claim an instance-wide no-write audit from limited traffic. Read [UI verification limits](references/validation-and-troubleshooting.md#tombstones-and-ui-verification) when a record or the rendered UI cannot be verified directly. Leave the UI in a sensible state; restore test viewport/filter changes. Report app errors and platform warnings separately.

Browser tool unavailable: give the user the exact URL and the checks in steps 2-4, record their observations as user-reported, and report the rest as **not tested**; UI acceptance is not established.

Record installed SDK, `@servicenow/aiux`, Node and package-manager versions with the results in the workspace memory/evidence location, otherwise the conversation. Partial functional success is not production, security or full accessibility clearance.
