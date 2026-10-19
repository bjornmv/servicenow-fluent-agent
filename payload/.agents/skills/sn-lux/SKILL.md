---
name: sn-lux
description: Creates and extends Lux (AIUX, AI Experience) apps from the javascript.aiux templates. Use when creating an app or extending or reviewing its pages and widgets; not build or deploy issues (sn-lux-build).
argument-hint: "<Lux/AIUX experience, page, widget or extension request>"
compatibility: AIUX project with matching official project-local reference packs and the Node/package-manager versions its package.json declares; npm registry access to scaffold; authorized instance for runtime work; sn-skill (else node "<user-profile>/.agents/tools/sn-skill.cjs").
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 and 4.11.2 `init` with `@servicenow/aiux-app-templates` 1.14.0 (versioned independently of the SDK) on 2026-10-08; dependency install, dev server and instance behaviour were not re-verified.

# Lux (AIUX) entry workflow

Extend the Fluent workflow; do not replace it. Fluent owns backend/security records; Lux/AIUX owns Lit pages/widgets and generated AIX metadata. Read [official reference routing](references/official-skills.md) before UI planning, authoring or review. Build, preview, deploy and runtime failures belong to [sn-lux-build](../sn-lux-build/SKILL.md).

- Keep work proportional: for an existing app, inspect only what the requested surface needs. Local review or a bounded copy/CSS patch neither needs nor authorizes instance access. Review-only work reports without edits or new project notes.
- Use **Lux** for the product and **AIUX** for technical identifiers ("AI-UX" is only a search synonym). Keep upstream names (`@servicenow/aiux`, `@servicenow/agent-pack-aiux`, `aiux.json`, `AIUXElement`, `AIUXWidgetElement`, `javascript.aiux`, `javascript.aiux-extension`); never invent Lux-renamed ones.
- `now-sdk explain` covers Fluent, not Lux; a missing Lux topic is not proof of missing runtime support. Fluent backend authoring stays explain-first.
- Adding an AIUX UI does not authorize modifying vendor Builder/AI Control Tower records, deploying, changing ACLs/roles or enabling generative AI.

## 1. Classify and inspect

- In the intended project root, read `aiux.json`, `now.config.json`, `package.json`, `application.js`/layout, theme and one relevant page/widget. Search the lockfile (do not read it whole) for its type and the resolved `@servicenow/aiux`, `@servicenow/sdk` and agent-pack versions.
- `aiux.json` marks an AIUX pipeline. In mixed repositories confirm the requested surface; do not migrate a React UI Page because its name contains "Experience". Lit JS, decorators and external widget server functions are not `.now.ts` DSL; do not clean them up as Fluent records.
- New standalone experience: `javascript.aiux` in an empty folder with a custom scope (section 3). Never scaffold over an existing app.
- Extension: `javascript.aiux-extension` only after confirming the host experience (application scope and `url_suffix`) and intended behaviour. Its layout is `src/extensions/<host-scope>/<host-route-id>/` (no root `application.js`, no `basename`); its official reference appears only after dependency install, so read it then, before authoring.
- Non-AIUX Fluent app: [sn-new-app](../sn-new-app/SKILL.md).

## 2. Capability and toolchain preflight

Run before a new scaffold, dependency/toolchain changes, instance build/deploy/runtime work, or on a compatibility failure. Read [preflight details](references/preflight.md) while running it.

