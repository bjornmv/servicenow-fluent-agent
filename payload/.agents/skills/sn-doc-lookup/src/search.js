const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const {
  tokenize,
  extractPhrases,
  normalizeForMatch,
  makeSnippet,
  readOffsets,
  readLineAt,
} = require('./common');

class JsonlIndex {
  constructor(indexDir, name) {
    this.indexDir = indexDir;
    this.name = name;
    this.dataPath = path.join(indexDir, `${name}.jsonl`);
    this.offPath = path.join(indexDir, `${name}.off`);
    this.idxPath = path.join(indexDir, `${name}.idx`);
    this.mapPath = path.join(indexDir, `${name}.idx.map.json`);
    this.map = JSON.parse(fs.readFileSync(this.mapPath, 'utf8'));
    this.offsets = readOffsets(this.offPath);
    this.postingCache = new Map();
    this.rowCache = new Map();
  }

  df(term) {
    const m = this.map[term];
    return m ? m[2] : 0;
  }

  postings(term) {
    if (this.postingCache.has(term)) return this.postingCache.get(term);
    const meta = this.map[term];
    if (!meta) return [];
    const [offset, len] = meta;
    const fd = fs.openSync(this.idxPath, 'r');
    try {
      const buf = Buffer.allocUnsafe(len);
      fs.readSync(fd, buf, 0, len, offset);
      const line = buf.toString('utf8').trimEnd();
      const tab = line.indexOf('\t');
      const ids = tab >= 0 && line.length > tab + 1 ? line.slice(tab + 1).split(',').filter(Boolean).map(Number) : [];
      this.postingCache.set(term, ids);
      return ids;
    } finally {
      fs.closeSync(fd);
    }
  }

  row(id) {
    if (this.rowCache.has(id)) return this.rowCache.get(id);
    const off = this.offsets[id];
    if (off === undefined) return null;
    const line = readLineAt(this.dataPath, off);
    const row = JSON.parse(line);
    this.rowCache.set(id, row);
    if (this.rowCache.size > 2000) {
      const first = this.rowCache.keys().next().value;
      this.rowCache.delete(first);
    }
    return row;
  }
}

function classifyIntent(query) {
  const q = query.toLowerCase();
  if (/release notes?|upgrade|deprecated|new in|delta/.test(q)) return 'release';
  if (/fluent|now-sdk|\.now\.ts|businessrule|table api|scriptinclude|catalogitem/.test(q)) return 'fluent';
  if (/\b[A-Z][A-Za-z0-9_]*\.[a-zA-Z_][A-Za-z0-9_]*\b/.test(query) || /\b[A-Z][A-Za-z0-9_]+\s*-\s*[a-zA-Z_][A-Za-z0-9_]+/.test(query) || /api|gliderecord|glidesystem|glideform|sputil|scriptableflow/i.test(query)) return 'api';
  if (/what is|define|definition|meaning|glossary/.test(q)) return 'definition';
  return 'general';
}

function topEntries(map, limit) {
  return [...map.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);
}

class DocSearch {
  constructor(indexDir) {
    this.indexDir = path.resolve(indexDir);
    this.manifest = JSON.parse(fs.readFileSync(path.join(this.indexDir, 'manifest.json'), 'utf8'));
    this.content = new JsonlIndex(this.indexDir, 'content');
    this.toc = fs.existsSync(path.join(this.indexDir, 'toc.jsonl')) ? new JsonlIndex(this.indexDir, 'toc') : null;
    this.pathMap = JSON.parse(fs.readFileSync(path.join(this.indexDir, 'path-map.json'), 'utf8'));
  }

  idf(term, index = this.content) {
    const n = index.offsets.length || 1;
    const df = index.df(term) || 0;
    return Math.log(1 + n / (1 + df));
  }

  initialCandidates(terms, opts = {}) {
    const limitDf = opts.limitDf || Math.max(5000, Math.floor(this.content.offsets.length * 0.08));
    const useful = terms
      .map(t => ({ term: t, df: this.content.df(t) }))
      .filter(x => x.df > 0)
      .sort((a, b) => a.df - b.df);
    const uncommon = useful.filter(x => x.df <= limitDf);
    const chosen = (uncommon.length ? uncommon : useful).slice(0, 8).map(x => x.term);
    const candidates = new Map();
    for (const term of chosen) {
      const postings = this.content.postings(term);
      const df = postings.length || 1;
      const idf = this.idf(term);
      // Avoid pathological one-term generic scans; direct callers should provide better keywords.
      const cap = terms.length <= 1 ? Math.min(df, 30000) : df;
      for (let i = 0; i < cap; i++) {
        const id = postings[i];
        let c = candidates.get(id);
        if (!c) candidates.set(id, c = { score: 0, matched: new Set() });
        c.score += idf;
        c.matched.add(term);
      }
    }
    return { candidates, chosenTerms: chosen };
  }

