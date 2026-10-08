'use strict';
// Offline checks of the Node dispatcher: Markdown preprocessing, argument
// validation, preflight exit status and the doc-to-tool contract. No renderer
// packages, browser, Python, npm, SDK or network are needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const skillDir = path.join(__dirname, '../../../payload/.agents/skills/sn-doc-export');
const renderPath = path.join(skillDir, 'render.js');
const source = fs.readFileSync(renderPath, 'utf8');
const doc = name => fs.readFileSync(path.join(skillDir, name), 'utf8').replace(/\r\n/g, '\n');

function slice(name) {
  const m = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(m, `render.js defines ${name}`);
  const rest = source.slice(m.index + 1);
  const next = rest.search(/^(?:(?:async )?function |const |let |\/\/ -{10,}|\/\/ |\/\*\*)/m);
  return source.slice(m.index, next < 0 ? source.length : m.index + 1 + next);
}
const context = vm.createContext({
  existsSync: fs.existsSync, readFileSync: fs.readFileSync,
  resolve: path.resolve, basename: path.basename, extname: path.extname,
  decodeURI,
});
vm.runInContext([
  "const IMG_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg' };",
  "const VALID_FORMATS = ['pdf', 'docx', 'html'];",
  "const VALID_BACKENDS = ['auto', 'node', 'python'];",
  "const NODE_ARCHETYPES = new Set(['plain']);",
  "const PYTHON_ARCHETYPES = ['plain', 'runbook'];",
  source.match(/^const IMG_RE = .*$/m)[0],
  ...['splitFences', 'splitCode', 'mapOutsideCode', 'stripFrontMatter', 'rewriteImageSources',
    'expandAdmonitions', 'resolveRelativeImages', 'parseFormats', 'resolveBackend', 'slugify', 'escapeHtml'].map(slice),
  'globalThis.api = { splitFences, splitCode, stripFrontMatter, rewriteImageSources, expandAdmonitions, resolveRelativeImages, parseFormats, resolveBackend, slugify, escapeHtml };',
].join('\n'), context);
const api = context.api;
const plain = v => JSON.parse(JSON.stringify(v));

test('untitled admonition keeps its kind label and its whole body', () => {
  for (const eol of ['\n', '\r\n']) {
    const out = api.expandAdmonitions(['Intro', '', ':::{warning}', 'First body line.', '', 'Second.', ':::', 'After'].join(eol) + eol);
    assert.match(out, /<strong style="color:#f59e0b">Warning<\/strong>\n\nFirst body line\.\s+Second\.\n\n<\/div>/);
    assert.match(out, /After/);
    assert.doesNotMatch(out, /:::/);
  }
  assert.match(api.expandAdmonitions(':::{note}\nOnly line.\n:::\n'), /<strong[^>]*>Note<\/strong>\n\nOnly line\./);
});

test('title on the directive line is used; inline code in the body does not break the block', () => {
  const out = api.expandAdmonitions(':::{tip} Custom Title\nUse `now-sdk build` here.\n:::\n');
  assert.match(out, /<strong style="color:#10b981">Custom Title<\/strong>\n\nUse `now-sdk build` here\./);
});

test('admonition and image syntax inside code is left untouched', () => {
  const fenced = '```markdown\n:::{note}\nZZINCODE ![x](missing.png)\n:::\n```\n';
  assert.equal(api.expandAdmonitions(fenced), fenced);
  const tilde = '~~~~\n:::{note}\nbody\n:::\n~~~~\n';
  assert.equal(api.expandAdmonitions(tilde), tilde);
  const problems = [];
  const md = `${fenced}\nInline \`![a](nope.png)\` stays.\n`;
  assert.equal(api.resolveRelativeImages(md, os.tmpdir(), problems), md);
  assert.deepEqual(plain(problems), []);
  // A fence that is never closed stays code to the end of the file.
  assert.equal(api.expandAdmonitions('```\n:::{note}\nx\n:::\n'), '```\n:::{note}\nx\n:::\n');
});

