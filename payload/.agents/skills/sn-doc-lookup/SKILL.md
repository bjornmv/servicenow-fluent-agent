---
name: sn-doc-lookup
description: Markdown-native lookup for the official ServiceNowDocs GitHub corpus. Use when answering ServiceNow product documentation questions, finding official docs/citations, researching API/platform behavior, or checking lookup quality/latency. Runs local deterministic search over a prebuilt index; no PDF conversion, vector DB, or web access required.
argument-hint: <ServiceNow docs question or search terms>
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
node "$Skill\bin\sn-doc-md.js" search --index <index> --query "..." --keywords "..." --json
node "$Skill\bin\sn-doc-md.js" read   --index <index> --id <chunk-id> --json
node "$Skill\bin\sn-doc-md.js" read   --index <index> --path <source_rel> --json
node "$Skill\test\run-tests.js"       --index <index>
```

## Default Windows paths

```text
Docs:  %LOCALAPPDATA%\SNDocs\repo
Index: %LOCALAPPDATA%\SNDocs\index
```

All CLI commands share these defaults. Explicit `--docs` / `--out` / `--index` paths take precedence over `SN_DOCS_HOME` / `SN_DOC_MD_INDEX`, then the defaults above. No legacy-location discovery or automatic migration is performed. Other platforms must provide explicit paths or those overrides when `LOCALAPPDATA` is unavailable.

`node "$Skill\bin\sn-doc-md.js" paths` reports resolved paths without creating directories, downloading docs or building an index.

## Before searching

Set paths in PowerShell style when invoking from a shell. In Pi tool calls, pass paths directly as arguments.

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

1. Start with a direct search using the user's natural question plus high-signal keywords.
2. If results look broad/noisy, run a second targeted search with better keywords.
3. Read only the few top source paths/chunks needed for citations.
4. Answer with concise synthesis, `source_rel`, and `canonical_url`.

Example:

```powershell
node "$Skill\bin\sn-doc-md.js" search --index "$Index" `
  --query "How do I reduce the size of the audit logs?" `
  --keywords "audit retention purge sys_audit no_audit audit_type whitelist audited fields" `
  --limit 8 --json
```

Then read a cited doc:

```powershell
node "$Skill\bin\sn-doc-md.js" read --index "$Index" --path "platform-security/setup-audit-retention.md" --json
```

## Keyword discipline

Always pass `--keywords` when possible. Prefer ServiceNow-specific terms:

- API/class/method names: `GlideRecord addQuery`, `ScriptableFlowAPI executeAction`
- Table/property names: `sys_audit`, `audit_type`, `no_audit`
- Product/doc terms: `Workflow Studio action inputs`, `Discovery probes patterns MID Server`
- Fluent terms: `BusinessRule object sys_script servicenow sdk`

Drop generic words like `how`, `what`, `best`, `use`, `between` unless they are part of an exact title.

## Fast path vs subagent

Use direct CLI lookup first. It typically returns in a few hundred milliseconds once indexed.

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

Current benchmark from the Australia corpus (`ServiceNowDocs@cb48b5c3`): 12/12 passed, p50 ~253 ms, p95 ~333 ms on this machine.

## Notes for distribution

- Do not bundle `.sn-doc-index/`; it is large and machine-generated.
- Bundle this skill's source files and build the index locally from the user's cloned/shallow-cloned ServiceNowDocs repository.
- The official docs corpus can be refreshed with `git fetch/reset` in the docs checkout, then rebuild the index.
