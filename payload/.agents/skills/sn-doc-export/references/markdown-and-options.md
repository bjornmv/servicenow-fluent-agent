# Markdown support and render options

## Markdown per backend

- Both backends: headings, tables, fenced code, task lists and admonitions (`:::{note}`, `tip`, `important`, `warning`, `caution`, `danger`; optional title on the directive line, body on the following lines, closing `:::`).
- Node DOCX keeps admonition text but not its colour or border, and shows task state as ☐/☑.
- Python only: definition lists, footnotes and math.

## Metadata on Node

Only `--meta title` is used (output file name and PDF/HTML document title). Other `--meta` values are not rendered, and a leading YAML front-matter block is dropped with a warning. Write title, author and version into the document body.

## Images

Use `![alt](name.png)` plus `--image-map "name.png=<absolute-image-path>"` (repeatable), or a path relative to the Markdown file. Node embeds data URIs and supports spaces in paths. A missing image is exit 2 with nothing written; fix the path rather than deleting the reference (see [install.md](../install.md#troubleshooting)).

## Node-only options

- `--reference-docx <template.docx>` applies a template's styles, headers and footers to DOCX.
- `--stylesheet <file.css>` adds CSS to PDF.
