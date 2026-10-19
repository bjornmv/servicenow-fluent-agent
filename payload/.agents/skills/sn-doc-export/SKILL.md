---
name: sn-doc-export
description: Renders project documents to PDF, DOCX or HTML, optionally with instance screenshots. Use when writing a runbook, release notes or guide; not doc search (sn-doc-lookup).
argument-hint: <document kind, source, output formats and destination>
compatibility: Node.js with md-to-pdf and @adobe/helix-md2docx; sn-skill (else node "<user-profile>/.agents/tools/sn-skill.cjs"); installed Chrome/Edge for PDF/HTML and screenshots.
metadata:
  version: '1'
---
# Export project documentation

Authors local Markdown and renders deliverables; it does not publish KB records (that is **sn-rest**, separately approved). Doc search is **sn-doc-lookup**. `html` output is a standalone page, not a KB body.

## Preflight

Follow the [command policy](../../reference/sdk-commands.md). Run from the confirmed project directory (project `cwd`); relative paths resolve from it. Run the renderer as `sn-skill doc-render` and screenshots as `sn-skill doc-capture`. After step 1 below fixes the archetype and formats, check them:

```
sn-skill doc-render --check --format '<formats>' --archetype '<archetype>'
```

- Proceed only on exit 0 with a final `READY — the selected archetype and formats can render.` On `NOT READY` (exit 2), stop and report the `[BAD]` lines. A bare `--check` is not a gate.
- `[BAD]` lines name what is missing: `md-to-pdf` plus Chrome/Edge for PDF/HTML, `@adobe/helix-md2docx` for DOCX. A browser older than Chromium 131 gives `[WARN]`: the PDF header/footer then also prints on the cover.
- The renderer installs nothing. Any install needs explicit approval and follows [install.md](install.md).

## Author and render

1. Confirm title, output folder, formats and the [archetype](archetypes.md): `plain`, `knowledge_article`, `runbook`, `compliance_report`, `release_notes`, `architecture`, `customer_deliverable` or `letter`. Ask for required metadata; never invent it.
2. Gather facts from project source; instance data only through **sn-rest** narrow reads, when authorized and fit for the audience.
3. Write Markdown in project `docs/` with file tools. Put the title and metadata in front matter (flat `key: value` lines); values with apostrophes or quotes go there, never on the command line. See [references/markdown-and-options.md](references/markdown-and-options.md) for callouts, images, a DOCX template or extra CSS.
4. Render (`pdf`, `docx`, `html`; default `pdf,docx`):

```
sn-skill doc-render --in "docs/runbook.md" --archetype runbook --format 'pdf,docx' --out "docs/dist/"
```

- Output: `<out>/<slug>.<format>`, slug from the front-matter or `--meta` title (else the file name), lower-cased, æ ø å as ae o a, other characters as `-`. `--meta 'key=value'` overrides one key for this run.
- Overwrite only with `--force` after user confirmation.
- Exit: 0 all written; 2 nothing written (bad argument, missing metadata, input or image, existing output, not ready); 3 a format failed, earlier ones may exist; 1 unexpected.

5. Verify: final stderr line `sn-skill: doc-render exit=<N>` (none = UNKNOWN), one `[OK ]` per format, nonempty files at the printed paths in the project's `docs/dist/`. Review the layout before claiming quality; report unverified formats.

## Optional Service Portal screenshots

```
sn-skill doc-capture --url '<path-or-url-on-the-instance>' --out "docs/screenshots/<name>.png" --alias '<confirmed-alias>' --instance 'https://<confirmed-host>'
```

- The helper refuses any other host and attaches the bearer only to requests on that exact origin, never to third-party subresources or cross-origin redirects. It never prints the token.
- On an sn-rest or authentication error, stop and use **sn-auth**. Overwrite a PNG only with `--force` after confirmation.
- A login screenshot is not UI evidence; review each PNG. Read [references/screenshots.md](references/screenshots.md) before the first capture or after a failure.
