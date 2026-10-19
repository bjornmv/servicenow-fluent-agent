'use strict';
// Archetype registry and PDF/HTML framing for sn-doc-export (pure functions,
// no dependencies). The registry is the source of truth for the archetype
// names, cover style, TOC range, running header/footer and metadata keys.
// render.js puts coverHtml()/tocHtml() in front of the Markdown it hands to
// md-to-pdf and adds frameCss(); docx-frame.cjs uses the same registry.

// cover: none | compact | full | letter. toc: [minLevel, maxLevel] or null.
// header/footer: templates filled from metadata ({key}); the footer always
// also carries "Page N of M". h1Break: every top-level section starts a page.
const ARCHETYPES = {
  plain: {
    label: 'Document', required: [], optional: ['title', 'subtitle'],
    cover: 'none', toc: null, header: null, footer: null, h1Break: false,
  },
  knowledge_article: {
    label: 'Knowledge Article', required: ['title'],
    optional: ['subtitle', 'category', 'audience', 'author', 'last_reviewed'],
    cover: 'compact', toc: null, header: '{title}', footer: null, h1Break: false,
  },
  runbook: {
    label: 'Runbook', required: ['title', 'audience'],
    optional: ['subtitle', 'service', 'version', 'on_call_team', 'last_drilled'],
    cover: 'full', toc: [1, 3], header: 'Runbook — {title}', footer: 'Internal use only', h1Break: true,
  },
  compliance_report: {
    label: 'Compliance Report', required: ['title', 'control_id', 'framework'],
    optional: ['subtitle', 'audit_period', 'owner', 'reviewer', 'status'],
    cover: 'full', toc: [1, 4], header: '{framework} — {control_id}', footer: 'Confidential', h1Break: true,
  },
  release_notes: {
    label: 'Release Notes', required: ['title', 'version', 'release_date'],
    optional: ['subtitle', 'product', 'channel', 'breaking_changes'],
    cover: 'compact', toc: [2, 3], header: '{product} {version}', footer: null, h1Break: false,
  },
  architecture: {
    label: 'Architecture Document', required: ['title', 'version', 'status'],
    optional: ['subtitle', 'owner', 'reviewers', 'decision_log'],
    cover: 'full', toc: [1, 3], header: '{title} ({status})', footer: null, h1Break: true,
  },
  customer_deliverable: {
    label: 'Customer Deliverable', required: ['title', 'customer', 'date'],
    optional: ['subtitle', 'author', 'contract_id', 'version', 'classification'],
    cover: 'full', toc: [1, 3], header: '{customer} — {title}', footer: 'Prepared for {customer}', h1Break: true,
  },
  letter: {
    label: 'Letter', required: ['title', 'from_name', 'to_name', 'date'],
    optional: ['from_address', 'to_address', 'subject', 'salutation', 'author'],
    cover: 'letter', toc: null, header: null, footer: null, h1Break: false,
  },
};

// Other accepted spellings; the canonical name is reported.
const ALIASES = { compliance: 'compliance_report' };

// Keys every archetype accepts without a warning (document properties).
const COMMON_KEYS = ['title', 'subtitle', 'author'];

function getArchetype(name) {
  const key = Object.hasOwn(ALIASES, name) ? ALIASES[name] : name;
  if (!Object.hasOwn(ARCHETYPES, key)) return null;
  return { name: key, ...ARCHETYPES[key] };
}

// ---------------------------------------------------------------------------
// metadata: flat front matter + --meta overrides
// ---------------------------------------------------------------------------

// Metadata key as stored: lower case, '-' read as '_' (front matter and --meta).
const metaKey = (k) => String(k).trim().toLowerCase().replace(/-/g, '_');

