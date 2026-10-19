'use strict';

// `sn-skill zip`: the dependency-free zip reader (list/extract, stored + deflate) and its
// refusals (traversal, absolute/drive paths, symlinks, zip64, encryption, non-empty --out,
// size limits and zip bombs).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const tools = path.join(repoRoot, 'payload', '.agents', 'tools');
const zipScript = path.join(tools, 'sn-zip.cjs');
const dispatcher = path.join(tools, 'sn-skill.cjs');
const { crc32, unsafeName, checkLimits } = require(zipScript);

// Minimal zip writer. entry: { name, data, method (0|8), mode (unix st_mode), flags, extra,
// csize/usize (declared sizes, to fake huge entries without huge data) }
function makeZip(entries, { zip64Locator = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data ?? '');
    const method = e.method ?? 8;
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const name = Buffer.from(e.name, 'utf8');
    const extra = e.extra ?? Buffer.alloc(0);
    const flags = (e.flags ?? 0) | 0x800;
    const crc = e.crc ?? crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8); local.writeUInt32LE(crc, 14);
    const csize = e.csize ?? body.length;
    const usize = e.usize ?? data.length;
    local.writeUInt32LE(csize, 18); local.writeUInt32LE(usize, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.mode !== undefined ? (3 << 8) | 20 : 20, 4);
    central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(csize, 20); central.writeUInt32LE(usize, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(e.mode !== undefined ? (e.mode << 16) >>> 0 : 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name, extra);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  const locator = Buffer.alloc(zip64Locator ? 20 : 0);
  if (zip64Locator) locator.writeUInt32LE(0x07064b50, 0);
  return Buffer.concat([...locals, cd, locator, eocd]);
}

function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-zip-test-'));
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const run = (args, options = {}) => spawnSync(process.execPath, [zipScript, ...args], { encoding: 'utf8', ...options });
function writeZip(dir, entries, options) {
  const file = path.join(dir, 'app_1.0.0.zip');
  fs.writeFileSync(file, makeZip(entries, options));
  return file;
}

const sample = [
  { name: 'app/', method: 0 },
  { name: 'app/readme.txt', data: 'stored text æøå\n', method: 0 },
  { name: 'app/records/sys_script_include_x.xml', data: '<record>' + 'x'.repeat(5000) + '</record>\n', method: 8 },
  { name: 'empty.txt', data: '', method: 8 },
];

test('writer self-check: crc32 matches the known value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('list prints sizes and names, one per line, with a total', () => withTemp(dir => {
  const zip = writeZip(dir, sample);
  const result = run(['list', zip]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trimEnd().split('\n');
  assert.match(lines[0], /^\s+-  app\/$/);
  assert.match(lines[1], new RegExp(`^\\s+${Buffer.byteLength('stored text æøå\n')}  app/readme.txt$`));
  assert.match(lines[2], /^\s+5018  app\/records\/sys_script_include_x\.xml$/);
  assert.match(lines[3], /^\s+0  empty\.txt$/);
  assert.equal(lines[4], `3 files, ${Buffer.byteLength('stored text æøå\n') + 5018} bytes`);
  assert.equal(fs.readdirSync(dir).length, 1, 'list writes nothing');
}));

test('extract --out unpacks stored and deflate entries byte-exactly', () => withTemp(dir => {
  const zip = writeZip(dir, sample);
  const out = path.join(dir, 'out', 'nested');
  const result = run(['extract', zip, '--out', out]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(out, 'app', 'readme.txt'), 'utf8'), 'stored text æøå\n');
  assert.equal(fs.readFileSync(path.join(out, 'app', 'records', 'sys_script_include_x.xml'), 'utf8'), sample[2].data);
  assert.equal(fs.readFileSync(path.join(out, 'empty.txt'), 'utf8'), '');
  assert.equal(result.stdout, `extracted 3 files, ${Buffer.byteLength('stored text æøå\n') + 5018} bytes\n${fs.realpathSync(out)}\n`);
}));

