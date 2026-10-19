'use strict';
// Offline checks of the archetype registry and the PDF/HTML framing in
// sn-doc-export/frames.cjs. No renderer packages or browser are needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const frames = require(path.join(__dirname, '../../../payload/.agents/skills/sn-doc-export/frames.cjs'));
const plain = v => JSON.parse(JSON.stringify(v));

test('registry: every archetype is complete; compliance is an alias; unknown names are null', () => {
  const names = Object.keys(frames.ARCHETYPES);
  assert.deepEqual(names, ['plain', 'knowledge_article', 'runbook', 'compliance_report', 'release_notes', 'architecture', 'customer_deliverable', 'letter']);
  for (const name of names) {
    const a = frames.getArchetype(name);
    assert.equal(a.name, name);
    assert.ok(a.label && Array.isArray(a.required) && Array.isArray(a.optional), name);
    assert.ok(['none', 'compact', 'full', 'letter'].includes(a.cover), name);
    assert.ok(a.toc === null || (a.toc.length === 2 && a.toc[0] <= a.toc[1]), name);
    // A title-bearing cover always requires a title.
    if (a.cover !== 'none') assert.ok(a.required.includes('title'), name);
  }
  assert.equal(frames.getArchetype('compliance').name, 'compliance_report');
  assert.equal(frames.getArchetype('runbok'), null);
  assert.equal(frames.getArchetype('__proto__'), null);
  assert.equal(frames.getArchetype('toString'), null);
});

test('front matter: flat keys parsed, quotes stripped, nested lines reported, block always removed', () => {
  const r = frames.parseFrontMatter([
    '﻿---', 'title: "Recovery: nightly import"', "subtitle: 'It''s late'", 'On-Call-Team: Ops',
    '# a comment', '', 'version: 1.2 # trailing comment', 'reviewers:', '  - Ann', 'pdf_options: {format: Letter}', '---', '# Body', '',
  ].join('\r\n'));
  assert.deepEqual(plain(r.meta), { title: 'Recovery: nightly import', subtitle: "It's late", on_call_team: 'Ops', version: '1.2', reviewers: '' });
  assert.deepEqual(plain(r.ignored), ['- Ann', 'pdf_options: {format: Letter}']);
  assert.equal(r.md, '# Body\r\n');
  assert.equal(r.found, true);
  assert.deepEqual(plain(r.comments), ['version']);
  // A leading horizontal rule is not front matter; nothing is removed.
  for (const untouched of ['# Body\n\n---\n\ntext\n', 'text\n---\ntitle: X\n---\n', '---\n\nIntro paragraph.\n\nMore text.\n\n---\n# Body\n']) {
    assert.deepEqual(plain(frames.parseFrontMatter(untouched)), { md: untouched, meta: {}, found: false, ignored: [], comments: [] });
  }
  assert.equal(frames.parseFrontMatter('---\n---\nBody\n').md, 'Body\n');
  // The closing delimiter must start a line.
  const mid = frames.parseFrontMatter('---\ntitle: Part A---\nversion: 2\n---\nBody\n');
  assert.deepEqual(plain(mid.meta), { title: 'Part A---', version: '2' });
  assert.equal(mid.md, 'Body\n');
  // A comment after a quoted value is dropped silently; after a bare value it is reported.
  const c = frames.parseFrontMatter('---\ntitle: "Quoted" # note\nsubtitle: Incident #42 fix\n---\n');
  assert.deepEqual(plain(c.meta), { title: 'Quoted', subtitle: 'Incident' });
  assert.deepEqual(plain(c.comments), ['subtitle']);
  assert.equal(frames.metaKey(' Control-ID '), 'control_id');
  // A body that starts with a rule is protected from md-to-pdf's own front-matter reader.
  assert.equal(frames.framedMarkdown(frames.getArchetype('plain'), {}, '---\n\nText\n'), '\n---\n\nText\n');
});

test('metadata: --meta overrides front matter; first H1 is the title fallback, outside code only', () => {
  const runbook = frames.getArchetype('runbook');
  let r = frames.resolveMetadata(runbook, { title: 'Front', audience: 'A' }, { title: ' CLI ' }, 'x');
  assert.equal(r.meta.title, 'CLI');
  assert.equal(r.titleFrom, 'meta');
  r = frames.resolveMetadata(runbook, {}, {}, '```\n# not a heading\n```\n# The **Real** Title\nBody\n');
  assert.equal(r.meta.title, 'The Real Title');
  assert.equal(r.titleFrom, 'h1');
  assert.equal(r.body, '```\n# not a heading\n```\nBody\n');
  assert.deepEqual(frames.missingMetadata(runbook, { title: 'T', audience: '  ' }), ['audience']);
  assert.deepEqual(frames.missingMetadata(frames.getArchetype('letter'), {}), ['title', 'from_name', 'to_name', 'date']);
  assert.deepEqual(frames.unusedMetadata(runbook, { title: 'T', author: 'A', service: 'S', colour: 'red' }), ['colour']);
});

