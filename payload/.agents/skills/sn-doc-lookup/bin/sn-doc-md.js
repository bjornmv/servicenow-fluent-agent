#!/usr/bin/env node
const { resolveDocs, resolveIndex } = require('../src/paths');
const { parseArgs } = require('../src/common');
const { buildIndex } = require('../src/build-index');
const { DocSearch } = require('../src/search');

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  try {
    if (cmd === 'paths') {
      console.log(JSON.stringify({ docs: resolveDocs(args.docs), index: resolveIndex(args.index || args.out) }, null, 2));
      return;
    }
    if (cmd === 'build') {
      const res = await buildIndex(args);
      console.log(JSON.stringify({ ok: true, outDir: res.outDir, warnings: res.warnings || [], manifest: res.manifest }, null, 2));
      return;
    }
    if (cmd === 'search') {
      const index = resolveIndex(args.index);
      const query = args.query || args.q || args._.join(' ');
      if (!query) throw new Error('missing --query');
      const ds = new DocSearch(index);
      const res = ds.search(query, { keywords: args.keywords || '', limit: args.limit || 10 });
      if (args.json) console.log(JSON.stringify(res, null, 2));
      else printSearch(res);
      return;
    }
    if (cmd === 'read') {
      const index = resolveIndex(args.index);
      const ds = new DocSearch(index);
      let rows;
      if (args.id !== undefined) rows = [ds.readById(args.id)].filter(Boolean);
      else if (args.path) rows = ds.readByPath(args.path);
      else throw new Error('missing --id or --path');
      if (!rows.length) {
        // A miss is a failure, not an empty document: never report ok with no rows.
        const what = args.id !== undefined ? `chunk id ${args.id}` : `path ${args.path}`;
        const error = `no indexed content for ${what}; use the numeric id or source_rel of a kind "content" search result`;
        if (args.json) console.log(JSON.stringify({ ok: false, error, rows: [] }, null, 2));
        else console.error(`ERROR: ${error}`);
        process.exitCode = 1;
        return;
      }
      if (args.json) console.log(JSON.stringify({ ok: true, ...ds.indexInfo(), rows }, null, 2));
      else {
        const max = Number(args.max_chars || 12000);
        for (const r of rows) {
          console.log(`# ${r.title}${r.heading && r.heading !== r.title ? ' / ' + r.heading : ''}`);
          console.log(`Id: ${r.id}`);
          console.log(`Path: ${r.source_rel}`);
          if (r.canonical_url) console.log(`Canonical: ${r.canonical_url}`);
          console.log('');
          console.log(r.text.slice(0, max));
          if (r.text.length > max) console.log(`\n[truncated: ${max} of ${r.text.length} characters shown; use --json or a larger --max_chars]`);
          console.log('\n---\n');
        }
      }
      return;
    }
    if (cmd === 'test') {
      const { runBenchmarks } = require('../test/run-tests');
      const index = resolveIndex(args.index);
      const ok = await runBenchmarks({ indexDir: index, json: !!args.json });
      process.exit(ok ? 0 : 1);
    }
    usage();
    process.exit(cmd ? 1 : 0);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    if (args.verbose) console.error(e.stack);
    process.exit(1);
  }
}

function printSearch(res) {
  console.log(`Query: ${res.query}`);
  if (res.keywords) console.log(`Keywords: ${res.keywords}`);
  console.log(`Intent: ${res.intent} | ${res.elapsed_ms} ms | candidates=${res.total_candidates}`);
  for (const w of res.warnings || []) console.log(`Warning: ${w}`);
  console.log('');
  for (let i = 0; i < res.results.length; i++) {
    const r = res.results[i];
    console.log(`${i + 1}. [${r.score}] ${r.heading || r.title}`);
    console.log(`   id: ${r.id} | kind: ${r.kind} | ${r.source_rel}`);
    if (r.canonical_url) console.log(`   ${r.canonical_url}`);
    if (r.why && r.why.length) console.log(`   why: ${r.why.join('; ')}`);
    if (r.snippet) console.log(`   ${r.snippet}`);
    console.log('');
  }
}

function usage() {
  console.log(`sn-doc-md

Commands:
  paths  [--docs <repo>] [--index <index>] (report paths only; no filesystem changes)
  build  [--docs <ServiceNowDocs root or markdown dir>] [--out <index dir>] [--family australia] [--force]
         (--force only replaces an existing recognized index)
  search [--index <index dir>] --query <text> [--keywords <terms>] [--limit 10] [--json]
         (when --keywords is given, it alone supplies the retrieval terms)
  read   [--index <index dir>] --id <chunk id> [--json] [--max_chars 12000]
  read   [--index <index dir>] --path <source_rel, relative to markdown/> [--json]
         (--path returns every chunk of the page; a miss exits 1)
  test   [--index <index dir>] [--json]

Defaults: %LOCALAPPDATA%\\SNDocs\\repo and %LOCALAPPDATA%\\SNDocs\\index.
Precedence: explicit flags > SN_DOCS_HOME / SN_DOC_MD_INDEX > defaults.
No legacy-location fallback, automatic download or migration.
`);
}

main();
