# UI review — <surface / change>

Use for a substantial structured report. Omit irrelevant sections; a small patch needs only change, checks/evidence and gaps. Return in the conversation unless a saved report is requested or part of the authorized implementation deliverable.

Date / reviewer: <...>; independent or self-review: <...>
Scope / revision / environment: <...>
Evidence level: <source-only / saved / local rendered / target rendered>
Contract criteria: <path + IDs, or scoped review criteria>
Role / fixture/query / theme / locale / viewport / zoom / scroll: <tested context>
Allowed interactions/writes: <normally no live mutations>

## Verdict and findings

<State whether the reviewed task works or acceptance is blocked, and what evidence supports that conclusion. A source-only review makes no rendered-acceptance claim.>

| Severity | Task/problem | Evidence and certainty | Correction | Status |
|---|---|---|---|---|
| Blocker / major / minor | <...> | <file:line, measurement or reproducible interaction; observed vs inferred> | <...> | <open / fixed / retest> |

Don't average safety, focus or primary-task failures into a visual score. Review-only work proposes corrections without applying them.

## Checks and measurements

Results: **pass / fail / not tested / not applicable (reason)**. Missing evidence is not a pass. Unavailable required checks are not “not applicable.”

| Criterion/scenario | Result | Actual command/outcome or evidence | Gap / next step |
|---|---|---|---|
| <affected criterion> | <...> | <...> | <...> |

Include affected source/safety tests, populated layout, real keyboard/focus, state continuity, error/recovery, zoom/reflow/themes, accessibility, locale, performance and target-runtime checks. Separate automated scans from actual screen-reader testing. Record commands only if run and artifacts only if saved.

For layout comparisons, use identical data/role/query/viewport/zoom/theme/scroll and label unavailable baselines:

| Measurement / view | Before | After | Agreed target | Evidence |
|---|---|---|---|---|
| <first useful content, complete rows, overflow/obstruction, task steps as applicable> | <...> | <...> | <...> | <...> |

## Material copy changes — if relevant

| Before | After | User-facing reason |
|---|---|---|
| <include accessible names/errors when changed> | <...> | <...> |

## Handoff

- Source readiness / local rendered status: <separate outcomes>
- Target installation/content evidence / target runtime: <separate outcomes; not performed if absent>
- Limitations and remaining blockers: <untested roles/states/tools; no full WCAG audit>
- User design approval / deployment authorization: <separate actual decisions, or pending/not requested>
- Next action and actual sanitized artifact paths: <...>
