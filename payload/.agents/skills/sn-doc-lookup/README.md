# sn-doc-md

Markdown-native ServiceNow documentation lookup prototype for the official `ServiceNow/ServiceNowDocs` GitHub corpus.

Design goals:

- No PDF conversion.
- No vector database.
- No external npm dependencies.
- Fast local deterministic search with citations back to official markdown/canonical URLs.
- Easy to package as a VS Code/agent skill.

## Build an index

```powershell
node bin/sn-doc-md.js build `
  --docs C:\Personal\SNDocs\ServiceNowDocs `
  --out C:\Personal\SNDocs\sn-doc-md\.sn-doc-index\australia `
  --family australia `
  --force
```

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

## Search

```powershell
node bin/sn-doc-md.js search --index .\.sn-doc-index\australia --query "GlideRecord.addQuery"
```

Use `--keywords` for high-signal retrieval terms:

```powershell
node bin/sn-doc-md.js search --index .\.sn-doc-index\australia `
  --query "How do Service Portal widget client scripts use spUtil?" `
  --keywords "spUtil Service Portal widget client script"
```

## Read

```powershell
node bin/sn-doc-md.js read --index .\.sn-doc-index\australia --id 123
node bin/sn-doc-md.js read --index .\.sn-doc-index\australia --path api-reference/server-api-reference/c_GlideRecordAPI.md
```

## Benchmark quality and latency

```powershell
node test/run-tests.js --index .\.sn-doc-index\australia
```

The benchmark is intentionally small and editable. It verifies that important ServiceNow lookup queries return expected documents within a target rank and reports p50/p95 latency.

Current local Australia index build from `ServiceNowDocs@cb48b5c3`:

- 45,991 markdown files scanned
- 47 zero-byte files skipped
- 45,891 article files indexed
- 150,663 content chunks
- 57,197 TOC links
- Quality benchmark: 12/12 passed
- In-process benchmark latency: p50 ~253 ms, p95 ~333 ms on this machine