- Confirm the target instance/alias with the user. Use `sn-auth` and `sn-rest` without printing tokens, passing the confirmed alias and instance explicitly on every REST check. Browser login is separate from SDK OAuth.
- Compare against the current [Lux prerequisites](https://www.servicenow.com/docs/r/application-development/configuring-servicenow-ai-experience-lab-for-vs-code.html); if unreadable, ask the user for the current minimums rather than skipping or guessing. Check `sn_aixf` and `sn_aiux_builder` separately.
- Report platform version, framework presence, readable runtime records, deployment permissions and browser runtime as separate findings. ACL denial or an empty query is not proof of absence; read-only checks do not prove write/deploy permission. Never release/reset an instance to satisfy prerequisites without explicit approval.
- Read the declared Node/package-manager engines. `@servicenow/aiux` (observed 22.42.3, 22.67.1) and the scaffold require Node >=24.14.1; `init` does not check it and scaffolds on older Node without warning. Do not impose it on other Fluent projects or silently upgrade global Node/SDK.
- Use a permitted package manager consistent with the project's lockfile and `packageManager`. A fresh scaffold has neither: confirm the choice with the user once, then keep it. Do not work around an explicit policy denial.

## 3. Scaffold only when requested

`init` writes into the current directory. Create and enter an empty project folder and list it with `Get-ChildItem -Force -Name` (PowerShell) / `ls -A` (bash). Stop and ask in any non-empty directory.

Resolve the instance-bound vendor prefix with an authenticated, read-only `sn-rest` request:

```
sn-skill rest --agent --alias '<confirmed-alias>' --instance 'https://<confirmed-host>' '/api/now/appcreator/app/vendorprefix'
```

The prefix is `result.result` in the `--agent` envelope, including `x_` and the trailing underscore; without a final `sn-skill: rest exit=0` stderr line it is UNKNOWN. Validate the scope against it and the SDK naming rules (max 18 characters); never reuse a sample prefix. `init` is local-only and succeeds with a missing or wrong alias, so a generated scope ID is not evidence of reservation or installation. Before deployment, run the [collision check](references/preflight.md#scope-and-route-collisions).

Use `now-sdk` directly in the VS Code terminal (PowerShell with now-sdk on Windows; bash with the now-sdk function on Linux) from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md) and its [bash notes](../../reference/sdk-commands.md#linux-and-vs-code-server-bash). Print the command. Both `init` commands run unchanged in bash. Standalone experience:

```powershell
now-sdk init --template javascript.aiux --auth <confirmed-alias> --appName "<app name>" --packageName <package-name> --scopeName <validated-scope> --noUpdate
```

Extension (both host values confirmed by the user or a bounded read, never guessed):

```powershell
now-sdk init --template javascript.aiux-extension --auth <confirmed-alias> --appName "<app name>" --packageName <package-name> --scopeName <validated-scope> --parentScopeName <confirmed-host-scope> --parentRouteId <confirmed-host-url_suffix> --noUpdate
```

- Keep `--noUpdate`, `--parentScopeName` and `--parentRouteId`; `init --help` omits them.
- Never answer a prompt or pick from a `Select a template:` picker: cancel, fix the cause and re-run in a still-empty directory.
- Exit code 0 is not success. Require `Application created successfully.` and new `now.config.json` and `aiux.json` files.
- Read [scaffold failures](references/scaffold.md) when `init` prompts, prints `ERROR:` or creates nothing.

Review the scaffold before continuing; it installs no dependencies.

- The starter's `AGENTS.md`, `GEMINI.md` and `.claude/` (pnpm commands, "proceed without asking for confirmation", a `postinstall` skill-copy hook, `deploy` and `deploy:reinstall` scripts) are upstream defaults, not user approval; this workflow's gates, `--ignore-scripts` and no-`--reinstall` rules apply.
- Review/pin direct dependencies (the starter pins `@servicenow/aiux`, both agent packs and the AIUX ESLint plugins to `latest`), lifecycle hooks and source-packaging settings.
- The starter sets `packageSourceCodeOnInstance` to `true` (SDK default false), which installs a source archive on the instance. Ask the user; set it to `false` in `now.config.json` unless source packaging was approved.
- `aiux.json` `development.token` is an `Authorization` header value, so a credential: leave it empty; never invent, write, print or commit one.
- Local preview (`now-sdk run dev`, the starter's `dev` script) belongs to `sn-lux-build`.

Install declared dependencies with the approved launcher and lifecycle scripts disabled: `ci --ignore-scripts` with a valid npm lockfile, otherwise `install --ignore-scripts`. Do not run the skipped skill-copy `postinstall` just to read the packs; they stay readable under `node_modules`. Preserve the lockfile; do not mix package managers. Review a needed native build hook individually, never by enabling all scripts; review audit findings, never `audit fix --force`.

## 4. Load official guidance and build the UI

Locate the project-local packs via [official-skills.md](references/official-skills.md). If absent, say so and propose the approved dependency workflow (no automatic install or upgrade); do not author against unknown APIs or pretend they were loaded. Load only affected topics: a copy-only change does not by itself require component discovery or `aiux-build`.

1. Before coding, read the discovery entry (`ui-discovery`; `component-discovery` only in an older pack) and the selected candidate's full reference (identify capability gaps), `aiux-build`, and every matching row of the [required task routes](references/official-skills.md#required-task-routes) (Horizon `compositions`, `patterns`, `components`, `motion` too), including accessibility and internationalization for user-visible changes. A directory listing is not consultation.
2. Use `AIUXElement` / `AIUXWidgetElement` and the runtime's supported imports. Guard browser globals for SSR. Use translated messages and native components.
3. Read-only UI: prefer presentational `aiux-gallery-list`. A connected list can write through inline editing; `selectionEnabled: false` alone does not make it read-only.
4. Widget server logic is an external file referenced by the AIUX `@server` decorator, exporting `server(data, options, input)`. Fluent backend record scripts keep their Fluent APIs, usually `Now.include`.
5. Enforce authorization and record/field ACLs server-side; allowlist table, query, fields and actions; bound limits. Never expose exception details, unrestricted counts or client-controlled queries. Writes need explicitly requested behaviour and authorization.
6. Handle loading, empty, denied/error, timeout/retry and stale-response/disconnect states. Distinguish a bounded readable snapshot from a global count.

## Done

- Record **Reference decisions** per the [handoff](references/official-skills.md#leave-evidence-not-a-reading-claim): in existing project notes for substantial work, briefly in the response for small or review-only work.
- Report source creation, dependency installation, build, install and browser verification as separate outcomes. Reading references is not UI acceptance and authorizes no edits, scripts, installs or deployment.
- Build, preview, deploy and runtime verification: [sn-lux-build](../sn-lux-build/SKILL.md), with its full approval and verification gates.
