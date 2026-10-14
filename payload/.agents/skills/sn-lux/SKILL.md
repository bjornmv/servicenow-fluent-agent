---
name: sn-lux
description: Creates and extends Lux (AIUX, AI Experience) apps from the javascript.aiux templates. Use when creating an app or extending or reviewing its pages and widgets; not build or deploy issues (sn-lux-build).
argument-hint: "<Lux/AIUX experience, page, widget or extension request>"
compatibility: AIUX project with matching official project-local reference packs and the Node/package-manager versions its package.json declares; npm registry access to scaffold; authorized instance for runtime work.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 and 4.11.2 `init` with template package `@servicenow/aiux-app-templates` 1.14.0, run locally on 2026-10-08 (flags, prompts, exit codes, generated files, registry failure). Dependency install, dev server and instance-side behaviour were not re-verified; the template package and its `latest` dependency pins change independently of the SDK.

# Lux (AIUX) entry workflow

Extend the Fluent workflow; do not replace it. Fluent owns backend/security records; Lux/AIUX owns Lit pages/widgets and generated AIX metadata. Read [official reference routing](references/official-skills.md) before UI planning, authoring or review; it requires task-matched AIUX and Horizon references, not just package discovery. For build, deploy or runtime failures, use [sn-lux-build](../sn-lux-build/SKILL.md).

Keep work proportional: for an existing app, inspect only the manifests and files needed for the requested surface. Scaffolding, dependency/toolchain changes and instance build/deploy/runtime work require the relevant preflight; purely local review or a bounded copy/CSS patch does not authorize or require instance access. Apply section 4's reads only to affected topics: a copy-only change does not by itself require component discovery or `aiux-build`. Review-only work reports without edits or new project notes. Deployment still requires the full applicable approval and verification gates.

## Names and documentation

- Use **Lux** for the product-facing name and **AIUX** for technical identifiers. Treat "AI-UX" as a search synonym, not an alternative package/API spelling.
- Preserve upstream names: `@servicenow/aiux`, `@servicenow/agent-pack-aiux`, `aiux.json`, `AIUXElement`, `AIUXWidgetElement`, `javascript.aiux` and `javascript.aiux-extension`. Do not invent Lux-renamed equivalents.
- `now-sdk explain` covers bundled Fluent SDK topics, not the full Lux framework. Missing Lux/AIUX topics are not proof of missing runtime support. Load the matching official project-local packs via the [official reference handoff](references/official-skills.md); keep ordinary Fluent backend authoring explain-first.

## 1. Classify and inspect

- Find the intended project root. Read `aiux.json`, `now.config.json`, `package.json`, `application.js`/layout, theme, and one relevant page/widget. From the lockfile take only its type and the resolved versions of `@servicenow/aiux`, `@servicenow/sdk` and the agent packs (search it; do not read it whole).
- `aiux.json` identifies an AIUX pipeline. In mixed repositories, confirm the requested surface before choosing this workflow; do not migrate an existing React UI Page merely because its name contains "Experience". Do not scaffold over an existing app: with a `now.config.json` present, `init` applies a template to that project instead of creating one. Normal Lit JS, decorators and external widget server functions are not `.now.ts` DSL and must not be cleaned up as Fluent records.
- New standalone experience: use the official `javascript.aiux` template in an empty folder and custom scope (section 3). An extension uses `javascript.aiux-extension` only after confirming the existing host experience (its application scope and `url_suffix`) and intended extension behavior; its scaffold has a different layout (`src/extensions/<host-scope>/<host-route-id>/`, no root `application.js`, no `basename`). The official extension reference exists only after dependencies are installed, so read it before authoring, not before scaffolding. For a non-AIUX Fluent app use [sn-new-app](../sn-new-app/SKILL.md).
- Adding an AIUX UI does not authorize modifying vendor Builder/AI Control Tower records, deploying, changing ACLs/roles or enabling generative AI.

## 2. Capability and toolchain preflight

