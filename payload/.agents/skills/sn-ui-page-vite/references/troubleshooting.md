# Vite UI Page troubleshooting and background

Read when the sample and its README disagree, the dev run uses the wrong script, Vite warns about the transformer, the bundle lands in the wrong directory, or a plugin option or dependency choice is unclear.

## Sources

- The `./vite` entry is listed under `exports` in the installed `@servicenow/isomorphic-rollup` `package.json` (`dist/vite.js`).
- The sample's code is authoritative over its `README.md`, which still describes `esbuild: false` and names `servicenowFrontEndPlugins`.
- `servicenowVitePlugins` options are declared as `ServicenowVitePluginOptions` in the installed package's `dist/vite/plugins.d.ts`. Options from a Rollup `servicenowFrontEndPlugins` call do not carry over.
- `direct: true` is required for the imported-HTML React pattern per `ui-page-guide`; the sample sets it.

## Dependencies

- The sample's `catalog:` and `link:` specifiers are pnpm-workspace and machine-local references.
- Check the chosen Vite's `engines.node` before installing.
- A missing `node_modules/rollup` after install is typical when `@servicenow/sdk` is not a project dependency.

## Dev run

- `run` is not listed in `now-sdk --help`; `now-sdk run --help` shows it.
- It runs `scripts.dev` from `now.config.json` if set, otherwise `now.dev.mjs` in the project root. The first log line `Running script "dev" from <path>` shows which file ran.
- `now-sdk build` invokes `now.prebuild.mjs`; its log line is `Running script "prebuild" from <path>`.
- `No user script for "dev", using built-in default` means the Vite script was not found.
- The sample requests port 3000; Vite moves to the next free port when it is in use, so use the URL from the log.

## Transformer warnings

The wrong option for the installed Vite major is not an error: Vite 8 warns that `esbuild: false` "does not have effect any more", and Vite 6 ignores `oxc` silently.

## Output directory

The SDK packages `config.staticContent.buildDir` (default `dist/static`). The sample reads the deprecated `config.staticContentDir`, which stays at the default when `staticContent.buildDir` is set, so the bundle is written where the SDK does not look. Hence `config.staticContent?.buildDir ?? config.staticContentDir`.
