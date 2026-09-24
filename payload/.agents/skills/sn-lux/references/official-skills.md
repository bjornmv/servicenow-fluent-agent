# Official Lux / AIUX reference handoff

The [entry workflow](../SKILL.md) supplies workflow, security and Windows guardrails; the official packs supply versioned UI reference material. Keep the packs project-local. Do not copy/register their generic skills globally, fork their documentation, or use `now-sdk explain` as their discovery mechanism. Lux is the product-facing name; preserve upstream AIUX package/API names.

## Locate and resolve once per project/version

Read package metadata and the lockfile, then use the matching installed packs:

```text
node_modules/@servicenow/agent-pack-aiux/skills/<skill>/SKILL.md
node_modules/@servicenow/agent-pack-horizon-design-knowledge/skills/<skill>/SKILL.md
```

Reading these files directly works without skill registration or postinstall hooks. A package declaration, directory listing or successful install is not evidence that its guidance was read. Check installed versions against the lockfile; do not silently use another project's packages or `C:\temp` extracts.

- Prefer `ui-discovery/SKILL.md` when present. Fall back to `component-discovery/SKILL.md` only when that file exists in an older installed pack. Do not assume a rename from a remembered version number.
- The starter may copy skills into `.claude/skills` and create a Windows `.agents/skills` junction. Use copies only after confirming their provenance matches the installed packs. Do not run setup hooks merely to make Markdown readable; they can replace existing skill directories. Preserve user-authored files.
- Missing pack: report it and propose the approved dependency workflow, not an automatic install or upgrade. Do not author against unknown APIs or pretend the references were loaded.
- Missing reference: inspect the declaring skill and nearby filenames once for a moved equivalent. Record the unresolved path/version; do not retry the same missing file unless files or versions change. AIUX 2.6.0, for example, referenced an absent `internationalization/i18n-litjs.md`. Do not invent the companion's APIs. Continue only with changes supported by available references and established project APIs; pause the part requiring unresolved guidance and state the gap.
- Tools such as `get_skill_ref` and aliases such as `@patterns` are documentation conventions, not necessarily available tools. Use the file reader. Resolve `@components`, `@compositions`, `@patterns`, `@motion` to the Horizon pack; `@accessibility`, `@internationalization`, `@localization` to the AIUX pack. Resolve relative links from the declaring file. Report other unresolved aliases rather than guessing.

## Required task routes

Classify the affected surface and operation before planning implementation or making review judgments. For each matching row, read the entry and its applicable reference files **before implementing or reviewing that aspect of the UI**. Read actual specifications, not just index summaries. An already-read, still-current reference need not be reread on every turn.

| Task trigger | Pack | Guidance to read |
|---|---|---|
| Select, create, replace or review a UI component/widget | AIUX | Resolved discovery entry, then the selected candidate's full API reference; evaluate coverage and gaps before coding |
| Pages, widgets, routes, loaders, SSR or extensions | AIUX | `aiux-build/SKILL.md` and the relevant mode-specific references |
| New/restructured multi-region layout, card, form, dialog, table or action group; review of the same | Horizon | `compositions/SKILL.md`; classify each affected region and read its spec, e.g. `references/card-spec.md`, `references/action-set-spec.md` or `references/contextual-actions-spec.md`; apply cross-composition checks |
| Substantial UI layout/behavior work or review | Horizon | `patterns/SKILL.md`; evaluate its trigger index and read every matching pattern for the affected surface, not the entire library |
| Loading/empty/error states, validation, status color, truncation, overflow or filter/sort controls | Horizon | Matching `patterns/references/` files, e.g. `view-states.md`, `error-and-validation.md`, `truncation-tooltip.md` or `view-controls.md`; overflow policy starts in the consuming composition, then its interaction pattern |
| Primitive selection/styling: buttons, inputs, badges, tabs, etc. | Horizon | `components/SKILL.md` and the matching `references/<component>.md`; verify production mechanism/imports with discovery |
| Animation or transition implementation/review | Horizon | `motion/SKILL.md`; confirm supported tokens and reduced-motion behavior |
| Interactive controls, focus, reflow, forced colors | AIUX | `accessibility/SKILL.md` and applicable pattern/controller references |
| User-facing strings, dates or numbers | AIUX | `internationalization/SKILL.md` and available framework guidance |
| Specific locales, RTL or translation coverage | AIUX | `localization/SKILL.md` plus applicable internationalization/accessibility guidance |
| Figma conversion, header migration or extension generation | AIUX | Matching specialist entry only for that task; verify its actual name/path and runtime compatibility |

