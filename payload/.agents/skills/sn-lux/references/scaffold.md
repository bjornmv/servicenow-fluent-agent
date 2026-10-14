# Lux scaffold failures

Read when `init` prompts, prints `ERROR:` or creates nothing (section 3 of the [entry workflow](../SKILL.md)).

- `init` creates no subfolder. If `now.config.json` exists, `init` applies a template to that project instead of scaffolding; if `package.json` exists, its `name` silently replaces `--packageName`. Hence the empty-directory rule.
- `--noUpdate` only skips the SDK latest-version lookup; it does not make `init` offline.
- Both AIUX templates are downloaded from the npm registry during `init` (package `@servicenow/aiux-app-templates`, latest version; the registry comes from the npm configuration, so a `registry=` line in `.npmrc` is honoured). When the registry is unreachable, `init --help` still lists the AIUX ids but `init` ignores `--template` and opens a `Select a template:` picker without them. Report registry access as the blocker; do not pick another template.
- The extension template prompts for the host scope/route id when `--parentScopeName` / `--parentRouteId` are missing. A prompt that cannot be answered ends with `User force closed the prompt`, exit 1 and no files.
- A rejected input (for example a scope over 18 characters) prints an `ERROR:` line, writes nothing and still exits 0.
- In every case: cancel, fix the cause and re-run in a still-empty directory.
