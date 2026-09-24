const fs = require('fs');
const path = require('path');
const {
  normalizeSlashes,
  normalizeText,
  tokenize,
  parseFrontmatter,
  stripMarkdownInline,
  ensureDir,
  walkFiles,
  tryGit,
} = require('./common');

function splitMarkdown(body, fallbackTitle) {
  const text = normalizeText(body);
  const re = /^(#{1,4})\s+(.+?)\s*$/gm;
  const headings = [];
  let m;
  while ((m = re.exec(text))) {
    headings.push({ level: m[1].length, heading: stripMarkdownInline(m[2]), start: m.index, contentStart: re.lastIndex });
  }
  if (!headings.length) {
    const t = text.trim();
    return t ? [{ heading: fallbackTitle || '', level: 1, heading_path: fallbackTitle || '', text: t }] : [];
  }
  const out = [];
  const stack = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    stack[h.level - 1] = h.heading;
    stack.length = h.level;
    const end = i + 1 < headings.length ? headings[i + 1].start : text.length;
    const section = text.slice(h.contentStart, end).trim();
    const combined = (h.heading + '\n' + section).trim();
    if (combined.length < 80 && section.length < 80) continue;
    const headingPath = stack.filter(Boolean).join(' > ');
    for (const part of splitLong(combined)) {
      out.push({ heading: h.heading || fallbackTitle || '', level: h.level, heading_path: headingPath, text: part });
    }
  }
  return out;
}

function splitLong(text, max = 18000) {
  if (text.length <= max) return [text];
  const paras = text.split(/\n{2,}/);
  const out = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > max && cur) {
      out.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [text.slice(0, max)];
}

function addTerms(termMap, id, fields) {
  const joined = fields.filter(Boolean).join('\n');
  const terms = tokenize(joined);
  for (const t of terms) {
    let arr = termMap.get(t);
    if (!arr) termMap.set(t, arr = []);
    arr.push(id);
  }
}

function writeJsonlLine(stream, obj, offsets) {
  const line = JSON.stringify(obj) + '\n';
  const offset = stream.__snDocOffset || 0;
  offsets.push(offset);
  stream.__snDocOffset = offset + Buffer.byteLength(line, 'utf8');
  stream.write(line, 'utf8');
}

function writeOffsets(filePath, offsets) {
  const buf = Buffer.allocUnsafe(offsets.length * 8);
  for (let i = 0; i < offsets.length; i++) buf.writeBigUInt64LE(BigInt(offsets[i]), i * 8);
  fs.writeFileSync(filePath, buf);
}

function writeIndex(prefix, termMap) {
  const idxPath = prefix + '.idx';
  const mapPath = prefix + '.idx.map.json';
  const fd = fs.openSync(idxPath, 'w');
  const indexMap = {};
  let offset = 0;
  try {
    const terms = [...termMap.keys()].sort();
    for (const term of terms) {
      const postings = termMap.get(term);
      // Deduplicate defensively; terms are already per-record unique in normal build.
      let prev = -1;
      const ids = [];
      for (const id of postings) { if (id !== prev) ids.push(id); prev = id; }
      const line = `${term}\t${ids.join(',')}\n`;
      const buf = Buffer.from(line, 'utf8');
      fs.writeSync(fd, buf, 0, buf.length, offset);
      indexMap[term] = [offset, buf.length, ids.length];
      offset += buf.length;
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.writeFileSync(mapPath, JSON.stringify(indexMap));
}

function parseTocLine(line) {
  const m = line.match(/^(\s*)-\s+\[([^\]]+)\]\(([^)]+)\)\s*(?:--\s*(.*))?\s*$/);
  if (!m) return null;
  const indent = m[1].replace(/\t/g, '    ').length;
  const depth = Math.floor(indent / 2);
  const title = stripMarkdownInline(m[2]);
  const href = m[3];
  const desc = stripMarkdownInline(m[4] || '');
  let branch = '';
  let target_rel = '';
  const raw = href.match(/^https:\/\/raw\.githubusercontent\.com\/ServiceNow\/ServiceNowDocs\/([^/]+)\/markdown\/(.+)$/);
  if (raw) {
    branch = raw[1];
    try { target_rel = decodeURI(raw[2]); } catch (_) { target_rel = raw[2]; }
  }
  return { depth, title, href, branch, target_rel: normalizeSlashes(target_rel), description: desc };
}

function resolvePaths(docsArg) {
  const abs = path.resolve(docsArg || '.');
  const markdown = fs.existsSync(path.join(abs, 'markdown')) ? path.join(abs, 'markdown') : abs;
  const root = path.basename(markdown).toLowerCase() === 'markdown' ? path.dirname(markdown) : abs;
  if (!fs.existsSync(markdown)) throw new Error(`markdown path not found: ${markdown}`);
  return { root, markdown };
}

