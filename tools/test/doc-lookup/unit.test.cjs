'use strict';

// Offline regression tests for the indexer and CLI. Fixtures live in a temp
// directory; the real SNDocs checkout and index are never touched.
// Run from the distribution repository root: node --test tools/test/doc-lookup/unit.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const skill = path.resolve(__dirname, '../../../payload/.agents/skills/sn-doc-lookup');
const { stripMarkdownInline } = require(path.join(skill, 'src/common'));
const { buildIndex } = require(path.join(skill, 'src/build-index'));
const { DocSearch } = require(path.join(skill, 'src/search'));

const URL_UNDERSCORE = 'https://www.servicenow.com/docs/r/australia/api-reference/server-api-reference/c_GlideRecordAPI.html';
const URL_ESCAPED = 'https://www.servicenow.com/docs/r/australia/platform-security/r_ACL_rules.html';
const FILLER = 'Audit retention controls how long audited field changes are kept before they are purged. '.repeat(3);

function write(root, rel, text) {
  const file = path.join(root, 'markdown', rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

async function fixture(fn, family = 'australia') {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-unit-'));
  try {
    const docs = path.join(temp, 'docs');
    const index = path.join(temp, 'index');
    write(docs, 'api-reference/server-api-reference/c_GlideRecordAPI.md',
      `---\ntitle: GlideRecord\ncanonical_url: ${URL_UNDERSCORE}\nrelease: australia\n---\n` +
      `# GlideRecord\n\n${FILLER}\n\n## The security\\_admin role and _elevated_ access\n\n` +
      `Grant security\\_admin before editing sys\\_security\\_acl records. ${FILLER}\n`);
    write(docs, 'platform-security/r_ACL_rules.md',
      `---\ntitle: "ACL rules for sys_security_acl"\ncanonical_url: ${URL_ESCAPED.replace(/_/g, '\\_')}\nrelease: australia\n---\n` +
      `# ACL rules\n\n${FILLER}${'x'.repeat(13000)}\n`);
    const built = await buildIndex({ docs, out: index, family });
    return await fn({ temp, docs, index, built });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function cli(args) {
  const result = spawnSync(process.execPath, [path.join(skill, 'bin/sn-doc-md.js'), ...args], { encoding: 'utf8', timeout: 20000 });
  assert.ifError(result.error);
  return result;
}

test('inline stripping removes emphasis markers but keeps identifier underscores', () => {
  assert.equal(stripMarkdownInline('The security_admin role'), 'The security_admin role');
  assert.equal(stripMarkdownInline('**ui\\_builder\\_admin** role'), 'ui_builder_admin role');
  assert.equal(stripMarkdownInline('_italic_ and __bold__ sys_audit'), 'italic and bold sys_audit');
  assert.equal(stripMarkdownInline('glide.ui.audit_deleted_tables'), 'glide.ui.audit_deleted_tables');
  assert.equal(stripMarkdownInline('x_snc_app_table'), 'x_snc_app_table');
});

test('canonical_url, title and heading keep underscores in the built index', () => fixture(async ({ index, built }) => {
  assert.match(built.manifest.generator, /^sn-doc-md@0\.1\.[1-9]/);
  assert.equal(built.manifest.corpus_release, 'australia');
  assert.deepEqual(built.warnings, []);
  const ds = new DocSearch(index);
  const api = ds.readByPath('api-reference/server-api-reference/c_GlideRecordAPI.md');
  assert.ok(api.length >= 2);
  for (const row of api) assert.equal(row.canonical_url, URL_UNDERSCORE);
  const section = api.find(row => /security/.test(row.heading));
  assert.equal(section.heading, 'The security_admin role and elevated access');
  assert.match(section.heading_path, /security_admin/);
  assert.equal(section.text.split('\n')[0], 'The security_admin role and elevated access');
  assert.match(section.text, /Grant security_admin before editing sys_security_acl records/);
  const acl = ds.readByPath('platform-security/r_ACL_rules.md');
  assert.equal(acl[0].canonical_url, URL_ESCAPED);
  assert.equal(acl[0].title, 'ACL rules for sys_security_acl');
  const titles = JSON.parse(fs.readFileSync(path.join(index, 'titles.json'), 'utf8'));
  assert.ok(titles.every(t => [URL_UNDERSCORE, URL_ESCAPED].includes(t.canonical_url)));
}));

test('search reports chunk ids, per-page chunk counts, provenance and intact URLs', () => fixture(async ({ index }) => {
  const result = cli(['search', '--index', index, '--query', 'Which role edits ACLs?', '--keywords', 'security_admin sys_security_acl', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.index.family, 'australia');
  assert.match(out.index.generator, /^sn-doc-md@/);
  assert.deepEqual(out.warnings, []);
  const hit = out.results.find(r => r.source_rel.endsWith('c_GlideRecordAPI.md'));
  assert.equal(hit.canonical_url, URL_UNDERSCORE);
  assert.equal(hit.doc_chunks, 2);
  assert.equal(Number.isInteger(hit.id), true);
  // --keywords alone supplies retrieval terms; the query is not tokenized.
  assert.equal(out.terms.includes('edits'), false);
  const plain = cli(['search', '--index', index, '--query', 'security_admin']);
  assert.match(plain.stdout, /id: \d+ \| kind: content \| /);
}));

test('read accepts path near-misses and fails closed on a miss', () => fixture(async ({ docs, index }) => {
  const rel = 'platform-security/r_ACL_rules.md';
  const variants = [rel, rel.replace(/\//g, '\\'), `markdown/${rel}`, `.\\markdown\\${rel.replace(/\//g, '\\')}`, path.join(docs, 'markdown', rel)];
  for (const variant of variants) {
    const result = cli(['read', '--index', index, '--path', variant, '--json']);
    assert.equal(result.status, 0, `${variant}: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.rows[0].source_rel, rel);
    assert.equal(out.index.family, 'australia');
  }
  for (const args of [['--path', 'platform-security/missing.md'], ['--id', '999999'], ['--id', 'toc:1'], ['--id', 'abc']]) {
    const result = cli(['read', '--index', index, ...args, '--json']);
    assert.equal(result.status, 1, args.join(' '));
    const out = JSON.parse(result.stdout);
    assert.equal(out.ok, false);
    assert.deepEqual(out.rows, []);
    assert.match(out.error, /no indexed content/);
    const plain = cli(['read', '--index', index, ...args]);
    assert.equal(plain.status, 1);
    assert.equal(plain.stdout, '');
    assert.match(plain.stderr, /ERROR: no indexed content/);
  }
}));

test('plain-text read marks truncation instead of cutting silently', () => fixture(async ({ index }) => {
  const result = cli(['read', '--index', index, '--path', 'platform-security/r_ACL_rules.md']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[truncated: 12000 of \d+ characters shown; use --json or a larger --max_chars\]/);
  assert.match(result.stdout, /^Id: \d+$/m);
  const full = cli(['read', '--index', index, '--path', 'platform-security/r_ACL_rules.md', '--max_chars', '50000']);
  assert.doesNotMatch(full.stdout, /\[truncated:/);
}));

test('a family label that differs from the corpus release is surfaced, and old indexes are flagged', () => fixture(async ({ index, built }) => {
  assert.equal(built.manifest.family, 'zurich');
  assert.equal(built.manifest.corpus_release, 'australia');
  assert.match(built.warnings[0], /does not match the corpus frontmatter release "australia"/);
  assert.match(new DocSearch(index).indexInfo().warnings[0], /differs from the corpus frontmatter release/);
  const manifestFile = path.join(index, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.generator = 'sn-doc-md@0.1.0';
  delete manifest.corpus_release;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const out = JSON.parse(cli(['search', '--index', index, '--query', 'security_admin', '--json']).stdout);
  assert.equal(out.warnings.length, 1);
  assert.match(out.warnings[0], /sn-doc-md@0\.1\.0: canonical_url, title and heading values may have lost underscores/);
}, 'zurich'));
