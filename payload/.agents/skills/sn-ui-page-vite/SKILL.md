---
name: sn-ui-page-vite
description: Sets up React UI Pages with Vite, a hot-reload dev server and a runtime compatibility check. Use when adding or adapting that setup; not styling (sn-react-ui-design).
argument-hint: <new/adapt existing UI Page + endpoint and client entry>
compatibility: ServiceNow Fluent React UI Page project; compatible SDK, Node and Vite dependencies; browser access for runtime verification.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 (`@servicenow/isomorphic-rollup` 1.3.11) with Vite 8.3 and 6.4 builds and a dev-server start locally and the official sample as of 2026-09-14; no instance install. Recheck against the project's own versions.

Follow the official sample: `https://github.com/ServiceNow/sdk-examples/tree/main/react-ui-page-vite-sample`. Pages using `@servicenow/react-components` follow `https://github.com/ServiceNow/sdk-examples/tree/main/react-components-vite-sample` instead; it adds `optimizeDeps.exclude: ['@servicenow/react-components']` to the shared Vite config and an authenticated `/amb` WebSocket proxy to `now.dev.mjs`.

Run `now-sdk` directly in the VS Code terminal (PowerShell with now-sdk on Windows; bash with the now-sdk function on Linux) from the confirmed project directory (project `cwd`) per the [SDK command policy](../../reference/sdk-commands.md) and its [bash notes](../../reference/sdk-commands.md#linux-and-vs-code-server-bash).

For a new page or any user-visible layout, copy or interaction change, load [sn-react-ui-design](../sn-react-ui-design/SKILL.md) before implementation; this skill owns only the runtime integration. Neither skill authorizes deployment or a framework migration merely for styling.

## Preflight

- **Choose the path first.** SDK React templates already ship a Rollup `now.dev.mjs` (watch build) and `now.prebuild.mjs`. Use Vite only when the user asked for Vite/HMR or needs something the sample documents as Vite-only (CSS Modules); otherwise keep the existing scripts.
- Support evidence is the `./vite` export of the project's installed `@servicenow/isomorphic-rollup`; its `README.md` documents `servicenowVitePlugins` and `createViteProxy`. `explain` topics do not cover Vite. Do not upgrade the SDK for this skill.
- Read `uipage-api` and `ui-page-guide` with `explain --format raw`. On an approved Vite path the sample and package README override only the guides' rules against Vite/build configs, build tools as dependencies and CSS Modules. Keep the project's React version.
- Inspect the sample's `package.json`, `vite.config.mjs`, `now.dev.mjs`, `now.prebuild.mjs` and UI Page record before adapting; its code beats its stale README. Do not invent plugin APIs or copy versions blindly. If the sample cannot be retrieved, use the pattern below with the package README, report that the sample was not inspected, and do not work around the block.
- Existing project: check `now.dev.mjs` / `now.prebuild.mjs` and `scripts.dev` / `scripts.prebuild` in `now.config.json` (these take precedence). Replace scripts only within the approved Vite change and show the diff. Pass only `ServicenowVitePluginOptions` (`scope`, `rootDir`, `registerExplicitId`, `enableCacheBusting`, `credential`); report any dropped Rollup option (e.g. `editableSourceCodeOnInstance`).

Read [troubleshooting](references/troubleshooting.md) when the sample and README disagree, the wrong dev script runs, Vite warns about the transformer, the bundle lands in the wrong directory, or a plugin option or dependency choice is unclear.

## Conditional target-runtime compatibility slice

A one-time gate for any direct React UI Page (Vite or default Rollup), not an upload per change. Run it only when the runtime boundary is unproven:
- First direct UI Page on an instance/release, or a new hosting pattern.
- Major now-sdk, React or `@servicenow/react-components` change.
- First use of a runtime-dependent component family such as `RecordProvider` on that stack.
- Cached evidence invalidated by one of those.

Skip it for CSS/layout, ordinary logic, more screens on a validated architecture, or a proven template on the same stack.

1. Validate mounting, components and authenticated reads locally with `now-sdk run dev`.
2. Use the **final** UI Page record, endpoint and client entry, not a throwaway page: a visible mount marker, one representative runtime-dependent component, one read-only authenticated request if the app reads instance data. No mutations.
3. Install it once via **sn-build-install**; on the real scoped `.do` endpoint confirm rendered root children, visible marker, successful read and no new uncaught console error.
4. Fail: stop and resolve the runtime architecture before the full UI. Pass: evolve the same source and record.
5. Record the pass in `docs/ui-runtime-compatibility.md` under the confirmed project root (or an existing evidence location), keyed by instance/release (when known), hosting type, now-sdk, React/component-library versions and component families, with endpoint, date and evidence; no credentials or sensitive data. Reuse it until an input changes.

## Required pattern

- UI source under `src/client`. The Fluent `UiPage({...})` imports the HTML entry with a stable `$id`, a scoped `.do` endpoint and `direct: true`. Converting an existing non-direct page changes its hosting; get approval first.
- Adding `vite`, `@vitejs/plugin-react` and, if missing, `@servicenow/isomorphic-rollup`, `react` and `react-dom` needs approval and the command policy's package-manager launcher. Use explicit versions, not the sample's `catalog:`/`link:` specifiers. Keep an existing `@servicenow/isomorphic-rollup`, else the version installed with the project's SDK. Pick a `@vitejs/plugin-react` major whose `peerDependencies.vite` includes the chosen Vite (plugin-react 6 requires Vite 8). Check the chosen Vite's `engines.node` (Vite 7 and 8: Node `^20.19.0 || >=22.12.0`).
- `@servicenow/isomorphic-rollup/vite` loads `rollup` undeclared and Vite 8 no longer installs it. If `node_modules/rollup` is missing after install, `now-sdk build` stops with `Cannot find module 'rollup'`; add `rollup` 4.x as a devDependency.
- `now.dev.mjs`: Vite `createServer`, `@vitejs/plugin-react` ahead of `servicenowVitePlugins`, `createViteProxy` with the SDK-provided `credential`.
- `now.prebuild.mjs`: Vite `build`, `servicenowVitePlugins` with `registerExplicitId` (deterministic asset sys_ids; omit it in `now.dev.mjs`).
- Both write to `config.staticContent?.buildDir ?? config.staticContentDir` (default `dist/static`); never add the deprecated `staticContentDir` to `now.config.json`.
- One TypeScript/JSX transformer, ServiceNow's SWC plugin: disable Vite's own in the shared root `vite.config.mjs`, loaded by both scripts with `configFile: path.join(rootDir, 'vite.config.mjs')`. Vite 8 and later: `oxc: false`. Vite 6/7: `esbuild: false`.
- Do **not** create `vite.config.js/ts` or any other Vite config. `vite.config.mjs` holds only the transformer switch plus what the sample in use adds.
- Never package localhost/dev-server URLs, credentials, proxy settings or relaxed development security.

## Run

On locked Windows invoke the `dev` script directly with the confirmed auth alias:

```powershell
now-sdk run dev --auth <alias>
```

bash (Linux, VS Code server):

```bash
now-sdk run dev --auth <alias>
```

`run` is missing from `now-sdk --help`; `now-sdk run --help` shows it. The first log line `Running script "dev" from <path>` names the script that ran; `No user script for "dev", using built-in default` means the Vite script was not found.

It does not exit by itself: give it its own terminal, send that terminal nothing else, stop it with Ctrl+C. Start evidence is the log line `Vite dev server running at http://localhost:<port>` (use that URL), not an exit status; never report the dev run as completed. On a remote server that URL is server-local: forward the port (VS Code Ports view, `ssh -L`); do not set Vite's host to `0.0.0.0` without approval. The proxy uses the alias's credential, so the page hits the real instance; stay read-only unless a write is approved.

For production run `now-sdk build` (it invokes `now.prebuild.mjs`; log `Running script "prebuild" from <path>`), then search the static build directory and build XML for development URLs (defaults shown; substitute the configured `staticContent.buildDir` and `appOutputDir`):

```powershell
Get-ChildItem -Recurse -File dist/static, dist/app/update | Select-String -SimpleMatch -List 'localhost', '127.0.0.1' | Select-Object -ExpandProperty Path
```

bash (Linux, VS Code server):

```bash
grep -rlF -e localhost -e 127.0.0.1 dist/static dist/app/update; echo "exit=$?"
```

No output passes (in bash `exit=1`; `exit=2` is an error, not a pass). Review each listed file; stop if a match is a dev-server URL, credential or proxy setting rather than third-party library text.

## Install and verify

Install and verify markers with **sn-build-install**. In a built React page:
- `sys_ui_page.html` holds only the built HTML entry; a marker there must come from `src/client/index.html`.
- TSX text lands in `sys_ux_lib_asset` named `<scope>/main`, field `content` in the build XML. CSS ships as a compressed attachment; markers there cannot be searched.
- Confirm the marker in the local build XML before reading the same record and field on the instance.

A marker proves deployment, not runtime. Browser checks are required before calling a user-facing UI runtime-smoked, working, verified or complete.
