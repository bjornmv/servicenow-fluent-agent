# React behavior and ServiceNow boundaries

Use for interaction/state changes or behavioral review. Apply affected sections; this is not a requirement to rewrite unrelated behavior. Inspect project versions and official local docs before using component, provider, client or server APIs.

## Runtime and components

Reuse the supported React host, component library and tokens. A package named `@servicenow/*` does not guarantee its providers work in a direct UI Page. Prefer semantic HTML for simple controls and approved accessible components for complex pickers/dialogs; don't invent imports or add a UI kit to restyle a page.

Scope styles to the app root/modules; preserve host controls, portals and inherited themes. No global resets that damage the ServiceNow shell. Keep dev proxies, localhost assets and relaxed security out of production; no injected live-edit helpers, weakened CSP or disabled browser security. Scaffolding/HMR/hosting changes route through `sn-ui-page-vite` as described in SKILL.md, not for ordinary UI changes.

## Separate state by meaning

| Domain | Policy |
|---|---|
| Presentation: density, theme, columns | Preserve selected IDs, drafts and review of unchanged data |
| Dataset/context: query, filters, source, employee, page | Explicitly persist, prune or reset selection; explain necessary resets and scope |
| Selection | Stable record IDs, never row index, display name or DOM position |
| Edit draft | Preserve on validation/network errors; never submit an old object's draft to a new object |
| Server snapshot: fields, eligibility, versions | Authoritative for what was read, not perpetual permission |
| Review/approval | Bind exact operation, IDs, values/versions; invalidate affected changes and revalidate on server execution |

- Use stable keys, not density, array position or randomness. Avoid nested component definitions that remount on every render. Hoist important state if switching table/list views unmounts components.
- Handle unsaved work on intentional object/context changes. Query/source/permission changes are not presentation changes; never preserve selections blindly across security/user contexts.
- Sorting usually presents the same set, but page-based selection may change scope. Preserve explicit IDs where safe. “Select all” needs a real, bounded, authorized definition and cross-page policy.
- Keep approval-bearing state and sensitive drafts out of URLs/localStorage by default. Deep-link only safe validated navigation/filter state; exclude secrets and sensitive search terms. Preserve predictable Back behavior.

## Async and mutations

- Distinguish initial load, ready, empty, no matches, denied and error. Track refresh/loading-more separately so retained results remain usable but are not falsely described as current.
- Guard against stale responses with cancellation or request sequencing; clean up subscriptions/unmounts. Debounce expensive searches appropriately, including IME composition. Keep input responsive; profile before blanket memoization or new state libraries.
- Fetch bounded pages/fields, avoiding per-row requests and unrestricted list/count loads. Measure realistic volume before adding virtualization.
- Show pending state and prevent duplicate submission. Client disabling is not exactly-once execution; retain server concurrency/idempotency protections.
- Timeout/abort does not prove a write was cancelled. Reconcile through an authorized status/read flow before retrying a possibly committed non-idempotent write.
- Report per-item partial outcomes; retain failed/uncertain work and don't retry successful items. Optimistic updates require understood reversibility, authorization and reconciliation; don't assume high-consequence success.

## Server and data safety

- Enforce record/field authorization and eligibility on the server through documented secure access. Hidden buttons, client role checks and successful previews are not enforcement.
- Preserve strict validation, allowlisted operations/fields, bounded limits, scoped queries, exact reviewed IDs/versions, required confirmation/attestations and final server revalidation. A new selector must not expand backend-supported operations.
- Retain the established authenticated client/session and CSRF protections. Never expose credentials or raw tokens in bundles, logs, screenshots or docs.
- Explain safe known capability/eligibility reasons without leaking restricted fields. Admin success does not establish ordinary-user access; never weaken ACLs for a demo.
- Audit implicit writes, inline editing and connected controls in read-only views, not just Save buttons. UI testing does not authorize live transfers, emails, side-effecting document generation or destructive fixtures.
- Keep React text escaping. Rich HTML needs an approved sanitizer and URL policy; validate navigation/download URLs and preserve platform protections.

## Semantics and focus

- Links navigate; buttons act. Native buttons already support keyboard activation; redundant Space/Enter handlers can fire twice. Use persistent input labels, associated hints/errors (`aria-describedby`) and accurate `aria-invalid`.
- Use semantic tables with header relationships and named sort controls/`aria-sort`. Selectable rows do not require `role="grid"`; a grid requires its complete composite keyboard model.
- Follow the supported component/APG pattern for custom tabs/comboboxes/dialogs. Ordinary navigation needs links, not ARIA tabs.
- Modals need a name, appropriate initial focus, containment, background isolation, suitable Escape behavior and focus return to the trigger/logical fallback. Never hide a focused ancestor with `aria-hidden`. Nonmodal drawers must not trap focus or inert the background.
- Keep focus stable on refresh, density changes and contextual-bar appearance. Announce useful status/counts politely without rereading the list on every keystroke. Critical errors cannot be toast-only.
- Preserve visible/unobscured focus, contrast, zoom and motion preferences. Adding an `aria-label` does not repair a broken interaction.

## Regression scope

Test affected outcomes: presentation preservation, intentional context/version invalidation, stale-query guards, validation recovery, partial/uncertain results and exact reviewed-write semantics. Keep backend safety coverage. Change a test that enshrines poor UX only with an approved behavior change, not by deleting its safety assertions. Logic tests do not replace real browser interaction evidence.
