'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonc, setJsoncValue } = require('../../lib/jsonc-settings.cjs');

test('JSONC edits preserve comments, sibling bytes, BOM and trailing commas', () => {
  const original = '\ufeff{\r\n  // settings\r\n  "profiles": {\r\n    "Other": {"path":"keep.exe"}, // keep this\r\n    "Managed": { "args": ["-NoProfile",], },\r\n  },\r\n  "url": "https://example.test/a//b", /* unchanged */\r\n}\r\n';
  const result = setJsoncValue(original, ['profiles', 'Managed', 'env', 'Path'], 'C:\\Git\\cmd;${env:Path}');
  assert.equal(parseJsonc(result).profiles.Managed.env.Path, 'C:\\Git\\cmd;${env:Path}');
  assert.ok(result.startsWith('\ufeff{\r\n  // settings\r\n'));
  assert.ok(result.includes('"Other": {"path":"keep.exe"}, // keep this'));
  assert.ok(result.includes('"args": ["-NoProfile",],'));
  assert.ok(result.includes('"url": "https://example.test/a//b", /* unchanged */'));
  assert.equal(setJsoncValue(result, ['profiles', 'Managed', 'env', 'Path'], 'C:\\Git\\cmd;${env:Path}'), result);
});

test('replacement edits only the selected value', () => {
  const original = '{ "a": {"p":"old" /* preserve */}, "b": [1,2,] }';
  const result = setJsoncValue(original, ['a', 'p'], 'new\\quoted"value');
  assert.equal(result, original.replace('"old"', JSON.stringify('new\\quoted"value')));
});

test('insertion places missing commas before line comments', () => {
  const result = setJsoncValue('{\n "a": 1 // comment\n}', ['b'], true);
  assert.deepEqual(parseJsonc(result), { a: 1, b: true });
  assert.ok(result.includes('"a": 1, // comment'));
});

test('empty documents, inline objects and nested objects round-trip', () => {
  for (const source of ['', '\ufeff', '// header', '{}', '{ /* comment */ }', '{"x":1}', '{"x":1,}']) {
    const result = setJsoncValue(source, ['terminal.profiles', 'Managed', 'env', 'Path'], 'git');
    assert.equal(parseJsonc(result)['terminal.profiles'].Managed.env.Path, 'git');
  }
});

test('malformed, ambiguous and incompatible settings fail closed', () => {
  for (const source of ['{"a":', '{"a":1,,}', '{"a":NaN}', '{/* unterminated', '{"a":01}']) {
    assert.throws(() => parseJsonc(source));
  }
  assert.throws(() => setJsoncValue('{"a":{},"a":{}}', ['a', 'b'], 1), /Duplicate/);
  for (const value of [null, 1, [], 'text']) {
    assert.throws(() => setJsoncValue(JSON.stringify({ a: value }), ['a', 'b'], true), /Non-object/);
  }
  assert.throws(() => setJsoncValue('{}', ['a'], undefined), /JSON-compatible/);
  assert.throws(() => setJsoncValue('{}', ['a'], NaN), /JSON-compatible/);
});

test('JSON keys and escaped strings cannot alter prototypes or comment parsing', () => {
  const result = setJsoncValue('{"quoted\\\"key":"/* not a comment */"}', ['__proto__', 'value'], 'ok');
  assert.equal(parseJsonc(result).__proto__.value, 'ok');
  assert.equal({}.value, undefined);
  assert.equal(parseJsonc(result)['quoted"key'], '/* not a comment */');
});
