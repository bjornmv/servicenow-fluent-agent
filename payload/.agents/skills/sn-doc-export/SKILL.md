---
name: sn-doc-export
description: Renders project documents to PDF, DOCX or HTML, optionally with instance screenshots. Use when writing a runbook, release notes or guide; not doc search (sn-doc-lookup).
argument-hint: <document kind, source, output formats and destination>
compatibility: Node.js and renderer packages; installed browser for Node PDF/HTML and screenshots; optional Python backend needs explicit absolute SN_AGENT_HOME and its dependencies.
metadata:
  version: '1'
---
# Export project documentation

Use **sn-doc-lookup** for official documentation search instead. This skill authors local Markdown and renders deliverables; it does not publish instance KB records. A requested KB write uses **sn-rest** with separate approval. Node `html` output is a standalone styled page (inline CSS, embedded images), not a KB body fragment; agree extraction and sanitising with the user before any KB use.

## Backend and preflight

Follow the [command policy](../../reference/sdk-commands.md). Run from the confirmed project directory (project `cwd`): relative `--in`/`--out` paths and project-local renderer packages resolve from it. Each command carries the full renderer path; do not rely on a variable from an earlier terminal call. Preflight the formats you will render (add `--archetype <name>` for a framed document):

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --check --format pdf,docx
```

| Backend | Output and requirements |
| --- | --- |
| Node (default for plain) | `md-to-pdf` plus `@adobe/helix-md2docx`; installed Chrome/Edge for PDF/HTML, packages alone for DOCX |
| Python (optional for framed archetypes) | Python 3.11+, selected SNagent libraries, WeasyPrint/GTK runtime and python-docx |

`--backend auto` selects Node for `plain`, Python for a framed archetype. Unknown archetypes, backends and formats are errors (exit 2), not permission to silently fall back. **Preflight must pass for the selected backend and formats before authoring or rendering.** With `--format`, `--archetype` or `--backend`, `--check` ends with a `Selected:` line and exits 0 only when that selection is ready (`READY`), otherwise 2. A bare `--check` exits 0 when any output is possible, so do not gate on it. Node lines are `[OK ]` or `[BAD]`: PDF/HTML need `md-to-pdf` and `browser:`, DOCX needs `@adobe/helix-md2docx`. Missing Python does not block Node output; missing browser makes the Node backend DOCX-only. The renderer never installs anything. Runtime/package installation requires explicit approval; see [install.md](install.md), not speculative dependency changes.

Python requires `SN_AGENT_HOME` to be the explicit absolute path of a user-selected SNagent checkout containing `tools/_doc_lib`. This distribution does not ship that backend. No personal, current-directory, relative or guessed default exists. Configure only the invoking shell or an approved environment setting. Node output does not require it. Do not locate a substitute checkout or download the backend automatically. If a framed archetype is requested and the backend is not ready, stop and offer `plain` (no cover or framing) or the install path; never substitute `plain` silently.

## Author and render

1. Confirm title, output location and formats; for a framed archetype also its required metadata (version, author, audience, …). Do not invent required metadata.
2. Choose [archetype](archetypes.md): `plain`, `knowledge_article`, `runbook`, `compliance_report`, `release_notes`, `architecture`, `customer_deliverable`, or `letter`. All except plain need Python.
3. Gather facts from project source; use **sn-rest** narrow reads with explicit fields for instance metadata when authorized. Do not publish private instance data without the user's intended audience/scope.
4. Write Markdown inside project `docs/` using file tools. Headings, tables, fenced code, task lists and admonitions (`:::{note}`, `tip`, `important`, `warning`, `caution`, `danger`; optional title on the directive line, body on the following lines, closing `:::`) work on both backends. Node DOCX keeps admonition text but not its colour or border, and shows task state as ☐/☑. Definition lists, footnotes and math require Python. On Node, write title, author and version into the document body: only `--meta title` is used (output file name and PDF/HTML document title), other `--meta` values are not rendered, and a leading YAML front-matter block is dropped with a warning.
5. Render (`--format` accepts `pdf`, `docx`, `html`; default `pdf,docx`):

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --in docs/body.md --format pdf,docx --out docs/dist/ --meta "title=Example App Guide"
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --in docs/body.md --backend python --archetype runbook --format pdf,docx --out docs/dist/ --meta "title=..." --meta "audience=Platform admins"
```

Outputs are `<out>/<slug>.<format>`, where the slug is the lower-cased title (else the input file name) with other characters replaced by `-`; the example writes `docs/dist/example-app-guide.pdf` and `.docx`. `--meta "key=value"` forwards archetype metadata to Python. Images use `![alt](name.png)` plus `--image-map "name.png=<absolute-image-path>"` (repeatable), or a path relative to the Markdown file; Node embeds data URIs and supports spaces. Node only: `--reference-docx <template.docx>` applies a template's styles, headers and footers to DOCX, and `--stylesheet <file.css>` adds CSS to PDF. Never overwrite an output without user confirmation for `--force`.

Exit codes: 0 every requested format written; 2 nothing written on Node (bad argument, missing input, missing or unsupported image, existing output without `--force`, backend not ready); 3 a format failed while rendering, so earlier formats in the list may already exist; 1 unexpected error.

6. Verify native completion, one `[OK ]` line per requested format, the printed output paths and nonempty files. Review rendered layout before claiming delivery quality. Outputs belong in the project's `docs/dist/`, not a backend sandbox or temporary folder. Report unverified formats honestly.

## Optional Service Portal screenshots

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\capture.cjs" --url "<path-or-url-on-the-instance>" --out docs/screenshots/<name>.png --alias "<confirmed-alias>" --instance "https://<confirmed-host>"
```

`--url` must be a path (for example `/sp?id=index`) or a URL on the confirmed instance origin; `--instance` must be `https`. The helper refuses any other host and attaches the bearer only to requests on that exact origin, never to third-party subresources or cross-origin redirects. It reads SDK OAuth through the installed **sn-rest** helper in a child process and never prints the token; this does not permit running raw-token modes yourself. It first performs one bounded instance read to refresh auth, then drives installed Chrome/Edge. It needs `md-to-pdf` resolvable (for its bundled puppeteer); `--check` does not cover the capture path. If it fails with an sn-rest or authentication error, stop and use **sn-auth**.

An existing PNG is not overwritten without `--force` after user confirmation; unknown flags are errors. `--selector <css>` requires that element and crops the PNG to it; `--full-page` captures the whole scroll height. HTTP errors, navigation that leaves the instance origin, and blank pages fail. Sign-in detection is a heuristic (final URL or title containing `login`, `signin` or `saml`), so a legitimate page matching it also fails; report that instead of working around it. Never expose credentials or treat a login screenshot as successful UI evidence; review each PNG before using it. SNagent's `sn_doc_screenshot` remains an option for existing explicitly configured Python workflows.

## Files

- [render.js](render.js), [render.py](render.py): dispatcher and optional backend shim.
- [capture.cjs](capture.cjs): screenshot helper.
- [package.json](package.json), [requirements.txt](requirements.txt): dependencies.
- [install.md](install.md), [archetypes.md](archetypes.md): setup and authoring references.