test('fillTemplate collapses missing values cleanly', () => {
  assert.equal(frames.fillTemplate('{product} {version}', { version: '2.0' }), '2.0');
  assert.equal(frames.fillTemplate('{title} ({status})', { title: 'Design' }), 'Design');
  assert.equal(frames.fillTemplate('{customer} — {title}', { title: 'Report' }), 'Report');
  assert.equal(frames.fillTemplate('{customer} — {title}', { customer: 'Acme' }), 'Acme');
  assert.equal(frames.fillTemplate('Runbook — {title}', { title: 'X' }), 'Runbook — X');
  assert.equal(frames.fillTemplate(null, {}), '');
});

test('collectHeadings: marked-compatible slugs, duplicates numbered, code fences ignored, inline markup stripped', () => {
  const md = '# Over-view & Scope\n## Step 1 - Check `job`\n```\n# not\n```\n~~~\n## also not\n~~~\n## Step 1 - Check job\n### [Link](http://x) **bold**\n## Step 1 - Check job\n';
  assert.deepEqual(plain(frames.collectHeadings(md)), [
    { level: 1, text: 'Over-view & Scope', slug: 'over-view--scope' },
    { level: 2, text: 'Step 1 - Check job', slug: 'step-1---check-job' },
    { level: 2, text: 'Step 1 - Check job', slug: 'step-1---check-job-1' },
    { level: 3, text: 'Link bold', slug: 'link-bold' },
    { level: 2, text: 'Step 1 - Check job', slug: 'step-1---check-job-2' },
  ]);
  const rn = frames.getArchetype('release_notes');
  assert.deepEqual(frames.tocHeadings(rn, md).map(h => h.level), [2, 2, 3, 2]);
  // Underscores inside words, code spans and entities survive as marked renders them.
  const names = '## Configure sys_user_group and cmdb_ci mappings\n## Run the `fix_ci_groups` script\n## A &amp; B\n## _em_ and __init__ and *x*\n';
  assert.deepEqual(plain(frames.collectHeadings(names).map(h => [h.text, h.slug])), [
    ['Configure sys_user_group and cmdb_ci mappings', 'configure-sys_user_group-and-cmdb_ci-mappings'],
    ['Run the fix_ci_groups script', 'run-the-fix_ci_groups-script'],
    ['A & B', 'a--b'],
    ['em and init and x', 'em-and-init-and-x'],
  ]);
  assert.equal(frames.resolveMetadata(frames.getArchetype('runbook'), {}, {}, '# Reset sys_user passwords\n').meta.title, 'Reset sys_user passwords');
  assert.deepEqual(frames.tocHeadings(frames.getArchetype('plain'), md), []);
});

