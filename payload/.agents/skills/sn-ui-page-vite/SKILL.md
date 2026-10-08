---
name: sn-ui-page-vite
description: Use when scaffolding or adapting a React UI Page with the official SDK Vite integration (local dev server with hot reload via now-sdk run dev, now.dev.mjs, now.prebuild.mjs, ServiceNow Vite plugins), or deciding whether a one-time target-instance runtime compatibility check is needed. Ordinary JSX, CSS and copy work belongs to sn-react-ui-design.
argument-hint: <new/adapt existing UI Page + endpoint and client entry>
compatibility: ServiceNow Fluent React UI Page project; compatible SDK, Node and Vite dependencies; browser access for runtime verification.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 (bundled `@servicenow/isomorphic-rollup` 1.3.11) with local Vite 8.3 and Vite 6.4 builds and a local dev-server start, and the official sample as of 2026-09-14. No instance install was part of that verification; recheck against the project's own versions.

Use the official SDK Vite pattern for a React UI Page. Source of truth: `https://github.com/ServiceNow/sdk-examples/tree/main/react-ui-page-vite-sample`. When the page uses `@servicenow/react-components`, use `https://github.com/ServiceNow/sdk-examples/tree/main/react-components-vite-sample` instead: it adds `optimizeDeps.exclude: ['@servicenow/react-components']` to the shared Vite config and an authenticated `/amb` WebSocket proxy to `now.dev.mjs`.

Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md).

## Required design companion

For a new page or any user-visible layout, copy or interaction change, load [sn-react-ui-design](../sn-react-ui-design/SKILL.md) before implementation. It owns task-first structure, supported component selection, plain language, state continuity and rendered design acceptance; this skill owns the React UI Page/Vite runtime integration. Reuse an approved design contract for small patches rather than repeating a full concept exercise. Neither skill authorizes deployment or a framework migration merely for styling.

## Preflight

