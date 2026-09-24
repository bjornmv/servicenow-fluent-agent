---
name: sn-lux
description: "Create, extend or review ServiceNow Lux (AIUX) experiences, Lit pages and server-backed widgets. Use for Lux, AIUX, AI-UX or AI Experience requests, or the AIUX surface of an aiux.json project. Routes to official project-local AIUX skills; not the React UI Page workflow."
argument-hint: "<Lux/AIUX experience, page, widget or extension request>"
---
# Lux (AIUX) entry workflow

Extend the Fluent workflow; do not replace it. Fluent owns backend/security records; Lux/AIUX owns Lit pages/widgets and generated AIX metadata. Read [official reference routing](references/official-skills.md) before UI planning, authoring or review; it requires task-matched AIUX and Horizon references, not just package discovery. For build, deploy or runtime failures, use [sn-lux-build](../sn-lux-build/SKILL.md).

Keep work proportional: for an existing app, inspect only the manifests and files needed for the requested surface. Scaffolding, dependency/toolchain changes and instance build/deploy/runtime work require the relevant preflight; purely local review or a bounded copy/CSS patch does not authorize or require instance access. Apply section 4's reads only to affected topics: a copy-only change does not by itself require component discovery or `aiux-build`. Review-only work reports without edits or new project notes. Deployment still requires the full applicable approval and verification gates.

## Names and documentation

- Use **Lux** for the product-facing name and **AIUX** for technical identifiers. Treat "AI-UX" as a search synonym, not an alternative package/API spelling.
- Preserve upstream names: `@servicenow/aiux`, `@servicenow/agent-pack-aiux`, `aiux.json`, `AIUXElement`, `AIUXWidgetElement`, `javascript.aiux` and `javascript.aiux-extension`. Do not invent Lux-renamed equivalents.
- `now-sdk explain` covers bundled Fluent SDK topics, not the full Lux framework. Missing Lux/AIUX topics are not proof of missing runtime support. Load the matching official project-local packs via the handoff below; keep ordinary Fluent backend authoring explain-first.

## 1. Classify and inspect

- Find the intended project root. Read `aiux.json`, `now.config.json`, `package.json`, its lockfile, `application.js`/layout, theme, and one relevant page/widget.
- `aiux.json` identifies an AIUX pipeline. In mixed repositories, confirm the requested surface before choosing this workflow; do not migrate an existing React UI Page merely because its name contains "Experience". Do not scaffold over an existing app. Normal Lit JS, decorators and external widget server functions are not `.now.ts` DSL and must not be cleaned up as Fluent records.
- New standalone experience: use the official `javascript.aiux` template in a fresh folder and custom scope. An extension uses `javascript.aiux-extension` only after confirming the existing host experience and intended extension behavior; read the official extension reference first.
- Adding an AIUX UI does not authorize modifying vendor Builder/AI Control Tower records, deploying, changing ACLs/roles or enabling generative AI.

## 2. Capability and toolchain preflight

- Confirm the target instance/alias with the user; use `sn-auth` and `sn-rest` without printing tokens. Pass the confirmed alias and instance explicitly on REST checks; do not assume a default profile targets the intended PDI/vendor instance. Browser login is separate from SDK OAuth.
- Recheck current [Lux prerequisites](https://www.servicenow.com/docs/r/application-development/configuring-servicenow-ai-experience-lab-for-vs-code.html). The documented baseline checked on 2026-09-20 was SDK 4.10+ and Australia Patch 5+ or Zurich Patch 12+. Check AI Experience Framework (`sn_aixf`) and Framework Builder (`sn_aiux_builder`) installation/version separately; these checks do not establish entitlement or full compatibility.
- Check the actual build (for example `glide.war`), not just the release-family label. `sys_scope` can identify framework versions when Store application inventory is ACL-restricted. AIX tables are global `sys_aix_*`; experiences/pages use `title`. ACL denial or an empty plugin-view query is not proof of absence. Use narrow fields/limits; do not dump plugin or user tables.
- Report platform version, framework presence, readable runtime records, deployment permissions and browser runtime as separate findings. Read-only checks do not prove write/deploy permission. A replacement PDI is not guaranteed to receive a newer patch; never release/reset an instance merely to satisfy prerequisites without explicit approval.
- Read declared Node/package-manager engines. The observed AIUX 22.42.3 requirement is Node >=24.14.1; Node 24 LTS >=24.15.0 is recommended for that stack. Do not impose this on all Fluent projects, silently upgrade global Node/SDK, or claim an untested version is validated.
- Use a permitted package manager consistent with the project's lockfile and `packageManager`. A resolved npm JavaScript CLI invoked with Node is a supported option when permitted. Do not work around an explicit policy denial. See [toolchain notes](../sn-lux-build/references/validation-and-troubleshooting.md).

## 3. Scaffold only when requested

Resolve the real instance-bound vendor prefix first with an authenticated, read-only request:

```text
GET /api/now/appcreator/app/vendorprefix
```

Validate the scope against that prefix and the SDK's length/naming rules (observed cap: 18 characters). Never reuse a sample vendor prefix. Verify scope/basename availability before deployment; a local generated scope ID is not evidence of reservation or installation.

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md) for local SDK precedence, package-manager launchers and the permitted missing-function fallback. Print the command. Check version-specific help if flags differ:

```powershell
now-sdk init --template javascript.aiux --auth <confirmed-alias> --appName "<app name>" --packageName <package-name> --scopeName <validated-scope> --noUpdate
```

Inspect the result before continuing. Scaffold creation does **not** install dependencies. Review/pin direct dependencies, lifecycle hooks and source-packaging settings. Default `packageSourceCodeOnInstance` to false unless source packaging was approved. Do not invent development tokens.

Install declared dependencies using the approved launcher, initially with lifecycle scripts disabled (`ci --ignore-scripts` with a valid npm lockfile, otherwise `install --ignore-scripts`). Preserve the chosen lockfile; do not mix package managers. Review any necessary native build hook individually, rather than enabling all scripts. Audit findings require review, not `audit fix --force`.

## 4. Load official guidance and build the UI

The official packs are project dependencies, not vendored/global skills in this distribution. Follow [official-skills.md](references/official-skills.md) to locate them. If absent, say so and install/retrieve an approved version before authoring against unknown APIs; do not pretend they were loaded.

1. Resolve the installed discovery entry: prefer `ui-discovery`, with `component-discovery` only as an existing older-pack fallback. Read the selected candidate's full reference and identify capability gaps before coding; a directory listing is not consultation.
2. Read `aiux-build` for authoring and the task-matched references in the routing table. For layouts/action groups, read Horizon `compositions` and each affected region's spec; for states, validation, overflow and related behavior, read `patterns` and the triggered files. Use `components` sheets for primitive styling and `motion` only for animation changes. These are required when the task matches, not an optional design afterthought.
3. Read and apply the relevant accessibility and internationalization guidance for interactive or user-visible changes. Load only affected topics; do not load every skill for a small fix. Resolve missing paths once and report gaps rather than inventing APIs or repeatedly retrying absent files.
4. Use `AIUXElement` / `AIUXWidgetElement` and the current runtime's supported imports. Guard browser globals for SSR. Use translated messages and native components.
5. For a read-only UI, prefer presentational `aiux-gallery-list`. A connected list may write through inline editing; `selectionEnabled: false` alone does not make it read-only.
6. Widget server logic is an external file referenced by the supported AIUX `@server` decorator. Use the current exported `server(data, options, input)` function shape. Ordinary Fluent backend record scripts still use their documented Fluent APIs, usually `Now.include`.
7. Enforce authorization and record/field ACLs server-side. Prefer fixed/allowlisted table, query, fields, actions and bounded limits. Do not expose exception details, unrestricted counts or client-controlled queries. Writes require explicit requested behavior and authorization.
8. Include loading, empty, denied/error, timeout/retry behavior and stale-response/disconnect handling. Distinguish a bounded readable snapshot from a global count.

Follow the handoff's **Reference decisions** evidence step: record the actual references and decisions in existing project notes for substantial implementation, or briefly in the response for small changes/review-only work. Preserve operation limits; reading guidance does not authorize edits, scripts, installs or deployment. Use `sn-lux-build` when building or verifying runtime behavior. Report source creation, dependency installation, build, install and browser verification as separate outcomes; reference reads are not UI acceptance.