test('extract without --out creates a fresh temp folder and prints it', () => withTemp(dir => {
  const zip = writeZip(dir, sample);
  const result = run(['extract', zip]);
  assert.equal(result.status, 0, result.stderr);
  const printed = result.stdout.trimEnd().split('\n').pop();
  try {
    assert.ok(path.isAbsolute(printed));
    assert.ok(printed.startsWith(fs.realpathSync(os.tmpdir())), printed);
    assert.equal(fs.readFileSync(path.join(printed, 'app', 'readme.txt'), 'utf8'), 'stored text æøå\n');
  } finally { fs.rmSync(printed, { recursive: true, force: true }); }
}));

test('a non-empty or non-folder --out is refused with exit 2 and left untouched', () => withTemp(dir => {
  const zip = writeZip(dir, sample);
  const busy = path.join(dir, 'busy');
  fs.mkdirSync(busy);
  fs.writeFileSync(path.join(busy, 'keep.txt'), 'mine');
  const result = run(['extract', zip, '--out', busy]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /is not empty.*Nothing was written/);
  assert.deepEqual(fs.readdirSync(busy), ['keep.txt']);
  assert.equal(run(['extract', zip, '--out', zip]).status, 2, 'a file as --out');
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty);
  assert.equal(run(['extract', zip, '--out', empty]).status, 0, 'an existing empty folder is fine');
}));

test('traversal, absolute, drive-letter and backslash names are refused before any write', () => withTemp(dir => {
  for (const name of ['../evil.txt', 'a/../../evil.txt', '/etc/evil', 'C:/evil.txt', 'c:evil', 'a\\..\\evil.txt', 'a//b', './a', 'a/./b', 'a:stream']) {
    const zip = writeZip(dir, [{ name: 'ok.txt', data: 'fine' }, { name, data: 'evil' }]);
    const out = path.join(dir, 'out');
    for (const args of [['list', zip], ['extract', zip, '--out', out]]) {
      const result = run(args);
      assert.equal(result.status, 2, `${name}: ${args[0]}`);
      assert.match(result.stderr, /unsafe entry/, name);
      assert.equal(result.stdout, '', name);
    }
    assert.equal(fs.existsSync(out), false, `${name}: nothing written`);
    assert.equal(fs.existsSync(path.join(dir, 'evil.txt')), false);
  }
  assert.equal(unsafeName('app/records/x.xml'), '');
  assert.equal(unsafeName('dir/'), '');
}));

test('symlinks, zip64, encryption, unknown methods and duplicates exit 2', () => withTemp(dir => {
  const cases = [
    [[{ name: 'link', data: '/etc/passwd', method: 0, mode: 0o120777 }], /symbolic link/],
    [[{ name: 'a.txt', data: 'x' }], /zip64/, { zip64Locator: true }],
    [[{ name: 'a.txt', data: 'x', extra: Buffer.from([1, 0, 0, 0]) }], /zip64/],
    [[{ name: 'a.txt', data: 'x', flags: 1 }], /encrypted/],
    [[{ name: 'a.txt', data: 'x', method: 12 }], /compression method 12/],
    [[{ name: 'A.txt', data: 'x' }, { name: 'a.txt', data: 'y' }], /duplicate entry/],
    [[{ name: 'a', data: 'x' }, { name: 'a/b', data: 'y' }], /inside a file entry/],
  ];
  for (const [entries, message, options] of cases) {
    const zip = writeZip(dir, entries, options);
    const result = run(['extract', zip, '--out', path.join(dir, 'out')]);
    assert.equal(result.status, 2, String(message));
    assert.match(result.stderr, message);
    assert.equal(fs.existsSync(path.join(dir, 'out')), false);
  }
}));

test('corrupt data exits 1 and removes partial output; missing or non-zip input exits 1', () => withTemp(dir => {
  const zip = writeZip(dir, [{ name: 'good.txt', data: 'fine' }, { name: 'bad.txt', data: 'payload', crc: 1 }]);
  const out = path.join(dir, 'out');
  const result = run(['extract', zip, '--out', out]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CRC mismatch for "bad\.txt"/);
  assert.equal(fs.existsSync(out), false, 'partial output removed');
  assert.equal(run(['list', path.join(dir, 'missing.zip')]).status, 1);
  fs.writeFileSync(path.join(dir, 'plain.zip'), 'not a zip at all');
  const notZip = run(['list', path.join(dir, 'plain.zip')]);
  assert.equal(notZip.status, 1);
  assert.match(notZip.stderr, /not a zip archive/);
}));

