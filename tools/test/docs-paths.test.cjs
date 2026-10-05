'use strict';

// Offline fixtures only: never populate the real user's SNDocs directories.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const skill = path.join(root, 'payload/.agents/skills/sn-doc-lookup');
const { resolveDocs, resolveIndex } = require(path.join(skill, 'src/paths'));
const { buildIndex } = require(path.join(skill, 'src/build-index'));

async function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-paths-'));
  const env = { ...process.env, LOCALAPPDATA: path.join(temp, 'Local AppData') };
  delete env.SN_DOCS_HOME;
  delete env.SN_DOC_MD_INDEX;
  try { return await fn(temp, env); }
  finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
function cli(args, env, file = 'bin/sn-doc-md.js') {
  const result = spawnSync(process.execPath, [path.join(skill, file), ...args], { env, encoding: 'utf8', timeout: 20000 });
  assert.ifError(result.error);
  return result;
}
function seedDocs(docs) {
  fs.mkdirSync(path.join(docs, 'markdown'), { recursive: true });
  fs.writeFileSync(path.join(docs, 'markdown/example.md'), '---\ntitle: GlideRecord query\n---\n# GlideRecord query\n' + 'GlideRecord addQuery finds incident records using an encoded query condition. '.repeat(4));
}

test('short defaults and paths CLI resolve without creating directories', () => fixture(async (temp, env) => {
  const expected = { docs: path.join(env.LOCALAPPDATA, 'SNDocs/repo'), index: path.join(env.LOCALAPPDATA, 'SNDocs/index') };
  assert.equal(resolveDocs(undefined, env), expected.docs);
  assert.equal(resolveIndex(undefined, env), expected.index);
  const result = cli(['paths'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), expected);
  assert.equal(fs.existsSync(env.LOCALAPPDATA), false);
}));

test('explicit paths override env, which overrides defaults, independently', () => fixture(async (temp, env) => {
  env.SN_DOCS_HOME = path.join(temp, 'custom repo');
  env.SN_DOC_MD_INDEX = path.join(temp, 'custom index');
  assert.equal(resolveDocs(undefined, env), env.SN_DOCS_HOME);
  assert.equal(resolveIndex(undefined, env), env.SN_DOC_MD_INDEX);
  assert.equal(resolveDocs(path.join(temp, 'explicit repo'), env), path.join(temp, 'explicit repo'));
  assert.equal(resolveIndex(path.join(temp, 'explicit index'), env), path.join(temp, 'explicit index'));
  delete env.LOCALAPPDATA;
  assert.equal(resolveDocs(undefined, env), env.SN_DOCS_HOME);
  assert.equal(resolveIndex(undefined, env), env.SN_DOC_MD_INDEX);
}));

test('missing LOCALAPPDATA fails closed without hardcoded or cwd fallback', () => {
  assert.throws(() => resolveDocs(undefined, {}), /LOCALAPPDATA/);
  assert.throws(() => resolveIndex(undefined, {}), /LOCALAPPDATA/);
  assert.throws(() => resolveDocs(undefined, { LOCALAPPDATA: 'relative' }), /absolute/);
  assert.throws(() => resolveIndex(true, {}), /Invalid path/);
});

test('missing source/index never triggers download, migration or directory creation', () => fixture(async (temp, env) => {
  for (const args of [['build'], ['search', '--query', 'GlideRecord'], ['read', '--id', '0'], ['test']]) {
    const result = cli(args, env);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(fs.existsSync(env.LOCALAPPDATA), false);
  }
}));

test('build, search, read and benchmark share defaults using tiny isolated fixtures', () => fixture(async (temp, env) => {
  const docs = resolveDocs(undefined, env);
  const index = resolveIndex(undefined, env);
  seedDocs(docs);
  const build = cli(['build'], env);
  assert.equal(build.status, 0, build.stderr);
  const manifest = JSON.parse(build.stdout).manifest;
  assert.equal(manifest.docs_root, docs);
  assert.equal(manifest.family, 'australia');
  assert.equal(fs.existsSync(path.join(index, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(docs, '.sn-doc-index')), false);
  for (const args of [['search', '--query', 'GlideRecord', '--json'], ['read', '--id', '0', '--json']]) {
    const result = cli(args, env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /example\.md/);
  }
  const cases = path.join(temp, 'cases.json');
  fs.writeFileSync(cases, JSON.stringify([{ name: 'fixture', query: 'GlideRecord', expect: [{ source_rel: 'example.md' }], max_rank: 1 }]));
  const benchmark = cli(['--file', cases, '--json'], env, 'test/run-tests.js');
  assert.equal(benchmark.status, 0, benchmark.stderr);
  assert.equal(JSON.parse(benchmark.stdout).passed, 1);
  assert.equal(cli(['build'], env).status, 1);
  assert.equal(cli(['build', '--force'], env).status, 0);
}));

test('escaped UI Builder roles are found/read via defaults despite a legacy cache; benchmark checks exact text', () => fixture(async (temp, env) => {
  const docs = resolveDocs(undefined, env);
  const source = 'application-development/ui-builder/ui-builder-overview.md';
  const file = path.join(docs, 'markdown', source);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = '# UI Builder overview\n\nThe ui\\_builder\\_admin role is required to complete tasks in UI Builder.\n' + 'Create pages and configure components for workspace experiences. '.repeat(4);
  fs.writeFileSync(file, raw);
  assert.equal(raw.includes('ui_builder_admin'), false, 'literal grep misses the escaped source');
  const legacy = path.join(env.LOCALAPPDATA, 'sn-docs/index');
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'manifest.json'), 'historical cache - do not open');
  assert.equal(cli(['build'], env).status, 0);
  const search = cli(['search', '--query', 'UI Builder required roles', '--keywords', 'UI Builder roles admin ui_builder_admin experience_admin', '--json'], env);
  assert.equal(search.status, 0, search.stderr);
  assert.equal(JSON.parse(search.stdout).results[0].source_rel, source);
  const read = cli(['read', '--path', source, '--json'], env);
  assert.equal(read.status, 0, read.stderr);
  assert.ok(JSON.parse(read.stdout).rows.some(row => row.text.includes('The ui_builder_admin role is required')));
  const cases = path.join(temp, 'roles.json');
  const tc = { name: 'UI Builder', query: 'UI Builder roles', max_rank: 3, expect: [{ source_rel: source, text_contains: 'The ui_builder_admin role is required' }] };
  fs.writeFileSync(cases, JSON.stringify([tc]));
  assert.equal(cli(['--file', cases], env, 'test/run-tests.js').status, 0);
  tc.expect[0].text_contains = 'nonexistent_admin_role';
  fs.writeFileSync(cases, JSON.stringify([tc]));
  assert.equal(cli(['--file', cases], env, 'test/run-tests.js').status, 1, 'ranking alone cannot satisfy an exact-text expectation');
  assert.equal(fs.readFileSync(path.join(legacy, 'manifest.json'), 'utf8'), 'historical cache - do not open');
}));

