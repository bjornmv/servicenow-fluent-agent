'use strict';
// DOCX framing for sn-doc-export: post-processes the @adobe/helix-md2docx
// package with string edits on known OOXML parts (no dependencies).
//   - cover (full / compact / letterhead) and a Contents list at the body start
//   - running header, footer with PAGE / NUMPAGES fields, clean first page
//   - callout boxes, neutral table headers, shaded code blocks
//   - core properties (title, author)
// Also holds the small zip reader/writer the skill uses for .docx files.

const zlib = require('node:zlib');
const { coverMetaPairs, fillTemplate, tocHeadings, firstPageClean } = require('./frames.cjs');

// ---------------------------------------------------------------------------
// zip: stored + deflate entries, no zip64 / encryption / multi-disk. That is
// everything helix-md2docx, Word and LibreOffice write for a normal .docx.
// Sizes come from the central directory, so data descriptors read correctly.
// ---------------------------------------------------------------------------

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

// Returns Map<name, Buffer> in central-directory order (directory entries skipped).
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error('zip64 archives are not supported');
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip central directory entry');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (flags & 0x41) throw new Error(`encrypted zip entry: ${name}`);
    if (name.endsWith('/')) continue;
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`unsupported zip method ${method} for ${name}`);
    if (crc32(data) !== crc) throw new Error(`zip CRC mismatch for ${name}`);
    out.set(name, data);
  }
  return out;
}