- Choose the path first. The SDK React templates already ship Rollup-based `now.dev.mjs` (watch build) and `now.prebuild.mjs`, with a `dev` script that maps to `now-sdk run dev`. Use the Vite pattern below only when the user asked for Vite/HMR or needs something the sample documents as Vite-only (CSS Modules). Otherwise keep the existing scripts; do not migrate merely to satisfy this skill.
- The SDK's `explain` topics do not document the Vite integration. Support evidence is the `./vite` entry of the project's installed `@servicenow/isomorphic-rollup` (`dist/vite.js`, listed under `exports` in its `package.json`); its `README.md` documents `servicenowVitePlugins` and `createViteProxy`. Do not upgrade the SDK merely to satisfy this skill.
- Read `uipage-api` and `ui-page-guide` with `explain --format raw`. `ui-page-guide` and `ui-page-patterns-guide` describe the default Rollup path: on an approved Vite path the official sample and the `@servicenow/isomorphic-rollup` README supersede only their rules against Vite/build configs, build tools as dependencies and CSS Modules. Everything else in those guides still applies. Keep the project's existing React version rather than changing it to match the guide or the sample.
- Inspect the official sample's `package.json`, `vite.config.mjs`, `now.dev.mjs`, `now.prebuild.mjs`, and UI Page record before adapting it. Its code is authoritative over its `README.md`, which still describes `esbuild: false` and names `servicenowFrontEndPlugins`. Do not invent plugin APIs or copy stale versions blindly. If the sample cannot be retrieved, use the pattern below with the installed package's README and report that the sample was not inspected; a blocked download is not something to work around.
- Adapting an existing project: check for `now.dev.mjs` / `now.prebuild.mjs` and for `scripts.dev` / `scripts.prebuild` in `now.config.json`, which take precedence over the `now.<script>.mjs` files. Replace existing scripts only as part of the approved Vite change and show the diff. `servicenowVitePlugins` has its own options (`ServicenowVitePluginOptions` in the installed package's `dist/vite/plugins.d.ts`: `scope`, `rootDir`, `registerExplicitId`, `enableCacheBusting`, `credential`); do not carry over other options from a Rollup `servicenowFrontEndPlugins` call (for example `editableSourceCodeOnInstance`), and report any option that is dropped.

## Conditional target-runtime compatibility slice

Use local HMR first. A target-instance slice is a **conditional, one-time compatibility gate**, not a required upload for every UI Page or follow-up change. The gate applies to any direct React UI Page, whether it is built by Vite or by the default Rollup scripts.

Run the target slice only when the planned runtime boundary is not already proven, for example:
- The first direct UI Page on an instance/release or the first use of a new hosting pattern.
- A major now-sdk, React, or `@servicenow/react-components` change.
- The first use of a runtime-dependent component family such as `RecordProvider` on that stack.
- A previously cached compatibility result was invalidated by one of those changes.

Skip a separate target slice for CSS/layout work, ordinary logic changes, additional screens on an already validated architecture, or an app using a proven template on the same stack.

When the gate is required:
1. Start with `now-sdk run dev` and validate mounting, component behavior, and authenticated reads locally. HMR requires no production build or upload.
2. Use the **final** UI Page record, endpoint, and client entry; do not create a throwaway page. Keep it minimal: a visible mount marker, one representative runtime-dependent component, and one read-only authenticated request when the planned app uses instance data. Do not perform mutations.
3. Build and install that small slice once with **sn-build-install**, then test the real scoped `.do` endpoint. Confirm the root has rendered children, the marker is visible, the representative read succeeded, and no new uncaught console error occurred.
4. If the slice fails, stop and resolve the runtime architecture before implementing the full UI. If it passes, evolve the same source and record into the finished application.
5. Record the passing result in `docs/ui-runtime-compatibility.md`, resolved against the confirmed project root (or an existing documented project evidence location). Key it by instance/release when known, UI hosting type, now-sdk version, React/component-library versions, and tested component families; include the tested endpoint, date and evidence. Store no credentials or sensitive record data. Reuse it until one of those inputs changes.

The slice adds one small install only when crossing an unvalidated target-runtime boundary. Do not add an upload merely because a UI file changed.

## Required pattern

- UI source stays under `src/client`; the Fluent `UiPage({...})` imports the HTML entry and uses a stable `$id`, a scoped `.do` endpoint, and `direct: true` (required for the imported-HTML React pattern per `ui-page-guide`; the sample sets it). Converting an existing non-direct page changes how it is hosted, so get approval first.
- Add `vite`, `@vitejs/plugin-react` and, if missing, `@servicenow/isomorphic-rollup`, `react` and `react-dom` as explicit versions; this is a dependency change that needs approval and the package-manager launcher from the SDK command policy. Do not copy the sample's `catalog:` or `link:` specifiers; they are pnpm-workspace and machine-local references. Keep an existing `@servicenow/isomorphic-rollup` entry, otherwise use the version installed with the project's SDK. Pick a `@vitejs/plugin-react` major whose `peerDependencies.vite` includes the chosen Vite (plugin-react 6 requires Vite 8), and check the chosen Vite's `engines.node`: Vite 7 and 8 need Node `^20.19.0 || >=22.12.0`, which is stricter than the SDK's own minimum.
- `@servicenow/isomorphic-rollup/vite` loads `rollup` but does not declare it, and Vite 8 no longer installs it. If `node_modules/rollup` is missing after the install (typical when `@servicenow/sdk` is not a project dependency), `now-sdk build` stops with `Cannot find module 'rollup'`; add `rollup` 4.x as a devDependency.
- `now.dev.mjs` uses Vite `createServer`, `servicenowVitePlugins`, and `createViteProxy` with the SDK-provided `credential`, and adds `@vitejs/plugin-react` ahead of the ServiceNow plugins.
- `now.prebuild.mjs` uses Vite `build` and `servicenowVitePlugins`, and passes `registerExplicitId`, which registers the emitted assets with deterministic sys_ids; it is required for the production build and omitted in `now.dev.mjs`.
- Both scripts use the static build directory the SDK packages: `config.staticContent.buildDir` (default `dist/static`). The sample reads the deprecated `config.staticContentDir`, which stays at the default when `staticContent.buildDir` is set, so the bundle is written where the SDK does not look. Use `config.staticContent?.buildDir ?? config.staticContentDir`, and do not add the deprecated key to `now.config.json`.
- Exactly one TypeScript/JSX transformer: ServiceNow's SWC plugin, so disable Vite's built-in one with the option for the installed Vite major. Vite 8 and later: `oxc: false`, in the sample's shared `vite.config.mjs` at the project root that both scripts load with `configFile: path.join(rootDir, 'vite.config.mjs')`. Vite 6/7: `esbuild: false` in that same file instead. The wrong option is not an error: Vite 8 warns that `esbuild: false` "does not have effect any more", and Vite 6 ignores `oxc` silently.
- Do **not** create `vite.config.js/ts` or any Vite config other than that one shared `vite.config.mjs`, and keep it to the transformer switch (plus what the official sample in use adds); the ServiceNow plugins, proxy and output directory live in `now.dev.mjs` and `now.prebuild.mjs`.
- Never package localhost/dev-server URLs, credentials, proxy settings, or relaxed development security into production artifacts.

## Run

The sample's `dev` script maps to `now-sdk run dev`. On locked Windows invoke it directly and provide the confirmed auth alias:

```powershell
now-sdk run dev --auth <alias>
```

`run` is not listed in `now-sdk --help`; `now-sdk run --help` shows it. It runs `scripts.dev` from `now.config.json` if set, otherwise `now.dev.mjs` in the project root, and the first log line `Running script "dev" from <path>` shows which file ran. `No user script for "dev", using built-in default` means the Vite script was not found.

This is a long-running local dev server with HMR that never exits by itself, so run it in its own terminal and do not send other commands to that terminal. Start evidence is the sample's log line `Vite dev server running at http://localhost:<port>`, not an exit status; never report the dev run as completed. The sample requests port 3000 and Vite moves to the next free port when it is in use, so use the URL from the log. The proxy forwards instance API requests with the alias's credential, so actions in the local page reach the real instance; keep local checks read-only unless a write is approved. Stop it normally with Ctrl+C in that terminal.

For production output run normal `now-sdk build`, which invokes `now.prebuild.mjs` (log line `Running script "prebuild" from <path>`). Then search the static build directory and the build XML for development URLs (the paths below are the defaults; substitute the configured `staticContent.buildDir` and `appOutputDir`):

```powershell
Get-ChildItem -Recurse -File dist/static, dist/app/update | Select-String -SimpleMatch -List 'localhost', '127.0.0.1' | Select-Object -ExpandProperty Path
```

No output passes. Review each listed file and stop if a match is a dev-server URL, credential or proxy setting rather than third-party library text.

Use **sn-build-install** for installation and marker verification; it owns the marker read and the browser-check requirement. For a built React page, `sys_ui_page.html` holds only the built HTML entry, so a marker there must come from `src/client/index.html`. Text from TSX is compiled into the bundle record (`sys_ux_lib_asset` named `<scope>/main`, field `content` in the build XML), and CSS ships as a compressed attachment where no marker search works. Confirm the marker in the local build XML before reading the same record and field on the instance. A content marker proves deployment, not runtime behavior. Browser checks remain secondary to marker verification as deployment evidence, but they are required before claiming a user-facing UI is runtime-smoked, working, verified, or complete. Apply the conditional target-runtime slice above only when its compatibility gate is triggered.