async function buildIndex(options) {
  const t0 = Date.now();
  const { root, markdown } = resolvePaths(options.docs || options.markdown);
  const outDir = path.resolve(options.out || path.join(root, '.sn-doc-index', options.family || 'australia'));
  const family = options.family || 'australia';
  if (fs.existsSync(outDir)) {
    if (!options.force) throw new Error(`output exists: ${outDir} (pass --force)`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  ensureDir(outDir);

  const fileSizes = new Map();
  const allMarkdown = [];
  walkFiles(markdown, (p) => {
    if (!p.toLowerCase().endsWith('.md')) return;
    const rel = normalizeSlashes(path.relative(markdown, p));
    const size = fs.statSync(p).size;
    fileSizes.set(rel, size);
    allMarkdown.push({ path: p, rel, size });
  });

  const contentPath = path.join(outDir, 'content.jsonl');
  const contentStream = fs.createWriteStream(contentPath, { encoding: 'utf8' });
  const contentOffsets = [];
  const contentTerms = new Map();
  const pathMap = {};
  const titles = [];
  let chunkId = 0;
  let zeroSkipped = 0;
  let indexSkipped = 0;
  let articleFiles = 0;

  for (const f of allMarkdown) {
    if (f.size === 0) { zeroSkipped++; continue; }
    if (path.basename(f.rel).toLowerCase() === 'index.md') { indexSkipped++; continue; }
    articleFiles++;
    const raw = fs.readFileSync(f.path, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const publication = f.rel.split('/')[0] || '';
    const title = stripMarkdownInline(meta.title || '');
    const description = stripMarkdownInline(meta.description || '');
    const product = stripMarkdownInline(meta.product || '');
    const classification = stripMarkdownInline(meta.classification || '');
    const topic_type = stripMarkdownInline(meta.topic_type || '');
    const last_updated = stripMarkdownInline(meta.last_updated || '');
    const breadcrumb = Array.isArray(meta.breadcrumb) ? meta.breadcrumb.map(stripMarkdownInline) : [];
    const canonical_url = stripMarkdownInline(meta.canonical_url || '').replace(/\\_/g, '_');
    const raw_url = `https://raw.githubusercontent.com/ServiceNow/ServiceNowDocs/${family}/markdown/${f.rel}`;
    const chunks = splitMarkdown(body, title);
    for (const c of chunks) {
      const row = {
        id: chunkId,
        family,
        publication,
        source_rel: f.rel,
        canonical_url,
        raw_url,
        title,
        description,
        product,
        classification,
        topic_type,
        last_updated,
        breadcrumb,
        heading: c.heading || title,
        heading_level: c.level || 1,
        heading_path: c.heading_path || c.heading || title,
        text: c.text,
      };
      writeJsonlLine(contentStream, row, contentOffsets);
      (pathMap[f.rel] ||= []).push(chunkId);
      titles.push({ id: chunkId, source_rel: f.rel, title, heading: row.heading, product, canonical_url });
      addTerms(contentTerms, chunkId, [title, description, product, classification, topic_type, breadcrumb.join(' '), f.rel, row.heading, row.heading_path, row.text]);
      chunkId++;
    }
  }
  await new Promise(resolve => contentStream.end(resolve));
  writeOffsets(path.join(outDir, 'content.off'), contentOffsets);
  writeIndex(path.join(outDir, 'content'), contentTerms);
  fs.writeFileSync(path.join(outDir, 'path-map.json'), JSON.stringify(pathMap));
  fs.writeFileSync(path.join(outDir, 'titles.json'), JSON.stringify(titles));

  const tocPath = path.join(outDir, 'toc.jsonl');
  const tocStream = fs.createWriteStream(tocPath, { encoding: 'utf8' });
  const tocOffsets = [];
  const tocTerms = new Map();
  let tocId = 0;
  let tocLinks = 0;
  let tocZeroTargets = 0;
  let tocMissingTargets = 0;
  for (const f of allMarkdown) {
    if (f.size === 0 || path.basename(f.rel).toLowerCase() !== 'index.md') continue;
    const publication = f.rel.split('/')[0] || '';
    const stack = [];
    const lines = fs.readFileSync(f.path, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const item = parseTocLine(line);
      if (!item || !item.target_rel) continue;
      stack[item.depth] = item.title;
      stack.length = item.depth + 1;
      const targetSize = fileSizes.get(item.target_rel);
      const exists = targetSize !== undefined;
      const zero = exists && targetSize === 0;
      if (!exists) tocMissingTargets++;
      if (zero) tocZeroTargets++;
      const row = {
        id: tocId,
        family: item.branch || family,
        publication,
        index_rel: f.rel,
        depth: item.depth,
        title: item.title,
        description: item.description,
        target_rel: item.target_rel,
        href: item.href,
        parents: stack.slice(0, item.depth),
        exists,
        zero,
        target_size: exists ? targetSize : null,
      };
      writeJsonlLine(tocStream, row, tocOffsets);
      addTerms(tocTerms, tocId, [row.title, row.description, row.target_rel, row.parents.join(' '), publication]);
      tocId++;
      tocLinks++;
    }
  }
  await new Promise(resolve => tocStream.end(resolve));
  writeOffsets(path.join(outDir, 'toc.off'), tocOffsets);
  writeIndex(path.join(outDir, 'toc'), tocTerms);

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generator: 'sn-doc-md@0.1.0',
    family,
    docs_root: root,
    markdown_root: markdown,
    git_head: tryGit(root, ['rev-parse', 'HEAD']),
    git_subject: tryGit(root, ['log', '-1', '--format=%s']),
    counts: {
      markdown_files: allMarkdown.length,
      zero_markdown_files: [...fileSizes.values()].filter(x => x === 0).length,
      zero_skipped: zeroSkipped,
      index_skipped: indexSkipped,
      article_files: articleFiles,
      content_chunks: chunkId,
      content_terms: contentTerms.size,
      toc_links: tocLinks,
      toc_terms: tocTerms.size,
      toc_zero_targets: tocZeroTargets,
      toc_missing_targets: tocMissingTargets,
    },
    elapsed_ms: Date.now() - t0,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { outDir, manifest };
}

module.exports = { buildIndex };