// entries: Map<name, Buffer|string>. [Content_Types].xml goes first (OOXML
// convention). Fixed timestamps keep the output byte-stable.
function writeZip(entries) {
  const names = [...entries.keys()].sort((a, b) =>
    (a === '[Content_Types].xml' ? -1 : 0) - (b === '[Content_Types].xml' ? -1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;
  const dosDate = (1 << 5) | 1; // 1980-01-01
  for (const name of names) {
    let data = entries.get(name);
    if (typeof data === 'string') data = Buffer.from(data, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const comp = zlib.deflateRawSync(data, { level: 6 });
    const store = comp.length >= data.length;
    const body = store ? data : comp;
    const method = store ? 0 : 8;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8); eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// ---------------------------------------------------------------------------
// OOXML string helpers
// ---------------------------------------------------------------------------

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = {
  header: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  footer: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
};
const GREY = '6B7280';
const MID = '4B5563';
const ACCENT = '1D4ED8';

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unx = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Top-level elements of an XML fragment, each { name, xml }. Nested elements
// of the same name are balanced, so a table inside a table stays one element.
function topLevel(xml) {
  const out = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) break;
    const m = /^<([\w:]+)\b[^>]*?(\/?)>/.exec(xml.slice(lt));
    if (!m || m[1].startsWith('/')) { i = lt + 1; continue; }
    const name = m[1];
    let end = lt + m[0].length;
    if (!m[2]) {
      const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'g');
      re.lastIndex = end;
      let depth = 1;
      let t;
      while (depth && (t = re.exec(xml))) {
        if (t[1]) depth -= 1;
        else if (!t[2]) depth += 1;
        end = re.lastIndex;
      }
    }
    out.push({ name, xml: xml.slice(lt, end) });
    i = end;
  }
  return out;
}

// CT_PPr child order; Word rejects a pPr whose children are out of order.
const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr',
  'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct',
  'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind',
  'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment',
  'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];

// Set (replace) pPr children of a paragraph: adds = { localName: xml|null }.
function setPPr(p, adds) {
  const open = p.match(/^<w:p\b[^>]*?\/?>/)[0];
  if (open.endsWith('/>')) p = `${open.slice(0, -2)}></w:p>`;
  const head = p.match(/^<w:p\b[^>]*>/)[0];
  let rest = p.slice(head.length);
  const children = new Map();
  if (rest.startsWith('<w:pPr>') || rest.startsWith('<w:pPr ')) {
    const el = topLevel(rest)[0];
    const inner = el.xml.replace(/^<w:pPr\b[^>]*>/, '').replace(/<\/w:pPr>$/, '');
    for (const c of topLevel(inner)) children.set(c.name.replace(/^w:/, ''), c.xml);
    rest = rest.slice(el.xml.length);
  } else if (rest.startsWith('<w:pPr/>')) rest = rest.slice(8);
  for (const [k, v] of Object.entries(adds)) {
    if (v === null) children.delete(k);
    else children.set(k, v);
  }
  const rank = (k) => { const r = PPR_ORDER.indexOf(k); return r < 0 ? PPR_ORDER.length : r; };
  const sorted = [...children.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([, v]) => v).join('');
  return `${head}${sorted ? `<w:pPr>${sorted}</w:pPr>` : ''}${rest}`;
}

const paraText = (p) => unx([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''));
const paraStyle = (p) => (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';

// One run; o: size (pt), bold, italic, color, caps.
function run(text, o = {}) {
  const rp = [o.bold && '<w:b/><w:bCs/>', o.italic && '<w:i/>', o.caps && '<w:caps/>',
    o.color && `<w:color w:val="${o.color}"/>`, o.spacing && `<w:spacing w:val="${o.spacing}"/>`,
    o.size && `<w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/>`].filter(Boolean).join('');
  return `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
}
// Paragraph; o: before/after (pt), align, tabs, keepNext, ind (twips), border (pBdr inner), pageBreakBefore.
function para(runs, o = {}) {
  const pp = {};
  if (o.keepNext) pp.keepNext = '<w:keepNext/>';
  if (o.border) pp.pBdr = `<w:pBdr>${o.border}</w:pBdr>`;
  if (o.tabs) pp.tabs = `<w:tabs>${o.tabs}</w:tabs>`;
  if (o.after != null || o.before != null) {
    pp.spacing = `<w:spacing${o.before != null ? ` w:before="${Math.round(o.before * 20)}"` : ''}${o.after != null ? ` w:after="${Math.round(o.after * 20)}"` : ''}/>`;
  }
  if (o.ind) pp.ind = `<w:ind w:left="${o.ind}"/>`;
  if (o.align) pp.jc = `<w:jc w:val="${o.align}"/>`;
  return setPPr(`<w:p>${runs}</w:p>`, pp);
}
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const field = (instr, cached, rpr) =>
  `<w:r>${rpr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>`
  + `<w:r>${rpr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rpr}<w:t>${x(cached)}</w:t></w:r><w:r>${rpr}<w:fldChar w:fldCharType="end"/></w:r>`;

// #RRGGBB mixed with white (share = remaining colour share).
function tint(hex, share = 0.12) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => Math.round(255 - (255 - parseInt(h.slice(i, i + 2), 16)) * share)
    .toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---------------------------------------------------------------------------
// front matter of the document: cover and Contents
// ---------------------------------------------------------------------------

function coverXml(cfg, meta) {
  const title = meta.title || 'Document';
  if (cfg.cover === 'full') {
    return [
      para('', { border: `<w:top w:val="single" w:sz="48" w:space="1" w:color="${ACCENT}"/>`, after: 0 }),
      para(run(cfg.label, { size: 9, color: GREY, caps: true, spacing: 30 }), { before: 170, after: 10 }),
      para(run(title, { size: 30, bold: true, color: '111827' }), { after: 6 }),
      meta.subtitle ? para(run(meta.subtitle, { size: 14, color: MID }), { after: 24 }) : '',
      para('', { after: 12 }),
      ...coverMetaPairs(cfg, meta).map(([k, v]) =>
        para(run(k, { bold: true, color: MID }) + '<w:r><w:tab/></w:r>' + run(v),
          { after: 4, tabs: '<w:tab w:val="left" w:pos="2268"/>' })),
      pageBreak,
    ].join('');
  }
  if (cfg.cover === 'compact') {
    const strip = coverMetaPairs(cfg, meta).map(([k, v]) => `${k}: ${v}`).join('  ·  ');
    const rule = `<w:bottom w:val="single" w:sz="4" w:space="6" w:color="E5E7EB"/>`;
    return para(run(cfg.label, { size: 8, color: GREY, caps: true, spacing: 20 }), { after: 4 })
      + para(run(title, { size: 22, bold: true, color: '111827' }), { after: 4, border: meta.subtitle || strip ? null : rule })
      + (meta.subtitle ? para(run(meta.subtitle, { size: 12, color: MID }), { after: 4, border: strip ? null : rule }) : '')
      + (strip ? para(run(strip, { size: 9, color: GREY }), { after: 18, border: rule }) : '');
  }
  if (cfg.cover === 'letter') {
    const head = `<w:bottom w:val="single" w:sz="16" w:space="6" w:color="${ACCENT}"/>`;
    return [
      para(run(meta.from_name, { size: 16, bold: true, color: '111827' }), { after: meta.from_address ? 0 : 36, border: meta.from_address ? null : head }),
      meta.from_address ? para(run(meta.from_address, { size: 9, color: MID }), { after: 36, border: head }) : '',
      para(run(meta.date, { color: MID }), { after: 18 }),
      para(run(meta.to_name, { bold: true }), { after: meta.to_address ? 0 : 18 }),
      meta.to_address ? para(run(meta.to_address), { after: 18 }) : '',
      para(run(meta.subject || meta.title, { bold: true }), { after: 14 }),
      para(run(meta.salutation || `Dear ${meta.to_name},`), { after: 12 }),
    ].join('');
  }
  return '';
}

// Contents: a TOC field whose cached result is the heading list, each entry a
// link to a bookmark on its heading. It reads and navigates without a field
// update; page numbers appear when the reader updates the field (F9).
function tocXml(entries, [min, max] = [1, 3], breakAfter = false) {
  if (!entries.length) return '';
  const rows = entries.map((e, i) => {
    const text = run(e.text, { bold: e.level === Math.min(...entries.map((h) => h.level)) });
    const link = e.anchor ? `<w:hyperlink w:anchor="${e.anchor}" w:history="1">${text}</w:hyperlink>` : text;
    const open = i === 0
      ? `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "${min}-${max}" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`
      : '';
    const close = i === entries.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
    const top = Math.min(...entries.map((h) => h.level));
    return para(open + link + close, { ind: (e.level - top) * 360 || null, before: e.level === top && i ? 6 : 0, after: 2 });
  }).join('');
  return para(run('Contents', { size: 16, bold: true, color: '111827' }), { after: 12 }) + rows
    + (breakAfter ? pageBreak : para('', { after: 12 }));
}

// ---------------------------------------------------------------------------
// body fixes: callout boxes, code blocks, tables, headings
// ---------------------------------------------------------------------------

const BOX_START = /^⟦sn-box:(\d+)⟧$/;
const BOX_END = '⟦/sn-box⟧';

function boxPPr(color, extra = {}) {
  return {
    pBdr: `<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${color}"/></w:pBdr>`,
    shd: `<w:shd w:val="clear" w:color="auto" w:fill="${tint(color)}"/>`,
    ...extra,
  };
}

function fixTable(tbl) {
  let t = tbl.replace(/w:fill="F4CCCD"/g, 'w:fill="F3F4F6"');
  t = t.replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/, (b) => b.replace(/w:color="auto"/g, 'w:color="D1D5DB"'));
  // Repeat the header row on every page.
  t = t.replace(/<w:tr>(?!<w:trPr>)/, '<w:tr><w:trPr><w:tblHeader/></w:trPr>');
  // Compact cell paragraphs.
  return t.replace(/<w:tc>([\s\S]*?)<\/w:tc>/g, (tc) => tc.replace(/<w:p\b(?:[^>]*\/>|[\s\S]*?<\/w:p>)/g,
    (p) => setPPr(p, { spacing: '<w:spacing w:before="0" w:after="0"/>' })));
}

function frameBody(bodyXml, cfg, toc, boxes) {
  const els = topLevel(bodyXml);
  const out = [];
  let box = null;
  let firstH1Seen = false;
  let tocIdx = 0;
  let bookmarkId = 9000;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  // Looser key for a second pass: a heading that renders slightly differently
  // still finds its entry, and a miss never disables the entries after it.
  const loose = (s) => norm(s).replace(/[*_`]/g, '').toLowerCase();
  const findEntry = (level, text) => {
    for (const same of [(e) => norm(e.text) === norm(text), (e) => loose(e.text) === loose(text)]) {
      for (let j = tocIdx; j < toc.length; j++) if (toc[j].level === level && same(toc[j])) return j;
    }
    return -1;
  };
  for (let i = 0; i < els.length; i++) {
    const { name } = els[i];
    let { xml } = els[i];
    if (name === 'w:tbl') { out.push(fixTable(xml)); continue; }
    if (name !== 'w:p') { out.push(xml); continue; }
    const text = paraText(xml);
    const style = paraStyle(xml);
    if (!style && !box && !xml.includes('<w:numPr>') && /^(?:-{3,}|\*{3,}|_{3,})$/.test(text.replace(/[ \t]/g, ''))) {
      // A Markdown thematic break: helix writes the literal '---'; draw a rule.
      out.push(para('', { border: '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D5DB"/>', before: 6, after: 6 }));
      continue;
    }
    const start = text.match(BOX_START);
    if (start && boxes[+start[1]]) {
      box = boxes[+start[1]];
      out.push(setPPr(para(run(box.title, { bold: true, color: box.color.replace('#', '') }),
        { before: 6, after: 2, keepNext: true }), boxPPr(box.color.replace('#', ''), { ind: '<w:ind w:left="170" w:right="113"/>' })));
      continue;
    }
    if (text === BOX_END && box) {
      // The last paragraph of the box gets a little room below.
      for (let j = out.length - 1; j >= 0; j--) {
        if (out[j].startsWith('<w:p')) { out[j] = setPPr(out[j], { spacing: '<w:spacing w:before="0" w:after="120"/>' }); break; }
      }
      box = null;
      continue;
    }
    if (box && !xml.includes('<w:numPr>')) {
      xml = setPPr(xml, boxPPr(box.color.replace('#', ''), { spacing: '<w:spacing w:before="0" w:after="60"/>', ind: '<w:ind w:left="170" w:right="113"/>' }));
    } else if (box) {
      xml = setPPr(xml, boxPPr(box.color.replace('#', ''), { spacing: '<w:spacing w:before="0" w:after="60"/>' }));
    } else if (style === 'CodeBlock') {
      const prevCode = paraStyle(out[out.length - 1] || '') === 'CodeBlock';
      const nextCode = els[i + 1] && els[i + 1].name === 'w:p' && paraStyle(els[i + 1].xml) === 'CodeBlock';
      const side = (s) => `<w:${s} w:val="single" w:sz="4" w:space="4" w:color="E5E7EB"/>`;
      xml = setPPr(xml, {
        pBdr: `<w:pBdr>${['top', 'left', 'bottom', 'right'].map(side).join('')}</w:pBdr>`,
        shd: '<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>',
        spacing: `<w:spacing w:before="${prevCode ? 0 : 60}" w:after="${nextCode ? 0 : 160}" w:line="240" w:lineRule="auto"/>`,
        ind: '<w:ind w:left="113" w:right="113"/>',
      });
    }
    const h = style.match(/^Heading([1-6])$/);
    if (h) {
      const level = +h[1];
      if (level === 1 && cfg.h1Break) {
        if (firstH1Seen) xml = setPPr(xml, { pageBreakBefore: '<w:pageBreakBefore/>' });
        firstH1Seen = true;
      }
      const at = findEntry(level, text);
      if (at >= 0) {
        tocIdx = at;
        const entry = toc[tocIdx];
        entry.anchor = `_TocSn${tocIdx + 1}`;
        const id = bookmarkId++;
        const pos = xml.includes('</w:pPr>') ? xml.indexOf('</w:pPr>') + 8 : xml.indexOf('>') + 1;
        xml = `${xml.slice(0, pos)}<w:bookmarkStart w:id="${id}" w:name="${entry.anchor}"/>${xml.slice(pos)}`
          .replace(/<\/w:p>$/, `<w:bookmarkEnd w:id="${id}"/></w:p>`);
        tocIdx += 1;
      }
    }
    out.push(xml);
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// header / footer parts, styles, properties
// ---------------------------------------------------------------------------

const hdrFtrDoc = (tag, inner) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} xmlns:w="${W_NS}" xmlns:r="${R_NS}">${inner}</w:${tag}>`;

function headerXml(text) {
  return hdrFtrDoc('hdr', para(text ? run(text, { size: 8, color: GREY }) : '', { align: 'right', after: 0 }));
}
function footerXml(text, width) {
  const rpr = `<w:rPr><w:color w:val="${GREY}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>`;
  const right = run('Page ', { size: 8, color: GREY }) + field('PAGE', '1', rpr)
    + run(' of ', { size: 8, color: GREY }) + field('NUMPAGES', '1', rpr);
  return hdrFtrDoc('ftr', para(run(text, { size: 8, color: GREY }) + '<w:r><w:tab/></w:r>' + right,
    { tabs: `<w:tab w:val="right" w:pos="${width}"/>`, after: 0 }));
}
const emptyPart = (tag) => hdrFtrDoc(tag, '<w:p/>');

// Readable defaults for helix's bare styles (skipped for --reference-docx).
function fixStyles(styles) {
  let s = styles.replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>|<w:docDefaults\/>/,
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>'
    + '<w:color w:val="1A1F2E"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>');
  // Code: smaller monospace (Courier New exists on Windows and maps to Liberation
  // Mono elsewhere); inline code on a light tint instead of mid grey.
  const mono = '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>';
  s = s.replace(/(<w:style\b[^>]*w:styleId="CodeBlock"[\s\S]*?<w:rPr>)([\s\S]*?)(<\/w:rPr>)/g,
    (m, a, b, c) => `${a}${mono}<w:sz w:val="18"/><w:szCs w:val="18"/>${c}`);
  s = s.replace(/(<w:style\b[^>]*w:styleId="InlineCode"[\s\S]*?<\/w:style>)/g, (st) => st
    .replace(/<w:rFonts [^>]*\/>/, mono)
    .replace(/<w:sz w:val="\d+"\/>/, '<w:sz w:val="19"/>')
    .replace(/<w:shd [^>]*\/>/, '<w:shd w:val="clear" w:color="auto" w:fill="EEF0F3"/>'));
  // Tables (helix "PageBlock"): neutral header shading and grey rules, body font in the header row.
  s = s.replace(/(<w:style\b[^>]*w:styleId="PageBlock"[\s\S]*?<\/w:style>)/, (st) => st
    .replace(/w:fill="F4CCCD"/g, 'w:fill="F3F4F6"')
    .replace(/(<w:(?:top|left|bottom|right|insideH|insideV) w:val="single"[^>]*?)w:color="auto"/g, '$1w:color="D1D5DB"')
    .replace(/<w:rFonts w:ascii="Arial" w:hAnsi="Arial"\/>/, '').replace(/<w:sz w:val="22"\/>/, '')
    .replace(/<w:(top|bottom) w:w="113" w:type="dxa"\/>/g, '<w:$1 w:w="57" w:type="dxa"/>'));
  // Headings: dark text instead of helix blue, matching the PDF.
  s = s.replace(/(<w:style\b[^>]*w:styleId="Heading[1-6]"[\s\S]*?<\/w:style>)/g, (st) =>
    st.replace(/<w:color w:val="[0-9A-F]{6}"\/>/i, '<w:color w:val="111827"/>').replace(/<w:rPr>(?![\s\S]*<w:b\/>)/, '<w:rPr><w:b/>'));
  return s;
}

// Function replacements: a '$&' or "$'" in the value stays literal.
function setCoreTag(xml, tag, val) {
  const re = new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`);
  const el = `<${tag}>${x(val)}</${tag}>`;
  return re.test(xml) ? xml.replace(re, () => el) : xml.replace('</cp:coreProperties>', () => `${el}</cp:coreProperties>`);
}

// Lists: bullet and numbered levels step the same way (566 twips per level),
// so a bullet nested under "1." sits inside it as in the PDF; helix's '-'
// bullets become •, ◦, ▪ by level.
const BULLETS = ['•', '◦', '▪'];
function fixNumbering(numbering) {
  return numbering.replace(/<w:lvl w:ilvl="(\d+)"[\s\S]*?<\/w:lvl>/g, (lvl, n) => lvl
    .replace(/<w:ind\b[^>]*\/>/, `<w:ind w:left="${566 * (+n + 1)}" w:hanging="283"/>`)
    .replace(/<w:lvlText w:val="-"\/>/, `<w:lvlText w:val="${BULLETS[+n % 3]}"/>`));
}

// A4 page geometry matching the PDF margins (twips).
const PG_MAR = '<w:pgMar w:top="1361" w:right="1134" w:bottom="1247" w:left="1134" w:header="680" w:footer="567" w:gutter="0"/>';

/**
 * Frame a helix-md2docx buffer. opts:
 *   chrome  add our header/footer (false when a --reference-docx brings its own)
 *   styles  apply readable default styles + page margins (false with --reference-docx)
 *   boxes   callout descriptors referenced by ⟦sn-box:N⟧ marker paragraphs
 */
function frameDocx(docxBuf, cfg, meta, bodyMd, opts = {}) {
  const { chrome = true, styles = true, boxes = [] } = opts;
  const z = readZip(docxBuf);
  const get = (n) => z.get(n)?.toString('utf8');
  let doc = get('word/document.xml');
  let rels = get('word/_rels/document.xml.rels');
  let ct = get('[Content_Types].xml');
  if (!doc || !rels || !ct) throw new Error('unexpected DOCX layout from helix-md2docx (missing document, rels or content types)');
  const bodyOpen = doc.match(/<w:body>/);
  const sectAt = doc.lastIndexOf('<w:sectPr');
  if (!bodyOpen || sectAt < 0) throw new Error('unexpected DOCX layout from helix-md2docx (no body or section properties)');
  const bodyStart = bodyOpen.index + bodyOpen[0].length;

  // 1. Body: cover + Contents first, then the fixed-up content.
  const toc = tocHeadings(cfg, bodyMd).map((h) => ({ ...h }));
  const content = frameBody(doc.slice(bodyStart, sectAt), cfg, toc, boxes);
  let tail = doc.slice(sectAt);
  doc = doc.slice(0, bodyStart) + coverXml(cfg, meta) + tocXml(toc, cfg.toc || undefined, cfg.cover === 'full') + content;

  // 2. Section properties: geometry, header/footer references, clean first page.
  tail = tail.replace(/^<w:sectPr\b([^>]*?)\/>/, '<w:sectPr$1></w:sectPr>');
  if (styles) tail = tail.replace(/<w:pgMar\b[^>]*\/>/, PG_MAR);
  if (chrome) {
    const pgW = +((tail.match(/<w:pgSz\b[^>]*w:w="(\d+)"/) || [])[1] || 11906);
    const mar = (side) => +((tail.match(new RegExp(`<w:pgMar\\b[^>]*w:${side}="(\\d+)"`)) || [])[1] || 1440);
    const width = pgW - mar('left') - mar('right');
    let maxRid = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]));
    const refs = [];
    const addPart = (kind, type, name, xml) => {
      const rid = `rId${++maxRid}`;
      z.set(`word/${name}`, xml);
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${R_NS}/${kind}" Target="${name}"/></Relationships>`);
      ct = ct.replace('</Types>', `<Override PartName="/word/${name}" ContentType="${CT[kind]}"/></Types>`);
      refs.push(`<w:${kind}Reference w:type="${type}" r:id="${rid}"/>`);
    };
    addPart('header', 'default', 'sn_header1.xml', headerXml(fillTemplate(cfg.header, meta)));
    addPart('footer', 'default', 'sn_footer1.xml', footerXml(fillTemplate(cfg.footer, meta), width));
    if (firstPageClean(cfg)) {
      addPart('header', 'first', 'sn_header_first.xml', emptyPart('hdr'));
      addPart('footer', 'first', 'sn_footer_first.xml', emptyPart('ftr'));
    }
    tail = tail.replace(/<w:(header|footer)Reference\b[^>]*\/>/g, '');
    tail = tail.replace(/^<w:sectPr\b[^>]*>/, (m) => m + refs.join(''));
    if (firstPageClean(cfg) && !/<w:titlePg/.test(tail)) {
      // CT_SectPr: titlePg follows pgNumType/cols/formProt/vAlign/noEndnote and precedes textDirection/bidi/docGrid.
      tail = /<w:(?:textDirection|bidi|rtlGutter|docGrid|printerSettings)\b/.test(tail)
        ? tail.replace(/<w:(textDirection|bidi|rtlGutter|docGrid|printerSettings)\b/, '<w:titlePg/><w:$1')
        : tail.replace('</w:sectPr>', '<w:titlePg/></w:sectPr>');
    }
  }
  doc += tail;
  z.set('word/document.xml', doc);
  z.set('word/_rels/document.xml.rels', rels);
  z.set('[Content_Types].xml', ct);

  // 3. Styles.
  const stylesXml = get('word/styles.xml');
  if (styles && stylesXml) z.set('word/styles.xml', fixStyles(stylesXml));
  const numberingXml = get('word/numbering.xml');
  if (styles && numberingXml) z.set('word/numbering.xml', fixNumbering(numberingXml));

  // 4. Core properties.
  let core = get('docProps/core.xml');
  if (core) {
    if (meta.title) core = setCoreTag(core, 'dc:title', meta.title);
    if (meta.subtitle) core = setCoreTag(core, 'dc:subject', meta.subtitle);
    for (const tag of ['dc:creator', 'cp:lastModifiedBy']) core = setCoreTag(core, tag, meta.author || meta.from_name || '');
    z.set('docProps/core.xml', core);
  }
  return writeZip(z);
}

module.exports = { crc32, readZip, writeZip, topLevel, setPPr, tint, setCoreTag, fixNumbering, frameDocx, BOX_END };