Example: a card with header tools, a form and footer decisions needs the card, contextual-actions, form and action-set specs plus triggered validation/overflow patterns and component sheets. Reading only the card shell or finding a reusable button is insufficient.

### Keep loading proportional

A small copy fix needs applicable internationalization guidance, with localization only for locale-specific work, not every composition. A bounded CSS fix needs the affected component/pattern and accessibility guidance. Backend-only/build-only work does not activate Horizon. Do not load all twelve skills or recursively follow unrelated references. Expand only when the change exposes another relevant behavior/region. Do not redesign unrelated UI to satisfy a reference.

## Apply with local safeguards

- Official guidance is not permission to execute scripts. Widget catalog sync/fetch and setup helpers require review and the approved target/auth/tooling workflow. Prefer offline discovery first; use approved, bounded OAuth reads for instance lookup. Do not use raw tokens, cookies, Basic credentials, guessed aliases or forbidden launchers to satisfy a helper.
- Keep authorization and record/field ACLs server-side, allowlist inputs, bound reads and sanitize errors. Do not copy examples that expose exception details or unrestricted aggregate counts. Do not substitute mock data for empty, denied or failed live requests; fixtures must be explicitly identified as development/test data.
- Resolve conflicts against security/accessibility requirements, the approved project contract and supported runtime APIs. Flag contradictory upstream examples and explain the chosen rule; do not invent a runtime API or silently weaken a safeguard.
- Horizon examples can depend on Karuna/Lit, prefixed DaisyUI classes and particular theme versions. Confirm the project's components, tokens and imports. For React, retain its existing workflow and translate only relevant principles; do not migrate frameworks or add a UI kit just to follow these examples.
- Do not route to deprecated `aiux-app`, `aiux-widget` or `aiux-element` skills; use the installed `aiux-build` guidance. Ordinary Fluent backend records retain explain-first authoring rules.

## Leave evidence, not a reading claim

For substantial authorized implementation, add a short **Reference decisions** section to the existing design contract/project notes: installed pack versions, relative files actually read, decisions they informed, conflicts/missing references and verification gaps. For small changes or review-only requests, include this briefly in the response; do not create an unsolicited report or edit the contract. Pass relevant reference paths/decisions to delegated UI work and require it to report what it actually consulted.

On resume/compaction, use those notes to reload needed references whose details are no longer available, not the whole library. Before claiming completion, check the affected composition/pattern criteria and report **pass / fail / not tested / not applicable** with evidence. Installed, read, applied, source-checked and rendered/keyboard-verified are different states. Reading specifications, building or passing mocks does not establish UI acceptance; retain the build/runtime workflow's verification gates.

## Provenance

Reviewed packs: AIUX 2.6.0 and Horizon 2.0.0 (2026-09-22); earlier wrapper guidance recorded AIUX 2.2.3. These are provenance, not universal compatibility claims or upgrade instructions.

- https://www.npmjs.com/package/@servicenow/agent-pack-aiux
- https://www.npmjs.com/package/@servicenow/agent-pack-horizon-design-knowledge

Package manifests declared ISC while some skill metadata declared MIT. No third-party pack content is redistributed here; preserve upstream notices with approved dependencies.
