---
name: sn-doc-lookup
description: Use when answering ServiceNow product documentation questions or finding official citations through the local Markdown corpus and prebuilt index; no web access or SDK maintenance required.
argument-hint: <ServiceNow docs question or search terms>
compatibility: Node.js and an existing ServiceNowDocs corpus/index; explicit paths required outside the Windows default layout.
metadata:
  version: '1'
---

# ServiceNow Markdown Doc Lookup

Use this skill for fast official ServiceNow documentation lookup from the GitHub markdown corpus (`ServiceNow/ServiceNowDocs`). It is the preferred general ServiceNow docs lookup path for the distributed / VS Code agent setup.

## Tooling in this skill

- CLI: `bin/sn-doc-md.js`
- Source code: `src/`
- Benchmark suite: `test/benchmarks.json`, `test/run-tests.js`

The CLI is dependency-free Node.js and supports:

```powershell
node "$Skill\bin\sn-doc-md.js" build  --docs <ServiceNowDocs> --out <index> --family australia --force
node "$Skill\bin\sn-doc-md.js" paths
node "$Skill\bin\sn-doc-md.js" search --query "..." --keywords "..." --json
node "$Skill\bin\sn-doc-md.js" read   --id <chunk-id> --json
node "$Skill\bin\sn-doc-md.js" read   --path <source_rel> --json
node "$Skill\test\run-tests.js"       --index <index>
```

## Default Windows paths

```text
Docs:  %LOCALAPPDATA%\SNDocs\repo
Index: %LOCALAPPDATA%\SNDocs\index
```

All CLI commands share these defaults. Explicit `--docs` / `--out` / `--index` paths take precedence over `SN_DOCS_HOME` / `SN_DOC_MD_INDEX`, then the defaults above. No legacy-location discovery or automatic migration is performed. Other platforms must provide explicit paths or those overrides when `LOCALAPPDATA` is unavailable.

`node "$Skill\bin\sn-doc-md.js" paths` reports resolved paths without creating directories, downloading docs or building an index. Prefer omitting `--index` for search/read: the CLI already honors the configured override/default. Use an explicit path only when intentionally selected and verified.

Current resolver output takes precedence over legacy cache/MCP memories. `%LOCALAPPDATA%\sn-docs` is NOT `%LOCALAPPDATA%\SNDocs` (the hyphen matters). On ENOENT, run `paths` and compare the failed path with its output before declaring documentation unavailable. Do not silently fall back to a bare Git cache, guess another path, migrate, download or rebuild. If a selected override is genuinely missing, report that exact path and stop for review.

## Before searching

Set paths in PowerShell style in the VS Code terminal. For direct Node execution, pass resolved paths as arguments.

```powershell
$Skill = Join-Path $env:USERPROFILE '.agents\skills\sn-doc-lookup'
$Docs  = if ($env:SN_DOCS_HOME) { $env:SN_DOCS_HOME } else { Join-Path $env:LOCALAPPDATA 'SNDocs\repo' }
$Index = if ($env:SN_DOC_MD_INDEX) { $env:SN_DOC_MD_INDEX } else { Join-Path $env:LOCALAPPDATA 'SNDocs\index' }
```

If the docs checkout is missing, report that documentation installation is pending. Do not silently use an older checkout or download/move docs outside an authorized installation. If the checkout exists but the index is missing, build it only when indexing is authorized:

```powershell
node "$Skill\bin\sn-doc-md.js" build --docs "$Docs" --out "$Index" --family australia
```

Rebuilding an existing recognized index requires explicit `--force`. Never delete an unexpected directory to make indexing succeed. Search/read/test do not create or rebuild indexes.

## Search workflow

Outside the agent's shared session-start gate, documentation-only questions skip update-advisor checks. A startup notice or lookup never authorizes SDK upgrades, builds or documentation maintenance. Start with the existing index.

1. Start with a direct search using the user's natural question plus high-signal keywords.
2. If results look broad/noisy, run a second targeted search with better keywords.
3. Read only the few top source paths/chunks needed for citations.
4. Answer with concise synthesis, `source_rel`, and `canonical_url`.

For exact roles/APIs, use the **read text**, not just search snippets (display formatting may remove underscores). Raw Markdown can contain escaped identifiers such as `ui\_builder\_admin`; a literal grep miss does not establish semantic absence. Read relevant overview/access pages before making negative claims, and distinguish general use, specialized features and permissions needed to grant a role.

Example:

```powershell
node "$Skill\bin\sn-doc-md.js" search `
  --query "How do I reduce the size of the audit logs?" `
  --keywords "audit retention purge sys_audit no_audit audit_type whitelist audited fields" `
  --limit 8 --json
```

Then read a cited doc:

```powershell
node "$Skill\bin\sn-doc-md.js" read --path "platform-security/setup-audit-retention.md" --json
```

## Keyword discipline

Always pass `--keywords` when possible. Prefer ServiceNow-specific terms:

- API/class/method names: `GlideRecord addQuery`, `ScriptableFlowAPI executeAction`
- Table/property names: `sys_audit`, `audit_type`, `no_audit`
- Product/doc terms: `Workflow Studio action inputs`, `Discovery probes patterns MID Server`
- Fluent terms: `BusinessRule object sys_script servicenow sdk`

Drop generic words like `how`, `what`, `best`, `use`, `between` unless they are part of an exact title.

## Fast path vs subagent

Prefer a direct CLI lookup when the harness permits it. It typically returns in a few hundred milliseconds once indexed. If the harness requires an execution subagent, preserve the same lookup/read commands and require its response to include the actual excerpts, exact identifiers, `source_rel`, `canonical_url`, observed exit/error evidence and any saved-output path. “Files retrieved successfully” is not sufficient. Read a saved result if provided; do not answer without the evidence or invent a failure/exit code from missing output.

Blank stdout or “Command produced no output” is **UNKNOWN**, not an empty result set or native exit 0. Search --json must return valid JSON with a results array, even for zero hits. On missing/misattributed output, stop sending commands into that suspect terminal. Read saved output or use editor file tools on the verified corpus; do not broaden queries, infer absent roles/corpus, rebuild the index or retry a mutation to compensate for an execution-channel failure.

Use a documentation subagent only when:

- the question needs multiple independent searches and synthesis,
- evidence conflicts,
- query confidence is low,
- or the user explicitly asks for a deeper research pass.

## Quality benchmark

Run after changing ranking/indexing code:

```powershell
node "$Skill\test\run-tests.js" --index "$Index"
```

The suite includes UI Builder roles: the overview must rank near the top and its read text must preserve `ui_builder_admin`. Report measured results and available index provenance from the current run; do not reuse a historical timing or assume an indexed commit when the manifest lacks it.

## Notes for distribution

- Do not bundle `.sn-doc-index/`; it is large and machine-generated.
- Bundle this skill's source files and build the index locally from the user's cloned/shallow-cloned ServiceNowDocs repository.
- Refresh the corpus/index only through an approved update workflow (`sn-update-advisor`), preserving dirty work and existing sources. A lookup error alone does not authorize refresh or rebuild.
