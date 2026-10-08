---
name: sn-react-ui-design
description: Use when designing, restyling, implementing, reviewing or verifying the layout, accessibility, copy, state and interactions of a ServiceNow React UI Page (JSX/TSX, CSS) in a now-sdk project; not Vite/HMR scaffolding or hosting (sn-ui-page-vite), Lux/AIUX, Service Portal or UI Builder.
argument-hint: <React surface, operation, requested change and acceptance criteria>
compatibility: ServiceNow React UI Page project with its existing tooling; browser access for rendered verification; installs nothing.
metadata:
  version: '1'
---
# ServiceNow React UI design

Optimize task completion, clarity and accessibility. **Read only the current task/phase's guidance, once; links are not a read-all checklist.** Resolve relative paths from this directory. Store project decisions in the project contract: `docs/ui-design-contract.md`, resolved against the confirmed project root (or the project's existing documented location). Read it first when it exists; only the new-page path creates it.

## Route and scope

Confirm the requested project, surface and operation using minimal entry/manifest evidence; never assume a remembered app/instance. A React UI Page is a Fluent `UiPage({...})` that imports an HTML entry under `src/client` whose entry module renders with `react-dom`.

- Actual Lux/AIUX (Lit classes from `@servicenow/aiux`): switch to `sn-lux` and stop this workflow. Service Portal (`SPPage`/`SPWidget`): stop this workflow and use `sn-add-record` with `sn-explain` (`service-portal-guide`). UI Builder: this bundle has no workflow for it; say so and stop rather than applying React guidance. In mixed projects verify the surface; an `aiux.json` elsewhere in the repository or “Experience” in a page name does not make a React page Lux.
- **Operation limits override every path below:** plan: propose only; review: report and propose corrections without edits or unrequested report files; implement: change only authorized source; verify: test only authorized behavior. Source-only review needs no browser. Otherwise state the available review evidence level.
- After routing, inspect affected files/tests and existing instructions/contract. Expand to data clients, lockfiles or other surfaces only when needed. Preserve unrelated work and proven architecture.
- Load available companion skill entries conditionally: `sn-ui-page-vite` for Vite/HMR integration, and for its conditional target-runtime compatibility gate (evidence in `docs/ui-runtime-compatibility.md`) when the change first introduces a runtime-dependent component family (e.g. `RecordProvider`) or follows a major now-sdk / React / `@servicenow/react-components` change, reusing valid evidence otherwise; `sn-explain` before Fluent edits; `sn-build-install` for build/install operations. No framework migration merely for styling.
- **Components, tokens and CSS approach, on every path, in this order:** (1) the project's proven convention and approved contract; (2) for a new surface or the first use of a component family, the project SDK's bundled guides, reading only the task-relevant sections once from the confirmed project directory with `now-sdk explain <topic> --format raw` ([command policy](../../reference/sdk-commands.md)): `ui-page-guide` (components, URL routing), `ui-page-patterns-guide` (dirty state, CSS limits), `ui-page-theming-guide` (Horizon `--now-*` tokens); when the project already depends on `@servicenow/react-components`, also read the component docs shipped in that package before use, because props and events differ from React norms; (3) semantic HTML where no supported component fits, the project already uses it, or the component family has not passed the gate above. Record a deviation from the guides in the contract. The guides' absolutes (React 18.2.0, always `@servicenow/react-components`, never a build config) describe new pages on the default build: they never justify changing an existing project's React version, adding the library without approval, or removing the Vite files `sn-ui-page-vite` owns.

## Choose the smallest path

| Task | Read when starting that phase | Action / stop |
|---|---|---|
| Bounded copy/CSS patch | Nothing extra by default | Quick path below; no new contract/concept round |
| New page / major restructure | [Layout](references/layout-patterns.md), [contract template](templates/ui-design-contract.md) | Establish tasks and two populated structural options; get direction before broad implementation unless delegated |
| State, selection, form, async or write flow | [React behavior](references/react-servicenow.md) | Fix/test affected behavior; no unrelated redesign |
| Substantial copy work / wording uncertainty | [Copy](references/plain-language.md) | Revise affected strings, accessible names and recovery states |
| Source-only review | Topic references needed for findings | Report source evidence/inference and untested rendering; stop |
| Rendered review / substantial verification | [Browser acceptance](references/browser-acceptance.md) | Test agreed criteria; report evidence/gaps |

