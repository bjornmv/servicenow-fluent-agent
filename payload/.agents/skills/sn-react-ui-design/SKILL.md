---
name: sn-react-ui-design
description: Design, implement, review or verify ServiceNow React UI Pages and custom React interfaces, including React-based Asset Experience. Use for JSX/TSX, CSS, copy, forms, tables and interaction changes. Not Lux/AIUX (Lit), Service Portal or UI Builder.
compatibility: Windows-native; existing project tooling. Rendered verification needs browser access. No installation required.
metadata:
  version: "1.1.0"
---
# ServiceNow React UI design

Optimize task completion, clarity and accessibility. **Read only the current task/phase's guidance, once; links are not a read-all checklist.** Resolve relative paths from this directory. Store project decisions in the project contract.

## Route and scope

Confirm the requested project, surface and operation using minimal entry/manifest evidence; never assume a remembered app/instance.

- Actual Lux/AIUX (Lit): switch to `sn-lux` and stop this workflow. Portal/UI Builder needs its supported workflow. In mixed projects verify the surface; `aiux.json` and “Experience” alone don't identify it.
- **Operation limits override every path below:** plan proposes; review reports/proposes corrections without edits or unrequested report files; implement changes authorized source; verify tests authorized behavior. Source-only review needs no browser. Otherwise state the available review evidence level.
- After routing, inspect affected files/tests and existing instructions/contract. Expand to data clients, lockfiles or other surfaces only when needed. Preserve unrelated work and proven architecture.
- Load available companion skill entries conditionally: `sn-ui-page-vite` for scaffolding/hosting/HMR, `sn-explain` before Fluent edits, `sn-build-install` for build/install operations. No framework migration merely for styling.

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

### Quick path

1. State the bounded change/acceptance check; reuse decisions. Ask only blocking questions, otherwise state assumptions.
2. Inspect/change affected code only. Reuse supported components/tokens or semantic HTML and scoped styles. Copy: sentence case, concrete outcomes, persistent labels, accurate counts, safe cause/recovery, existing localization; preserve essential restrictions.
3. Run relevant checks. Inspect rendered changed content with representative long/missing values and affected viewport/zoom states. Test real keyboard/focus if controls are affected, and selection/draft continuity on presentation changes when present. No unrelated async/write matrix. Load deeper guidance if the change exposes that risk.
4. Briefly report change, checks/evidence and gaps. Browser unavailable: source work may finish, rendered checks are **not tested**, UI acceptance is not established.

## Always preserve

- Version-supported APIs/components; no guessed imports, mixed UI kits or incidental dependency upgrades.
- Stable IDs, selection, drafts and unchanged reviews across presentation changes. Context/version changes need explicit invalidation; consult React behavior when touching it.
- Server authorization, eligibility, exact reviewed IDs/versions, confirmation and concurrency. Client visibility is not security. No blind retry of uncertain writes or blanket success for partial results.
- Semantic controls, keyboard access, visible/unobscured focus, readability and zoom/reflow. Never hide required data or shrink text to hit density budgets; numerical targets are task-specific starting points.
- Synthetic/approved sanitized fixtures and bounded evidence; no credentials or private artifacts to external services. No live mutations, installs, ACL changes or remote uploads without explicit authorization. Design approval is not deployment permission.

## Finish honestly

Use **pass / fail / not tested / not applicable (reason)** per criterion. Separate source checks, local rendering, target installation/runtime and actual user approval/delegation. Builds, mocks and preview screenshots don't prove target behavior or design acceptance; this is not a WCAG audit.

Block acceptance for unusable primary tasks, unjustified missed agreed budgets, lost work, keyboard/focus defects, unexplained known ineligibility, misleading write outcomes, weakened security or missing required evidence. Fix within scope or report. For substantial work compare like-for-like before/after and revise failures; seek independent critique when available, otherwise label self-review. Review-only work stops at findings, not fixes.
