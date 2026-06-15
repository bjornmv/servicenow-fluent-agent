# Archetypes quick reference

Each archetype controls the cover page, header, footer, and (eventually) TOC behavior. Pass via `--archetype <name>` to `render.py`. Required metadata is enforced at render time — missing fields emit warnings but the doc still renders.

Source of truth: `C:\Personal\SNagent\tools\_doc_lib\archetypes\registry.py`.

| Archetype | Cover | Required metadata | Use for |
|---|---|---|---|
| `plain` | none | — | Quick reference, ad-hoc notes |
| `knowledge_article` | compact | `title` | KB articles, FAQs |
| `runbook` | compact | `title`, `audience` | Ops runbooks, on-call procedures |
| `compliance_report` | full | `title`, `control_id`, `framework` | Audit / compliance evidence |
| `release_notes` | compact | `title`, `version`, `date` | Per-release change docs |
| `architecture` | full | `title`, `version` | Solution architecture / design |
| `customer_deliverable` | full | `title`, `author` | Client-facing reports |
| `letter` | letter | `title`, `author`, `date` | Formal letters |

## Common metadata flags
```
--meta-title "Pelican Case Transfer — Technical Reference"
--meta-subtitle "TestApp001 v0.0.1"
--meta-author "Brad Velsrud"
--meta-version "0.0.1"
--meta-date "2026-06-04"
--meta-audience "Platform admins"
--meta-classification "Internal"
--meta-control_id "AC-2"
--meta-framework "NIST 800-53"
--meta-category "How-to"
--meta-last_reviewed "2026-06-04"
--meta-logo_path "C:\\path\\to\\logo.png"
```

## Picking the right archetype
- **Technical reference for a now-sdk app** → `architecture` (full cover, version-stamped) OR `knowledge_article` (lighter).
- **End-user how-to** → `knowledge_article`.
- **Ops procedure** → `runbook`.
- **Change log** → `release_notes`.
- **Quick scratch doc** → `plain`.
