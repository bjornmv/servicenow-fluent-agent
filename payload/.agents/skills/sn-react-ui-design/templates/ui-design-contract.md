# UI design contract — <application / surface>

Use for a new page/major redesign. Merge into the project's `docs/ui-design-contract.md`; preserve unrelated surfaces. Keep only applicable sections. Record facts, decisions or explicit unknowns, not placeholder prose. Small patches reuse existing decisions without creating this document.

Status: <proposed / approved / delegated direction recorded>
Date / owner / scope: <...>
Actual approval or delegation reference: <decision / pending>

## Task and constraints

- Surface/entry, framework/host and embedded shell: <...>
- Users/roles and accessibility needs: <...>
- Supported data/actions, authorization, eligibility and concurrency guarantees: <...>
- Expected volume, page size/count scope and peak workload: <...>
- Non-goals / behavior to preserve: <...>
- Required viewports, themes, locales/time zones and input methods: <...>
- Local/target environments, fixture policy and explicitly allowed write tests: <...>

| Priority | Concrete task | Start -> successful end | Current friction and evidence type |
|---|---|---|---|
| 1 | <...> | <...> | <live / saved / source inference / unknown> |
| 2 | <...> | <...> | <...> |
| 3 | <...> | <...> | <...> |

## Structural decision

- Two populated structural options, trade-offs and recommendation: <...>
- Chosen structure and actual approval/delegation: <...>
- Navigation vocabulary; first-screen regions; primary/contextual actions: <...>
- Required columns/fields, secondary details and narrow-screen priority: <...>
- Components/tokens and verified versions/imports/runtime constraints: <reuse documented decisions; link rather than duplicate>
- Material copy decisions/glossary: <inline or existing reference>

## State and safety — affected domains only

| Event | Selection/draft policy | Review invalidation | Focus/announcement |
|---|---|---|---|
| Density/theme/columns | Preserve relevant work | No if data/operation unchanged | Preserve logical focus |
| Query/page/sort/source/object | <explicit ID/scope and unsaved-work policy> | <affected inputs> | <necessary reset explanation> |
| Permission/version/eligibility | <safe prune/reset> | Revalidate affected operation | <safe explanation> |
| Partial/uncertain write | <recoverable work retained> | <reconcile before retry> | <truthful outcome> |

Mutation/review boundary, exact IDs/versions, confirmation, duplicate/retry policy: <existing guarantees>
Sensitive data/URL/storage/evidence restrictions: <...>
Affected loading, empty, error, stale, denied and long-content states: <...>

## Acceptance criteria

Adopt task-specific targets from layout guidance only where appropriate. Do not copy table row budgets into forms or zoomed layouts. Proposed criteria are not test results.

| ID | Task/state, data, role, viewport/zoom | Measurable target | Verification method |
|---|---|---|---|
| <...> | <...> | <...> | <source / geometry+visual / real keyboard / behavior / user evaluation> |

Cover applicable layout, focus/accessibility, state continuity/invalidation, safe recovery, locale and realistic-volume performance. Document usable host viewport, stable synthetic/sanitized fixtures and any exception with rationale, replacement criterion and actual decision owner.

## Evidence and release

Link results rather than copying the review: <actual review/artifact paths>
- Source / local-rendered / target installation and runtime status: <separate results or pending>
- Existing target compatibility evidence and whether invalidated: <...>
- Independent critique or self-review; blockers/gaps: <...>
- User design approval: <actual decision / pending>
- Deployment authorization and target: <separate actual decision / not requested>
