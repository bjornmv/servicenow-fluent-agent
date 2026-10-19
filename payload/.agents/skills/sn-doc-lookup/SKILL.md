---
name: sn-doc-lookup
description: Searches official ServiceNow product documentation offline, with citations. Use when answering product documentation questions or when the local docs search fails; not Fluent syntax (sn-explain).
argument-hint: <ServiceNow docs question or search terms>
compatibility: Node.js, sn-skill (else node "<user-profile>/.agents/tools/sn-skill.cjs") and an existing ServiceNowDocs corpus/index in the default per-user data layout or explicit paths.
metadata:
  version: '1'
---

# ServiceNow Markdown Doc Lookup

Preferred lookup for official ServiceNow product docs, from the GitHub markdown corpus (`ServiceNow/ServiceNowDocs`). The exact field/syntax shape of a Fluent record you are about to author comes from [sn-explain](../sn-explain/SKILL.md), not from here.

## Commands

Three read-only commands, each starting with `sn-skill docs`, not a variable from a previous terminal call. The final stderr line `sn-skill: docs exit=<N>` is the native exit evidence; without it the lookup is UNKNOWN. Single-quote query text and leave out any `'` or `"`.

```
sn-skill docs paths
sn-skill docs search --query '...' --keywords '...' --json
sn-skill docs read --id '<chunk-id>' --json
sn-skill docs read --path "<source_rel>" --json
```

## Paths

```text
Docs:  %LOCALAPPDATA%\SNDocs\repo
Index: %LOCALAPPDATA%\SNDocs\index
```

Linux/macOS: `$XDG_DATA_HOME/SNDocs/{repo,index}`, or `~/.local/share/SNDocs/{repo,index}` when `XDG_DATA_HOME` is unset or relative. `SN_DOCS_HOME` names the checkout root (the directory containing `markdown/`).

- Precedence: explicit `--docs` / `--out` / `--index`, then `SN_DOCS_HOME` / `SN_DOC_MD_INDEX`, then these defaults. No legacy-location discovery or migration.
- `paths` prints the resolved `docs` and `index` as JSON, plus `docsExists`, `indexExists` and `manifestExists`; it creates, downloads and changes nothing. Its output beats legacy cache/MCP memories; `%LOCALAPPDATA%\sn-docs` is NOT `%LOCALAPPDATA%\SNDocs`.
- Prefer omitting `--index` for search/read; use an explicit path only when intentionally selected and verified.
- Search directly; a usable index needs no pre-check. On ENOENT, run `paths` and compare the failed path with its output before declaring documentation unavailable. Do not silently fall back to a bare Git cache, guess another path, migrate, download or rebuild. If a selected override is genuinely missing, report that exact path and stop for review.
- If ENOENT persists on the resolved path (checkout, index or its `manifest.json` missing), read [references/missing-docs-or-index.md](references/missing-docs-or-index.md) before acting. Building needs a setup run that includes it or explicit user approval; replacing an index needs separate approval plus `--force`. Never delete an unexpected directory.

## Search workflow

Outside the agent's shared session-start gate, documentation-only questions skip update-advisor checks. A startup notice or lookup never authorizes SDK upgrades, builds or documentation maintenance.

1. Search with the user's natural question in `--query` and high-signal terms in `--keywords`.
2. If results are broad or noisy, run a second search with better keywords.
3. Read only the few chunks you will cite: `read --id <id>` with each result's numeric `id`.
4. Answer with a concise synthesis, `source_rel` and `canonical_url`, naming the release the index covers (`index.family`). If the user's instance is on another release, say the corpus covers only that family.

```
sn-skill docs search --query 'How do I reduce the size of the audit logs?' --keywords 'audit retention purge sys_audit no_audit audit_type whitelist audited fields' --limit 8 --json
sn-skill docs read --id '<chunk-id>' --json
```

### Results

- Always pass `--json` to read; plain text is cut at 12,000 characters per chunk (`[truncated: ...]`).
- `read --path <source_rel>` returns **every** chunk, uncapped; use it only for a whole page with small `doc_chunks` (`c_GlideRecordAPI.md`, about 160 chunks, is roughly 2 MB). Copy `source_rel` from the result; it is relative to the checkout's `markdown` directory, with forward slashes.
- A read miss returns `"ok": false`, an `error`, empty `rows` and exit 1: the id/path is not in the index, not an empty page.
- `kind: "toc"` results (id `toc:<n>`) are listed pages missing from the checkout: unreadable, no `canonical_url`; say so.
- If `canonical_url` is empty, cite `source_rel` and the row's `raw_url` from `read`; never construct a docs URL yourself.
- Report any `warnings`. If one flags an older index whose URLs lost underscores (`cGlideRecordAPI.html` for `c_GlideRecordAPI.html`), cite `source_rel` and `raw_url` instead of `canonical_url` for any `source_rel` file name with an underscore until an approved rebuild.
- For exact roles/APIs, use the **read text**, not shortened search snippets. Raw Markdown can escape identifiers such as `ui\_builder\_admin`, so a literal grep miss does not establish semantic absence. Read relevant overview/access pages before negative claims; distinguish general use, specialized features and permissions needed to grant a role.

## Keyword discipline

- When `--keywords` is present, retrieval terms come **only** from it; `--query` then drives intent classification and identifier scoring. Put every term that must match into `--keywords`, and keep a dotted `Class.method` symbol in `--query` as well.
- Only the first 16 keyword tokens count, and identifiers expand (`sys_audit` also yields `sys` and `audit`; plurals add a singular), so lead with the most distinctive terms.
- Prefer API, table, property and product names (`GlideRecord addQuery`, `no_audit`, `Workflow Studio action inputs`). Fluent terms (`BusinessRule object sys_script servicenow sdk`) find narrative product pages, for background/citation only. Drop generic words like `how`, `what`, `best` unless part of an exact title.

## Execution evidence and subagents

- Prefer a direct CLI lookup. An execution subagent, if the harness requires one, must return the actual excerpts, exact identifiers, `source_rel`, `canonical_url`, observed exit/error evidence and any saved-output path; "files retrieved successfully" is not enough. Read a saved result if provided; never answer without that evidence or invent a failure/exit code.
- Blank stdout or "Command produced no output" is **UNKNOWN**, not an empty result set or native exit 0 (search `--json` must return valid JSON with a results array, even for zero hits). On missing or misattributed output, stop sending commands into that terminal; read saved output or use file tools on the verified corpus. Do not broaden queries, infer absent roles/corpus, rebuild the index or retry a mutation to compensate.
- Use a documentation subagent only for multiple independent searches, conflicting evidence, low query confidence or an explicit deep-research request.

## Maintenance boundary

Refresh the corpus/index only through an approved [sn-update-advisor](../sn-update-advisor/SKILL.md) workflow, preserving dirty work and existing sources. A lookup error alone does not authorize refresh or rebuild. Report index provenance from the current run's `index` object or the manifest; do not reuse historical timings or assume an indexed commit the manifest lacks.
