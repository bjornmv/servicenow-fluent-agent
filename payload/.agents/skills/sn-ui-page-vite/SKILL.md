---
name: sn-ui-page-vite
description: Build a now-sdk 4.11 React UI Page with the official Vite/HMR integration using now.dev.mjs, now.prebuild.mjs, and ServiceNow Vite plugins.
argument-hint: <new/adapt existing UI Page + endpoint and client entry>
---
Use the official SDK 4.11 Vite pattern for a React UI Page. Source of truth: `https://github.com/ServiceNow/sdk-examples/tree/main/react-ui-page-vite-sample`.

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

## Required design companion

For a new page or any user-visible layout, copy or interaction change, load [sn-react-ui-design](../sn-react-ui-design/SKILL.md) before implementation. It owns task-first structure, supported component selection, plain language, state continuity and rendered design acceptance; this skill owns the React UI Page/Vite runtime integration. Reuse an approved design contract for small patches rather than repeating a full concept exercise. Neither skill authorizes deployment or a framework migration merely for styling.

## Preflight

- Require Node `>=20.18.0` and now-sdk `>=4.11.0`.
- Read `uipage-api` and `ui-page-guide` with `explain --format raw`.
- Inspect the official sample's `README.md`, `package.json`, `now.dev.mjs`, `now.prebuild.mjs`, and UI Page record before adapting it. Do not invent plugin APIs or copy stale versions blindly.

## Conditional target-runtime compatibility slice

Use local HMR first. A target-instance slice is a **conditional, one-time compatibility gate**, not a required upload for every UI Page or follow-up change.

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
5. Record the passing result in `docs/ui-runtime-compatibility.md`, resolved against the confirmed project root (or an existing documented project evidence location). Key it by instance/release when known, UI hosting type, now-sdk version, React/component-library versions, and tested component families; include the tested endpoint, date and evidence. Store no credentials or sensitive record data. Reuse it until one of those inputs changes. Do not assume an undefined `/memories/repo/` facility exists on Windows.

The slice adds one small install only when crossing an unvalidated target-runtime boundary. Do not add an upload merely because a UI file changed.

## Required pattern

- UI source stays under `src/client`; the Fluent `UiPage({...})` imports the HTML entry and uses a stable `$id`, scoped `.do` endpoint, and `direct: true` when the sample pattern requires it.
- Add project-compatible `vite`, React, `@vitejs/plugin-react`, and `@servicenow/isomorphic-rollup` dependencies.
- `now.dev.mjs` uses Vite `createServer`, `servicenowVitePlugins`, and `createViteProxy` with the SDK-provided `credential`.
- `now.prebuild.mjs` uses Vite `build` and `servicenowVitePlugins`, writes to `config.staticContentDir`, and passes `registerExplicitId`.
- Both integrations use `configFile: false`; set `esbuild: false` so ServiceNow's SWC/Rollup plugin pipeline handles TypeScript/JSX.
- Do **not** create `vite.config.js/ts`; the official integration lives in `now.dev.mjs` and `now.prebuild.mjs`.
- Never package localhost/dev-server URLs, credentials, proxy settings, or relaxed development security into production artifacts.

## Run

The sample's `dev` script maps to `now-sdk run dev`. On locked Windows invoke it directly and provide the confirmed auth alias:

```powershell
now-sdk run dev --auth <alias>
```

This is a long-running local dev server with HMR; stop it normally with Ctrl+C. For production output run normal `now-sdk build`, which invokes `now.prebuild.mjs`, then inspect `staticContentDir`/build XML to confirm no development URL leaked.

Use **sn-build-install** for installation and marker verification. A content marker proves deployment, not runtime behavior. Browser checks remain secondary to marker verification as deployment evidence, but they are required before claiming a user-facing UI is runtime-smoked, working, or complete. Apply the conditional target-runtime slice above only when its compatibility gate is triggered.
