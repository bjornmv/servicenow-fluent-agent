'use strict';
// Exercise the dispatcher's isolated path gate without importing renderer deps,
// invoking Python/npm/SDK, or running the CLI's main function.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../../payload/.agents/skills/sn-doc-export/render.js'), 'utf8');
const start = source.indexOf('function pythonHomeIssue() {');
const end = source.indexOf('\nfunction preflightPython()', start);
assert.ok(start >= 0 && end > start, 'dispatcher exposes the expected isolated gate');
const gate = source.slice(start, end);
function issue(home) {
  return vm.runInNewContext(`${gate}\npythonHomeIssue()`, {
    SN_AGENT_HOME: home, isAbsolute: path.isAbsolute, join: path.join, statSync: fs.statSync,
  });
}

test('Python backend rejects unset, whitespace and relative homes', () => {
  assert.match(issue(''), /no default/);
  assert.match(issue('  '), /no default/);
  assert.match(issue('relative-backend'), /absolute path/);
});

test('Python backend requires the explicit complete directory layout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-home-'));
  try {
    assert.match(issue(path.join(root, 'missing')), /readable tools\/_doc_lib/);
    assert.match(issue(root), /readable tools\/_doc_lib/);
    fs.mkdirSync(path.join(root, 'tools'));
    fs.writeFileSync(path.join(root, 'tools', '_doc_lib'), 'not a directory');
    assert.match(issue(root), /directory not found/);
    fs.unlinkSync(path.join(root, 'tools', '_doc_lib'));
    fs.mkdirSync(path.join(root, 'tools', '_doc_lib'));
    assert.equal(issue(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('both Python entry paths validate before interpreter discovery', () => {
  for (const name of ['preflightPython', 'renderPython']) {
    const begin = source.indexOf(`function ${name}(`);
    const next = source.indexOf('\nfunction ', begin + 1);
    const body = source.slice(begin, next < 0 ? source.length : next);
    assert.ok(body.indexOf('pythonHomeIssue()') >= 0);
    assert.ok(body.indexOf('pythonHomeIssue()') < body.indexOf("which('python')"));
  }
});
