---
name: sn-lux-build
description: "Use when building, previewing, deploying or verifying a ServiceNow Lux (AIUX) app in an aiux.json project, or diagnosing 'Could not resolve aiux-sdk/build' or 'aiux-sdk/serve', a page that never hydrates, a 'was not pre-fetched' console error or unexpected delete entries; not for React UI Pages."
argument-hint: "<Lux/AIUX build, deploy, verify or runtime problem>"
compatibility: Windows-native AIUX project with compatible dependencies; authorized OAuth target and browser access for deployed verification.
metadata:
  version: '1'
---
# Lux (AIUX) build and runtime workflow

For scaffolding/authoring, start with [sn-lux](../sn-lux/SKILL.md). Use [sn-build-install](../sn-build-install/SKILL.md) for shared install/auth/Flow guardrails; this skill adds AIUX-specific checks. Do not apply the React UI Page/Vite recipe to an AIUX app.

Read [validation and troubleshooting](references/validation-and-troubleshooting.md) before changing the pipeline. This skill is not permission to deploy, reinstall, modify vendor apps, impersonate users or suppress security controls.

- Do not patch vendor packages as speculative fixes, because that can change behavior beyond the approved application boundary.
- Do not overwrite user preferences while diagnosing a failure, because a troubleshooting task does not authorize changing stored user behavior.

## 1. Establish the actual build state

Read the project manifests, lockfile, scripts, output-directory settings and installed versions. Distinguish:

- scaffold only;
- dependencies installed;
- syntax/mock tests passed;
- real SDK build/lint passed;
- installed content verified;
- live browser behavior verified.

`Could not resolve aiux-sdk/build` (or `aiux-sdk/serve` from the dev server) has two causes; separate them before changing anything. The SDK resolves `@servicenow/aiux` from the SDK's own install location, not from the project, so a global SDK cannot find a project's AIUX package even when it is installed. From the app root:

```powershell
node -e "console.log(require.resolve('@servicenow/aiux/aiux-sdk/build',{paths:[process.cwd()]}))"
Test-Path node_modules\@servicenow\sdk\bin\index.js
```

- First command fails: the project's AIUX dependency is not installed/resolved. Resolve dependencies through an allowed launcher with reviewed versions and lifecycle scripts disabled initially.
- First command prints a path: the dependency is installed and the SDK that ran was not the project's. Do not reinstall dependencies. The build's first line, `Initiating the build process with SDK <version>`, shows which SDK ran. If `Test-Path` is `False`, no project SDK exists and a global one ran: when `package.json` declares `@servicenow/sdk`, install the declared dependencies; when it does not, stop and ask before adding a project SDK pin. If it is `True`, the terminal did not use the project SDK; open the configured terminal profile per the command policy and report the mismatch.

Do not fabricate output, claim missing instance capability, install AIUX globally, or add guessed private fallback packages.

Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md). Print commands before execution. From the app root, after dependencies exist:

```powershell
now-sdk build
```

Read `package.json` scripts for the project's own lint/test checks and run what they run, through Node where the script is a JavaScript CLI (for example `node node_modules/eslint/bin/eslint.js .` for a `lint` script of `eslint .`). Add `--max-warnings=0` only if the project's script or CI does; otherwise report warning counts. Run `node --test` only if the project has test files: with none it exits 0 with `tests 0`, which is "no tests", not "tests passed". A project script that sets an environment variable inline (`PORT=3000 ...`) is POSIX syntax and fails on Windows; run its command directly instead of editing the script.

Read the whole build output, not only the last line. `[metadata]` warnings (for example a page that is global with no `@acl` decorator and therefore reachable without ACL restriction) do not fail the build; report them before any install.

A normal AIUX starter needs neither React/Vite nor a custom prebuild hook: the SDK discovers `aiux.json` and calls the public AIUX builder. Add a hook only for a confirmed customization/compatibility need.

## 2. Inspect output before installing

