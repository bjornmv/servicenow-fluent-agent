'use strict';
// Offline checks of the Node dispatcher: Markdown preprocessing, argument
// validation, preflight exit status and the doc-to-tool contract. No renderer
// packages, browser, npm, SDK or network are needed.
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
  frames: require(path.join(skillDir, 'frames.cjs')),
});
vm.runInContext([
  "const IMG_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg' };",
  "const VALID_FORMATS = ['pdf', 'docx', 'html'];",
  "const ARCHETYPE_NAMES = Object.keys(frames.ARCHETYPES);",
  source.match(/^const IMG_RE = .*$/m)[0],
  ...['splitFences', 'splitCode', 'mapOutsideCode', 'rewriteImageSources', 'expandAdmonitions',
    'resolveRelativeImages', 'parseFormats', 'resolveArchetype', 'prepareDocument', 'slugify', 'escapeHtml'].map(slice),
  'globalThis.api = { splitFences, splitCode, rewriteImageSources, expandAdmonitions, resolveRelativeImages, parseFormats, resolveArchetype, prepareDocument, slugify, escapeHtml };',
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

test('a callout that contains a fenced code block is converted with the code inside it', () => {
  const md = [':::{warning} Don\'t run this in production', 'Back up first.', '', '- First', '', '```js', 'var gr = new GlideRecord(\'cmdb_ci\');', ':::', '```', ':::', 'After', ''].join('\n');
  const out = api.expandAdmonitions(md);
  assert.match(out, /<strong style="color:#f59e0b">Don't run this in production<\/strong>\n\nBack up first\.\n\n- First\n\n```js\nvar gr = new GlideRecord\('cmdb_ci'\);\n:::\n```\n\n<\/div>\n\nAfter/);
  assert.doesNotMatch(out, /:::\{warning\}/);
  const boxes = [];
  assert.match(api.expandAdmonitions(md, boxes), /\u27e6sn-box:0\u27e7\n\nBack up first\.[^]*```\n\n\u27e6\/sn-box\u27e7\n\nAfter/);
  assert.equal(boxes.length, 1);
  // An unclosed callout is left as written.
  assert.equal(api.expandAdmonitions(':::{note}\nNo end\n```\n:::\n```\n'), ':::{note}\nNo end\n```\n:::\n```\n');
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

test('DOCX callouts become numbered box markers; PDF/HTML keep the coloured div', () => {
  const boxes = [];
  const out = api.expandAdmonitions(':::{warning} Mind the gap\nBody.\n:::\n\n:::{bogus}\nX\n:::\n', boxes);
  assert.match(out, /\u27e6sn-box:0\u27e7\n\nBody\.\n\n\u27e6\/sn-box\u27e7/);
  assert.match(out, /\u27e6sn-box:1\u27e7\n\nX\n/);
  assert.deepEqual(plain(boxes), [{ kind: 'warning', title: 'Mind the gap', color: '#f59e0b' }, { kind: 'note', title: 'Note', color: '#2563eb' }]);
  assert.doesNotMatch(out, /<div/);
});

test('front matter and --meta resolve metadata; required keys are enforced with a named list', () => {
  const runbook = api.resolveArchetype('runbook', null).cfg;
  let r = api.prepareDocument('---\ntitle: Front title\naudience: Admins\ndest: C:/elsewhere/out.pdf\n---\n# Body\n', runbook, {}, 'docs/in.md');
  assert.equal(r.error, undefined);
  assert.equal(r.doc.title, 'Front title');
  assert.equal(r.doc.body, '# Body\n', 'front matter never reaches the renderers');
  assert.match(r.warnings.join('\n'), /not used by archetype runbook: dest/);
  r = api.prepareDocument('---\ntitle: Incident #42 fix\naudience: Ops\n---\nx\n', runbook, {}, 'docs/in.md');
  assert.equal(r.doc.meta.title, 'Incident');
  assert.match(r.warnings.join('\n'), /front matter title: text after ' #' was read as a comment and dropped; quote the value to keep it/);
  r = api.prepareDocument('---\naudience: Admins\n---\n', runbook, { title: 'CLI title' }, 'docs/in.md');
  assert.equal(r.doc.meta.title, 'CLI title');
  r = api.prepareDocument('# Heading Title\n\ntext\n', runbook, {}, 'docs/in.md');
  assert.match(r.error, /^Archetype runbook: missing required metadata: audience\. .*--meta 'key=value'\. No output written\.$/);
  r = api.prepareDocument('text\n', runbook, {}, 'docs/in.md');
  assert.match(r.error, /missing required metadata: title, audience\./);
  // H1 title: used for the cover and removed from the body; the file name still names the output.
  r = api.prepareDocument('# Heading Title\n\ntext\n', runbook, { audience: 'Ops' }, 'docs/in.md');
  assert.equal(r.doc.meta.title, 'Heading Title');
  assert.equal(r.doc.title, 'in');
  assert.doesNotMatch(r.doc.body, /Heading Title/);
  const plainCfg = api.resolveArchetype('plain', null).cfg;
  r = api.prepareDocument('# Heading Title\n\ntext\n', plainCfg, {}, 'docs/in.md');
  assert.match(r.doc.body, /^# Heading Title/, 'plain has no cover, so the H1 stays');
});

test('formats and archetypes are validated; the python backend is gone', () => {
  assert.deepEqual(plain(api.parseFormats('PDF, docx,pdf')), { formats: ['pdf', 'docx'] });
  assert.match(api.parseFormats('docx,pfd').error, /Unsupported --format value: pfd\. Valid formats: pdf, docx, html\./);
  assert.match(api.parseFormats(' , ').error, /\(empty\)/);
  assert.equal(api.resolveArchetype('runbook', null).cfg.name, 'runbook');
  assert.equal(api.resolveArchetype('runbook', null).note, null);
  assert.equal(api.resolveArchetype('compliance', null).cfg.name, 'compliance_report');
  assert.match(api.resolveArchetype('runbok', null).error, /Unknown archetype: runbok\. Valid values: plain, knowledge_article, runbook, compliance_report,/);
  assert.match(api.resolveArchetype('runbook', 'python').error, /python backend was removed; all archetypes render in Node/);
  assert.match(api.resolveArchetype('runbook', 'node').note, /no longer needed/);
  assert.match(api.resolveArchetype('plain', 'nodejs').error, /Unknown backend: nodejs/);
  assert.equal(api.slugify('Example App Guide'), 'example-app-guide');
  assert.equal(api.slugify('Blåbær integration'), 'blabaer-integration');
  assert.equal(api.slugify('Årsrapport for Økonomi'), 'arsrapport-for-okonomi');
  assert.equal(api.slugify('Crème brûlée — Straße'), 'creme-brulee-strasse');
  const long = api.slugify('Recovering from the nightly overwrite that clobbers support groups across all configuration items');
  assert.ok(long.length <= 80 && !long.endsWith('-'), long);
  assert.equal(long, 'recovering-from-the-nightly-overwrite-that-clobbers-support-groups-across-all');
  assert.equal(api.escapeHtml('A <b> & c'), 'A &lt;b&gt; &amp; c');
});

function run(args, env = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-cli-'));
  fs.writeFileSync(path.join(cwd, 'body.md'), '# T\n');
  const clean = { ...process.env, NODE_PATH: '', npm_config_prefix: '', ...env };
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
  assert.equal(r.made, false);
  r = run(['--in', 'body.md', '--out', 'out', '--archetype', 'runbook']);
  assert.equal(r.status, 2);
  assert.match(r.text, /Archetype runbook: missing required metadata: audience\./);
  assert.equal(r.made, false);
  r = run(['--in', 'body.md', '--out', 'out', '--backend', 'python']);
  assert.equal(r.status, 2);
  assert.match(r.text, /python backend was removed; all archetypes render in Node/);
  assert.equal(r.made, false);
  r = run(['--in', 'body.md', '--format']);
  assert.equal(r.status, 2);
  assert.match(r.text, /Missing value for --format/);
});

test('CLI: --meta keys are normalized like front-matter keys', () => {
  const r = run(['--in', 'body.md', '--out', 'out', '--archetype', 'compliance_report', '--format', 'pdf', '--browser', 'no-such-browser',
    '--meta', 'Control-ID=AC-2', '--meta-Framework', 'NIST']);
  assert.doesNotMatch(r.text, /missing required metadata|not used by archetype/, r.text);
  assert.match(r.text, /Archetype: compliance_report/);
  assert.equal(r.made, false);
});

test('CLI: a scoped --check exits non-zero when the selection cannot render', () => {
  const r = run(['--check', '--archetype', 'compliance']);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.text, /python|SN_AGENT_HOME/i);
  assert.match(r.text, /Selected: archetype=compliance_report formats=pdf,docx required metadata: title, control_id, framework\nNOT READY — /);
});

test('CLI: --browser overrides SN_DOC_BROWSER for the run and is reported on the browser line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-browser-'));
  try {
    const chosen = path.join(dir, 'chosen browser');
    fs.writeFileSync(chosen, '', { mode: 0o755 });
    const env = { SN_DOC_BROWSER: path.join(dir, 'env-browser'), PUPPETEER_EXECUTABLE_PATH: '' };
    fs.writeFileSync(env.SN_DOC_BROWSER, '');
    let r = run(['--check', '--format', 'pdf,docx', '--browser', chosen], env);
    assert.ok(r.text.includes(`browser: ${chosen}  (--browser)`), r.text);
    assert.doesNotMatch(r.text, /env-browser/);
    r = run(['--check', '--format', 'pdf', '--browser', path.join(dir, 'missing')], env);
    assert.equal(r.status, 2);
    assert.match(r.text, /\[BAD\] browser: --browser path not found: .*missing/);
    assert.doesNotMatch(r.text, /env-browser/, 'no fallback to SN_DOC_BROWSER');
    r = run(['--check', '--format', 'pdf', '--browser', dir], env);
    assert.equal(r.status, 2);
    assert.match(r.text, /\[BAD\] browser: --browser path is not an executable file: /);
    assert.doesNotMatch(r.text, /env-browser/, 'a directory is not a browser and has no fallback');
    for (const bad of [[], [''], ['--check']]) {
      r = run(['--check', '--format', 'pdf', '--browser', ...bad], env);
      assert.equal(r.status, 2, `--browser ${JSON.stringify(bad)}`);
      assert.match(r.text, /Missing value for --browser/);
      assert.doesNotMatch(r.text, /env-browser/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --node-path is searched first for the packages and must be a directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-nodepath-'));
  try {
    const root = path.join(dir, 'global modules');
    fs.mkdirSync(root);
    let r = run(['--check', '--format', 'docx', '--node-path', root]);
    assert.ok(r.text.includes(`searched: cwd, ${root}`), r.text);
    r = run(['--check', '--node-path', path.join(dir, 'missing')]);
    assert.equal(r.status, 2);
    assert.match(r.text, /--node-path is not a directory: .*missing/);
    for (const bad of [[], [''], ['--check']]) {
      r = run(['--check', '--node-path', ...bad]);
      assert.equal(r.status, 2, `--node-path ${JSON.stringify(bad)}`);
      assert.match(r.text, /Missing value for --node-path/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  // Every helper command is the one OS-neutral dispatcher line (no cross-call variable, no per-shell path).
  for (const text of [skill, install]) {
    assert.doesNotMatch(text, /node .*(?:render\.js|capture\.cjs)|\.agents[\\/]skills[\\/]sn-doc-export[\\/](?:render\.js|capture\.cjs)/);
    for (const [, line] of text.matchAll(/^(sn-skill .*)$/gm)) assert.match(line, /^sn-skill doc-(?:render|capture) --/, line);
  }
  assert.ok((skill.match(/^sn-skill doc-(?:render|capture) /gm) || []).length >= 3, 'SKILL.md commands use sn-skill');
  assert.match(skill, /^sn-skill doc-capture --url '[^']+' --out "docs\/screenshots\/<name>\.png"/m, 'file path double-quoted, URL single-quoted');
  assert.match(skill, /confirmed project directory \(project `cwd`\)/);
  // Output strings quoted in the docs exist in the tools.
  for (const quoted of ['READY — the selected archetype and formats can render.', 'no installed browser found', 'image not found',
    '--image-map target not found', 'Unsupported --format value', 'Unknown archetype', 'missing required metadata']) {
    assert.ok(source.includes(quoted), quoted);
    assert.ok(install.includes(quoted) || skill.includes(quoted) || archetypes.includes(quoted), `documented: ${quoted}`);
  }
  assert.ok(source.includes('not installed (searched: cwd'));
  assert.match(install, /`md-to-pdf — not installed`/);
  assert.doesNotMatch(install, /\[MISSING\] (?:md-to-pdf|@adobe)/);
  assert.doesNotMatch(install, /bundled Chromium \(fallback\)/);
  // Browser selection is one OS-neutral command, with the flag the dispatcher parses.
  assert.match(install, /^sn-skill doc-render --check --format 'pdf,docx' --browser "<browser-path>"$/m);
  assert.doesNotMatch(install, /\$env:SN_DOC_BROWSER|SN_DOC_BROWSER=/);
  assert.match(source, /case '--browser':/);
  // The Python backend is gone from the tool and the skill entry points.
  for (const gone of ['render.py', 'requirements.txt']) assert.equal(fs.existsSync(path.join(skillDir, gone)), false, gone);
  assert.doesNotMatch(source, /SN_AGENT_HOME|render\.py|spawnSync\(py/);
  const refs = [doc('references/markdown-and-options.md'), doc('references/screenshots.md')];
  for (const text of [skill, install, archetypes, ...refs]) {
    assert.doesNotMatch(text, /SN_AGENT_HOME|--backend|[Pp]ython|WeasyPrint|SNagent|requirements\.txt/);
    // One OS-neutral form: no PowerShell/bash twin blocks.
    assert.doesNotMatch(text, /^```(?:powershell|bash)$/m);
  }
  for (const file of ['README.md', 'docs/technical-guide.md', 'docs/uninstall.md']) {
    assert.doesNotMatch(fs.readFileSync(path.join(skillDir, '../../../..', file), 'utf8'), /SN_AGENT_HOME|test_python_home/, file);
  }
  // Values with quote marks cannot be quoted on the command line (sdk-commands.md): they go in front matter.
  for (const text of [skill, archetypes]) assert.match(text, /apostrophes or quotes/);
  // The archetype table in the docs is the registry the renderer validates.
  const frames = require(path.join(skillDir, 'frames.cjs'));
  for (const [name, a] of Object.entries(frames.ARCHETYPES)) {
    assert.ok(skill.includes('`' + name + '`'), `SKILL.md lists ${name}`);
    const row = archetypes.split('\n').find(l => l.startsWith('| `' + name + '` |'));
    assert.ok(row, `archetypes.md lists ${name}`);
    const cells = row.split('|').map(c => c.trim());
    assert.equal(cells[2], a.cover, `${name} cover`);
    assert.equal(cells[3], a.required.map(k => '`' + k + '`').join(', ') || '—', `${name} required metadata`);
  }
  // Screenshot guidance states the credential scope the helper enforces.
  assert.match(skill, /refuses any other host/);
  assert.match(skill, /never to third-party subresources or cross-origin redirects/);
});