test('usage errors exit 2; --help exits 0', () => {
  for (const args of [[], ['nope'], ['list'], ['list', 'a.zip', 'b.zip'], ['list', 'a.zip', '--out', 'x'], ['extract', 'a.zip', '--out'], ['extract', 'a.zip', '--force']]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(' '));
    assert.match(result.stderr, /Usage: sn-skill zip/);
  }
  assert.equal(run(['--help']).status, 0);
});

test('sn-skill zip dispatches to the helper with exit evidence', () => withTemp(dir => {
  const zip = writeZip(dir, sample);
  const result = spawnSync(process.execPath, [dispatcher, 'zip', 'list', zip], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /app\/readme\.txt/);
  assert.equal(result.stderr, 'sn-skill: zip exit=0\n');
}));

test('names Windows would rewrite, reject or treat as devices are refused with exit 2', () => withTemp(dir => {
  for (const name of ['.../evil.txt', '.. /evil.txt', 'a./b.txt', 'a /b.txt', 'b.txt.', 'b.txt ', 'a?b.txt', 'a*b', 'a<b', 'a>b', 'a|b', 'a"b', 'NUL', 'dir/con.txt', 'Com1.log', 'lpt9']) {
    const zip = writeZip(dir, [{ name: 'ok.txt', data: 'fine' }, { name, data: 'evil' }]);
    const result = run(['extract', zip, '--out', path.join(dir, 'out')]);
    assert.equal(result.status, 2, name);
    assert.match(result.stderr, /unsafe entry/, name);
    assert.equal(fs.existsSync(path.join(dir, 'out')), false, `${name}: nothing written`);
  }
  for (const name of ['.gitignore', 'a.b/c.d', 'console.txt', 'nul2/x', 'com10.txt']) assert.equal(unsafeName(name), '', name);
}));

test('a fake end-of-central-directory record in the comment does not hide entries', () => withTemp(dir => {
  const base = makeZip(sample);
  const fake = Buffer.alloc(22);
  fake.writeUInt32LE(0x06054b50, 0); // count 0, offset 0: an "empty archive" inside the comment
  const comment = Buffer.concat([Buffer.from('built by test '), fake]);
  base.writeUInt16LE(comment.length, base.length - 2);
  const zip = path.join(dir, 'commented.zip');
  fs.writeFileSync(zip, Buffer.concat([base, comment]));
  const result = run(['list', zip]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^3 files, /m);
}));

test('entries with a data descriptor (flag bit 3, zero local sizes) use the central directory', () => withTemp(dir => {
  const buf = makeZip([{ name: 'stream.txt', data: 'streamed '.repeat(500), flags: 0x08 }]);
  buf.fill(0, 14, 26); // local crc, compressed and uncompressed size left blank as streaming writers do
  const zip = path.join(dir, 'stream.zip');
  fs.writeFileSync(zip, buf);
  const out = path.join(dir, 'out');
  const result = run(['extract', zip, '--out', out]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(out, 'stream.txt'), 'utf8'), 'streamed '.repeat(500));
}));

test('a 20,000-entry archive lists quickly (no quadratic nesting check)', () => withTemp(dir => {
  const entries = Array.from({ length: 20000 }, (_, i) => ({ name: `a/b/c/d/e/${i}.txt`, method: 0 }));
  const zip = writeZip(dir, entries);
  const started = Date.now();
  const result = run(['list', zip]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^20000 files, 0 bytes$/m);
  assert.ok(Date.now() - started < 10000, `took ${Date.now() - started} ms`);
}));