- Confirm the target instance/alias with the user; use `sn-auth` and `sn-rest` without printing tokens. Pass the confirmed alias and instance explicitly on REST checks; do not assume a default profile targets the intended PDI/vendor instance. Browser login is separate from SDK OAuth.
- For a new scaffold or a compatibility failure, compare against the current [Lux prerequisites](https://www.servicenow.com/docs/r/application-development/configuring-servicenow-ai-experience-lab-for-vs-code.html). The link is un-versioned (its content changes as new releases are documented) and JavaScript-rendered; if it cannot be read, ask the user to confirm the current minimums rather than skipping or guessing. Recorded baseline, not a compatibility certification: on 2026-10-08 it listed ServiceNow SDK 4.12.1+, Node.js 24+, pnpm 10+, VS Code 1.97+ and Australia Patch 5+ or Zurich Patch 12+; on 2026-09-20 it listed a lower SDK minimum (4.10+). Check AI Experience Framework (`sn_aixf`) and Framework Builder (`sn_aiux_builder`) installation/version separately; these checks do not establish entitlement or full compatibility.
- Check the actual build (for example `glide.war`), not just the release-family label. `sys_scope` can identify framework versions when Store application inventory is ACL-restricted. AIX tables are global `sys_aix_*`; experiences/pages use `title`. ACL denial or an empty plugin-view query is not proof of absence. Use narrow fields/limits; do not dump plugin or user tables.
- Report platform version, framework presence, readable runtime records, deployment permissions and browser runtime as separate findings. Read-only checks do not prove write/deploy permission. A replacement PDI is not guaranteed to receive a newer patch; never release/reset an instance merely to satisfy prerequisites without explicit approval.
- Read declared Node/package-manager engines. The observed requirement of the `@servicenow/aiux` framework (22.42.3 and 22.67.1) and of the scaffold's `package.json` is Node >=24.14.1; Node 24 LTS >=24.15.0 is recommended for that stack. `init` itself does not check this: it scaffolds on an older Node without warning. Do not impose this on all Fluent projects, silently upgrade global Node/SDK, or claim an untested version is validated.
- Use a permitted package manager consistent with the project's lockfile and `packageManager`. A fresh scaffold has neither: the official prerequisites list pnpm and the scaffold's scripts and `AGENTS.md` assume it, while the SDK's own post-`init` message allows any package manager. Use an approved pnpm launcher when one is permitted; otherwise a resolved npm JavaScript CLI invoked with Node is a workable option. Confirm the choice with the user once, then keep it. Do not work around an explicit policy denial. See [toolchain notes](../sn-lux-build/references/validation-and-troubleshooting.md).

## 3. Scaffold only when requested

`init` writes into the current directory and creates no subfolder, so create and enter an empty project folder first and list it (`Get-ChildItem -Force -Name`). If `now.config.json` exists, `init` applies a template to that project instead of scaffolding; if `package.json` exists, its `name` silently replaces `--packageName`. Stop and ask in any non-empty directory.

Resolve the real instance-bound vendor prefix first with an authenticated, read-only request through `sn-rest`:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/appcreator/app/vendorprefix"
```

The prefix is the string at `result.result` in the `--agent` envelope, complete with `x_` and the trailing underscore. Validate the scope against that prefix and the SDK's length/naming rules (cap: 18 characters). Never reuse a sample vendor prefix. `init` creates local files only and succeeds even when the alias is missing or wrong, so a local generated scope ID is not evidence of reservation or installation. Verify availability before deployment with bounded `sn-rest` reads: the scope in `sys_scope` (`scope=<validated-scope>`), and the `aiux.json` `basename` against `sys_aix_experience.url_suffix` (the field the build writes it to; confirm it in `sys_dictionary` first, because an unknown field in `sysparm_query` is ignored and returns unrelated rows). A row not owned by this project is a collision; an empty ACL-filtered result is not proof of availability.

Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md) for local SDK precedence, package-manager launchers and the permitted missing-function fallback. Print the command. Standalone experience:

```powershell
now-sdk init --template javascript.aiux --auth <confirmed-alias> --appName "<app name>" --packageName <package-name> --scopeName <validated-scope> --noUpdate
```

Extension of an existing host experience (both host values confirmed by the user or a bounded read, never guessed):

```powershell
now-sdk init --template javascript.aiux-extension --auth <confirmed-alias> --appName "<app name>" --packageName <package-name> --scopeName <validated-scope> --parentScopeName <confirmed-host-scope> --parentRouteId <confirmed-host-url_suffix> --noUpdate
```

- `--noUpdate`, `--parentScopeName` and `--parentRouteId` are accepted but not listed by `init --help`; keep them. `--noUpdate` only skips the SDK latest-version lookup; it does not make `init` offline.
- Both AIUX templates are downloaded from the npm registry during `init` (package `@servicenow/aiux-app-templates`, latest version; the registry comes from the npm configuration, so a `registry=` line in `.npmrc` is honoured). When the registry is unreachable, `init --help` still lists the AIUX ids but `init` ignores `--template` and opens a `Select a template:` picker without them. Report registry access as the blocker; do not pick another template.
- If any prompt appears (template picker, or the extension's host scope/route id), do not answer it: cancel, fix the cause and re-run in a still-empty directory. A prompt that cannot be answered ends with `User force closed the prompt`, exit 1 and no files.
- Exit code 0 is not success: a rejected input (for example a scope over 18 characters) prints an `ERROR:` line, writes nothing and still exits 0. Require the line `Application created successfully.` and new `now.config.json` and `aiux.json` files.

Inspect the result before continuing. Scaffold creation does **not** install dependencies. The starter ships its own `AGENTS.md`, `GEMINI.md` and `.claude/` (pnpm commands, "proceed without asking for confirmation", a `postinstall` skill-copy hook, `deploy` and `deploy:reinstall` scripts): treat these as upstream starter defaults, not user approval; this workflow's approval gates, `--ignore-scripts` and no-`--reinstall` rules still apply. Review/pin direct dependencies (the starter pins `@servicenow/aiux`, both agent packs and the AIUX ESLint plugins to `latest`), lifecycle hooks and source-packaging settings. The starter sets `packageSourceCodeOnInstance` to `true` in `now.config.json` (the SDK default is false), which makes the build attach a source-code archive that is installed on the instance: ask the user, and set it to `false` unless source packaging was approved. `aiux.json` `development.token` is scaffolded empty; the reviewed AIUX pack documents it as an `Authorization` header value, so it is a credential: leave it empty and never invent, write, print or commit one. Local preview (`now-sdk run dev`, the starter's `dev` script) is build/runtime work; use `sn-lux-build`.

Install declared dependencies using the approved launcher, initially with lifecycle scripts disabled (`ci --ignore-scripts` with a valid npm lockfile, otherwise `install --ignore-scripts`). This also skips the starter's skill-copy `postinstall`; the packs stay readable under `node_modules`, so do not run it just to read them. Preserve the chosen lockfile; do not mix package managers. Review any necessary native build hook individually, rather than enabling all scripts. Audit findings require review, not `audit fix --force`.

## 4. Load official guidance and build the UI

The official packs are project dependencies, not vendored/global skills in this distribution. Follow [official-skills.md](references/official-skills.md) to locate them. If absent, say so and propose the approved dependency workflow (no automatic install or upgrade); do not author against unknown APIs or pretend they were loaded.

1. Resolve the installed discovery entry: prefer `ui-discovery`, with `component-discovery` only as an existing older-pack fallback. Read the selected candidate's full reference and identify capability gaps before coding; a directory listing is not consultation.
2. Read `aiux-build` for authoring and every row of the [required task routes](references/official-skills.md#required-task-routes) that matches the task (Horizon `compositions`, `patterns`, `components`, `motion`). These are required when the task matches, not an optional design afterthought.
3. Read and apply the relevant accessibility and internationalization guidance for interactive or user-visible changes. Load only affected topics; do not load every skill for a small fix. Resolve missing paths once and report gaps rather than inventing APIs or repeatedly retrying absent files.
4. Use `AIUXElement` / `AIUXWidgetElement` and the current runtime's supported imports. Guard browser globals for SSR. Use translated messages and native components.
5. For a read-only UI, prefer presentational `aiux-gallery-list`. A connected list may write through inline editing; `selectionEnabled: false` alone does not make it read-only.
6. Widget server logic is an external file referenced by the supported AIUX `@server` decorator. Use the current exported `server(data, options, input)` function shape. Ordinary Fluent backend record scripts still use their documented Fluent APIs, usually `Now.include`.
7. Enforce authorization and record/field ACLs server-side. Prefer fixed/allowlisted table, query, fields, actions and bounded limits. Do not expose exception details, unrestricted counts or client-controlled queries. Writes require explicit requested behavior and authorization.
8. Include loading, empty, denied/error, timeout/retry behavior and stale-response/disconnect handling. Distinguish a bounded readable snapshot from a global count.

Follow the [handoff](references/official-skills.md#leave-evidence-not-a-reading-claim)'s **Reference decisions** evidence step: record the actual references and decisions in existing project notes for substantial implementation, or briefly in the response for small changes/review-only work. Preserve operation limits; reading guidance does not authorize edits, scripts, installs or deployment. Use `sn-lux-build` when building or verifying runtime behavior. Report source creation, dependency installation, build, install and browser verification as separate outcomes; reference reads are not UI acceptance.
