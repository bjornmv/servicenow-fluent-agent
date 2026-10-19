'use strict';
// Opt-in end-to-end renders: every archetype to PDF, DOCX and HTML through the
// real renderer packages and an installed Chrome/Edge. Runs only when
// SN_DOC_TEST_NODE_MODULES points at a node_modules folder that contains
// md-to-pdf and @adobe/helix-md2docx; otherwise every test is skipped.
// pdftotext (poppler), when on PATH, adds page-level text checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const skillDir = path.join(__dirname, '../../../payload/.agents/skills/sn-doc-export');
const renderPath = path.join(skillDir, 'render.js');
const frames = require(path.join(skillDir, 'frames.cjs'));
const { readZip } = require(path.join(skillDir, 'docx-frame.cjs'));
const capture = require(path.join(skillDir, 'capture.cjs'));

const modules = process.env.SN_DOC_TEST_NODE_MODULES || '';
const hasPackages = modules && ['md-to-pdf', '@adobe/helix-md2docx'].every(p => fs.existsSync(path.join(modules, p, 'package.json')));
const browser = capture.findBrowser();
const skip = !hasPackages ? 'set SN_DOC_TEST_NODE_MODULES to a node_modules with md-to-pdf and @adobe/helix-md2docx' : !browser ? 'no installed Chrome/Edge' : false;
const pdftotext = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).error ? null : 'pdftotext';

const SAMPLE_META = {
  plain: {},
  knowledge_article: { title: 'Reset a VPN token', category: 'How-to' },
  runbook: { title: 'Import Recovery', audience: 'Platform admins', version: '1.2' },
  compliance_report: { title: 'Access Review Q3', control_id: 'AC-2', framework: 'NIST 800-53' },
  release_notes: { title: 'App 2.0 Release Notes', product: 'App', version: '2.0', release_date: '2026-10-15' },
  architecture: { title: 'Transfer Architecture', version: '0.9', status: 'Draft' },
  customer_deliverable: { title: 'Health Check', customer: 'Example Corp', date: '2026-10-19' },
  letter: { title: 'Renewal', from_name: 'Example AS', to_name: 'Jane Doe', date: '19 October 2026' },
};
// Headings with underscores, code spans, entities and repeated text check that
// the Contents text and links match the rendered headings in every format.
const BODY = [
  '# Overview', '', 'Intro with `code` and **bold**.', '', ':::{warning} Careful', 'Check the update set.', '', '```', 'gs.info(1);', '```', ':::', '',
  '## Details', '', '| A | B |', '|---|---|', '| 1 | 2 |', '', '```', 'line one', 'line two', '```', '',
  '### Deep', '', '- [ ] task', '', '## The `sys_user_role` table', '', '## snake_case naming', '', '## A &amp; B', '', '## Details', '', '---', '',
  '# Second section', '', 'Text.', '',
].join('\n');

function sample(dir, name) {
  const meta = SAMPLE_META[name];
  const front = Object.keys(meta).length ? `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n` : '';
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, front + BODY);
  return file;
}

function render(args, env = {}) {
  return spawnSync(process.execPath, [renderPath, '--node-path', modules, '--browser', browser, ...args],
    { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 180000 });
}

const pdfText = (file, page) => spawnSync(pdftotext, ['-layout', '-f', String(page), '-l', String(page), file, '-'], { encoding: 'utf8' }).stdout;
const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;

