---
name: sn-doc-lookup
description: Searches official ServiceNow product documentation offline, with citations. Use when answering product documentation questions or when the local docs search fails; not Fluent syntax (sn-explain).
argument-hint: <ServiceNow docs question or search terms>
compatibility: Node.js and an existing ServiceNowDocs corpus/index; explicit paths required outside the Windows default layout.
metadata:
  version: '1'
---

# ServiceNow Markdown Doc Lookup

Use this skill for fast official ServiceNow product documentation lookup from the GitHub markdown corpus (`ServiceNow/ServiceNowDocs`). It is the preferred general ServiceNow docs lookup path for the distributed / VS Code agent setup. The exact field/syntax shape of a Fluent record you are about to author comes from [sn-explain](../sn-explain/SKILL.md), not from here.

## Tooling in this skill

- CLI: `bin/sn-doc-md.js` (dependency-free Node.js)
- Source code: `src/`
- Maintainer notes and benchmark suite: `README.md`, `test/`

Lookup uses three read-only commands. Give the full CLI path in every command and print the exit status in the same call; do not depend on a variable assigned in a previous terminal call.

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" paths
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" search --query "..." --keywords "..." --json
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" read --id <chunk-id> --json
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" read --path <source_rel> --json
```

## Default Windows paths

```text
Docs:  %LOCALAPPDATA%\SNDocs\repo
Index: %LOCALAPPDATA%\SNDocs\index
```

All CLI commands share these defaults. Explicit `--docs` / `--out` / `--index` paths take precedence over `SN_DOCS_HOME` / `SN_DOC_MD_INDEX`, then the defaults above. No legacy-location discovery or automatic migration is performed. Other platforms must provide explicit paths or those overrides when `LOCALAPPDATA` is unavailable.

`paths` reports the resolved paths as JSON (`docs`, `index`) without creating directories, downloading docs or building an index; it does not check that they exist. Prefer omitting `--index` for search/read: the CLI already honors the configured override/default. Use an explicit path only when intentionally selected and verified.

Current resolver output takes precedence over legacy cache/MCP memories. `%LOCALAPPDATA%\sn-docs` is NOT `%LOCALAPPDATA%\SNDocs` (the hyphen matters). On ENOENT, run `paths` and compare the failed path with its output before declaring documentation unavailable. Do not silently fall back to a bare Git cache, guess another path, migrate, download or rebuild. If a selected override is genuinely missing, report that exact path and stop for review.

## Before searching

Search directly; a usable index needs no pre-check. Only when search/read fails with ENOENT, check what exists (one terminal call):

```powershell
$P = node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" paths | Out-String | ConvertFrom-Json
Write-Output "doc-lookup-exit=$LASTEXITCODE"
if ($P) {
    Write-Output "docs=$($P.docs) exists=$(Test-Path -LiteralPath $P.docs)"
    Write-Output "index=$($P.index) exists=$(Test-Path -LiteralPath $P.index) manifest=$(Test-Path -LiteralPath (Join-Path $P.index 'manifest.json'))"
}
```

- **Docs checkout missing:** report that documentation installation is pending. Do not silently use an older checkout or download/move docs outside an authorized installation.
- **Checkout present, index directory absent:** building is authorized only by a full setup run that includes it or by the user's explicit approval. Otherwise ask first and state the cost: the build prints nothing until it finishes, takes minutes for the full corpus, and writes several hundred MB under the index path. Then:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" build --family australia
Write-Output "doc-lookup-exit=$LASTEXITCODE"
```

- **Index directory present without `manifest.json`:** an incomplete or foreign build. Search, read and build (with or without `--force`) all refuse it. Report the exact path and stop for review.

`--family` is only a label written into the index; it does not select or check a release branch. Replacing an existing index requires separate approval plus `--force`, which works only on a recognized index (`manifest.json` with `schema_version: 1` and `generator` starting `sn-doc-md@`). Never delete an unexpected directory to make indexing succeed. Search/read/test do not create or rebuild indexes.

## Search workflow

Outside the agent's shared session-start gate, documentation-only questions skip update-advisor checks. A startup notice or lookup never authorizes SDK upgrades, builds or documentation maintenance. Start with the existing index.

1. Start with a direct search: the user's natural question in `--query`, high-signal keywords in `--keywords`.
2. If results look broad/noisy, run a second targeted search with better keywords.
3. Read only the few top chunks needed for citations: `read --id <id>` with the numeric `id` of each cited result.
4. Answer with concise synthesis, `source_rel`, and `canonical_url`, and name the release the index covers (`index.family` in the search/read JSON). If the user's instance is on another release, say the local corpus covers only that family.

