---
name: sn-doc
description: 'Generate technical and user documentation in PDF and DOCX from authored MyST/Markdown. Node-native by default (md-to-pdf + @adobe/helix-md2docx); optional Python backend reuses SNagent (C:\Personal\SNagent) for framed archetypes (runbook, compliance_report, etc.). Use when the user asks for project docs, runbooks, release notes, KB articles, or customer deliverables from a now-sdk app.'
argument-hint: <doc kind — e.g. "technical reference for Pelican app", "user guide for case-transfer widget">
---
Author Markdown locally, render via the Node renderer (default) or the Python/SNagent renderer (for framed archetypes). One CLI, two backends.

## When to use
- User asks for technical reference, user guide, runbook, release notes, KB article, or any printable/Word doc generated from a now-sdk project + instance metadata.
- NOT for posting an in-product KB record (use `sn-rest` to POST `kb_knowledge` directly — `sn-doc` can produce the HTML body that goes in there).

## Backends

| Backend | What | Archetypes | Footprint |
|---|---|---|---|
| **node** (default) | `md-to-pdf` (PDF, bundles Chromium) + `@adobe/helix-md2docx` (DOCX) | `plain` only | ~170 MB once |
| **python** (optional) | SNagent's `parse_markdown` + WeasyPrint + python-docx | all 8 archetypes (`runbook`, `compliance_report`, `release_notes`, `architecture`, `customer_deliverable`, `letter`, `knowledge_article`, `plain`) | needs Python 3.11+ + GTK runtime |

`--backend auto` (the default) picks node for `plain`, python for any framed archetype. Unknown archetypes are errors; fix the requested archetype instead of silently rendering as `plain`.

## Invocation
```powershell
$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --check
```
The Python backend reads `SN_AGENT_HOME` at runtime (set in `settings.json` → `terminal.integrated.env.windows`). Override per-shell if needed: `$env:SN_AGENT_HOME = 'C:\Personal\SNagent'`.

## Always preflight FIRST
Never start authoring without confirming the renderer you need actually works.
```powershell
$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --check
```
Output reports both backends with `[OK ]` / `[BAD]` / `[MISSING]` per dep and prints the exact remediation. **Halt if the backend(s) and formats you need are not green** — do not author or attempt to render. The relevant subset depends on what you're producing:

- `plain` archetype, DOCX only → node backend + Node packages must be green; no browser needed.
- `plain` archetype, PDF (or PDF+DOCX) → node backend + Node packages + an installed Chrome or Edge.
- Any framed archetype (`runbook`, `compliance_report`, `release_notes`, `architecture`, `customer_deliverable`, `letter`, `knowledge_article`) → Python backend + WeasyPrint runtime.

Common outcomes:
- Node packages missing → after explicit approval, resolve npm's permitted JavaScript CLI per the [command policy](../../reference/sdk-commands.md), then `node "<resolved-npm-cli.js>" install -g md-to-pdf "@adobe/helix-md2docx"` (one-time; replace the path placeholder).
- No installed browser found → install Chrome or Edge (the puppeteer-bundled Chromium downloads to a user-writable path and is blocked by AppLocker/AV on locked-down boxes). Override with `$env:SN_DOC_BROWSER = "C:\path\to\msedge.exe"`.
- Python not installed → only matters if the user wants framed archetypes. Install via `winget install Python.Python.3.12` + `python -m pip install -r "$env:USERPROFILE\.agents\skills\sn-doc\requirements.txt"`.
- WeasyPrint runtime (Pango/GTK) on Windows → see [install.md](install.md).

Treat preflight failures for the chosen backend and requested formats as blockers. A node backend without an installed browser is DOCX-only; PDF/HTML output needs Chrome, Edge, or the Python backend. Print the install command verbatim; do NOT install on behalf of the user without explicit confirmation.

