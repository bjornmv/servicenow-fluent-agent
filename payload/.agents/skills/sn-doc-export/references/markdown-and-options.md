# Markdown support and render options

## Markdown

- Headings, tables, fenced code, task lists and callouts: `:::{note}` (also `tip`, `important`, `warning`, `caution`, `danger`), optional title on that line, body below, closing `:::`. Only this form becomes a shaded box.
- Not supported: definition lists, footnotes, math.

## Metadata

Front matter of flat `key: value` lines (see [archetypes.md](../archetypes.md)); nested lines are ignored with a warning. `--meta 'key=value'` overrides one key; values with apostrophes or quotes stay in front matter.

## Images

`![alt](name.png)` with a path relative to the Markdown file, or `--image-map "name.png=<absolute-image-path>"` (repeatable). Images are embedded. A missing image exits 2 with nothing written; fix the path, do not drop the reference.

## Options

- `--reference-docx "<template.docx>"`: DOCX uses the template's styles; its header/footer, if any, replace the archetype ones.
- `--stylesheet "<extra.css>"`: extra CSS for PDF and HTML, after the archetype CSS.
- DOCX Contents page numbers appear after the reader updates fields (F9 in Word).
