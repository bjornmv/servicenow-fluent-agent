# sn-doc-md

Markdown-native ServiceNow documentation lookup for the official `ServiceNow/ServiceNowDocs` GitHub corpus. This file holds maintainer notes; the agent's runtime instructions are in `SKILL.md`.

Design goals:

- No PDF conversion.
- No vector database.
- No external npm dependencies.
- Fast local deterministic search with citations back to official markdown/canonical URLs.
- Easy to package as a VS Code/agent skill.

Commands below are run from this skill directory. From elsewhere, give the full path to `bin/sn-doc-md.js`.

## Shared Windows defaults

- Docs: `%LOCALAPPDATA%\SNDocs\repo`
- Index: `%LOCALAPPDATA%\SNDocs\index`

Explicit path flags override `SN_DOCS_HOME` / `SN_DOC_MD_INDEX`, which override the defaults. No old-machine paths or current-directory fallbacks are used. Other platforms can use explicit paths or environment overrides.

`node bin/sn-doc-md.js paths` only reports the resolved paths: no directory creation, download or migration.

## Build an index

After the docs checkout is installed and indexing is authorized:

```powershell
node bin/sn-doc-md.js build --family australia
```

Use `--docs <checkout> --out <index>` to override paths explicitly. Rebuilding a recognized index requires `--force`; unrecognized directories (including one left without `manifest.json` by an interrupted build) and source/ancestor targets are protected. No command clones or migrates documentation automatically.

`--family` (default `australia`) is a label only: it is written to the manifest, each row and `raw_url`, and does not select a Git branch. The build also records `corpus_release`, the most common `release:` frontmatter value, and reports a warning when the two differ.

The build prints nothing until it finishes and holds its term maps in memory. The output is several hundred MB for the full corpus; measure time and size on the target machine instead of quoting figures from another one.

Generated files:

```text
manifest.json
content.jsonl
content.off
content.idx
content.idx.map.json
toc.jsonl
toc.off
toc.idx
toc.idx.map.json
path-map.json
titles.json
```

`manifest.json` is written last. Its `generator` identifies the indexer version: indexes from `sn-doc-md@0.1.0` stored `canonical_url`, `title` and `heading` without underscores, and search/read flag them in `warnings` until they are rebuilt.

## Search

```powershell
node bin/sn-doc-md.js search --query "GlideRecord.addQuery"
```

Use `--keywords` for high-signal retrieval terms. When given, the keywords alone supply the retrieval terms (first 16 tokens); the query still drives intent classification and identifier scoring:

```powershell
node bin/sn-doc-md.js search --query "How do Service Portal widget client scripts use spUtil?" --keywords "spUtil Service Portal widget client script"
```

## Read

```powershell
node bin/sn-doc-md.js read --id 123
node bin/sn-doc-md.js read --path api-reference/server-api-reference/c_GlideRecordAPI.md
```

`--path` takes a search result's `source_rel` (relative to `markdown/`) and returns every chunk of that page; backslashes and a leading `markdown/` are accepted. Plain-text output shows 12,000 characters per chunk unless `--max_chars` is raised; `--json` is never truncated. An unknown id or path exits 1 with `ok: false`.

## Tests

```powershell
node test/run-tests.js
```

The offline regression suite (URL/identifier preservation, read misses, truncation marker, index warnings) is a development test in the distribution repository, not the installed skill: `node --test tools/test/doc-lookup/unit.test.cjs` from the repository root. Run it after changing indexing or CLI code.

`test/run-tests.js` (also `node bin/sn-doc-md.js test`) is the quality benchmark against the resolved index, or `--index <index>`. Run it after changing ranking/indexing code and after building an index. It is intentionally small and editable: it verifies that important ServiceNow lookup queries return expected documents within a target rank and reports p50/p95 latency. The suite includes UI Builder roles: the overview must rank near the top and its read text must preserve `ui_builder_admin`. Report measured results and index provenance from the current run; do not reuse a historical timing or assume an indexed commit when the manifest lacks it.

## Distribution

- Bundle this skill's source files only; the index is large, machine-generated and built locally from the user's cloned/shallow-cloned ServiceNowDocs repository.
- Refresh the corpus/index only through an approved update workflow (`sn-update-advisor`), preserving dirty work and existing sources. A lookup error alone does not authorize refresh or rebuild.