Combine paths only as needed. [Review template](templates/ui-review.md): substantial structured reports only, omit irrelevant sections. [Provenance](references/sources.md): maintenance/source questions only. Don't fetch external prompts or run installers/hooks.

### Local render

Only for rendered checks; source-only work skips this.

- Use the project's existing dev script (`now.dev.mjs`, or `scripts.dev` in `now.config.json`); adding or replacing one is `sn-ui-page-vite` work, not a way to preview a patch. Start it from the confirmed project directory, in its own terminal, with the confirmed alias; without `--auth` it uses the default alias:

  ```powershell
  now-sdk run dev --auth <alias>
  ```

  It does not exit by itself. Open the `http://localhost:<port>` URL from its log, send no other commands to that terminal, and stop it with Ctrl+C.
- **The local page is the live instance, not a fixture.** The dev server proxies instance requests with the alias's credential: the page acts as that user, with that user's roles and no browser login. Mutating controls there are live writes under the no-live-mutation rule below. Classify controls from source before activating them and stop before the commit step unless a write on named records is approved. Treat local screenshots as instance data.
- Local evidence covers the alias user at the dev-server root. Other roles and denied paths, the scoped `.do` endpoint and the embedded shell stay **not tested** locally; error, timeout and stale states need a mock layer the project already has, and this skill adds none.
- Do not run `now-sdk build` while a dev script that builds into the static output directory is running (the SDK React templates' watch build does): build rewrites that directory and the local page stops loading its bundle. Stop the server first, or restart it afterwards.
- Empty data or 401s after a long session: the proxy reads the credential once at start. Restart the dev server (`sn-auth` for a demonstrated auth issue) before treating it as a UI defect.
- No dev script, browser or authorization: finish source work and mark rendered checks **not tested**. Rendering the installed page instead goes through `sn-build-install` and its approval gates.

### Quick path

1. State the bounded change/acceptance check; reuse decisions. Ask only blocking questions, otherwise state assumptions.
2. Inspect/change affected code only. Follow the components/tokens order above and keep styles scoped. Copy: sentence case, concrete outcomes, persistent labels, accurate counts, safe cause/recovery, existing localization; preserve essential restrictions.
3. Run the project's existing checks from the confirmed project directory: `now-sdk build` (local; in a TypeScript project it also type-checks `src/client`) plus scripts already declared in `package.json`; add none. Require the native exit status and attributable output per the command policy; a failing build blocks the change. Inspect rendered changed content with representative long/missing values and affected viewport/zoom states. Test real keyboard/focus if controls are affected, and selection/draft continuity on presentation changes when present. DPR changes or screenshot scaling are not zoom; forced `.focus()` or synthetic events are not keyboard evidence. No unrelated async/write matrix. Load deeper guidance if the change exposes that risk.
4. Briefly report change, checks/evidence and gaps. Browser unavailable: source work may finish, rendered checks are **not tested**, UI acceptance is not established.

## Always preserve

- Version-supported APIs/components; no guessed imports, props or events, mixed UI kits or incidental dependency upgrades.
- Presentation changes (density, theme, columns) keep stable IDs, selection, drafts and an in-app review/confirmation step whose data is unchanged, because losing them silently discards user work. Context/version changes need explicit invalidation; consult React behavior when touching it.
- Server authorization, eligibility, the exact IDs/versions shown in the in-app review step, confirmation and concurrency. Client visibility is not security. No blind retry of uncertain writes or blanket success for partial results.
- Semantic controls, keyboard access, visible/unobscured focus, readability and zoom/reflow. Never hide required data or shrink text to hit density budgets; numerical targets are task-specific starting points.
- Synthetic/approved sanitized fixtures and bounded evidence; no credentials or private artifacts to external services. No live mutations, installs, ACL changes or remote uploads without explicit authorization; a write made through a local dev-server page is a live mutation. Design approval is not deployment permission.

## Finish honestly

Use **pass / fail / not tested / not applicable (reason)** per criterion. Separate source checks, local rendering, target installation/runtime and actual user approval/delegation. Builds, mocks and preview screenshots don't prove target behavior or design acceptance; this is not a WCAG audit.

Block acceptance for unusable primary tasks, unjustified missed agreed budgets, lost work, keyboard/focus defects, unexplained known ineligibility, misleading write outcomes, weakened security or missing required evidence. Fix within scope or report. For substantial work compare like-for-like before/after and revise failures; seek independent critique when available, otherwise label self-review. Review-only work stops at findings, not fixes.