## Authoring workflow
1. **Preflight** — `$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --check`. Halt if not green for the backend you need.
2. **Pick archetype** — match user intent to one of: `plain` (node) / `knowledge_article` / `runbook` / `compliance_report` / `release_notes` / `architecture` / `customer_deliverable` / `letter`. See [archetypes.md](archetypes.md). Anything beyond `plain` routes through Python.
3. **Gather facts** — read project `.now.ts`, `src/scripts/**`, and query the instance via `sn-rest` for `sys_db_object`, `sys_dictionary`, `sys_script`, `sp_widget`, `sys_security_acl` as needed.
4. **Author body.md** — Markdown. Use `:::{note}` / `:::{tip}` / `:::{important}` / `:::{warning}` / `:::{caution}` / `:::{danger}` for admonitions (both backends accept the same syntax). Tables, code fences, and task lists are supported in both; definition lists, footnotes, and math are Python-backend only.
5. **Render** —
   ```powershell
   $SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --in docs/body.md `
     --format pdf,docx --out docs/dist/ `
     --meta title="Pelican Case Transfer Guide" --meta author="..."
   ```
   For framed archetypes, `--meta key=value` is forwarded to the Python backend as `--meta-<key>`, including custom metadata fields used by an archetype:
   ```powershell
   $SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --in docs/body.md `
     --archetype runbook --backend python `
     --format pdf,docx --out docs/dist/ `
     --meta title="..." --meta audience="Platform admins"
   ```
   Outputs land at `docs/dist/<slug>.<ext>`. Absolute paths are printed.
6. **Verify** — confirm files exist + size > 0; report paths to user.

## Markdown conventions
- Headings: `#` title (one), `##` h2, `###` h3.
- Admonitions: `:::{note}` … `:::` (also `tip`, `important`, `warning`, `caution`, `danger`). Node backend rewrites to styled `<div>` blocks; Python backend uses MyST native rendering.
- Tables: pipe tables.
- Task lists: `- [ ] item`.
- Code fences: triple-backtick with language hint.
- Images: `![alt](short-name.png)` — pair with `--image-map short-name.png=C:\path\to\file.png` (multiple flags allowed). Node backend embeds the mapped files as base64 `data:` URIs (works in both the PDF and DOCX renderers; spaces in paths are fine); Python backend embeds via `image_map`.
- Definition lists, footnotes, math: Python backend only (MyST extensions). Avoid for node backend.

## Screenshots (optional)
Use the bundled `capture.cjs` helper for Service Portal screenshots. It reuses the now-sdk OAuth token through `sn-rest`, performs a cheap REST read first so the token refresh path runs before browser launch, launches installed Chrome/Edge, and writes PNG files you can reference with `--image-map`. Navigation fails fast on HTTP errors, sign-in redirects, or apparently blank pages; use `--selector` when possible so the capture validates the intended UI element before writing the screenshot.

```powershell
$SnCapture = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\capture.cjs'; node "$SnCapture" --url <full-url-or-path> --out docs/screenshots/<name>.png --alias <alias> --instance https://<instance>.service-now.com
```

SNagent's `sn_doc_screenshot` remains available through the Python backend for workflows that already use SNagent directly.

## Discipline
- Never render without preflight passing for the chosen backend.
- Never invent metadata — ask the user for `title`, `version`, `author`, `audience` if the archetype requires them.
- Outputs go under `docs/dist/` inside the project, NOT into `/tmp` or SNagent's sandbox.
- The renderer refuses to overwrite existing outputs unless `--force` is passed. Confirm with the user before adding `--force`.
- Don't install global Node packages or run `python -m pip install` on behalf of the user without explicit ask — show the permitted command and let them run it.

## Files in this skill
- [render.js](render.js) — Node CLI (default backend + dispatcher)
- [render.py](render.py) — Python shim (SNagent backend)
- [capture.cjs](capture.cjs) — Service Portal screenshot helper
- [package.json](package.json) — declares Node peer deps
- [requirements.txt](requirements.txt) — Python deps
- [install.md](install.md) — install steps for both backends
- [archetypes.md](archetypes.md) — archetype quick reference
