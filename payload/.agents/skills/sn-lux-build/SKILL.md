---
name: sn-lux-build
description: "Build, deploy, verify and troubleshoot ServiceNow Lux (AIUX / AI-UX) apps on Windows. Use for the AIUX pipeline in aiux.json projects: dependency setup, asset URLs, gallery prefetch, full-payload deletion checks, OAuth-safe deployment and live browser verification."
argument-hint: "<Lux/AIUX build, deploy, verify or runtime problem>"
---
# Lux (AIUX) build and runtime workflow

For scaffolding/authoring, start with [sn-lux](../sn-lux/SKILL.md). Use [sn-build-install](../sn-build-install/SKILL.md) for shared install/auth/Flow guardrails; this skill adds AIUX-specific checks. Lux is the product-facing name; retain the upstream AIUX package, config, API and official skill names. Do not apply the React UI Page/Vite recipe to an AIUX app.

Read [validation and troubleshooting](references/validation-and-troubleshooting.md) before changing the pipeline. This skill is not permission to deploy, reinstall, modify vendor apps, impersonate users or suppress security controls.

## 1. Establish the actual build state

Read the project manifests, lockfile, scripts, output-directory settings and installed versions. Distinguish:

- scaffold only;
- dependencies installed;
- syntax/mock tests passed;
- real SDK build/lint passed;
- installed content verified;
- live browser behavior verified.

`Could not resolve aiux-sdk/build` normally means the declared project AIUX dependency has not been installed/resolved. Do not fabricate output, claim missing instance capability, or add guessed private fallback packages. Resolve dependencies through an allowed launcher with reviewed versions and lifecycle scripts disabled initially.

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md). Print commands before execution. From the app root, after dependencies exist:

```powershell
now-sdk build
node node_modules/eslint/bin/eslint.js . --max-warnings=0
node --test
```

Use project scripts when they add required checks. A normal AIUX starter needs neither React/Vite nor a custom prebuild hook: the SDK discovers `aiux.json` and calls the public AIUX builder. Add a hook only for a confirmed customization/compatibility need.

## 2. Inspect output before installing

- Resolve the actual `appOutputDir` and generated AIUX metadata directory from configuration, not a hardcoded demo path.
- Inspect **all** install categories and the final archive when available, including `author_elective_update`, not just `update/`.
- Compare table/record types and ownership to the user's approved plan. Reject unexpected records, source archives, credentials, development URLs and unapproved `DELETE` instructions.
- Scan `src/fluent/**` for `sys_hub_flow_*.now.ts` and `sys_hub_action_type_definition_*.now.ts`; apply the shared Flow guardrail. Never silently remove transformed automation.
- Do not automatically clear `deleted: true` registry entries. Tombstones can delete real records. Any cleanup requires approval, backup, provenance that the entry is obsolete, and appropriate instance verification; an ACL-filtered empty query alone does not prove absence.
- Check generated page/widget assets are portable URL paths, not Windows filesystem paths. See the optional [Windows adapter](references/validation-and-troubleshooting.md#windows-asset-404).
- Verify server script/action boundaries and actual generated code. If using native gallery cards, verify required preference prefetch metadata; do not substitute preference writes.
- Dependency advisories and unsupported engine warnings remain open findings even if compilation succeeds. No forced audit fixes or blanket native rebuilds.

## 3. Deploy only with explicit approval

Confirm alias, target, custom scope and intended changes. Do not touch installed Builder/AI Control Tower apps for a demo. Use existing SDK OAuth; never print/copy tokens or browser cookies. Choose demo-data behavior deliberately.

```powershell
now-sdk install --auth <confirmed-alias> --demoData=false
```

Capture output and exit code. Do not use `--reinstall`. On non-zero/error output, inspect upgrade history before retrying; partial application is possible. Record the SDK rollback context for recovery, but do not invoke rollback without approval. Check/cache source-control binding and remind the user about a Studio commit only when bound.

## 4. Verify the deployed UI, not just the build

1. Read back relevant **content fields** and match new markers, such as widget `script` or required-prefetch metadata. Timestamps/IDs alone are not proof. If a content lookup is unavailable, report that limit; do not change ACLs or assume success. An authenticated served-asset body can supply content evidence for the frontend.
2. Open the final route in the user's normally logged-in browser. Verify the asset response, custom-element registration/hydration, ready content, actual widget RPC and absence of new uncaught application errors.
3. Test the requested interactions and distinguish local filtering from another query. Exercise refresh, empty/error paths and permission behavior where authorized; never change roles or impersonate just to complete a checkbox.
4. Verify visual rendering, keyboard access, narrow-screen reflow and high contrast in a **visible** browser window. A hidden/minimized window, screenshot timeout, unreliable trusted input or zero-width layout is not a pass. A DOM click tests the handler, not physical keyboard/mouse access.
5. Keep browser/network reads bounded. HTTP POST to an AIUX widget may execute a read-only server function; HTTP method alone is not proof of a business-record mutation. Do not claim an instance-wide no-write audit from limited captured traffic.
6. Leave the UI in a sensible state and restore test viewport/filter changes. Separate app errors from platform warnings; report both accurately.

The public dev server can bind `0.0.0.0` (observed HTTP 80/HMR 3101). Review version-specific networking, dependency risks and any native requirements before starting preview. Do not open public tunnels/firewall exceptions or add credentials to make it work.

Cache the actual version tuple and observed results. Partial functional success is not production, security or full accessibility clearance.