  tocBoosts(terms, candidates, intent = 'general') {
    if (!this.toc || intent === 'fluent') return [];
    const tocScores = new Map();
    for (const term of terms) {
      const postings = this.toc.postings(term);
      const idf = this.idf(term, this.toc);
      for (const id of postings.slice(0, 20000)) {
        let c = tocScores.get(id);
        if (!c) tocScores.set(id, c = { score: 0, matched: new Set() });
        c.score += idf;
        c.matched.add(term);
      }
    }
    const tocOnly = [];
    for (const [id, c] of topEntries(tocScores, 150)) {
      const row = this.toc.row(id);
      if (!row) continue;
      const targetIds = this.pathMap[row.target_rel] || [];
      if (targetIds.length) {
        const bonus = Math.min(4, c.score * 0.15 + c.matched.size * 0.8);
        for (const cid of targetIds.slice(0, 4)) {
          let cc = candidates.get(cid);
          if (!cc) candidates.set(cid, cc = { score: 0, matched: new Set(), toc: 0 });
          cc.score += bonus;
          cc.toc = (cc.toc || 0) + bonus;
          for (const t of c.matched) cc.matched.add(t);
        }
      } else if (row.exists === false || row.zero) {
        tocOnly.push({ row, score: c.score, matched: c.matched });
      }
    }
    return tocOnly;
  }

