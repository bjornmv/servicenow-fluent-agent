---
name: sn-react-ui-design
description: Designs and reviews React UI Pages (layout, accessibility, states). Use when designing, styling or reviewing a page; not Vite (sn-ui-page-vite).
argument-hint: <React surface, operation, requested change and acceptance criteria>
compatibility: ServiceNow React UI Page project with its existing tooling; browser access for rendered verification; installs nothing.
metadata:
  version: '1'
---
# ServiceNow React UI design

Optimize task completion, clarity and accessibility. **Read only the current phase's guidance, once.** Resolve relative paths from this directory. Project decisions live in `docs/ui-design-contract.md` under the confirmed project root (or its existing documented location); read it first when it exists. Only the new-page path creates it.

## Route and scope

A React UI Page is a Fluent `UiPage({...})` importing an HTML entry under `src/client` whose entry module renders with `react-dom`. Confirm project, surface and operation from minimal entry/manifest evidence; never assume a remembered app/instance.

- Lux/AIUX (Lit classes from `@servicenow/aiux`): switch to `sn-lux` and stop. An `aiux.json` elsewhere or "Experience" in a page name does not make a React page Lux.
- Service Portal (`SPPage`/`SPWidget`): stop; use `sn-add-record` with `sn-explain` (`service-portal-guide`). UI Builder: no workflow here; say so and stop.
- **Operation limits override every path:** plan proposes only; review reports and proposes, with no edits or unrequested report files; implement changes only authorized source; verify tests only authorized behavior.
- Inspect affected files/tests, instructions and the contract; expand only when needed. Preserve unrelated work and proven architecture.
- Companions: `sn-ui-page-vite` for Vite/HMR and its runtime compatibility gate (first runtime-dependent component family such as `RecordProvider`, or a major now-sdk / React / `@servicenow/react-components` change); `sn-explain` before Fluent edits; `sn-build-install` for build/install. No framework migration merely for styling.

**Components, tokens and CSS, in this order on every path:** (1) the project's proven convention and approved contract; (2) for a new surface or first use of a component family, the SDK's UI Page guides and component docs; (3) semantic HTML where no supported component fits or the family has not passed the compatibility gate. The guides' absolutes never justify changing an existing project's React version, adding `@servicenow/react-components` without approval, or removing the Vite files `sn-ui-page-vite` owns. Read [components and SDK guides](references/components.md) when step 2 applies or a guide's rule conflicts with the project.

## Choose the smallest path

| Task | Read first | Action / stop |
|---|---|---|
| Bounded copy/CSS patch | Nothing extra | Quick path; no new contract/concept round |
| New page / major restructure | [Layout](references/layout-patterns.md), [contract template](templates/ui-design-contract.md) | Two populated structural options; get direction before broad implementation unless delegated |
| State, selection, form, async or write flow | [React behavior](references/react-servicenow.md) | Fix/test affected behavior; no unrelated redesign |
| Substantial copy / wording uncertainty | [Copy](references/plain-language.md) | Revise affected strings, accessible names, recovery states |
| Source-only review | References needed for findings | Report source evidence and untested rendering; stop |
| Rendered review / substantial verification | [Browser acceptance](references/browser-acceptance.md) | Test agreed criteria; report evidence/gaps |

Combine paths only as needed. [Review template](templates/ui-review.md): substantial structured reports only. [Provenance](references/sources.md): maintenance questions only. Don't fetch external prompts or run installers/hooks.

### Local render

For rendered checks only. Use the project's existing dev script (`now.dev.mjs`, or `scripts.dev` in `now.config.json`); adding or replacing one is `sn-ui-page-vite` work. Start it from the confirmed project directory in its own terminal with the confirmed alias (without `--auth` it uses the default alias):

```powershell
now-sdk run dev --auth <alias>
```

bash (Linux, VS Code server):

```bash
now-sdk run dev --auth <alias>
```

It does not exit by itself. Open the `http://localhost:<port>` URL from its log, send nothing else to that terminal, stop it with Ctrl+C. On a remote server that URL is server-local: use a browser tool on the server, or forward the port for the user's browser ([bash notes](../../reference/sdk-commands.md#linux-and-vs-code-server-bash)).

- **The local page is the live instance, not a fixture**: it acts as the alias user, so local evidence covers only that user; other roles, the scoped `.do` endpoint and the embedded shell stay **not tested**. Classify controls from source before activating them; stop before any commit step unless a write on named records is approved. Treat screenshots as instance data.
- Stop it before `now-sdk build` when it watch-builds into the static output directory (the SDK React templates' does), or restart it afterwards.
- No dev script, browser or authorization: finish source work; rendered checks are **not tested**. The installed page goes through `sn-build-install` and its gates.

Read [local render limits](references/local-render.md) before `now-sdk build` while the dev server runs, on empty data or 401s, or to judge what local evidence covers.

### Quick path

1. State the bounded change and acceptance check; reuse decisions. Ask only blocking questions; otherwise state assumptions.
2. Change affected code only, with scoped styles. Copy: sentence case, concrete outcomes, persistent labels, accurate counts, safe cause/recovery, existing localization, essential restrictions kept.
3. From the confirmed project directory run `now-sdk build` (it type-checks `src/client` in TypeScript projects) plus scripts already in `package.json`; add none. Require native exit status and attributable output per the [command policy](../../reference/sdk-commands.md); a failing build blocks the change.
4. Inspect rendered changes with long/missing values and affected viewport/zoom states. Test real keyboard/focus if controls changed, and selection/draft continuity on presentation changes. DPR or screenshot scaling is not zoom; forced `.focus()` or synthetic events are not keyboard evidence.
5. Report change, checks/evidence and gaps. Without a browser, UI acceptance is not established.

## Always preserve

- Version-supported APIs/components; no guessed imports, props or events, mixed UI kits or incidental upgrades.
- Presentation changes (density, theme, columns) keep stable IDs, selection, drafts and an unchanged review step; context/version changes need explicit invalidation.
- Server authorization, eligibility, exact reviewed IDs/versions, confirmation and concurrency. Client visibility is not security. No blind retry of uncertain writes or blanket success for partial results.
- Semantic controls, keyboard access, visible/unobscured focus, readability and zoom/reflow. Never hide required data or shrink text to hit density budgets.
- Synthetic or approved sanitized fixtures; nothing private to external services. No live mutations, installs, ACL changes or remote uploads without explicit authorization; a write through a local dev-server page is a live mutation. Design approval is not deployment permission.

## Finish honestly

Per criterion: **pass / fail / not tested / not applicable (reason)**. State the evidence level; keep source, local rendering, target installation/runtime and actual user approval/delegation separate. Builds, mocks and previews don't prove target behavior or design acceptance; this is not a WCAG audit.

Block acceptance for unusable primary tasks, unjustified missed budgets, lost work, keyboard/focus defects, unexplained ineligibility, misleading write outcomes, weakened security or missing required evidence. Fix within scope or report. For substantial work compare like-for-like before/after; label self-review when no independent critique is available. Review-only work stops at findings.
