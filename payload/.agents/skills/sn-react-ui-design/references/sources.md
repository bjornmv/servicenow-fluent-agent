# Sources and adaptation decisions

Reviewed on 2026-09-11. This skill is locally authored guidance inspired by the sources below. It does not redistribute their source files, execution scripts, packages, fonts or binaries. Repository links are provenance, not runtime dependencies or installation instructions.

## Third-party design guidance

### Impeccable

- Project: https://github.com/pbakaus/impeccable
- Reviewed README provenance: https://github.com/pbakaus/impeccable/blob/ec0928d7863e8bd2be8b82c4ea8752958c798b06/README.md
- Useful concepts: establish product/task context, shape structure before building, critique, remove unnecessary complexity, clarify language, harden edge cases, and visually review iterations.
- Deliberate adaptation: task performance and approved ServiceNow conventions take precedence over novelty, expressive effects, font bans or universal color rules. No required "hero" for operational screens.
- Scope of research: published README/workflow descriptions, not a full code/security audit or local validation of its executable tooling.
- The reviewed distribution describes a launcher/downloadable engine, optional native hooks and local-only live editing. None is installed, executed or required by this skill.

### Vercel Web Interface Guidelines

- Skill wrapper provenance: https://github.com/vercel-labs/agent-skills/blob/ba46938889d4e58635362fb8f618e1178ac3ec46/skills/web-design-guidelines/SKILL.md
- Rules provenance: https://github.com/vercel-labs/web-interface-guidelines/blob/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1/command.md
- Useful concepts: visible focus, semantic controls, labels, overflow/long content, navigation state, motion preferences, locale handling and concrete code-review findings.
- Deliberate adaptation: native buttons do not need duplicate keyboard handlers; native tables do not automatically require ARIA grids; virtualization follows evidence, not an arbitrary row threshold. Sentence case, approved component conventions and existing React form architecture take precedence over generic stylistic preferences. Do not globally disable useful autocomplete or conceal overflow to satisfy a checklist.
- The reviewed wrapper fetches a moving rules URL during each review. This skill has no such runtime fetch. Pinning that wrapper alone would not pin its rules.

### Anthropic frontend-design

- Reviewed skill provenance: https://github.com/anthropics/skills/blob/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/frontend-design/SKILL.md
- Useful concepts: specific subject matter and representative content, intentional hierarchy, restrained structural decoration, a plan/review/build/critique loop, consistent action vocabulary and recovery-oriented copy.
- Deliberate adaptation: enterprise operators should not pay for distinctiveness with more scrolling or unfamiliar controls. A memorable hero or aesthetic risk is not the brief for an inventory workspace.

Commit links identify the latest file-specific commits returned by GitHub during this research. They make the cited material inspectable; they are not security attestations or recommendations to install those revisions. If actual third-party text/code is later vendored, review its applicable license and preserve required notices then.

## Standards and primary references

- WCAG 2.2 normative standard: https://www.w3.org/TR/WCAG22/
- Focus not obscured (minimum), explanatory guidance: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- Target size (minimum), explanatory guidance including exceptions: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- APG table pattern and native-table guidance: https://www.w3.org/WAI/ARIA/apg/patterns/table/
- React state identity, preservation and intentional reset: https://react.dev/learn/preserving-and-resetting-state

The WAI Understanding pages and APG patterns explain implementation and interpretation; they are not the normative conformance standard. This skill's short checklist does not cover every success criterion. Approximately 44px touch targets and keeping the whole focused control visible are usability preferences stronger than the cited AA minimums in some cases.

## Existing local workflows

- [React UI Page / Vite](../../sn-ui-page-vite/SKILL.md): authoritative local routing for the official SDK integration and conditional target-runtime compatibility slice.
- [Lux / AIUX](../../sn-lux/SKILL.md): use for actual Lux/AIUX (Lit) surfaces, not because a page has "Experience" in its name.
- [Fluent explanation](../../sn-explain/SKILL.md) and [build/install](../../sn-build-install/SKILL.md): retain their authoring/deployment boundaries; this skill does not invent platform APIs.
- Pi skills documentation was reviewed for metadata, discovery, explicit invocation and progressive disclosure. The local skill has a short entry and on-demand references/templates; no harness extension is necessary.

## Asset Experience case study

Authoring evidence: `C:\Users\bvelsrud\AssetApp\docs\asset-experience-ui-review.md` and its saved review screenshots from 2026-09-11. This is optional historical evidence, not a path future projects must read or a live state assertion.

The inspected React page showed zero complete inventory rows in a 1366×768 compact view, long source/destination panels above transfer assets, repeated promotional text and selection invalidation on density changes. Those observations motivated the screen-space, plain-language, state-continuity and rendered-acceptance rules here.

Do not hardcode that application's instance, record IDs, counts, transfer limit, table schema or navigation into unrelated projects. The eight-row laptop target is a proposed operational-list starting point, not an accessibility requirement or an already achieved result.

## Updating this skill

Review changes deliberately against product tasks, platform compatibility and accessibility/security obligations. Do not automatically fetch the latest external prompt or execute third-party installers/hooks. Keep source review, runtime installation, project adoption and measured design outcomes distinct.