test('lookup routes to owning skills which retain path/advisor/evidence safeguards', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const agent = read('payload/.copilot/agents/ServiceNow Fluent.agent.md');
  const advisor = read('payload/.agents/skills/sn-update-advisor/SKILL.md');
  assert.match(agent, /\| Official product documentation \| `sn-doc-lookup`/);
  assert.match(agent, /sn-update-advisor/);
  assert.doesNotMatch(agent, /## Quiet Update Advisory|## Documentation Lookup|ui\\_builder/);
  assert.match(advisor, /--docs "<resolved-docs-checkout>"/);
  assert.match(advisor, /`--docs` requires a value/);
  assert.match(agent, /actual excerpts and completion evidence/);
  const skillText = read('payload/.agents/skills/sn-doc-lookup/SKILL.md');
  assert.match(skillText, /Prefer omitting `--index`/);
  assert.match(skillText, /On ENOENT, run `paths`/);
  assert.match(skillText, /Do not silently fall back to a bare Git cache/);
  assert.match(skillText, /literal grep miss does not establish semantic absence/);
  assert.match(skillText, /actual excerpts, exact identifiers, `source_rel`, `canonical_url`/);
  assert.match(skillText, /\*\*UNKNOWN\*\*, not an empty result set or native exit 0/);
  const cases = JSON.parse(read('payload/.agents/skills/sn-doc-lookup/test/benchmarks.json'));
  assert.ok(cases.some(tc => tc.expect.some(exp => exp.text_contains?.includes('ui_builder_admin'))));
});

test('overrides build outside defaults and explicit flags win', () => fixture(async (temp, env) => {
  const docs = path.join(temp, 'explicit docs');
  const index = path.join(temp, 'explicit index');
  seedDocs(docs);
  env.SN_DOCS_HOME = docs;
  env.SN_DOC_MD_INDEX = index;
  assert.equal(cli(['build'], env).status, 0);
  env.SN_DOCS_HOME = path.join(temp, 'missing docs');
  env.SN_DOC_MD_INDEX = path.join(temp, 'missing index');
  const other = path.join(temp, 'other index');
  const result = cli(['build', '--docs', docs, '--out', other], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(cli(['read', '--index', other, '--id', '0'], env).status, 0);
  assert.equal(fs.existsSync(env.LOCALAPPDATA), false);
}));

test('force refuses source/ancestor and unrecognized output without deleting data', () => fixture(async temp => {
  const docs = path.join(temp, 'docs');
  seedDocs(docs);
  for (const out of [docs, temp]) await assert.rejects(buildIndex({ docs, out, force: true }), /source or an ancestor/);
  const out = path.join(temp, 'unrelated');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'keep.txt'), 'preserve');
  await assert.rejects(buildIndex({ docs, out, force: true }), /unrecognized/);
  assert.equal(fs.readFileSync(path.join(out, 'keep.txt'), 'utf8'), 'preserve');
  assert.equal(fs.existsSync(path.join(docs, 'markdown/example.md')), true);
}));

test('setup and skill use short defaults, explicit clone destination and index step', () => {
  for (const name of ['setup.md', 'payload/.agents/skills/sn-doc-lookup/SKILL.md', 'payload/.agents/skills/sn-doc-lookup/README.md']) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    assert.ok(text.includes('%LOCALAPPDATA%\\SNDocs\\repo'), name);
    assert.ok(text.includes('%LOCALAPPDATA%\\SNDocs\\index'), name);
    assert.doesNotMatch(text, /C:\\Personal\\SNDocs|\.agents\\cache\\sn-doc-md/);
  }
  const setup = fs.readFileSync(path.join(root, 'setup.md'), 'utf8');
  assert.match(setup, /ServiceNowDocs\.git "\$Docs"/);
  assert.match(setup, /& \$GitExe -C "\$Docs" pull --ff-only/);
  assert.match(setup, /build --docs "\$Docs" --out "\$Index" --family australia/);
});
