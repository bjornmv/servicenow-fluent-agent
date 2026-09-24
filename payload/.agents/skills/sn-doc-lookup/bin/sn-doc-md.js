#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { parseArgs } = require('../src/common');
const { buildIndex } = require('../src/build-index');
const { DocSearch } = require('../src/search');

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  try {
    if (cmd === 'build') {
      const res = await buildIndex(args);
      console.log(JSON.stringify({ ok: true, outDir: res.outDir, manifest: res.manifest }, null, 2));
      return;
    }
    if (cmd === 'search') {
      const index = args.index || process.env.SN_DOC_MD_INDEX;
      if (!index) throw new Error('missing --index or SN_DOC_MD_INDEX');
      const query = args.query || args.q || args._.join(' ');
      if (!query) throw new Error('missing --query');
      const ds = new DocSearch(index);
      const res = ds.search(query, { keywords: args.keywords || '', limit: args.limit || 10 });
      if (args.json) console.log(JSON.stringify(res, null, 2));
      else printSearch(res);
      return;
    }
    if (cmd === 'read') {
      const index = args.index || process.env.SN_DOC_MD_INDEX;
      if (!index) throw new Error('missing --index or SN_DOC_MD_INDEX');
      const ds = new DocSearch(index);
      let rows;
      if (args.id !== undefined) rows = [ds.readById(args.id)].filter(Boolean);
      else if (args.path) rows = ds.readByPath(args.path);
      else throw new Error('missing --id or --path');
      if (args.json) console.log(JSON.stringify({ ok: true, rows }, null, 2));
      else {
        for (const r of rows) {
          console.log(`# ${r.title}${r.heading && r.heading !== r.title ? ' / ' + r.heading : ''}`);
          console.log(`Path: ${r.source_rel}`);
          if (r.canonical_url) console.log(`Canonical: ${r.canonical_url}`);
          console.log('');
          console.log(r.text.slice(0, Number(args.max_chars || 12000)));
          console.log('\n---\n');
        }
      }
      return;
    }
    if (cmd === 'test') {
      const { runBenchmarks } = require('../test/run-tests');
      const index = args.index || process.env.SN_DOC_MD_INDEX;
      if (!index) throw new Error('missing --index or SN_DOC_MD_INDEX');
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
  console.log('');
  for (let i = 0; i < res.results.length; i++) {
    const r = res.results[i];
    console.log(`${i + 1}. [${r.score}] ${r.heading || r.title}`);
    console.log(`   ${r.source_rel}`);
    if (r.canonical_url) console.log(`   ${r.canonical_url}`);
    if (r.why && r.why.length) console.log(`   why: ${r.why.join('; ')}`);
    if (r.snippet) console.log(`   ${r.snippet}`);
    console.log('');
  }
}

function usage() {
  console.log(`sn-doc-md

Commands:
  build  --docs <ServiceNowDocs root or markdown dir> --out <index dir> --family australia [--force]
  search --index <index dir> --query <text> [--keywords <terms>] [--limit 10] [--json]
  read   --index <index dir> --id <chunk id> [--json]
  read   --index <index dir> --path <markdown/source/path.md> [--json]
  test   --index <index dir> [--json]
`);
}

main();
