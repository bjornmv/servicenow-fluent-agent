# Archetypes

Pass `--archetype <name>` to `sn-skill doc-render`. Each sets the cover, Contents list and the PDF/DOCX running header/footer with `Page N of M` (not on a clean first page). HTML gets the cover and Contents only. Source of truth: `frames.cjs` (`--help` lists names, covers and required keys). A wrong name exits 2 with `Unknown archetype`; `compliance` = `compliance_report`.

| Archetype | Cover | Required metadata | Optional metadata | Contents | Header / footer |
|---|---|---|---|---|---|
| `plain` | none | — | `title`, `subtitle` | — | page numbers only |
| `knowledge_article` | compact | `title` | `subtitle`, `category`, `audience`, `author`, `last_reviewed` | — | `{title}` |
| `runbook` | full | `title`, `audience` | `subtitle`, `service`, `version`, `on_call_team`, `last_drilled` | h1-h3 | `Runbook — {title}` / Internal use only |
| `compliance_report` | full | `title`, `control_id`, `framework` | `subtitle`, `audit_period`, `owner`, `reviewer`, `status` | h1-h4 | `{framework} — {control_id}` / Confidential |
| `release_notes` | compact | `title`, `version`, `release_date` | `subtitle`, `product`, `channel`, `breaking_changes` | h2-h3 | `{product} {version}` |
| `architecture` | full | `title`, `version`, `status` | `subtitle`, `owner`, `reviewers`, `decision_log` | h1-h3 | `{title} ({status})` |
| `customer_deliverable` | full | `title`, `customer`, `date` | `subtitle`, `author`, `contract_id`, `version`, `classification` | h1-h3 | `{customer} — {title}` / Prepared for {customer} |
| `letter` | letter | `title`, `from_name`, `to_name`, `date` | `from_address`, `to_address`, `subject`, `salutation`, `author` | — | page numbers from page 2 |

- A full cover or letter has a clean first page (no header/footer). Full-cover archetypes start each top-level section on a new page.
- Missing required metadata exits 2 with `missing required metadata:` and the keys; nothing is written. Ask the user; do not invent values. Unused keys only warn.

## Metadata

Put metadata in front matter: flat `key: value` lines between `---` lines at the top of the Markdown. Values with apostrophes or quotes belong here, not in `--meta`. Without `title`, the first `# ` heading is the title (moved onto the cover).

```
---
title: Example Case Transfer Recovery
audience: Platform admins
version: 1.2
---
```

## Choosing

- Ops procedure → `runbook`; how-to or short reference → `knowledge_article`.
- App design or technical reference → `architecture`; change log → `release_notes`.
- Audit evidence → `compliance_report`; client report → `customer_deliverable`.
- Letter → `letter`; scratch doc → `plain`.
