---
name: sn-doc-export
description: Use when exporting project documentation, runbooks, release notes or user guides from Markdown to PDF/DOCX; not for searching official product documentation.
argument-hint: <document kind, source, output formats and destination>
compatibility: Node.js and renderer packages; installed browser for Node PDF/HTML; optional Python backend needs explicit absolute SN_AGENT_HOME and its dependencies.
metadata:
  version: '1'
---
# Export project documentation

Use **sn-doc-lookup** for official documentation search instead. This skill authors local Markdown and renders deliverables; it does not publish instance KB records. A requested KB write uses **sn-rest** with separate approval; export may supply its HTML body.

## Backend and preflight

Follow the [command policy](../../reference/sdk-commands.md). Resolve the installed renderer once:

```powershell
$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc-export\render.js'
node "$SnDoc" --check
```

| Backend | Output and requirements |
| --- | --- |
| Node (default for plain) | `md-to-pdf` plus `@adobe/helix-md2docx`; installed Chrome/Edge for PDF/HTML, packages alone for DOCX |
| Python (optional for framed archetypes) | Python 3.11+, selected SNagent libraries, WeasyPrint/GTK runtime and python-docx |

`--backend auto` selects Node for `plain`, Python for a framed archetype. Unknown archetypes are errors, not permission to silently fall back. **Preflight must pass for the selected backend and formats before authoring or rendering.** Missing Python does not block Node output; missing browser makes the Node backend DOCX-only. Runtime/package installation requires explicit approval; see [install.md](install.md), not speculative dependency changes.

Python requires `SN_AGENT_HOME` to be the explicit absolute path of a user-selected SNagent checkout containing `tools/_doc_lib`. No personal, current-directory, relative or guessed default exists. Configure only the invoking shell or an approved environment setting. Node output does not require it. Do not locate a substitute checkout or download the backend automatically.

## Author and render

1. Confirm title, version, author, audience, output location and formats. Do not invent required metadata.
2. Choose [archetype](archetypes.md): `plain`, `knowledge_article`, `runbook`, `compliance_report`, `release_notes`, `architecture`, `customer_deliverable`, or `letter`. All except plain need Python.
3. Gather facts from project source; use **sn-rest** schema-validated narrow reads for instance metadata when authorized. Do not publish private instance data without the user's intended audience/scope.
4. Write Markdown inside project `docs/` using file tools. Admonitions (`:::{note}`, `tip`, `important`, `warning`, `caution`, `danger`), headings, tables, fenced code and task lists work on both backends. Definition lists, footnotes and math require Python.
5. Render:

```powershell
node "$SnDoc" --in docs/body.md --format pdf,docx --out docs/dist/ --meta title="Example App Guide" --meta author="..."
node "$SnDoc" --in docs/body.md --backend python --archetype runbook --format pdf,docx --out docs/dist/ --meta title="..." --meta audience="Platform admins"
```

`--meta key=value` also forwards custom archetype metadata to Python. Images use `![alt](name.png)` plus `--image-map "name.png=<absolute-image-path>"` (repeatable); Node embeds data URIs and supports spaces. Never overwrite an output without user confirmation for `--force`.

6. Verify native completion, output paths and nonempty files. Review rendered layout before claiming delivery quality. Outputs belong in the project's `docs/dist/`, not a backend sandbox or temporary folder. Report unverified formats honestly.

## Optional Service Portal screenshots

```powershell
$SnCapture = Join-Path $env:USERPROFILE '.agents\skills\sn-doc-export\capture.cjs'
node "$SnCapture" --url <full-url-or-path> --out docs/screenshots/<name>.png --alias <alias> --instance https://<instance>.service-now.com
```

The helper reuses SDK OAuth via sn-rest, performs a bounded read to refresh auth before browser launch, then uses installed Chrome/Edge. Use `--selector` to validate intended content; HTTP errors, sign-in redirects and blank pages fail. Never expose credentials or treat a login screenshot as successful UI evidence. SNagent's `sn_doc_screenshot` remains an option for existing explicitly configured Python workflows.

## Files

- [render.js](render.js), [render.py](render.py): dispatcher and optional backend shim.
- [capture.cjs](capture.cjs): screenshot helper.
- [package.json](package.json), [requirements.txt](requirements.txt): dependencies.
- [install.md](install.md), [archetypes.md](archetypes.md): setup and authoring references.
