# `init` in a non-empty directory

What `now-sdk init` does to existing files (verified locally against now-sdk 4.13.6 and 4.11.2):

- `now.config.json` exists: `init` does NOT scaffold. It switches to apply-template mode for that existing project (only `partial.*` templates; `--appName`/`--scopeName` ignored). This is not a new app: stop.
- `package.json` exists: `init` replaces it (existing dependencies, scripts and version are lost) and uses its `name` instead of `--packageName`. Stop and ask.
- `init` also overwrites an existing `.gitignore` and `.vscode/extensions.json`.
- Other files (`.git`, README) are left alone.

Ask before continuing in any non-empty directory.