// A leading front-matter block of flat `key: value` lines. Values may be
// wrapped in matching single or double quotes; `#` lines, blank lines and a
// trailing ` # comment` on a value are skipped. Nested or list lines are not
// metadata and are reported, never guessed. A leading `---` whose first line
// is not `key:` is a horizontal rule, not front matter, and is left alone.
// A found block is always removed from the body (md-to-pdf would otherwise
// read it as renderer configuration).
function parseFrontMatter(md) {
  const m = md.match(/^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  const none = { md: md.replace(/^\uFEFF/, ''), meta: {}, found: false, ignored: [], comments: [] };
  if (!m) return none;
  const lines = (m[1] || '').split(/\r?\n/);
  const first = lines.find((l) => l.trim() && !/^\s*#/.test(l));
  if (first !== undefined && !/^[A-Za-z][\w-]*[ \t]*:/.test(first)) return none;
  const meta = {};
  const ignored = [];
  const comments = [];
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = line.match(/^([A-Za-z][\w-]*)[ \t]*:[ \t]*(.*?)[ \t]*$/);
    if (!kv || /^[[{|>]/.test(kv[2])) { ignored.push(line.trim()); continue; }
    const key = metaKey(kv[1]);
    let value = kv[2];
    const q = value.match(/^(['"])(.*)\1(?:[ \t]+#.*)?$/);
    if (q) value = q[1] === "'" ? q[2].replace(/''/g, "'") : q[2].replace(/\\"/g, '"');
    else if (/(?:^|[ \t])#/.test(value)) {
      value = value.replace(/(?:^|[ \t]+)#.*$/, '');
      comments.push(key);
    }
    meta[key] = value;
  }
  return { md: md.slice(m[0].length), meta, found: true, ignored, comments };
}

// First ATX level-1 heading outside fenced code: { text, line } or null.
function firstH1(md) {
  let fence = null;
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    const h = line.match(/^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (h) return { text: h[1].trim(), line: i };
  }
  return null;
}

// Front matter < --meta. The title falls back to the first H1, which is then
// taken out of the body when the archetype draws its own title (cover).
// Returns { meta, body, titleFrom } — titleFrom: meta | h1 | null.
function resolveMetadata(cfg, frontMeta, cliMeta, body) {
  const meta = { ...frontMeta, ...cliMeta };
  for (const k of Object.keys(meta)) meta[k] = String(meta[k] ?? '').trim();
  let titleFrom = meta.title ? 'meta' : null;
  if (!meta.title) {
    const h1 = firstH1(body);
    if (h1) {
      meta.title = inlineText(h1.text);
      titleFrom = 'h1';
      if (cfg.cover !== 'none') {
        const lines = body.split('\n');
        lines.splice(h1.line, 1);
        body = lines.join('\n');
      }
    }
  }
  return { meta, body, titleFrom };
}

function missingMetadata(cfg, meta) {
  return cfg.required.filter((k) => !String(meta[k] ?? '').trim());
}

function unusedMetadata(cfg, meta) {
  const known = new Set([...COMMON_KEYS, ...cfg.required, ...cfg.optional]);
  return Object.keys(meta).filter((k) => !known.has(k));
}

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const prettyKey = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bId\b/g, 'ID');

// Cover metadata: required keys (minus title/subtitle) first, then the
// optional keys that are present, in registry order.
function coverMetaPairs(cfg, meta) {
  const skip = new Set(['title', 'subtitle', 'salutation']);
  const keys = [];
  for (const k of [...cfg.required, ...cfg.optional]) {
    if (!skip.has(k) && !keys.includes(k) && String(meta[k] ?? '').trim()) keys.push(k);
  }
  return keys.map((k) => [prettyKey(k), String(meta[k])]);
}

// "{product} {version}" without product -> "2.0"; "({status})" empty -> "";
// a dangling leading/trailing dash is dropped.
function fillTemplate(tpl, meta) {
  if (!tpl) return '';
  const s = tpl.replace(/\{(\w+)\}/g, (_, k) => String(meta[k] ?? '').trim());
  return s.replace(/\(\s*\)/g, '').replace(/^\s*[—–-]\s*|\s*[—–-]\s*$/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}

// Plain text of inline Markdown, as marked 4 renders it for a heading id:
// code spans keep their content, emphasis markers go only where they wrap
// text (an underscore inside sys_user_group stays), links keep their text,
// backslash escapes and HTML entities are resolved.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
function inlineText(s) {
  const held = [];
  const hold = (t) => `\u0000${held.push(t) - 1}\u0000`;
  let t = String(s)
    .replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (m, ticks, code) => hold(/^ [\s\S]*\S[\s\S]* $/.test(code) ? code.slice(1, -1) : code))
    .replace(/\\([!-/:-@[-`{-~])/g, (m, c) => hold(c))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|\*)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\p{L}\p{N}_])(__|_)(?=\S)([\s\S]*?\S)\2(?![\p{L}\p{N}_])/gu, '$1$3')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) => {
      if (dec || hex) return String.fromCodePoint(parseInt(dec || hex, dec ? 10 : 16));
      return Object.hasOwn(ENTITIES, name.toLowerCase()) ? ENTITIES[name.toLowerCase()] : m;
    });
  // Restore held text (a held item may itself contain a placeholder).
  for (let i = 0; i < 3 && t.includes('\u0000'); i++) t = t.replace(/\u0000(\d+)\u0000/g, (m, n) => held[+n]);
  return t.trim();
}

// Headings outside fenced code, with the ids marked 4 (md-to-pdf) gives them
// (headerIds on, GitHub-style slugger), so TOC links resolve in the PDF.
// Returns every heading; the caller filters by level.
function collectHeadings(md) {
  const seen = {};
  const out = [];
  let fence = null;
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    const m = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (!m) continue;
    const text = inlineText(m[2]);
    let slug = text.toLowerCase().trim().replace(/<[!/a-z].*?>/gi, '')
      .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '').replace(/\s/g, '-');
    if (Object.hasOwn(seen, slug)) {
      let n = seen[slug];
      let candidate;
      do { n += 1; candidate = `${slug}-${n}`; } while (Object.hasOwn(seen, candidate));
      seen[slug] = n;
      seen[candidate] = 0;
      slug = candidate;
    } else seen[slug] = 0;
    out.push({ level: m[1].length, text, slug });
  }
  return out;
}

function tocHeadings(cfg, md) {
  if (!cfg.toc) return [];
  const [min, max] = cfg.toc;
  return collectHeadings(md).filter((h) => h.level >= min && h.level <= max);
}

// ---------------------------------------------------------------------------
// PDF / HTML
// ---------------------------------------------------------------------------

function coverHtml(cfg, meta) {
  const title = esc(meta.title || 'Document');
  const sub = meta.subtitle ? `<p class="doc-cover__subtitle">${esc(meta.subtitle)}</p>` : '';
  if (cfg.cover === 'full') {
    const dl = coverMetaPairs(cfg, meta).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    return `<section class="doc-cover"><p class="doc-cover__kind">${esc(cfg.label)}</p>`
      + `<h1 class="doc-cover__title">${title}</h1>${sub}`
      + (dl ? `<dl class="doc-cover__meta">${dl}</dl>` : '') + '</section>';
  }
  if (cfg.cover === 'compact') {
    const strip = coverMetaPairs(cfg, meta)
      .map(([k, v]) => `<span class="doc-meta__key">${esc(k)}:</span> ${esc(v)}`).join(' &middot; ');
    return `<header class="doc-header"><p class="doc-cover__kind">${esc(cfg.label)}</p><h1 class="doc-title">${title}</h1>${sub}`
      + (strip ? `<div class="doc-meta">${strip}</div>` : '') + '</header>';
  }
  if (cfg.cover === 'letter') {
    const line = (v) => (v ? `<br>${esc(v)}` : '');
    return '<header class="doc-letter">'
      + `<div class="doc-letter__head"><span class="doc-letter__org">${esc(meta.from_name)}</span>`
      + (meta.from_address ? `<span class="doc-letter__addr">${esc(meta.from_address)}</span>` : '') + '</div>'
      + `<p class="doc-letter__date">${esc(meta.date)}</p>`
      + `<p class="doc-letter__to"><strong>${esc(meta.to_name)}</strong>${line(meta.to_address)}</p>`
      + `<p class="doc-letter__subject">${esc(meta.subject || meta.title)}</p>`
      + `<p class="doc-letter__salutation">${esc(meta.salutation || `Dear ${meta.to_name},`)}</p></header>`;
  }
  return '';
}

function tocHtml(headings) {
  if (!headings.length) return '';
  const min = Math.min(...headings.map((h) => h.level));
  const items = headings.map((h) =>
    `<li class="toc-l${h.level - min + 1}"><a href="#${esc(h.slug)}">${esc(h.text)}</a></li>`).join('');
  return `<nav class="doc-toc"><p class="doc-toc__title">Contents</p><ul>${items}</ul></nav>`;
}

// Markdown handed to md-to-pdf: frame HTML blocks, TOC, then the body.
// A body that starts with a `---` rule gets a leading newline so md-to-pdf
// does not read it as front matter.
function framedMarkdown(cfg, meta, bodyMd) {
  const parts = [coverHtml(cfg, meta), tocHtml(tocHeadings(cfg, bodyMd))].filter(Boolean);
  return parts.length ? `${parts.join('\n\n')}\n\n${bodyMd}` : bodyMd.replace(/^(?=---)/, '\n');
}

const FONT = '"Segoe UI", "Helvetica Neue", Arial, "Liberation Sans", sans-serif';
const BASE_CSS = `
body { font-family: ${FONT}; font-size: 10.5pt; line-height: 1.5; color: #1a1f2e;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, h4 { color: #111827; line-height: 1.25; }
h1 { font-size: 18pt; border-bottom: 1px solid #d1d5db; padding-bottom: .2em; }
h2 { font-size: 14pt; border-bottom: 0; } h3 { font-size: 12pt; }
table { display: table; border-collapse: collapse; width: 100%; max-width: 100%; } thead { display: table-header-group; }
th { background: #f3f4f6; text-align: left; }
th, td { border: 1px solid #d1d5db; padding: 4px 8px; vertical-align: top; }
pre { background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 4px; }
.doc-toc__title { font-size: 16pt; font-weight: 600; margin: 0 0 .6em; }
.doc-toc ul { list-style: none; padding: 0; margin: 0; }
.doc-toc li { margin: .25em 0; } .doc-toc a { color: #1a1f2e; text-decoration: none; }
.doc-toc .toc-l1 { font-weight: 600; margin-top: .6em; } .doc-toc .toc-l2 { padding-left: 1.2em; }
.doc-toc .toc-l3 { padding-left: 2.4em; font-size: .95em; } .doc-toc .toc-l4 { padding-left: 3.6em; font-size: .9em; }
.doc-header { margin: 0 0 1.5em; padding-bottom: .8em; border-bottom: 1px solid #e5e7eb; }
.doc-header .doc-title { font-size: 22pt; margin: 0 0 .3em; border: 0; padding: 0; }
.doc-meta { color: #6b7280; font-size: .95em; } .doc-meta__key { color: #4b5563; font-weight: 600; }
.doc-cover, body > .doc-cover { border-top: 6pt solid #1d4ed8; padding-top: 2em; margin-bottom: 2em; }
.doc-cover__kind { text-transform: uppercase; letter-spacing: .12em; font-size: 9pt; color: #6b7280; margin: 0 0 .8em; }
.doc-cover__title { font-size: 30pt; margin: 0 0 .3em; line-height: 1.1; border: 0; padding: 0; }
.doc-cover__subtitle { font-size: 14pt; color: #4b5563; margin: 0 0 1.5em; }
.doc-cover__meta { display: grid; grid-template-columns: max-content 1fr; column-gap: 1.2em; row-gap: .35em; margin: 2.5em 0 0; }
.doc-cover__meta dt { color: #4b5563; font-weight: 600; } .doc-cover__meta dd { margin: 0; }
.doc-letter { margin-bottom: 1.5em; }
.doc-letter__head { display: flex; justify-content: space-between; align-items: flex-end; gap: 2em;
  border-bottom: 2pt solid #1d4ed8; padding-bottom: .6em; margin-bottom: 2.5em; }
.doc-letter__org { font-size: 16pt; font-weight: 700; color: #111827; }
.doc-letter__addr { font-size: 9pt; color: #4b5563; text-align: right; white-space: pre-line; }
.doc-letter__date { color: #4b5563; margin: 0 0 1.5em; }
.doc-letter__to { margin: 0 0 1.5em; } .doc-letter__subject { font-weight: 700; margin: 0 0 1.2em; }
`;
const SCREEN_CSS = `
body { max-width: 820px; margin: 2em auto; padding: 0 16px; }
.doc-toc { margin: 0 0 2em; padding: 1em 1.2em; background: #f9fafb; border: 1px solid #e5e7eb; }
`;
// Print only (PDF): the full cover fills page 1, the TOC has its own page,
// framed long documents start each top-level section on a new page.
function printCss(cfg) {
  let css = `
@page { size: A4; margin: 24mm 20mm 22mm 20mm; }
.markdown-body { max-width: none; }
body > .doc-cover { break-after: page; height: 245mm; padding: 70mm 0 0; margin: 0; box-sizing: border-box; }
.doc-toc { margin: 0 0 1.5em; }
pre, blockquote, tr, img { break-inside: avoid; } h1, h2, h3, h4 { break-after: avoid; }
pre, pre code { white-space: pre-wrap !important; overflow-wrap: anywhere; word-break: break-word; }
`;
  if (cfg.cover === 'full') css += '.doc-toc { break-after: page; }\n';
  if (cfg.h1Break) css += `h1 { break-before: page; }
.doc-cover + h1, .doc-toc + h1, body > h1:first-child, .doc-cover h1, .doc-header h1 { break-before: avoid; }
`;
  return css;
}

// Paged-media margin boxes (Chromium 131+): header text top right, footer text
// bottom left, "Page N of M" bottom right; @page :first stays clean when the
// archetype has a full cover or a letterhead.
const cssStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';
const BOX = `font-family: ${FONT.replace(/"/g, "'")}; font-size: 8pt; color: #6b7280;`;
function marginBoxCss(cfg, meta) {
  const header = fillTemplate(cfg.header, meta);
  const footer = fillTemplate(cfg.footer, meta);
  let css = `@page {
  @top-right { content: ${cssStr(header)}; ${BOX} vertical-align: bottom; padding-bottom: 4mm; }
  @bottom-left { content: ${cssStr(footer)}; ${BOX} vertical-align: top; padding-top: 4mm; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); ${BOX} vertical-align: top; padding-top: 4mm; }
}
`;
  if (firstPageClean(cfg)) {
    css += '@page :first { @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }\n';
  }
  return css;
}

const firstPageClean = (cfg) => cfg.cover === 'full' || cfg.cover === 'letter';

// Fallback for browsers before Chromium 131: puppeteer header/footer
// templates. Chrome paints them on every page, the cover included.
function pdfTemplates(cfg, meta) {
  const header = esc(fillTemplate(cfg.header, meta));
  const footer = esc(fillTemplate(cfg.footer, meta));
  const font = "font-family:'Segoe UI',Arial,'Liberation Sans',sans-serif;font-size:8pt;color:#6b7280;";
  return {
    displayHeaderFooter: true,
    headerTemplate: `<div style="${font}width:100%;padding:0 20mm;text-align:right;">${header}</div>`,
    footerTemplate: `<div style="${font}width:100%;padding:0 20mm;display:flex;justify-content:space-between;">`
      + `<span>${footer}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  };
}

// CSS for one output. mode: 'boxes' (PDF, margin boxes), 'templates' (PDF,
// fallback) or 'screen' (HTML).
function frameCss(cfg, meta, mode) {
  if (mode === 'screen') return BASE_CSS + SCREEN_CSS;
  return BASE_CSS + printCss(cfg) + (mode === 'boxes' ? marginBoxCss(cfg, meta) : '');
}

// Chromium 131 added CSS page margin boxes.
const MARGIN_BOX_MIN_CHROMIUM = 131;

module.exports = {
  ARCHETYPES, ALIASES, MARGIN_BOX_MIN_CHROMIUM,
  getArchetype, metaKey, parseFrontMatter, firstH1, resolveMetadata, missingMetadata, unusedMetadata,
  esc, coverMetaPairs, fillTemplate, inlineText, collectHeadings, tocHeadings, firstPageClean,
  coverHtml, tocHtml, framedMarkdown, marginBoxCss, pdfTemplates, frameCss,
};