Result handling:

- `read --path <source_rel>` returns **every** chunk of the page with no size cap in `--json` mode. Use it only when the whole page is needed and the result's `doc_chunks` is small; large API reference pages (for example `c_GlideRecordAPI.md`, about 160 chunks) return roughly 2 MB.
- `source_rel` is relative to the checkout's `markdown` directory with forward slashes; copy it from the search result.
- A read that matches nothing returns `"ok": false` with an `error`, empty `rows` and exit 1. That means the id/path is not in the index, not that the page is empty. Always pass `--json` to read; plain-text output is cut at 12,000 characters per chunk (marked `[truncated: ...]`).
- Results with `kind: "toc"` (id `toc:<n>`) are table-of-contents entries whose target page is missing or empty in the checkout. They cannot be read and have no `canonical_url`; report that the page is listed but its content is not in the local corpus.
- If `canonical_url` is empty, cite `source_rel` and the row's `raw_url` from `read`; never construct a docs URL yourself.
- Report any `warnings` in the search/read JSON. One of them flags an index built by an older indexer whose `canonical_url`, `title` and `heading` values lost underscores (for example `c_GlideRecordAPI.html` stored as `cGlideRecordAPI.html`). Until an approved rebuild, do not cite `canonical_url` from that index for a page whose `source_rel` file name contains an underscore: cite `source_rel` and `raw_url`.

For exact roles/APIs, use the **read text**, not just search snippets (snippets are shortened and stripped of Markdown formatting). Raw Markdown can contain escaped identifiers such as `ui\_builder\_admin`; a literal grep miss does not establish semantic absence. Read relevant overview/access pages before making negative claims, and distinguish general use, specialized features and permissions needed to grant a role.

Example:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" search --query "How do I reduce the size of the audit logs?" --keywords "audit retention purge sys_audit no_audit audit_type whitelist audited fields" --limit 8 --json
Write-Output "doc-lookup-exit=$LASTEXITCODE"
```

Then read a cited chunk by the `id` from that output:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" read --id <chunk-id> --json
Write-Output "doc-lookup-exit=$LASTEXITCODE"
```

## Keyword discipline

Pass `--keywords` whenever you can name specific terms. When it is present, retrieval terms and phrases come **only** from the keywords; `--query` then feeds intent classification and identifier scoring, so an identifier given only in `--query` is not searched. Put every term that must match into `--keywords`, and keep a dotted `Class.method` symbol in `--query` as well.

Only the first 16 keyword tokens are used, and identifiers expand into several tokens (`sys_audit` also yields `sys` and `audit`; plurals add a singular), so lead with the most distinctive terms. Prefer ServiceNow-specific terms:

- API/class/method names: `GlideRecord addQuery`, `ScriptableFlowAPI executeAction`
- Table/property names: `sys_audit`, `audit_type`, `no_audit`
- Product/doc terms: `Workflow Studio action inputs`, `Discovery probes patterns MID Server`
- Fluent terms (narrative product pages for background/citation only): `BusinessRule object sys_script servicenow sdk`

Drop generic words like `how`, `what`, `best`, `use`, `between` unless they are part of an exact title.

## Fast path vs subagent

Prefer a direct CLI lookup when the harness permits it. If the harness requires an execution subagent, preserve the same lookup/read commands and require its response to include the actual excerpts, exact identifiers, `source_rel`, `canonical_url`, observed exit/error evidence and any saved-output path. “Files retrieved successfully” is not sufficient. Read a saved result if provided; do not answer without the evidence or invent a failure/exit code from missing output.

Blank stdout or “Command produced no output” is **UNKNOWN**, not an empty result set or native exit 0. Search --json must return valid JSON with a results array, even for zero hits. On missing/misattributed output, stop sending commands into that suspect terminal. Read saved output or use editor file tools on the verified corpus; do not broaden queries, infer absent roles/corpus, rebuild the index or retry a mutation to compensate for an execution-channel failure.

Use a documentation subagent only when:

- the question needs multiple independent searches and synthesis,
- evidence conflicts,
- query confidence is low,
- or the user explicitly asks for a deeper research pass.

## Maintenance boundary

Refresh the corpus/index only through an approved update workflow ([sn-update-advisor](../sn-update-advisor/SKILL.md)), preserving dirty work and existing sources. A lookup error alone does not authorize refresh or rebuild. When reporting index provenance, use the current run's `index` object or the manifest; do not reuse a historical timing or assume an indexed commit when the manifest lacks it.