  scoreRow(row, query, terms, phrases, intent, initial) {
    const title = normalizeForMatch(row.title);
    const heading = normalizeForMatch(row.heading);
    const desc = normalizeForMatch(row.description);
    const sourcePath = normalizeForMatch(row.source_rel || '');
    const meta = normalizeForMatch([row.product, row.classification, row.topic_type, (row.breadcrumb || []).join(' '), row.source_rel].join(' '));
    const body = normalizeForMatch(row.text);
    const all = `${title} ${heading} ${desc} ${meta} ${body}`;
    let score = (initial.score || 0) * 1.4;
    const why = [];
    let covered = 0;
    for (const t of terms) {
      const idf = this.idf(t);
      let hit = false;
      if (title.includes(t)) { score += 9 * idf; hit = true; why.push(`title:${t}`); }
      if (heading.includes(t)) { score += 10 * idf; hit = true; why.push(`heading:${t}`); }
      if (desc.includes(t)) { score += 4.5 * idf; hit = true; }
      if (meta.includes(t)) { score += 3.5 * idf; hit = true; }
      if (body.includes(t)) { score += 1.1 * idf; hit = true; }
      if (hit) covered++;
    }
    const coverage = terms.length ? covered / terms.length : 0;
    score += coverage * 22;
    if (coverage === 1 && terms.length > 1) { score += 16; why.push('all query tokens covered'); }

    let pathCovered = 0;
    for (const t of terms) if (sourcePath.includes(t)) pathCovered++;
    if (terms.length && pathCovered) {
      const pathCoverage = pathCovered / terms.length;
      score += pathCoverage * 35;
      if (pathCoverage >= 0.5) why.push('source path token match');
    }

    for (const ident of (query.match(/\b[A-Za-z]+[A-Z][A-Za-z0-9_]*\b/g) || [])) {
      if (ident.length < 7) continue;
      const identNorm = ident.toLowerCase();
      if (title.includes(identNorm)) { score += 140; why.push(`title identifier:${ident}`); }
      if (heading.includes(identNorm)) { score += 150; why.push(`heading identifier:${ident}`); }
      else if (body.includes(identNorm)) score += 16;
    }

    for (const p of phrases) {
      const pn = normalizeForMatch(p);
      if (!pn || pn.length < 3) continue;
      if (title.includes(pn)) { score += title.startsWith(pn) ? 135 : 75; why.push(`title phrase:${p}`); }
      else if (heading.includes(pn)) { score += heading.startsWith(pn) ? 125 : 70; why.push(`heading phrase:${p}`); }
      else if (desc.includes(pn)) { score += 24; why.push(`description phrase:${p}`); }
      else if (body.includes(pn)) { score += 9; why.push(`body phrase:${p}`); }
    }

    // API dotted symbol bridge: GlideRecord.addQuery -> heading/title containing both tokens.
    const dotted = query.match(/\b([A-Z][A-Za-z0-9_]*)\.([a-zA-Z_][A-Za-z0-9_]*)\b/);
    if (dotted) {
      const a = dotted[1].toLowerCase();
      const b = dotted[2].toLowerCase();
      if ((title.includes(a) || heading.includes(a)) && (title.includes(b) || heading.includes(b))) {
        score += 520;
        why.push('api dotted symbol bridge');
      } else if ((title.includes(a) || heading.includes(a)) && !heading.includes(b)) {
        score *= 0.82;
        why.push('penalty: API class matched but method did not');
      }
    }

    if (intent === 'api') {
      if (row.publication === 'api-reference' || row.classification === 'api-reference') score += 18;
      if (/api-reference\//.test(row.source_rel)) score += 8;
    }
    if (intent === 'fluent') {
      if (/servicenow-sdk/.test(row.source_rel)) score += 150;
      if (/api-now-ts|fluent/.test(row.source_rel)) score += 60;
      if (!/servicenow-sdk/.test(row.source_rel) && row.publication === 'api-reference') {
        score *= 0.45;
        why.push('penalty: non-SDK source for fluent intent');
      }
    }
    if (!/\bscoped\b/i.test(query) && /^scoped\s+/i.test(row.heading || '')) {
      score *= 0.72;
      why.push('penalty: scoped result not requested');
    }
    if (!/\bclient\b|client-side/i.test(query) && (/client/i.test(row.source_rel || '') || /^client\s+side\s+/i.test(row.heading || ''))) {
      score *= 0.76;
      why.push('penalty: client result not requested');
    }
    if (intent !== 'release' && (/release-notes|^delta-/.test(row.source_rel) || row.publication === 'release-notes')) {
      score *= 0.35;
      why.push('penalty: release/delta');
    }
    if (intent !== 'definition' && /glossary/.test(row.source_rel)) {
      score *= 0.55;
      why.push('penalty: glossary');
    }
    if (initial.toc) why.push('toc boost');
    return { score, why: [...new Set(why)].slice(0, 8), coverage, allText: all };
  }

  search(query, options = {}) {
    const t0 = performance.now();
    const keywords = options.keywords || '';
    const retrieval = keywords || query;
    const terms = tokenize(retrieval).slice(0, 16);
    const phrases = extractPhrases(retrieval || query);
    const intent = options.intent || classifyIntent(query + ' ' + keywords);
    const limit = Number(options.limit || 10);
    const { candidates, chosenTerms } = this.initialCandidates(terms, options);
    const tocOnly = this.tocBoosts(terms, candidates, intent);
    const initialTop = topEntries(candidates, Number(options.candidateLimit || 500));
    const scored = [];
    for (const [id, init] of initialTop) {
      const row = this.content.row(id);
      if (!row) continue;
      const sr = this.scoreRow(row, query, terms, phrases, intent, init);
      scored.push({ row, score: sr.score, why: sr.why, coverage: sr.coverage });
    }
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit).map(x => ({
      kind: 'content',
      id: x.row.id,
      score: Number(x.score.toFixed(3)),
      title: x.row.title,
      heading: x.row.heading,
      source_rel: x.row.source_rel,
      canonical_url: x.row.canonical_url,
      product: x.row.product,
      topic_type: x.row.topic_type,
      why: x.why,
      snippet: makeSnippet(x.row.text, terms, phrases),
    }));

    if (results.length < limit && tocOnly.length) {
      for (const t of tocOnly.slice(0, limit - results.length)) {
        results.push({
          kind: 'toc',
          id: `toc:${t.row.id}`,
          score: Number(t.score.toFixed(3)),
          title: t.row.title,
          heading: t.row.title,
          source_rel: t.row.target_rel,
          canonical_url: '',
          product: '',
          topic_type: 'toc',
          why: [t.row.zero ? 'toc target is zero-byte' : 'toc target missing'],
          snippet: t.row.description,
        });
      }
    }

    return {
      ok: true,
      query,
      keywords,
      intent,
      terms,
      phrases,
      chosen_terms: chosenTerms,
      elapsed_ms: Number((performance.now() - t0).toFixed(1)),
      total_candidates: candidates.size,
      results,
    };
  }

  readById(id) {
    return this.content.row(Number(id));
  }

  readByPath(sourceRel) {
    const ids = this.pathMap[sourceRel] || [];
    return ids.map(id => this.content.row(id)).filter(Boolean);
  }
}

module.exports = { DocSearch, classifyIntent };
