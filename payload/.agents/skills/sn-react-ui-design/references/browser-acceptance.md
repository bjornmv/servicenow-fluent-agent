# Rendered design acceptance

Use for rendered review or substantial-change verification. A source-only review can finish without a browser; it cannot establish rendered acceptance. Small patches use the quick path in SKILL.md unless these deeper checks are needed.

## Evidence and scope

Distinguish **source/logic**, **local rendered**, **target rendered** and **user approval/delegation**. jsdom/VM tests have no reliable layout engine. Local fixtures/HMR prove only tested local behavior; installed content markers do not prove usable UI. Reuse valid target-runtime compatibility evidence under `sn-ui-page-vite`'s conditional gate; a visual patch does not require an upload. After authorized deployment, validate the changed artifact on its actual target separately.

Use contract criteria and a risk-based matrix. For substantial changes include applicable cases below; for a focused fix test affected risks only. Mark unavailable required checks **not tested**, not “not applicable.”

| Dimension | Cases to consider |
|---|---|
| Data | Empty, no matches, one row, 20+ representative mixed rows, long/unbroken identifiers, missing fields, mixed eligibility; peak volume separately for performance |
| Async | Initial load, refresh/load-more, denied, error/timeout, stale response, partial result, pending/uncertain write; simulate safely in local fixtures, not by disrupting production |
| Viewport | 1366×768, 1920×1080 or baseline, 390×844, actual embedded shell; same before/after dimensions |
| Accessibility | Actual 200% browser zoom/text enlargement as appropriate, 320 CSS px reflow (or equivalent 400% zoom from 1280px), keyboard, reduced motion, forced colors, required themes |
| Role | Intended ordinary operator plus relevant read-only/denied paths; admin-only testing is insufficient; don't change real roles/ACLs to stage evidence |
| Locale | Long translations, platform locale/time zone, RTL when supported |

DPR changes and screenshot resizing are **not browser zoom**. Record the method and limitations.

## Browser procedure

1. Use the available `pi-browser-harness` skill entry when using that harness; load it once, not an assumed installation path. If browser capability is unavailable, report the gap without installing/downloading tools automatically.
2. Connect with `browser_setup` if needed; use an owned tab in the approved profile. Browser login is separate from SDK OAuth; let the user authenticate without collecting credentials. After navigation, wait for load **and meaningful data readiness**, not just a mounted root or arbitrary sleep.
3. Use bounded `browser_snapshot` for structure/refs (roughly 300–800 nodes), then `browser_execute_js` for specific state/geometry. Use inspected selectors/stable attributes, not guessed CSS. Do not dump DOM or broad network payloads.
4. At initial scroll after data/fonts settle, measure first useful content, complete rows where applicable, usable viewport, overflow and primary-action position. Capture screenshots for actual visual hierarchy, legibility, spacing, colors and focus review, not data extraction.
5. Exercise real controls. Keyboard evidence requires `browser_press_key` sequences; forced `.focus()`, synthetic events, direct handler calls, force-enabling controls or bulk filling cannot establish a keyboard-only task passed.
6. Diagnose broken/silent actions with bounded console/network records; include response bodies only when necessary. For target runtime verification, check new uncaught errors during the tested flow and distinguish pre-existing errors.
7. Save only approved/sanitized evidence in the project's existing location; record paths only when files exist. Keep private/transient artifacts out of source control as appropriate. Never send private screenshots, URLs, records or source to external design services.

## Geometry without false passes

`getBoundingClientRect()` measures a border box, not readability, unobscured targets or accessibility. Compare actual measurements with the contract, not estimates from resized screenshots.

For table-row budgets:
- Select real populated rows, excluding headers, skeletons and hidden responsive duplicates.
- Intersect viewport, scroll container and clipping ancestors; account for host frames and sticky overlays. Count only rows fully inside the effective visible region whose required cells remain readable.
- Record first-row top and complete-row count. State frame-local versus outer-viewport coordinates and translate correctly, or document the usable frame viewport/shell allowance.
- Inspect horizontal overflow explicitly. A keyboard-accessible contained two-dimensional table may be valid; page clipping, hidden labels and masked overflow are not.

Use existing browser tests/stable selectors for agreed geometry and state assertions. Avoid pixel-perfect tests for every decorative margin. Written assertions are not executed tests.

## Real keyboard/focus paths

Test complete affected tasks, not merely Tab on the first button:
- Enter main content, reach search, type/query and navigate to results in logical order.
- Open/apply/clear filters and sort; exercise picker arrows, Enter/Escape and typed search where supported.
- Open and close record details/dialogs; check appropriate modal behavior and focus return, including when the original trigger disappears.
- Select records, change presentation and verify IDs/count/drafts remain; contextual actions must not steal focus.
- Open review, inspect exact changes/eligibility/errors, cancel and return without lost context. Confirm no real write without explicit authorization.
- Exercise validation/error summary, retry, unsaved-change behavior and useful, non-repetitive announcements where relevant.

Accessibility-tree inspection is not screen-reader testing. If assistive-technology testing is required/available, record the actual browser, technology and scenario; otherwise state the gap.

## Accessibility baseline

Target applicable WCAG 2.2 AA plus project obligations; this is not the full standard or a compliance audit.

- Normal text contrast >=4.5:1; qualifying large text >=3:1. Required non-text UI/state indicators generally need 3:1 against adjacent colors, subject to criterion scope/exceptions. Check real states in required themes.
- Targets generally meet 24×24 CSS px or a valid WCAG 2.5.8 exception, including spacing. Prefer roughly 44×44 hit areas for frequent touch actions; that preference is not the universal AA minimum. Row height alone does not establish checkbox target size.
- Visible keyboard focus. AA focus-not-obscured requires the component not be entirely hidden by authored content; prefer the stronger product target of the whole control/indicator remaining visible.
- Accurate names, roles, values, persistent labels, error association, headings/landmarks, keyboard access and status announcements. Never rely on color/hover alone.
- Text resize/reflow without lost function/content; preserve browser/pinch zoom. Assess genuine two-dimensional exceptions rather than breaking tables.
- Respect reduced motion, test forced colors, and provide non-drag alternatives; apply relevant gesture/motion requirements.

Run approved accessibility tooling if present; adding dependencies needs normal approval. A scan does not replace manual interaction or prove complete compliance.

## Critique and report

Compare like-for-like task/data/query/role/viewport/zoom/theme/scroll state; label missing baselines. Review hierarchy, task visibility, copy, continuity and accessibility, not just screenshot differences. Revise failures within authorized scope; for review-only work propose fixes. Seek independent critique for substantial work when available, otherwise label self-review.

Prefer observable tasks: locate a tagged record, identify its assignee, prepare three records for an operation and cancel safely. Agent execution is not a human usability study. Measure time, scrolling, corrections and comprehension with representative users when available; never invent percentage improvements.

For each criterion use **pass / fail / not tested / not applicable (reason)** with evidence and follow-up. Report blockers individually, not an average design score. Keep source readiness, local rendering, target installation/runtime, actual user sign-off and deployment authorization distinct. Use the review template only when a structured report is warranted.
