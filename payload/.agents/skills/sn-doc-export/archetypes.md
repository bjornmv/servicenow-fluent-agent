# Archetypes quick reference

Each archetype controls the cover page, header, footer, and (eventually) TOC behavior. Pass `--archetype <name>` to `render.js`; every archetype except `plain` routes to the optional Python backend and stops with an `SN_AGENT_HOME` error when that backend is not configured. A misspelled name is rejected as `Unknown archetype` before any backend runs.

Source of truth: `tools/_doc_lib/archetypes/registry.py` under the explicitly configured absolute `SN_AGENT_HOME`. There is no default backend checkout; confirm the selected backend's registry before relying on these archetypes.

Supply every field in the Required metadata column with `--meta "key=value"` and ask the user for missing values; do not invent them. The shipped shim does not validate required metadata, so a clean exit does not prove the cover is complete: check the rendered cover page.

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

Python backend only. On the Node backend (`plain`) only `title` is used, for the output file name and the PDF/HTML document title.

```
--meta "title=Example Case Transfer — Technical Reference"
--meta "subtitle=Example App v0.0.1"
--meta "author=Example Author"
--meta "version=0.0.1"
--meta "date=2026-06-04"
--meta "audience=Platform admins"
--meta "classification=Internal"
--meta "control_id=AC-2"
--meta "framework=NIST 800-53"
--meta "category=How-to"
--meta "last_reviewed=2026-06-04"
--meta "logo_path=C:\path\to\logo.png"
```

## Picking the right archetype
- **Technical reference for a now-sdk app** → `architecture` (full cover, version-stamped) OR `knowledge_article` (lighter).
- **End-user how-to** → `knowledge_article`.
- **Ops procedure** → `runbook`.
- **Change log** → `release_notes`.
- **Quick scratch doc** → `plain`.

When the Python backend is not configured, say so and offer `plain` (no cover or framing) or the install path in [install.md](install.md); never substitute `plain` silently for a requested framed archetype.