let work;
test.before(() => { work = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-e2e-')); });
test.after(() => { if (work) fs.rmSync(work, { recursive: true, force: true }); });

for (const name of Object.keys(frames.ARCHETYPES)) {
  test(`render ${name} to pdf, docx and html`, { skip, timeout: 240000 }, () => {
    const cfg = frames.getArchetype(name);
    const out = path.join(work, name);
    const r = render(['--in', sample(work, name), '--archetype', name, '--format', 'pdf,docx,html', '--out', out]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stderr, /warn: browser version/);
    const slug = name === 'plain' ? 'plain' : SAMPLE_META[name].title.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const pdf = path.join(out, `${slug}.pdf`), docx = path.join(out, `${slug}.docx`), html = path.join(out, `${slug}.html`);

    // PDF: pages, bookmarks for documents with Contents, header/footer per page.
    const pdfBuf = fs.readFileSync(pdf);
    assert.equal(pdfBuf.toString('latin1', 0, 5), '%PDF-');
    assert.ok(pdfPages(pdfBuf) >= 1);
    if (cfg.toc) assert.match(pdfBuf.toString('latin1'), /\/Outlines/, 'PDF bookmarks');
    if (pdftotext) {
      const pages = pdfPages(pdfBuf);
      const first = pdfText(pdf, 1);
      const last = pdfText(pdf, pages);
      if (pages > 1 || !frames.firstPageClean(cfg)) assert.match(last, new RegExp(`Page ${pages} of ${pages}`), 'last page number');
      if (frames.firstPageClean(cfg)) assert.doesNotMatch(first, /Page 1 of/, 'clean first page');
      else assert.match(first, new RegExp(`Page 1 of ${pages}`));
      const header = frames.fillTemplate(cfg.header, SAMPLE_META[name]);
      if (header && pages > 1) assert.ok(pdfText(pdf, 2).includes(header), `header on page 2: ${header}`);
      if (cfg.cover === 'full') assert.match(first, new RegExp(cfg.label.toUpperCase()));
    }

    // DOCX: framing parts present and consistent.
    const z = readZip(fs.readFileSync(docx));
    const doc = z.get('word/document.xml').toString('utf8');
    assert.ok(z.has('word/sn_footer1.xml'));
    assert.match(z.get('word/sn_footer1.xml').toString('utf8'), / NUMPAGES /);
    assert.equal(/<w:titlePg\/>/.test(doc), frames.firstPageClean(cfg));
    assert.equal(/ TOC \\o /.test(doc), Boolean(cfg.toc));
    assert.doesNotMatch(doc, /⟦|F4CCCD/);
    assert.match(doc, /w:color="f59e0b"/i, 'callout box');
    if (cfg.cover !== 'none') assert.match(z.get('docProps/core.xml').toString('utf8'), new RegExp(`<dc:title>${SAMPLE_META[name].title}</dc:title>`));
    const anchors = [...doc.matchAll(/<w:hyperlink w:anchor="([^"]+)"/g)].map(m => m[1]);
    assert.equal(anchors.length, frames.tocHeadings(cfg, BODY).length, 'one link per Contents entry');
    for (const anchor of anchors) assert.match(doc, new RegExp(`<w:bookmarkStart w:id="\\d+" w:name="${anchor}"/>`));
    assert.doesNotMatch(doc, />:::|>---</, 'callout converted, rule drawn');

    // HTML: every Contents link resolves to a heading id (marked slug parity).
    const page = fs.readFileSync(html, 'utf8');
    const links = [...page.matchAll(/<li class="toc-l\d"><a href="#([^"]+)"/g)].map(m => m[1]);
    assert.equal(links.length, frames.tocHeadings(cfg, BODY).length);
    for (const id of links) assert.match(page, new RegExp(`<h\\d id="${id}"`), `heading id ${id}`);
    assert.doesNotMatch(page, /:::/, 'callout with a code block converted');
    if (cfg.toc && cfg.toc[0] <= 2) assert.match(page, />The sys_user_role table<\/a>/);
    if (cfg.cover !== 'none') assert.doesNotMatch(page, /<h1 id="[^"]*">\s*(?:Reset|Import|Access|App|Transfer|Health|Renewal)/, 'H1 title not duplicated');
  });
}

test('missing required metadata exits 2 and writes nothing', { skip }, () => {
  const file = path.join(work, 'bare.md');
  fs.writeFileSync(file, '# Only a heading\n');
  const out = path.join(work, 'bare-out');
  const r = render(['--in', file, '--archetype', 'customer_deliverable', '--out', out]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Archetype customer_deliverable: missing required metadata: customer, date\./);
  assert.equal(fs.existsSync(out), false);
});

test('browser fallback: templates are used with a warning when margin boxes are switched off', { skip, timeout: 120000 }, () => {
  const out = path.join(work, 'fallback');
  const r = render(['--in', sample(work, 'runbook'), '--archetype', 'runbook', '--format', 'pdf', '--out', out], { SN_DOC_MARGIN_BOXES: 'off' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /warn: SN_DOC_MARGIN_BOXES=off — page header\/footer use templates/);
  if (pdftotext) assert.match(pdfText(path.join(out, 'import-recovery.pdf'), 1), /Page 1 of/, 'templates also print on the cover');
});

test('--check reports the browser version and the margin-box path', { skip }, () => {
  const r = render(['--check', '--format', 'pdf,docx', '--archetype', 'runbook']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /\[OK \] browser version \d+\.[\d.]+ — page header\/footer via CSS page margin boxes \(Chromium 131\+\)/);
  assert.match(r.stdout, /READY — the selected archetype and formats can render\./);
});

test('--reference-docx: template styles and its header/footer replace the archetype chrome', { skip, timeout: 120000 }, () => {
  // Build a template from a plain render, giving it a header part of its own.
  const base = path.join(work, 'tpl-src');
  assert.equal(render(['--in', sample(work, 'plain'), '--format', 'docx', '--out', base]).status, 0);
  const tplZip = readZip(fs.readFileSync(path.join(base, 'plain.docx')));
  const { writeZip } = require(path.join(skillDir, 'docx-frame.cjs'));
  tplZip.set('word/sn_header1.xml', tplZip.get('word/sn_header1.xml').toString('utf8').replace('</w:p>', '<w:r><w:t>CORP HEADER</w:t></w:r></w:p>'));
  const tpl = path.join(work, 'tpl.docx');
  fs.writeFileSync(tpl, writeZip(tplZip));
  const out = path.join(work, 'tpl-out');
  const r = render(['--in', sample(work, 'runbook'), '--archetype', 'runbook', '--format', 'docx', '--out', out, '--reference-docx', tpl]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /--reference-docx headers\/footers replace the archetype header\/footer/);
  const z = readZip(fs.readFileSync(path.join(out, 'import-recovery.docx')));
  const doc = z.get('word/document.xml').toString('utf8');
  assert.match(doc, />Contents</);
  const refs = doc.match(/<w:headerReference [^>]*\/>/g) || [];
  assert.equal(refs.length, 1);
  const rid = refs[0].match(/r:id="([^"]+)"/)[1];
  const target = z.get('word/_rels/document.xml.rels').toString('utf8').match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))[1];
  assert.match(z.get(`word/${target}`).toString('utf8'), /CORP HEADER/);
});
