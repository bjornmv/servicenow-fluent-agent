'use strict';
// Offline checks of the DOCX post-processor (sn-doc-export/docx-frame.cjs) on a
// small helix-md2docx-shaped fixture: zip round trip, framing parts, section
// properties, body fixes. No renderer packages are needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const skillDir = path.join(__dirname, '../../../payload/.agents/skills/sn-doc-export');
const frames = require(path.join(skillDir, 'frames.cjs'));
const { readZip, writeZip, frameDocx, setPPr, topLevel, crc32, setCoreTag, fixNumbering } = require(path.join(skillDir, 'docx-frame.cjs'));

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const p = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const BODY_MD = '# Overview\n\nIntro\n\n## Symptoms\n\n# Procedure\n\n```\ncode\n```\n';

// Shaped like helix-md2docx 2.x output (see the PageBlock / CodeBlock styles and the bare sectPr).
function fixture() {
  const body = [
    p('Overview', 'Heading1'), p('Intro'),
    p('⟦sn-box:0⟧'), p('Box body'),
    '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Item</w:t></w:r></w:p>',
    p('⟦/sn-box⟧'),
    p('Symptoms', 'Heading2'),
    '<w:tbl><w:tblPr><w:tblStyle w:val="PageBlock"/><w:tblBorders><w:top w:val="single" w:color="auto" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3120"/></w:tblGrid>'
      + '<w:tr><w:tc><w:tcPr><w:shd w:fill="F4CCCD" w:color="auto" w:val="clear"/></w:tcPr><w:p><w:r><w:t>Head</w:t></w:r></w:p></w:tc></w:tr>'
      + '<w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '<w:p/>',
    p('Procedure', 'Heading1'), p('code', 'CodeBlock'),
  ].join('');
  return new Map([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/styles" Target="styles.xml"/><Relationship Id="rId7" Type="x/numbering" Target="numbering.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:pgNumType/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`],
    ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault/><w:pPrDefault/></w:docDefaults>`
      + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:color w:val="2E74B5"/><w:sz w:val="32"/></w:rPr></w:style>'
      + '<w:style w:type="table" w:customStyle="1" w:styleId="PageBlock"><w:name w:val="PageBlock"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblStylePr w:type="firstRow"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="22"/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F4CCCD"/></w:tcPr></w:tblStylePr></w:style>'
      + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:style>'
      + '<w:style w:type="character" w:customStyle="1" w:styleId="InlineCode"><w:name w:val="InlineCode"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="22"/><w:shd w:val="clear" w:color="auto" w:fill="BFBFBF" w:themeFill="background1" w:themeFillShade="BF"/></w:rPr></w:style></w:styles>'],
    ['word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W}><w:evenAndOddHeaders w:val="false"/></w:settings>`],
    ['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Un-named</dc:creator><cp:lastModifiedBy>Un-named</cp:lastModifiedBy></cp:coreProperties>'],
    ['word/media/pic.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3])],
  ]);
}

// Minimal well-formedness check: balanced tags, one root, attributes quoted.
function assertWellFormed(xml, name) {
  const stack = [];
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  for (const m of body.matchAll(/<(\/?)([\w:]+)((?:\s+[\w:]+="[^"<]*")*)\s*(\/?)>|<|>/g)) {
    assert.ok(m[2], `${name}: stray markup near ${body.slice(m.index, m.index + 40)}`);
    if (m[1]) assert.equal(stack.pop(), m[2], `${name}: mismatched </${m[2]}>`);
    else if (!m[4]) stack.push(m[2]);
  }
  assert.deepEqual(stack, [], `${name}: unclosed ${stack.join(',')}`);
}

const frame = (name, meta, opts = {}) => {
  const out = readZip(frameDocx(writeZip(fixture()), frames.getArchetype(name), meta, BODY_MD, { boxes: [{ kind: 'warning', title: 'Careful', color: '#f59e0b' }], ...opts }));
  const text = n => out.get(n)?.toString('utf8');
  return { out, text, doc: text('word/document.xml') };
};

test('zip: round trip preserves entries and bytes; Content_Types first; CRC checked', () => {
  const src = fixture();
  const buf = writeZip(src);
  assert.equal(buf.toString('latin1', 30, 30 + '[Content_Types].xml'.length), '[Content_Types].xml');
  const back = readZip(buf);
  assert.deepEqual([...back.keys()].sort(), [...src.keys()].sort());
  for (const [k, v] of src) assert.ok(back.get(k).equals(Buffer.isBuffer(v) ? v : Buffer.from(v)), k);
  assert.ok(writeZip(src).equals(buf), 'byte-stable output');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const bad = Buffer.from(buf);
  bad[bad.indexOf('word/media/pic.png') + 'word/media/pic.png'.length + 4] ^= 0xff; // stored entry data
  assert.throws(() => readZip(bad), /CRC mismatch for word\/media\/pic\.png/);
  assert.throws(() => readZip(Buffer.from('not a zip at all, definitely not')), /not a zip file/);
});

test('setPPr keeps CT_PPr child order and replaces existing children; topLevel balances nesting', () => {
  const out = setPPr('<w:p><w:pPr><w:pStyle w:val="X"/><w:jc w:val="left"/><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r/></w:p>',
    { spacing: '<w:spacing w:after="0"/>', pBdr: '<w:pBdr/>', jc: '<w:jc w:val="right"/>', pageBreakBefore: '<w:pageBreakBefore/>' });
  assert.equal(out, '<w:p><w:pPr><w:pStyle w:val="X"/><w:pageBreakBefore/><w:numPr><w:ilvl w:val="0"/></w:numPr><w:pBdr/><w:spacing w:after="0"/><w:jc w:val="right"/></w:pPr><w:r/></w:p>');
  assert.equal(setPPr('<w:p/>', { keepNext: '<w:keepNext/>' }), '<w:p><w:pPr><w:keepNext/></w:pPr></w:p>');
  const els = topLevel('<w:tbl><w:tr><w:tc><w:tbl><w:tr/></w:tbl><w:p/></w:tc></w:tr></w:tbl><w:p><w:r/></w:p><w:p/>');
  assert.deepEqual(els.map(e => e.name), ['w:tbl', 'w:p', 'w:p']);
});

test('runbook: cover, linked Contents, header/footer with PAGE/NUMPAGES, clean first page, all parts well-formed', () => {
  const { out, text, doc } = frame('runbook', { title: 'Recovery & <Restore>', audience: 'Ops', version: '1.2', author: 'Team A' });
  for (const [name, data] of out) if (name.endsWith('.xml') || name.endsWith('.rels')) assertWellFormed(data.toString('utf8'), name);
  // Cover then Contents at the body start; the cover is its own page.
  const body = doc.slice(doc.indexOf('<w:body>'));
  assert.ok(body.indexOf('RUNBOOK') < 0 && body.indexOf('>Runbook<') > 0, 'label run uses caps formatting, not upper-cased text');
  assert.ok(body.indexOf('Recovery &amp; &lt;Restore&gt;') < body.indexOf('>Contents<'));
  assert.ok(body.indexOf('>Audience<') > 0 && body.indexOf('>Version<') > 0);
  assert.match(body, /<w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u <\/w:instrText>/);
  assert.equal((body.match(/w:fldCharType="begin"/g) || []).length, 1);
  assert.doesNotMatch(body, /w:dirty/);
  // Every TOC entry links to a bookmark on its heading.
  const anchors = [...body.matchAll(/<w:hyperlink w:anchor="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(anchors, ['_TocSn1', '_TocSn2', '_TocSn3']);
  for (const a of anchors) assert.match(body, new RegExp(`</w:pPr><w:bookmarkStart w:id="\\d+" w:name="${a}"/>`));
  // Top-level sections after the first start a page.
  assert.equal((body.match(/<w:pageBreakBefore\/>/g) || []).length, 1);
  assert.match(body, /<w:pStyle w:val="Heading1"\/><w:pageBreakBefore\/><\/w:pPr><w:bookmarkStart w:id="\d+" w:name="_TocSn3"\/><w:r><w:t xml:space="preserve">Procedure/);
  // Section: our references only, first-page set, titlePg before docGrid, A4 margins like the PDF.
  const sect = doc.slice(doc.lastIndexOf('<w:sectPr'));
  assert.match(sect, /^<w:sectPr><w:headerReference w:type="default" r:id="rId8"\/><w:footerReference w:type="default" r:id="rId9"\/><w:headerReference w:type="first" r:id="rId10"\/><w:footerReference w:type="first" r:id="rId11"\/><w:pgSz/);
  assert.match(sect, /<w:pgNumType\/><w:titlePg\/><w:docGrid/);
  assert.match(sect, /<w:pgMar w:top="1361" w:right="1134" w:bottom="1247" w:left="1134"/);
  const rels = text('word/_rels/document.xml.rels');
  for (const [rid, target] of [['rId8', 'sn_header1.xml'], ['rId9', 'sn_footer1.xml'], ['rId10', 'sn_header_first.xml'], ['rId11', 'sn_footer_first.xml']]) {
    assert.ok(rels.includes(`Id="${rid}"`) && rels.includes(`Target="${target}"`), target);
    assert.equal(text('[Content_Types].xml').split(`PartName="/word/${target}"`).length, 2, `one override for ${target}`);
  }
  assert.match(text('word/sn_header1.xml'), /<w:jc w:val="right"\/>.*Runbook — Recovery &amp; &lt;Restore&gt;/);
  const footer = text('word/sn_footer1.xml');
  assert.match(footer, /Internal use only/);
  assert.match(footer, /<w:tab w:val="right" w:pos="9638"\/>/);
  assert.match(footer, / PAGE .* NUMPAGES /);
  assert.doesNotMatch(text('word/sn_footer_first.xml'), /PAGE/);
  // Fields need no update prompt: no updateFields in settings.
  assert.doesNotMatch(text('word/settings.xml'), /updateFields/);
  const core = text('docProps/core.xml');
  assert.match(core, /<dc:title>Recovery &amp; &lt;Restore&gt;<\/dc:title>/);
  assert.match(core, /<dc:creator>Team A<\/dc:creator><cp:lastModifiedBy>Team A<\/cp:lastModifiedBy>/);
  assert.ok(out.get('word/media/pic.png').equals(fixture().get('word/media/pic.png')), 'binary parts untouched');
});

test('body fixes: callout box, neutral table header, shaded code; styles readable', () => {
  const { text, doc } = frame('plain', { title: 'T' });
  assert.doesNotMatch(doc, /⟦/, 'markers removed');
  assert.match(doc, /<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="f59e0b"\/><\/w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="FEF3E2"\/>[^]*?Careful/i);
  const boxed = doc.match(/<w:p>(?:(?!<\/w:p>).)*Box body/)[0];
  assert.match(boxed, /<w:pBdr><w:left [^>]*w:color="f59e0b"/i);
  const item = doc.match(/<w:p><w:pPr><w:pStyle w:val="ListParagraph"\/>(?:(?!<\/w:p>).)*Item/)[0];
  assert.match(item, /<w:numPr>.*<\/w:numPr><w:pBdr>/, 'list item in the box keeps its numbering and gets the rule');
  assert.doesNotMatch(item, /<w:ind /, 'list indentation comes from numbering');
  assert.doesNotMatch(doc, /F4CCCD/);
  assert.match(doc, /<w:tr><w:trPr><w:tblHeader\/><\/w:trPr><w:tc><w:tcPr><w:shd w:fill="F3F4F6"/);
  assert.match(doc, /<w:tblBorders><w:top w:val="single" w:color="D1D5DB"/);
  assert.match(doc, /<w:pStyle w:val="CodeBlock"\/><w:pBdr>.*?<\/w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"\/>/);
  // plain: no cover, no Contents, no page breaks, no clean first page; footer still numbers pages.
  assert.doesNotMatch(doc, />Contents<|pageBreakBefore|titlePg|w:type="first"/);
  const styles = text('word/styles.xml');
  assert.match(styles, /<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/);
  assert.doesNotMatch(styles, /F4CCCD|BFBFBF|2E74B5|w:ascii="Arial"/);
  assert.match(styles, /w:styleId="CodeBlock"[\s\S]*?<w:sz w:val="18"\/>/);
  assert.match(text('word/sn_footer1.xml'), / NUMPAGES /);
  assert.doesNotMatch(text('word/sn_header1.xml'), /<w:t/);
});

test('compact, letter and template interplay', () => {
  let r = frame('release_notes', { title: 'RN', version: '2.0', release_date: '2026-10-15', product: 'App' });
  assert.match(r.doc, />RN<.*>Version: 2\.0  ·  Release Date: 2026-10-15  ·  Product: App</);
  assert.doesNotMatch(r.doc, /titlePg|w:br w:type="page"/, 'compact cover and Contents share page 1');
  assert.match(r.text('word/sn_header1.xml'), />App 2\.0</);
  r = frame('letter', { title: 'Renewal', from_name: 'Us Ltd', to_name: 'Jane', date: '1 May', subject: 'Contract' });
  assert.match(r.doc, />Us Ltd<.*>1 May<.*>Jane<.*>Contract<.*>Dear Jane,</);
  assert.match(r.doc, /<w:titlePg\/>/, 'letterhead page has no page number');
  // A --reference-docx with its own chrome: no archetype header/footer, template styles and margins kept.
  r = frame('runbook', { title: 'T', audience: 'A' }, { chrome: false, styles: false });
  assert.doesNotMatch(r.doc, /headerReference|footerReference|titlePg/);
  assert.match(r.doc, /<w:pgMar w:top="1440"/);
  assert.match(r.text('word/styles.xml'), /F4CCCD/);
  assert.equal(r.out.has('word/sn_header1.xml'), false);
  assert.match(r.doc, />Contents</, 'cover and Contents still added');
  assert.throws(() => frameDocx(writeZip(new Map([['a.txt', 'x']])), frames.getArchetype('plain'), {}, ''), /unexpected DOCX layout/);
});

test('core properties keep $ patterns literally and stay well-formed', () => {
  const value = "Costs $` & $& plan $' and $$";
  const { text } = frame('runbook', { title: value, audience: 'Ops', author: "A $' B" });
  const core = text('docProps/core.xml');
  assertWellFormed(core, 'core.xml');
  assert.equal((core.match(/<\?xml/g) || []).length, 1);
  assert.ok(core.includes("<dc:title>Costs $` &amp; $&amp; plan $' and $$</dc:title>"), core);
  assert.ok(core.includes("<dc:creator>A $' B</dc:creator>"), core);
  assert.equal(setCoreTag('<cp:coreProperties></cp:coreProperties>', 'dc:title', '$&'), '<cp:coreProperties><dc:title>$&amp;</dc:title></cp:coreProperties>');
});

test('lists: bullet and numbered levels indent alike; thematic break becomes a rule', () => {
  const numbering = '<w:numbering><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="566" w:hanging="283"/></w:pPr></w:lvl></w:abstractNum>'
    + '<w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="-"/><w:pPr><w:ind w:left="283" w:hanging="283"/></w:pPr></w:lvl>'
    + '<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="-"/><w:pPr><w:ind w:left="566" w:hanging="283"/></w:pPr></w:lvl></w:abstractNum></w:numbering>';
  const fixed = fixNumbering(numbering);
  assert.match(fixed, /w:abstractNumId="2"><w:lvl w:ilvl="0">.*?<w:ind w:left="566" w:hanging="283"\/>/);
  assert.match(fixed, /w:abstractNumId="3"><w:lvl w:ilvl="0">.*?<w:lvlText w:val="•"\/>.*?<w:ind w:left="566" w:hanging="283"\/>/);
  assert.match(fixed, /<w:lvl w:ilvl="1">.*?<w:lvlText w:val="◦"\/>.*?<w:ind w:left="1132" w:hanging="283"\/>/);
  // Through frameDocx: numbering fixed with styles, left alone with a template.
  const zip = fixture();
  zip.set('word/numbering.xml', numbering);
  zip.set('word/document.xml', zip.get('word/document.xml').replace('<w:p/>', p('---')));
  const out = readZip(frameDocx(writeZip(zip), frames.getArchetype('plain'), { title: 'T' }, BODY_MD, { boxes: [{ kind: 'warning', title: 'C', color: '#f59e0b' }] }));
  assert.equal(out.get('word/numbering.xml').toString('utf8'), fixed);
  const doc = out.get('word/document.xml').toString('utf8');
  assert.doesNotMatch(doc, />---</);
  assert.match(doc, /<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D5DB"\/><\/w:pBdr>/);
  const tpl = readZip(frameDocx(writeZip(zip), frames.getArchetype('plain'), {}, BODY_MD, { styles: false, chrome: false }));
  assert.equal(tpl.get('word/numbering.xml').toString('utf8'), numbering);
});

test('Contents links: one heading that does not match never disables the later entries', () => {
  const zip = fixture();
  // The first heading renders differently from its Contents text; the later ones still link.
  zip.set('word/document.xml', zip.get('word/document.xml').replace(p('Overview', 'Heading1'), p('Overview (renamed)', 'Heading1')));
  const md = '# Overview\n\n## Symptoms\n\n# Procedure\n';
  const out = readZip(frameDocx(writeZip(zip), frames.getArchetype('runbook'), { title: 'T', audience: 'A' }, md, { boxes: [{ kind: 'warning', title: 'C', color: '#f59e0b' }] }));
  const doc = out.get('word/document.xml').toString('utf8');
  const anchors = [...doc.matchAll(/<w:hyperlink w:anchor="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(anchors, ['_TocSn2', '_TocSn3']);
  for (const a of anchors) assert.match(doc, new RegExp(`<w:bookmarkStart w:id="\\d+" w:name="${a}"/>`));
});