- Resolve the actual output paths, not a hardcoded demo path: `appOutputDir` in `now.config.json` (SDK default `dist/app`) holds the install categories as folders; the AIUX builder writes its generated JSON records to `dist-metadata/aiux-json` unless `aiux.json` `build.metadataOutputDir` overrides it. Where another skill names `dist/app`, substitute the resolved `appOutputDir`.
- Inspect **all** install category folders under `appOutputDir`, including `author_elective_update` when present, not just `update/`. `now-sdk build` creates no archive; the zip (`target/<name>_<version>.zip`) exists only after the local-only `now-sdk pack` or after an install. To inspect it, run `now-sdk pack`, then `Expand-Archive` it into a temporary folder.
- Compare table/record types and ownership to the user's approved plan. Reject unexpected records, source archives, credentials, development URLs and unapproved `DELETE` instructions. The AIUX starter sets `packageSourceCodeOnInstance: true` in `now.config.json`, so a source archive is produced unless that was set to `false`; it is expected only when source packaging was approved.
- Scan `src/fluent/**` for `sys_hub_flow_*.now.ts` and `sys_hub_action_type_definition_*.now.ts`; apply the shared Flow guardrail. Never silently remove transformed automation.
- Do not automatically clear `deleted: true` registry entries. The registry is the generated keys file (`src/fluent/generated/keys.ts` by default; created by the first build, so absent before it): look for per-key `deleted: true` flags and a top-level `deleted` table-to-ids map. Tombstones can delete real records. Any cleanup requires approval, backup, provenance that the entry is obsolete, and appropriate instance verification; an ACL-filtered empty query alone does not prove absence.
- Check that every generated `asset` value is a portable URL path, not a Windows filesystem path. Against the resolved AIUX JSON directory, this lists files whose `asset` contains a backslash (no output from a directory that does contain `sys_aix_*.json` files means none):
```powershell
Get-ChildItem -Path <aiux-json-dir> -Filter '*.json' | Select-String -Pattern '\\"asset\\":\s*\\"[^"\\]*\\\\' -List | Select-Object -ExpandProperty Path
```
  A hit is handled by the optional [Windows adapter](references/validation-and-troubleshooting.md#windows-asset-404), whose templates are [now.prebuild.mjs](assets/now.prebuild.mjs) and [normalize-aiux-assets.mjs](assets/scripts/normalize-aiux-assets.mjs). Copying them into the app is a project-configuration change that needs approval, and the root hook is active as soon as it is copied.
- Verify server script/action boundaries and actual generated code. If using native gallery cards, verify `required_user_preferences` in the generated `sys_aix_widget`/`sys_aix_page` JSON (see [native gallery prefetch](references/validation-and-troubleshooting.md#native-gallery-prefetch)); do not substitute preference writes.
- Dependency advisories and unsupported engine warnings remain open findings even if compilation succeeds. No forced audit fixes or blanket native rebuilds.

## 3. Preview locally only when asked

The dev server is separate from install and optional. It runs the project's code unsandboxed, binds `0.0.0.0`, and proxies to the instance with the alias's session, so starting it needs the user's go-ahead for that alias. `run` is not listed in `now-sdk --help`; use `now-sdk run --help`.

```powershell
$env:PORT = '3000'
now-sdk run dev --auth <confirmed-alias>
```

The HTTP port comes from the `PORT` environment variable (default 80; HMR on 3101), as read in `@servicenow/aiux` 22.67.1: confirm against the installed version. `$env:PORT` lasts for that terminal session. The server logs an `open → <url>` line; use that URL, not a guessed one. `Could not resolve aiux-sdk/serve` is the section 1 diagnosis. Review dependency risks and native requirements first. Do not open public tunnels/firewall exceptions or add credentials to make it work. A preview result is not deployed-UI evidence.

## 4. Deploy only with explicit approval

Confirm alias, target, custom scope and intended changes. Before the first install to a target, confirm the [sn-lux](../sn-lux/SKILL.md) capability preflight was done for that target; if not, run it or report it as open. Do not touch installed Builder/AI Control Tower apps for a demo. Use existing SDK OAuth; never print/copy tokens or browser cookies. Choose demo-data behavior deliberately: the SDK installs demo data by default.

Run the matching capture pattern from sn-build-install section 2 (normal, or the `--skip-flow-activation` one when the Flow guardrail applies) with one change: add `--demoData=false` unless installing demo data was approved. Its evidence rules and failure modes apply unchanged.

Do not use `--reinstall`. The starter's `deploy` and `deploy:reinstall` package scripts (`now-sdk install`, `now-sdk install --reinstall`) are not approval and are not a shortcut around this section. On non-zero/error output, inspect upgrade history before retrying; partial application is possible. A successful tracked install prints `Rollback (undo installation): <host>/sys_rollback_context.do?sys_id=<id>`: record that URL with the install evidence and do not open or act on it without approval. A failed install prints an execution-tracker URL instead. This is not the App Repository `cicd rollback` in sn-cicd. Follow sn-build-install section 4 for the source-control binding and remind the user about a Studio commit only when bound.

## 5. Verify the deployed UI, not just the build

1. Read back relevant **content fields** through the `sn-rest` skill and match new markers, such as `component` or `required_user_preferences` on `sys_aix_widget` (take table and field names from the generated JSON of the installed AIUX version). Timestamps/IDs alone are not proof. If a content lookup is unavailable, report that limit; do not change ACLs or assume success. An authenticated served-asset body can supply content evidence for the frontend.
2. State the full URL before opening it: the page path comes from `aiux.json` (`basename`, `landing`) and the page's own route; take the instance base path from the install output or the user, not a guess. Open it in the user's normally logged-in browser. Verify the asset response, custom-element registration/hydration, ready content, actual widget RPC and absence of new uncaught application errors.
3. Test the requested interactions and distinguish local filtering from another query. Exercise refresh, empty/error paths and permission behavior where authorized; never change roles or impersonate just to complete a checkbox.
4. Verify visual rendering, keyboard access, narrow-screen reflow and high contrast in a **visible** browser window. A hidden/minimized window, screenshot timeout, unreliable trusted input or zero-width layout is not a pass. A DOM click tests the handler, not physical keyboard/mouse access.
5. Keep browser/network reads bounded. HTTP POST to an AIUX widget may execute a read-only server function; HTTP method alone is not proof of a business-record mutation. Do not claim an instance-wide no-write audit from limited captured traffic.
6. Leave the UI in a sensible state and restore test viewport/filter changes. Separate app errors from platform warnings; report both accurately.

Browser tool unavailable: give the user the exact URL and the checks in steps 2-4 as a short list, record their observations as user-reported, and report the rest as **not tested**; UI acceptance is not established.

Record the installed SDK, `@servicenow/aiux`, Node and package-manager versions with the observed results, in the workspace's available memory facility or existing evidence location, otherwise in the conversation. Partial functional success is not production, security or full accessibility clearance.