test('extract refuses archives over the size limits before writing; list still lists them', () => withTemp(dir => {
  const MiB = 1024 * 1024;
  const cases = [
    [[{ name: 'big.bin', usize: 1024 * MiB + 1, csize: 8 * MiB }], /declares 1073741825 bytes; the limit is 1 GiB per entry/],
    [[{ name: 'a.bin', usize: 600 * MiB, csize: 4 * MiB }, { name: 'b.bin', usize: 600 * MiB, csize: 4 * MiB }], /the limit is 1 GiB in total/],
    [[{ name: 'bomb.bin', usize: 20 * MiB, csize: 1000 }], /over 200:1 .*possible zip bomb/],
  ];
  for (const [entries, message] of cases) {
    const zip = writeZip(dir, entries);
    const out = path.join(dir, 'out');
    const result = run(['extract', zip, '--out', out]);
    assert.equal(result.status, 2, String(message));
    assert.match(result.stderr, message);
    assert.match(result.stderr, /Nothing was written/);
    assert.equal(fs.existsSync(out), false, `${message}: nothing written`);
    assert.equal(run(['list', zip]).status, 0, `${message}: list still works`);
  }
  // High ratio is fine under 10 MiB, and 10 MiB of real zeros (about 1000:1) is refused.
  assert.doesNotThrow(() => checkLimits([{ name: 'small', usize: 5 * MiB, csize: 10 }]));
  const zeros = writeZip(dir, [{ name: 'zeros.bin', data: Buffer.alloc(11 * MiB) }]);
  assert.equal(run(['extract', zeros, '--out', path.join(dir, 'out')]).status, 2);
  assert.throws(() => checkLimits(Array.from({ length: 100001 }, (_, i) => ({ name: `${i}`, dir: false, usize: 0, csize: 0 }))), /100001 entries; the limit is 100000/);
}));

test('many entries under 10 MiB each are still refused over 200:1 for the whole archive', () => {
  const MiB = 1024 * 1024;
  const split = Array.from({ length: 100 }, (_, i) => ({ name: `part${i}.bin`, usize: 10 * MiB - 1, csize: 10000 }));
  assert.throws(() => checkLimits(split, 1029302), /archive expands 1029302 to 1048575900 bytes \(over 200:1 in total; possible zip bomb\)/);
  assert.doesNotThrow(() => checkLimits(split.slice(0, 2), 2 * 10 * MiB), 'ordinary ratio passes');
});

test('central-directory records that share one local entry are refused before writing', () => withTemp(dir => {
  const buf = makeZip(['a.txt', 'b.txt', 'c.txt'].map(name => ({ name, data: 'same payload '.repeat(100) })));
  // Point every central record at the first local entry.
  for (let p = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); p >= 0; p = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), p + 4)) buf.writeUInt32LE(0, p + 42);
  const zip = path.join(dir, 'overlap.zip');
  fs.writeFileSync(zip, buf);
  const out = path.join(dir, 'out');
  const result = run(['extract', zip, '--out', out]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /entries share or overlap compressed data \(possible zip bomb\)\. Nothing was written\./);
  assert.equal(fs.existsSync(out), false);
  assert.equal(run(['list', zip]).status, 0, 'list still lists it');
}));

test('a header that understates the size cannot inflate past it (exit 1, output removed)', () => withTemp(dir => {
  const zip = writeZip(dir, [{ name: 'liar.txt', data: 'x'.repeat(50000), usize: 10 }]);
  const out = path.join(dir, 'out');
  const result = run(['extract', zip, '--out', out]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"liar\.txt" inflates past its declared 10 bytes/);
  assert.equal(fs.existsSync(out), false);
}));

test('a failed extract removes the missing parent folders --out created', () => withTemp(dir => {
  const zip = writeZip(dir, [{ name: 'good.txt', data: 'fine' }, { name: 'bad.txt', data: 'payload', crc: 1 }]);
  const result = run(['extract', zip, '--out', path.join(dir, 'new', 'deeper', 'out')]);
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(path.join(dir, 'new')), false, 'created parents removed');
  const keep = path.join(dir, 'keep');
  fs.mkdirSync(keep);
  assert.equal(run(['extract', zip, '--out', path.join(keep, 'out')]).status, 1);
  assert.deepEqual(fs.readdirSync(keep), [], 'an existing parent stays');
}));