test('missing or unsupported images are reported instead of rendering a broken document', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-img-'));
  try {
    fs.writeFileSync(path.join(dir, 'ok one.png'), 'png');
    fs.writeFileSync(path.join(dir, 'vector.bmp'), 'bmp');
    let problems = [];
    const out = api.resolveRelativeImages('![a](ok%20one.png) ![b](gone.png) ![c](vector.bmp) ![d](https://example.com/x.png)', dir, problems);
    assert.match(out, /!\[a\]\(data:image\/png;base64,cG5n\)/);
    assert.match(out, /!\[d\]\(https:\/\/example\.com\/x\.png\)/);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /image not found: gone\.png/);
    assert.match(problems[1], /unsupported image type: vector\.bmp/);

    problems = [];
    const mapped = api.rewriteImageSources('![s](shot.png "T") ![t](other.png)', [['shot.png', path.join(dir, 'ok one.png')], ['other.png', path.join(dir, 'absent.png')]], problems);
    assert.match(mapped, /!\[s\]\(data:image\/png;base64,cG5n "T"\)/);
    assert.match(mapped, /!\[t\]\(other\.png\)/);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /--image-map target not found: other\.png=/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('leading YAML front matter is dropped so it cannot become renderer configuration', () => {
  const stripped = plain(api.stripFrontMatter('---\ntitle: X\ndest: C:/elsewhere/out.pdf\n---\n# Body\n'));
  assert.deepEqual(stripped, { md: '# Body\n', stripped: true });
  assert.equal(api.stripFrontMatter('---\r\ntitle: X\r\n---\r\n# Body\r\n').md, '# Body\r\n');
  for (const untouched of ['# Body\n\n---\n\ntext\n', 'text\n---\ntitle: X\n---\n']) {
    assert.deepEqual(plain(api.stripFrontMatter(untouched)), { md: untouched, stripped: false });
  }
  // The stripped Markdown is what reaches both renderers.
  const main = source.slice(source.indexOf('async function main()'));
  assert.ok(main.indexOf('stripFrontMatter(raw)') >= 0 && main.indexOf('stripFrontMatter(raw)') < main.indexOf('preprocessMd(front.md'));
});

test('formats, backends and archetypes are validated before routing', () => {
  assert.deepEqual(plain(api.parseFormats('PDF, docx,pdf')), { formats: ['pdf', 'docx'] });
  assert.match(api.parseFormats('docx,pfd').error, /Unsupported --format value: pfd\. Valid formats: pdf, docx, html\./);
  assert.match(api.parseFormats(' , ').error, /\(empty\)/);
  assert.deepEqual(plain(api.resolveBackend('auto', 'plain')), { backend: 'node' });
  assert.deepEqual(plain(api.resolveBackend('auto', 'runbook')), { backend: 'python' });
  assert.match(api.resolveBackend('auto', 'runbok').error, /Unknown archetype: runbok/);
  assert.match(api.resolveBackend('node', 'runbook').error, /'plain' only/);
  assert.match(api.resolveBackend('nodejs', 'plain').error, /Unknown backend: nodejs/);
  assert.equal(api.slugify('Example App Guide'), 'example-app-guide');
  assert.equal(api.escapeHtml('A <b> & c'), 'A &lt;b&gt; &amp; c');
});

function run(args, env = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-cli-'));
  fs.writeFileSync(path.join(cwd, 'body.md'), '# T\n');
  const clean = { ...process.env, SN_AGENT_HOME: '', NODE_PATH: '', npm_config_prefix: '', ...env };
  const r = spawnSync(process.execPath, [renderPath, ...args], { cwd, env: clean, encoding: 'utf8' });
  const made = fs.existsSync(path.join(cwd, 'out'));
  fs.rmSync(cwd, { recursive: true, force: true });
  return { status: r.status, text: `${r.stdout}\n${r.stderr}`, made };
}

test('CLI: typos exit 2 with a named cause and create no output directory', () => {
  let r = run(['--in', 'body.md', '--out', 'out', '--format', 'docx,xyz']);
  assert.equal(r.status, 2);
  assert.match(r.text, /Unsupported --format value: xyz/);
  assert.equal(r.made, false);
  r = run(['--in', 'body.md', '--out', 'out', '--archetype', 'runbok']);
  assert.equal(r.status, 2);
  assert.match(r.text, /Unknown archetype: runbok/);
  assert.doesNotMatch(r.text, /SN_AGENT_HOME/);
  assert.equal(r.made, false);
  r = run(['--in', 'body.md', '--out', 'out', '--archetype', 'runbook']);
  assert.equal(r.status, 2);
  assert.match(r.text, /Set SN_AGENT_HOME/);
  assert.equal(r.made, false);
  r = run(['--in', 'body.md', '--format']);
  assert.equal(r.status, 2);
  assert.match(r.text, /Missing value for --format/);
});

test('CLI: a scoped --check exits non-zero when the selection cannot render', () => {
  const r = run(['--check', '--archetype', 'runbook']);
  assert.equal(r.status, 2);
  assert.match(r.text, /Backend: python \(NOT READY, optional\)/);
  assert.match(r.text, /Selected: backend=python archetype=runbook formats=pdf,docx\nNOT READY — /);
});

test('dispatcher never prints or spawns a package-manager launcher', () => {
  assert.doesNotMatch(source, /npm\.cmd|npx\.cmd|shell:\s*true|install -g|\$SnDoc|via the resolver/);
  assert.doesNotMatch(source, /spawnSync\(\s*['"`]?npm/);
});

test('documents describe the tool that ships', () => {
  const skill = doc('SKILL.md'), install = doc('install.md'), archetypes = doc('archetypes.md');
  for (const text of [skill, install, archetypes]) {
    assert.doesNotMatch(text, /\$SnDoc|\$SnCapture|capture\.js\b|--meta-[a-z]/);
    // Same-directory links resolve.
    for (const [, link] of text.matchAll(/\]\(([a-z][\w.-]*\.(?:md|js|cjs|py|json|txt))\)/g)) assert.ok(fs.existsSync(path.join(skillDir, link)), link);
  }
  // Every command block carries the full installed path (no cross-call variable).
  for (const text of [skill, install]) {
    for (const [, line] of text.matchAll(/^(node .*(?:render\.js|capture\.cjs).*)$/gm)) {
      assert.match(line, /^node "\$env:USERPROFILE\\\.agents\\skills\\sn-doc-export\\(?:render\.js|capture\.cjs)" /, line);
    }
  }
  assert.match(skill, /confirmed project directory \(project `cwd`\)/);
  // Output strings quoted in the docs exist in the tools.
  const py = fs.readFileSync(path.join(skillDir, 'render.py'), 'utf8');
  for (const quoted of ['READY — node backend available for PDF/DOCX.', 'READY — the selected backend and formats can render.',
    'Backend: python (NOT READY, optional)', 'no installed browser found', 'image not found', '--image-map target not found',
    'Unsupported --format value', 'Unknown archetype']) {
    assert.ok(source.includes(quoted.replace('Backend: python (NOT READY, optional)', '(NOT READY, optional)')), quoted);
    assert.ok(install.includes(quoted) || skill.includes(quoted) || archetypes.includes(quoted), `documented: ${quoted}`);
  }
  assert.ok(source.includes('— not installed (searched: cwd') || source.includes('not installed (searched: cwd'));
  assert.match(install, /`md-to-pdf — not installed`/);
  assert.doesNotMatch(install, /\[MISSING\] (?:md-to-pdf|@adobe)/);
  assert.match(py, /"MISSING"/);
  assert.match(py, /READY — preflight passed\./);
  assert.doesNotMatch(install, /bundled Chromium \(fallback\)/);
  // The archetype list in the docs is the one the dispatcher validates.
  const names = source.match(/const PYTHON_ARCHETYPES = \[([\s\S]*?)\];/)[1].match(/'[a-z_]+'/g).map(s => s.slice(1, -1));
  for (const name of names) {
    assert.ok(skill.includes('`' + name + '`'), `SKILL.md lists ${name}`);
    assert.ok(archetypes.includes('| `' + name + '` |'), `archetypes.md lists ${name}`);
    assert.ok(py.includes(`"${name}"`), `render.py accepts ${name}`);
  }
  // Screenshot guidance states the credential scope the helper enforces.
  assert.match(skill, /refuses any other host/);
  assert.match(skill, /never to third-party subresources or cross-origin redirects/);
  // Python dependency floor is satisfiable together with docutils>=0.22.
  assert.match(doc('requirements.txt'), /^myst-parser>=5\.0$/m);
  assert.match(py, /myst-parser>=5\.0/);
});
