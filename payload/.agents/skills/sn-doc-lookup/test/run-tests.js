const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { parseArgs } = require('../src/common');
const { DocSearch } = require('../src/search');

function matchesExpectation(result, exp) {
  if (exp.source_rel && result.source_rel !== exp.source_rel) return false;
  if (exp.source_contains && !result.source_rel.includes(exp.source_contains)) return false;
  if (exp.heading_contains && !(result.heading || '').toLowerCase().includes(exp.heading_contains.toLowerCase())) return false;
  if (exp.title_contains && !(result.title || '').toLowerCase().includes(exp.title_contains.toLowerCase())) return false;
  return true;
}

async function runBenchmarks(options = {}) {
  const indexDir = options.indexDir || options.index;
  if (!indexDir) throw new Error('indexDir required');
  const file = options.file || path.join(__dirname, 'benchmarks.json');
  const cases = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ds = new DocSearch(indexDir);
  const rows = [];
  let pass = 0;
  const latencies = [];
  const t0 = performance.now();
  for (const tc of cases) {
    const res = ds.search(tc.query, { keywords: tc.keywords || '', limit: Math.max(10, tc.max_rank || 5) });
    latencies.push(res.elapsed_ms);
    let rank = -1;
    for (let i = 0; i < res.results.length; i++) {
      if ((tc.expect || []).some(exp => matchesExpectation(res.results[i], exp))) {
        rank = i + 1;
        break;
      }
    }
    const ok = rank > 0 && rank <= (tc.max_rank || 5);
    if (ok) pass++;
    rows.push({
      name: tc.name,
      ok,
      rank,
      max_rank: tc.max_rank || 5,
      elapsed_ms: res.elapsed_ms,
      top: res.results[0] ? `${res.results[0].source_rel} :: ${res.results[0].heading}` : '(none)',
      terms: res.terms.join(' '),
    });
  }
  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 0.50);
  const p95 = percentile(latencies, 0.95);
  const summary = {
    ok: pass === cases.length,
    passed: pass,
    total: cases.length,
    accuracy: Number((pass / cases.length).toFixed(3)),
    elapsed_ms: Number((performance.now() - t0).toFixed(1)),
    p50_ms: p50,
    p95_ms: p95,
    rows,
  };
  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
  return summary.ok;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const i = Math.min(values.length - 1, Math.ceil(values.length * p) - 1);
  return Number(values[i].toFixed(1));
}

function printSummary(s) {
  console.log(`sn-doc-md quality benchmark: ${s.passed}/${s.total} passed (${(s.accuracy * 100).toFixed(1)}%)`);
  console.log(`Latency: p50=${s.p50_ms} ms, p95=${s.p95_ms} ms, total=${s.elapsed_ms} ms`);
  console.log('');
  for (const r of s.rows) {
    const status = r.ok ? 'PASS' : 'FAIL';
    console.log(`${status} rank=${r.rank === -1 ? '-' : r.rank}/${r.max_rank} ${r.elapsed_ms}ms  ${r.name}`);
    console.log(`     top: ${r.top}`);
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  runBenchmarks({ indexDir: args.index || process.env.SN_DOC_MD_INDEX, json: !!args.json, file: args.file })
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error(e.stack || e.message); process.exit(1); });
}

module.exports = { runBenchmarks };
