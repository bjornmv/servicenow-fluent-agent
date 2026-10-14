---
name: sn-doc-export
description: Renders project documents to PDF, DOCX or HTML, optionally with instance screenshots. Use when writing a runbook, release notes or guide; not doc search (sn-doc-lookup).
argument-hint: <document kind, source, output formats and destination>
compatibility: Node.js and renderer packages; installed browser for Node PDF/HTML and screenshots; optional Python backend needs explicit absolute SN_AGENT_HOME and its dependencies.
metadata:
  version: '1'
---
# Export project documentation

Authors local Markdown and renders deliverables; it does not publish instance KB records. Doc search is **sn-doc-lookup**; a KB record write is **sn-rest** with separate approval. Node `html` is a standalone page (inline CSS, embedded images), not a KB body fragment; agree extraction and sanitising with the user before any KB use.

## Preflight

Follow the [command policy](../../reference/sdk-commands.md). Run from the confirmed project directory (project `cwd`): relative `--in`/`--out` paths and project-local renderer packages resolve from it. Give the full renderer path in every command, not a variable from an earlier terminal call. Preflight the formats you will render (add `--archetype <name>` for a framed document):

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --check --format pdf,docx
```

- **Preflight must pass for the selected backend and formats before authoring or rendering.** With `--format`, `--archetype` or `--backend`, `--check` ends with a `Selected:` line and exits 0 only when ready (`READY`), otherwise 2. A bare `--check` exits 0 when any output is possible; do not gate on it.
- Node (default for `plain`): PDF/HTML need `md-to-pdf` and an installed Chrome/Edge (`browser:` line); DOCX needs `@adobe/helix-md2docx`. Node lines read `[OK ]` or `[BAD]`. Missing Python does not block Node output.
- Unknown archetypes, backends and formats exit 2, not a silent fallback.
- The renderer never installs anything. Any install needs explicit approval and follows [install.md](install.md); no speculative dependency changes.
- Python needs `SN_AGENT_HOME` (invoking shell or approved setting only) set to the explicit absolute path of a user-selected SNagent checkout containing `tools/_doc_lib`. It is not shipped and has no default: never guess, substitute or download one. If a framed archetype is requested and that backend is not ready, stop and offer `plain` (no cover or framing) or the install path; never substitute `plain` silently.

## Author and render

1. Confirm title, output location and formats; for a framed archetype also its required metadata. Do not invent required metadata.
2. Choose the [archetype](archetypes.md): `plain`, `knowledge_article`, `runbook`, `compliance_report`, `release_notes`, `architecture`, `customer_deliverable`, or `letter`. All except plain need Python (`--backend auto` selects it).
3. Gather facts from project source; for instance metadata use **sn-rest** narrow reads with explicit fields when authorized. Do not publish private instance data without the user's intended audience/scope.
4. Write Markdown inside project `docs/` using file tools. On Node, write title, author and version into the body: only `--meta title` is used and YAML front matter is dropped. Read [references/markdown-and-options.md](references/markdown-and-options.md) when using admonitions, task lists, images, Python-only Markdown, a DOCX template or extra CSS.
5. Render (`--format` accepts `pdf`, `docx`, `html`; default `pdf,docx`):

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --in docs/body.md --format pdf,docx --out docs/dist/ --meta "title=Example App Guide"
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --in docs/body.md --backend python --archetype runbook --format pdf,docx --out docs/dist/ --meta "title=..." --meta "audience=Platform admins"
```

- Output is `<out>/<slug>.<format>`, slug = lower-cased title (else the input file name) with other characters replaced by `-`; the first example writes `docs/dist/example-app-guide.pdf` and `.docx`. `--meta "key=value"` forwards archetype metadata to Python.
- Never overwrite an output without user confirmation for `--force`.
- Exit: 0 all formats written; 2 nothing written on Node (bad argument, missing input or image, existing output, backend not ready); 3 a format failed, earlier ones may exist; 1 unexpected error.

6. Verify native completion, one `[OK ]` line per requested format, the printed paths and nonempty files in the project's `docs/dist/` (not a sandbox or temp folder). Review the rendered layout before claiming delivery quality; report unverified formats.

## Optional Service Portal screenshots

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\capture.cjs" --url "<path-or-url-on-the-instance>" --out docs/screenshots/<name>.png --alias "<confirmed-alias>" --instance "https://<confirmed-host>"
```

- The helper refuses any other host and attaches the bearer only to requests on that exact origin, never to third-party subresources or cross-origin redirects. It never prints the token; do not run raw-token modes yourself.
- On an sn-rest or authentication error, stop and use **sn-auth**.
- Overwrite an existing PNG only with `--force` after user confirmation.
- Never expose credentials or treat a login screenshot as UI evidence; review each PNG before using it.
- Read [references/screenshots.md](references/screenshots.md) before the first capture or when one fails.
