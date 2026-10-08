# Task-first layout and structural planning

Use for new/major structures or layout-specific review. Choose from task frequency, comparison needs, data shape and permissions, not a favorite dashboard template.

## Plan before CSS

1. Establish users/roles, top three concrete tasks and completion conditions, authorized data/actions, expected volume, non-goals and host/viewport/locale/theme constraints. Ask only blocking questions; otherwise record assumptions.
2. For an existing surface, capture available task-path, scrolling, first useful content, visible-record and state-loss evidence. Label live observation, saved evidence and source inference separately.
3. Merge decisions into `docs/ui-design-contract.md` using the contract template linked from SKILL.md. Preserve other surfaces and existing approved choices.
4. Present **two genuinely different populated structural options**, not palettes. Place search, records, details, selection and the primary action; explain trade-offs and recommend one. Obtain direction before broad implementation unless the user delegated the decision; record the actual approval/delegation, never invent it.
5. Agree measurable task/layout criteria and a small verified component/token plan. Use synthetic or approved sanitized fixtures with enough mixed rows, long identifiers and missing values to expose problems. Do not invent live totals.

## Shared defaults

- One compact title/context row, task controls, then useful work. Avoid heroes, duplicate eyebrow/title/subtitle, decorative KPI/category strips and cards around every field unless task evidence justifies them.
- Use consistent object/task nouns in navigation. Separate audience context from destinations; make returning to the user's own records easy.
- Reuse accessible project tokens; otherwise Horizon tokens from the SDK's `ui-page-theming-guide` (`--now-static-space--*`, `--now-static-font-size--*`, semantic `--now-*` colors), always written with a fallback (`var(--now-…, <fallback>)`) as that guide's examples are, and with no hard-coded colors. Starting targets if neither fits: 1.5rem title, 0.875–1rem body with comfortable line height, 0.25/0.5rem spacing steps, 1.5–2rem desktop gutters, quiet dividers, modest radii/elevation; prefer rem over fixed px. These are not WCAG minimum font sizes.
- Use wide screens for useful columns/context; constrain prose and focused forms rather than every inventory. One deliberate accent and neutral surfaces are valid; no universal font/color bans.
- Distinguish primary action, selection, focus, warnings and errors. Status needs a non-color equivalent. Preserve required themes, reduced motion and forced colors; skip decorative animation by default.
- One clear primary next action per task region. Disclose details/rare filters progressively, never essential restrictions, required inputs or material consequences.
- Create reusable components for recurring behavior, not every ordinary section.

## Choose a pattern

### Inventory / work queue

```text
Assets           My assets | All assets | Transfers
All assets                         [Search assets..........]
[Type: All v] [Status: All v] [More filters] [Sort: Name v]
[ ] Asset                   Tag       Status       Location
[ ] Network switch          EQ-0107   In stock     Oslo
[ ] Field laptop            EQ-0108   Assigned     Bergen
...
25 shown                                        Prev  Next
When selected: 3 selected   Clear           [Review action]
```

For ServiceNow records, use the supported record-list component when SKILL.md's components order selects it (`NowRecordListConnected` on `@servicenow/react-components` pages); otherwise, and for non-record data, an aligned semantic table for comparison. Record a hand-built record list on such a page as a deviation in the contract. The sorting, count, selection and bulk-action rules below are acceptance criteria either way; verify that a component meets them. A two-line list can suit small personal collections. Choose task-relevant columns; put optional technical fields in details. Use links for destinations, buttons for in-place actions, not a clickable row as the only affordance or duplicate focus stops.

Provide stable sorting, scoped counts, active filters and bounded server pagination. “25 shown” is not a global total; “Select this page” means the displayed page. Virtualize only for measured scale with supported keyboard/assistive behavior, not an arbitrary row threshold.

At zero selection hide bulk actions, not selection affordances. Showing the bar must not jump the table or steal focus. Explain known disabled actions safely and specifically; distinguish limits, permissions, eligibility and pending work. Hover on a disabled button cannot be the only explanation.

### Multi-record workbench

```text
Transfers                                  [Documents...]
Type [Stockroom to case v]
From [Central stockroom v]    To [Case EQ-020 v]
Assets in Central stockroom                 [Search.......]
[ ] Asset                   Tag       Serial        Status
[ ] Network switch          EQ-0107   Not recorded  In stock
...
3 selected  Central stockroom -> Case EQ-020 [Review transfer (3)]
```

Use labeled, searchable, bounded endpoint pickers; collapse to the chosen value plus Change. Avoid persistent full-height directories above the records. Keep context, selection and next action together. Reserve space for sticky controls so they do not cover rows, focus or the mobile keyboard's active field.

Offer only supported operation combinations. Keep one primary review action; select-page changes selection, not a competing review flow. Review exact selected IDs, endpoints, meaningful before/after values and known ineligible items. Preserve required confirmation, attestations and existing limits; do not invent a maximum. Keep secondary outputs (documents, exports) out of the primary action position.

### Record details / forms

Make identity, status and next task easy to locate. For a ServiceNow record form the components order may select `RecordProvider`; the rules here still apply. Group fields by the user's mental model, with persistent labels and appropriate input types. Prefer one readable column; use multiple columns only for closely related fields with sensible reading/tab order.

A supported drawer can preserve list context for short inspection; use a full page for long editing. Choose modal/nonmodal behavior explicitly; not every side panel needs a focus trap. Keep requiredness and constraints visible. Preserve input on error, associate field errors and focus an error summary/first invalid field after submission.

Name outcomes (“Save changes”, “Assign equipment”). Confirm consequential/destructive operations, not every harmless save. Warn only for genuinely unsaved changes, through the project's dialog component, not `window.confirm()`/`window.alert()`. Follow the existing router/draft policy; `beforeunload` alone is unreliable, and sensitive drafts need approved storage.

### Analytical dashboard

Use only for monitoring, prioritization or trends. Every metric/chart needs a decision, authorized scope, units/time range, accessible summary and drill-down. No invented KPIs or real-time claims. If the main task is locating/updating records, start with a queue.

## Agree screen-space budgets

These are **starting targets for a populated comparison table with 20+ representative rows**, not universal acceptance criteria. Adopt or replace them in the project contract based on task and host.

| Viewport, 100% browser zoom | Starting target |
|---|---|
| 1366×768 CSS px | First data row top <=240px; >=8 complete readable rows at normal density |
| 1920×1080 or the contract's primary desktop viewport | Deliberate gutters; useful columns/context rather than blank framing |
| 390×844 CSS px | First meaningful result top <=320px; key action reachable; no unintended page-wide horizontal scroll |

Measure at initial scroll after data/fonts settle; document host/iframe chrome and usable viewport. A local dev-server page has no host chrome, so embedded-shell budgets stay not tested there. Count fully visible readable populated rows, not skeletons, clipped rows or rows covered by sticky bars. Browser acceptance owns the measurement procedure.

Desktop row heights might start at 44–48px, compact 36–40px; let content grow. Accessible targets and legibility take precedence. At zoom, check access/reflow rather than forcing row counts. Forms, dashboards, embedded shells and instructional tasks need task-specific criteria and documented exceptions.

On narrow screens prioritize search, filters, records and key actions rather than stacking every desktop panel. At 320 CSS px, preserve information/functionality through reflow. Genuine two-dimensional tables may use a keyboard-accessible contained scroll region; don't silently lose critical comparisons. Use flexible sizing, `min-width: 0` and deliberate wrapping, never global `overflow-x: hidden` to mask defects.