test('covers: full lists required then present optional keys; compact strip; letterhead; all escaped', () => {
  const runbook = frames.getArchetype('runbook');
  const meta = { title: 'A <b> & "c"', subtitle: 'Sub', audience: 'Ops', version: '1.2', service: '' };
  const full = frames.coverHtml(runbook, meta);
  assert.match(full, /^<section class="doc-cover"><p class="doc-cover__kind">Runbook<\/p><h1 class="doc-cover__title">A &lt;b&gt; &amp; &quot;c&quot;<\/h1>/);
  assert.match(full, /<dt>Audience<\/dt><dd>Ops<\/dd><dt>Version<\/dt><dd>1\.2<\/dd><\/dl>/);
  assert.doesNotMatch(full, /Service|<dt>Title/);
  assert.match(frames.coverHtml(frames.getArchetype('compliance'), { title: 'T', control_id: 'AC-2', framework: 'NIST' }), /<dt>Control ID<\/dt>/);
  const compact = frames.coverHtml(frames.getArchetype('release_notes'), { title: 'RN', version: '2.0', release_date: '2026-10-15' });
  assert.match(compact, /<header class="doc-header">.*<h1 class="doc-title">RN<\/h1><div class="doc-meta"><span class="doc-meta__key">Version:<\/span> 2\.0 &middot; <span class="doc-meta__key">Release Date:<\/span> 2026-10-15<\/div><\/header>$/);
  const letter = frames.coverHtml(frames.getArchetype('letter'), { title: 'T', from_name: 'Us', to_name: 'Jane', date: '1 May' });
  assert.match(letter, /doc-letter__org">Us<\/span><\/div><p class="doc-letter__date">1 May<\/p>/);
  assert.match(letter, /<p class="doc-letter__subject">T<\/p><p class="doc-letter__salutation">Dear Jane,<\/p>/);
  assert.equal(frames.coverHtml(frames.getArchetype('plain'), meta), '');
});

test('TOC and framed Markdown: links to heading ids, indentation relative to the top level', () => {
  const md = '## Highlights\n### Detail\n## Fixes\n';
  const toc = frames.tocHtml(frames.tocHeadings(frames.getArchetype('release_notes'), md));
  assert.equal(toc, '<nav class="doc-toc"><p class="doc-toc__title">Contents</p><ul><li class="toc-l1"><a href="#highlights">Highlights</a></li><li class="toc-l2"><a href="#detail">Detail</a></li><li class="toc-l1"><a href="#fixes">Fixes</a></li></ul></nav>');
  const framed = frames.framedMarkdown(frames.getArchetype('release_notes'), { title: 'T', version: '1', release_date: 'd' }, md);
  assert.ok(framed.indexOf('<header class="doc-header">') < framed.indexOf('<nav class="doc-toc">'));
  assert.ok(framed.endsWith(`\n\n${md}`));
  assert.equal(frames.framedMarkdown(frames.getArchetype('plain'), {}, md), md);
});

test('margin boxes: header/footer/page counter; clean first page only for full covers and letters; CSS strings escaped', () => {
  const runbook = frames.getArchetype('runbook');
  const css = frames.marginBoxCss(runbook, { title: 'Say "hi" \\ there\nnow' });
  assert.match(css, /@top-right \{ content: "Runbook — Say \\"hi\\" \\\\ there now";/);
  assert.match(css, /@bottom-left \{ content: "Internal use only";/);
  assert.match(css, /@bottom-right \{ content: "Page " counter\(page\) " of " counter\(pages\);/);
  assert.match(css, /@page :first \{ @top-right \{ content: none; \}/);
  assert.match(frames.marginBoxCss(frames.getArchetype('letter'), {}), /@page :first/);
  for (const name of ['plain', 'knowledge_article', 'release_notes']) assert.doesNotMatch(frames.marginBoxCss(frames.getArchetype(name), { title: 'T' }), /:first/, name);
  // Per mode: PDF gets print rules (+ boxes), HTML only screen rules.
  assert.match(frames.frameCss(runbook, {}, 'boxes'), /@page \{ size: A4;[\s\S]*h1 \{ break-before: page; \}[\s\S]*counter\(pages\)/);
  assert.doesNotMatch(frames.frameCss(runbook, {}, 'templates'), /counter\(pages\)/);
  assert.doesNotMatch(frames.frameCss(runbook, {}, 'screen'), /@page|break-before/);
  assert.doesNotMatch(frames.frameCss(frames.getArchetype('knowledge_article'), {}, 'boxes'), /h1 \{ break-before: page/);
  assert.match(frames.frameCss(runbook, {}, 'boxes'), /\.doc-toc \{ break-after: page; \}/);
  assert.doesNotMatch(frames.frameCss(frames.getArchetype('release_notes'), {}, 'boxes'), /\.doc-toc \{ break-after: page; \}/);
});

test('template fallback: header/footer templates escaped and carrying page counters', () => {
  const t = frames.pdfTemplates(frames.getArchetype('customer_deliverable'), { title: '<T>', customer: 'A&B' });
  assert.equal(t.displayHeaderFooter, true);
  assert.match(t.headerTemplate, />A&amp;B — &lt;T&gt;<\/div>$/);
  assert.match(t.footerTemplate, /<span>Prepared for A&amp;B<\/span><span>Page <span class="pageNumber"><\/span> of <span class="totalPages"><\/span><\/span>/);
  assert.equal(frames.MARGIN_BOX_MIN_CHROMIUM, 131);
});

// With SN_DOC_TEST_NODE_MODULES set, compare against the marked that md-to-pdf uses.
const modules = process.env.SN_DOC_TEST_NODE_MODULES || '';
const markedDir = [path.join(modules, 'md-to-pdf', 'node_modules', 'marked'), path.join(modules, 'marked')]
  .find(d => modules && require('node:fs').existsSync(path.join(d, 'package.json')));
test('collectHeadings slugs equal the heading ids marked renders', { skip: markedDir ? false : 'set SN_DOC_TEST_NODE_MODULES to a node_modules with md-to-pdf' }, () => {
  const { marked } = require(markedDir);
  const md = ['# Configure sys_user_group and cmdb_ci mappings', '## The `sys_user_role` table', '## snake_case naming', '## Details', '## Details',
    '## A &amp; B', '## **Bold** _em_ *x*', '## Step 1 — Don\'t skip', '## [link `x_y`](http://a)', '## __init__ and _a_b_', '## Q&A — what\'s next?'].join('\n\n');
  const ids = [...marked.parse(md, { headerIds: true, headerPrefix: '' }).matchAll(/<h\d id="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(frames.collectHeadings(md).map(h => h.slug), ids);
});
