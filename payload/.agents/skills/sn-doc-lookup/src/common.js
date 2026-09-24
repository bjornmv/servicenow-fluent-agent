const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','can','could','did','do','does','for','from','had','has','have','how','i','if','in','into','is','it','its','of','on','or','our','should','show','tell','than','that','the','their','then','there','these','this','those','to','use','used','using','via','was','we','what','when','where','which','who','why','will','with','would','you','your',
  'about','after','all','also','any','between','both','compare','compared','difference','differences','different','each','example','examples','find','good','help','less','like','many','more','most','need','new','old','other','same','some','versus','vs',
  'servicenow','platform','instance'
]);

function normalizeSlashes(p) {
  return String(p || '').replace(/\\/g, '/');
}

function normalizeText(s) {
  return String(s || '')
    .replace(/\\([_()\[\]{}*`])/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function normalizeForMatch(s) {
  return normalizeText(s).toLowerCase().replace(/[^a-z0-9_\.\-\s/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitIdentifier(tok) {
  const out = new Set();
  if (!tok) return out;
  out.add(tok.toLowerCase());
  const camelSplit = tok.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  for (const part of camelSplit.split(/[_\-.\s/]+/)) {
    if (part) out.add(part.toLowerCase());
  }
  return out;
}

function tokenize(text, opts = {}) {
  const min = opts.min || 2;
  const max = opts.max || 80;
  const keepStopwords = !!opts.keepStopwords;
  const tokens = new Set();
  const raw = normalizeText(text);
  const re = /[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?|[a-z][a-z0-9]+_[a-z0-9_]+|\d+/g;
  let m;
  while ((m = re.exec(raw))) {
    for (const t of splitIdentifier(m[0])) {
      if (t.length < min || t.length > max) continue;
      if (!keepStopwords && STOPWORDS.has(t)) continue;
      tokens.add(t);
      // Cheap plural normalization improves recall for pairs like probe/probes,
      // pattern/patterns, input/inputs without requiring a stemmer dependency.
      if (t.length > 4 && t.endsWith('ies')) tokens.add(t.slice(0, -3) + 'y');
      else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) tokens.add(t.slice(0, -1));
    }
  }
  return [...tokens];
}

function extractPhrases(query) {
  const q = normalizeText(query);
  const out = new Set();
  for (const m of q.matchAll(/"([^"]{3,120})"|'([^']{3,120})'/g)) out.add((m[1] || m[2]).trim());
  for (const m of q.matchAll(/\b[A-Z][A-Za-z0-9_]*\.[a-zA-Z_][A-Za-z0-9_]*\b/g)) out.add(m[0].replace('.', ' '));
  for (const m of q.matchAll(/\b[a-z]+[A-Z][A-Za-z0-9_]*\b/g)) out.add(m[0]);
  for (const m of q.matchAll(/\b(?:[A-Z][A-Za-z0-9]{1,}|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9]{1,}|[A-Z]{2,})){1,5}\b/g)) {
    const phrase = m[0].trim();
    const words = phrase.split(/\s+/);
    if (!words.some(w => STOPWORDS.has(w.toLowerCase()))) {
      out.add(phrase);
      if (words.length > 2) {
        for (let i = 0; i < words.length - 1; i++) out.add(words.slice(i, i + 2).join(' '));
      }
    }
  }
  for (const m of q.matchAll(/\b(?:sys|cmdb|sn|sp|kb|sc|x)_[a-z0-9_]+\b/gi)) out.add(m[0]);
  const toks = tokenize(q);
  if (toks.length >= 2 && toks.length <= 5) out.add(toks.join(' '));
  return [...out].filter(p => p.length >= 3).slice(0, 20);
}

function parseFrontmatter(markdown) {
  const s = normalizeText(markdown);
  if (!s.startsWith('---\n')) return { meta: {}, body: s };
  const end = s.indexOf('\n---', 4);
  if (end < 0) return { meta: {}, body: s };
  const block = s.slice(4, end);
  const bodyStart = s.indexOf('\n', end + 4);
  const body = bodyStart >= 0 ? s.slice(bodyStart + 1) : '';
  const meta = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    val = val.replace(/\\_/g, '_');
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val.slice(1, -1).split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, body };
}

function stripMarkdownInline(s) {
  return normalizeText(s)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSnippet(text, terms = [], phrases = [], max = 420) {
  const clean = stripMarkdownInline(text || '');
  if (clean.length <= max) return clean;
  const low = clean.toLowerCase();
  let pos = -1;
  for (const p of phrases || []) {
    const i = low.indexOf(normalizeForMatch(p));
    if (i >= 0) { pos = i; break; }
  }
  if (pos < 0) {
    for (const t of terms || []) {
      const i = low.indexOf(t.toLowerCase());
      if (i >= 0) { pos = i; break; }
    }
  }
  if (pos < 0) pos = 0;
  const start = Math.max(0, pos - Math.floor(max / 2));
  const end = Math.min(clean.length, start + max);
  return (start > 0 ? '…' : '') + clean.slice(start, end).trim() + (end < clean.length ? '…' : '');
}

function readOffsets(offPath) {
  const buf = fs.readFileSync(offPath);
  const out = new Array(Math.floor(buf.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = Number(buf.readBigUInt64LE(i * 8));
  return out;
}

function readLineAt(filePath, offset) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const chunks = [];
    let pos = offset;
    while (true) {
      const buf = Buffer.allocUnsafe(8192);
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      const slice = buf.subarray(0, n);
      const nl = slice.indexOf(0x0a);
      if (nl >= 0) {
        chunks.push(slice.subarray(0, nl));
        break;
      }
      chunks.push(slice);
      pos += n;
    }
    return Buffer.concat(chunks).toString('utf8').replace(/\r$/, '');
  } finally {
    fs.closeSync(fd);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walkFiles(root, cb) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      walkFiles(p, cb);
    } else {
      cb(p, ent);
    }
  }
}

function tryGit(root, args) {
  try {
    return childProcess.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'force' || key === 'json' || key === 'verbose') { args[key] = true; continue; }
    args[key] = argv[++i];
  }
  return args;
}

module.exports = {
  STOPWORDS,
  normalizeSlashes,
  normalizeText,
  normalizeForMatch,
  tokenize,
  extractPhrases,
  parseFrontmatter,
  stripMarkdownInline,
  makeSnippet,
  readOffsets,
  readLineAt,
  ensureDir,
  walkFiles,
  tryGit,
  parseArgs,
};
