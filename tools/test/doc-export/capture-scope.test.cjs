'use strict';
// Credential-scope checks for the screenshot helper. The pure-helper tests need
// no browser, network, SDK or instance. The final browser test is opt-in: it
// runs only when SN_DOC_TEST_NODE_MODULES points at a node_modules directory
// containing puppeteer and an installed Chrome/Edge is found; it talks to two
// loopback servers only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const helperPath = path.join(__dirname, '../../../payload/.agents/skills/sn-doc-export/capture.cjs');
const source = fs.readFileSync(helperPath, 'utf8');
const capture = require(helperPath);
const ORIGIN = 'https://example.service-now.com';
const TOKEN = 'test-token-not-a-real-credential';

test('instance must resolve to an https origin without embedded credentials', () => {
  assert.equal(capture.instanceOrigin('https://example.service-now.com/'), ORIGIN);
  assert.equal(capture.instanceOrigin('example.service-now.com'), ORIGIN);
  assert.equal(capture.instanceOrigin('https://example.service-now.com/sp?id=index'), ORIGIN);
  assert.throws(() => capture.instanceOrigin('http://example.service-now.com'), /must use https/);
  assert.throws(() => capture.instanceOrigin('file:///c:/x'), /must use https/);
  assert.throws(() => capture.instanceOrigin('https://user:pw@example.service-now.com'), /must not contain credentials/);
  for (const empty of ['', '   ', null, undefined]) assert.throws(() => capture.instanceOrigin(empty), /pass --instance/);
});

test('--url is confined to the instance origin', () => {
  assert.equal(capture.resolveTarget('/sp?id=index', ORIGIN), `${ORIGIN}/sp?id=index`);
  assert.equal(capture.resolveTarget('sp?id=index', ORIGIN), `${ORIGIN}/sp?id=index`);
  assert.equal(capture.resolveTarget(`${ORIGIN}/now/nav/ui/home`, ORIGIN), `${ORIGIN}/now/nav/ui/home`);
  const refused = [
    'https://attacker.example/collect',
    'http://example.service-now.com/sp',            // scheme downgrade
    'https://example.service-now.com:8443/sp',       // other port
    'https://example.service-now.com.attacker.example/sp',
    '//attacker.example/sp',                         // protocol-relative
    '\\\\attacker.example\\sp',                      // backslash form browsers treat as //
    'https://example.service-now.com@attacker.example/sp',
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///c:/secret.txt',
  ];
  for (const url of refused) assert.throws(() => capture.resolveTarget(url, ORIGIN), /refusing|must not contain credentials/, url);
  assert.throws(() => capture.resolveTarget('', ORIGIN), /empty URL/);
});

test('bearer is attached only to https requests on the exact instance origin', () => {
  assert.equal(capture.shouldAttachBearer(`${ORIGIN}/api/now/table/x`, ORIGIN), true);
  for (const url of [
    'https://cdn.example.net/font.woff2',
    'https://login.idp.example/saml/sso',
    'http://example.service-now.com/x',
    'https://example.service-now.com:444/x',
    'https://sub.example.service-now.com/x',
    'wss://example.service-now.com/amb',
    'data:text/plain,x',
    'not a url',
  ]) assert.equal(capture.shouldAttachBearer(url, ORIGIN), false, url);
});

test('per-request headers add the bearer in scope and strip any inherited one out of scope', () => {
  const inScope = capture.scopedHeaders(`${ORIGIN}/sp`, { accept: '*/*' }, ORIGIN, TOKEN);
  assert.deepEqual(inScope, { accept: '*/*', Authorization: `Bearer ${TOKEN}` });
  for (const key of ['authorization', 'Authorization', 'AUTHORIZATION']) {
    const out = capture.scopedHeaders('https://login.idp.example/sso', { accept: '*/*', [key]: `Bearer ${TOKEN}` }, ORIGIN, TOKEN);
    assert.deepEqual(out, { accept: '*/*' });
  }
});

test('interception handler continues every request with scoped headers', async () => {
  const handlers = [];
  const page = { intercept: null, async setRequestInterception(v) { this.intercept = v; }, on(evt, fn) { handlers.push([evt, fn]); } };
  await capture.installScopedBearer(page, ORIGIN, TOKEN);
  assert.equal(page.intercept, true);
  assert.equal(handlers.length, 1);
  assert.equal(handlers[0][0], 'request');
  const run = (url, headers) => {
    let continued;
    handlers[0][1]({ url: () => url, headers: () => headers, isInterceptResolutionHandled: () => false, continue: async (o) => { continued = o; }, abort: async () => { continued = 'aborted'; } });
    return continued;
  };
  assert.equal(run(`${ORIGIN}/sp`, {}).headers.Authorization, `Bearer ${TOKEN}`);
  // A redirect hop to an identity provider is a new request on another origin.
  assert.deepEqual(run('https://login.idp.example/saml', { authorization: `Bearer ${TOKEN}` }).headers, {});
  assert.deepEqual(run('https://cdn.example.net/a.js', { accept: 'x' }).headers, { accept: 'x' });
});

test('helper source never sets a page-wide Authorization header or spawns a package-manager shim', () => {
  assert.doesNotMatch(source, /setExtraHTTPHeaders/);
  assert.doesNotMatch(source, /npm\.cmd|npx\.cmd|shell:\s*true/);
  assert.doesNotMatch(source, /capture\.js\b/);
  assert.equal(Object.prototype.hasOwnProperty.call(capture, 'getToken'), false, 'token accessor is not exported');
  // Scope is validated before the token is read.
  const body = source.slice(source.indexOf('async function createSession('));
  assert.ok(body.indexOf('instanceOrigin(') >= 0 && body.indexOf('instanceOrigin(') < body.indexOf('getToken('));
});

test('CLI rejects unknown flags, missing values and bad dimensions', () => {
  assert.throws(() => capture.parseArgs(['--url', '/sp', '--out', 'a.png', '--fullpage']), /Unknown argument: --fullpage/);
  assert.throws(() => capture.parseArgs(['--url']), /--url needs a value/);
  assert.throws(() => capture.parseArgs(['--url', '/sp', '--out', 'a.png', '--width', 'wide']), /positive integers/);
  const ok = capture.parseArgs(['--url', '/sp', '--out', 'a.png', '--selector', '.x', '--full-page', '--force']);
  assert.deepEqual([ok.url, ok.out, ok.selector, ok.fullPage, ok.force, ok.headless], ['/sp', 'a.png', '.x', true, true, true]);
  const picked = capture.parseArgs(['--url', '/sp', '--out', 'a.png', '--browser', 'C:/x/chrome.exe', '--node-path', '/g/node_modules']);
  assert.deepEqual([picked.browser, picked.nodePath], ['C:/x/chrome.exe', '/g/node_modules']);
  for (const flag of ['--browser', '--node-path']) {
    assert.throws(() => capture.parseArgs(['--url', '/sp', '--out', 'a.png', flag]), new RegExp(`${flag} needs a value`));
    assert.throws(() => capture.parseArgs(['--url', '/sp', '--out', 'a.png', flag, '']), new RegExp(`${flag} needs a value`));
    assert.throws(() => capture.parseArgs(['--url', '/sp', '--out', 'a.png', flag, '--force']), new RegExp(`${flag} needs a value`));
  }
});

test('a --browser override must be an executable file and has no fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-capture-browser-'));
  const saved = process.env.SN_DOC_BROWSER;
  try {
    const exe = path.join(dir, 'chosen browser');
    fs.writeFileSync(exe, '', { mode: 0o755 });
    process.env.SN_DOC_BROWSER = exe;
    assert.equal(capture.findBrowser(exe), exe);
    assert.equal(capture.findBrowser(dir), null, 'a directory is not a browser');
    assert.equal(capture.findBrowser(path.join(dir, 'missing')), null, 'no fallback to SN_DOC_BROWSER');
    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    const env = { ...process.env, USERPROFILE: home, HOME: home };
    let r = spawnSync(process.execPath, [helperPath, '--url', '/sp', '--out', path.join(home, 'a.png'), '--instance', ORIGIN, '--browser', path.join(dir, 'missing')], { encoding: 'utf8', env, cwd: home });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--browser path is not an executable file: .*missing/);
    assert.doesNotMatch(r.stderr, /sn-rest not found/, 'browser is checked before any token read');
    r = spawnSync(process.execPath, [helperPath, '--url', '/sp', '--out', path.join(home, 'a.png'), '--instance', ORIGIN, '--node-path', path.join(dir, 'missing')], { encoding: 'utf8', env, cwd: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--node-path is not a directory/);
  } finally {
    if (saved === undefined) delete process.env.SN_DOC_BROWSER; else process.env.SN_DOC_BROWSER = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI refuses a foreign host, a non-https instance and an existing output before reading any token', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-doc-capture-'));
  try {
    // Empty home: sn-rest is absent, so any attempt to read a token would fail with "sn-rest not found".
    const env = { ...process.env, USERPROFILE: home, HOME: home };
    const run = (...args) => spawnSync(process.execPath, [helperPath, ...args], { encoding: 'utf8', env, cwd: home });
    const existing = path.join(home, 'exists.png');
    fs.writeFileSync(existing, 'keep');
    let r = run('--url', '/sp', '--out', existing, '--instance', ORIGIN);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Output exists/);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep');
    r = run('--url', '/sp', '--out', path.join(home, 'a.png'), '--instance', 'http://example.service-now.com');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /must use https/);
    assert.doesNotMatch(r.stderr, /sn-rest not found/);
    r = run('--url', 'https://attacker.example/collect', '--out', path.join(home, 'a.png'), '--instance', ORIGIN);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refusing https:\/\/attacker\.example/);
    assert.doesNotMatch(r.stderr, /sn-rest not found/);
    assert.equal(fs.existsSync(path.join(home, 'a.png')), false);
    r = run('--url', '/sp', '--out', path.join(home, 'a.png'), '--bogus');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Unknown argument: --bogus[\s\S]*Usage: sn-skill doc-capture/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// ---- opt-in real-browser check ------------------------------------------------
const modules = process.env.SN_DOC_TEST_NODE_MODULES || '';
let puppeteer = null;
if (modules) {
  try { puppeteer = require(require.resolve('puppeteer', { paths: [path.dirname(modules)] })); } catch { puppeteer = null; }
}
const browserPath = capture.findBrowser();
const skip = !puppeteer ? 'set SN_DOC_TEST_NODE_MODULES to a node_modules containing puppeteer' : !browserPath ? 'no installed Chrome/Edge' : false;

test('real browser: subresources and redirect hops on another origin never receive the bearer', { skip }, async () => {
  const seen = { a: [], b: [] };
  const listen = (name, handler) => new Promise((resolve) => {
    const server = http.createServer((req, res) => { seen[name].push([req.url, req.headers.authorization || null]); handler(req, res); });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
  const b = await listen('b', (req, res) => { res.setHeader('content-type', 'text/html'); res.end('<p>other origin</p>'); });
  const originB = `http://127.0.0.1:${b.address().port}`;
  const a = await listen('a', (req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: `${originB}/landing` }); res.end(); return; }
    res.setHeader('content-type', 'text/html');
    res.end(`<p>instance page</p><img src="${originB}/pixel.png"><script src="${originB}/lib.js"></script>`);
  });
  const originA = `http://127.0.0.1:${a.address().port}`;
  // Loopback has no TLS, so the test injects an exact-origin predicate; the shipped default also requires https.
  const sameOrigin = (url, origin) => { try { return new URL(url).origin === origin; } catch { return false; } };
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await capture.installScopedBearer(page, originA, TOKEN, sameOrigin);
    await page.goto(`${originA}/page`, { waitUntil: 'networkidle0' });
    await page.goto(`${originA}/redirect`, { waitUntil: 'networkidle0' });
    assert.equal(new URL(page.url()).origin, originB, 'redirect was followed');
  } finally {
    await browser.close();
    a.close(); b.close();
  }
  assert.ok(seen.a.some(([url, auth]) => url === '/page' && auth === `Bearer ${TOKEN}`), 'instance request carries the bearer');
  assert.ok(seen.a.some(([url, auth]) => url === '/redirect' && auth === `Bearer ${TOKEN}`));
  assert.ok(seen.b.some(([url]) => url === '/pixel.png') && seen.b.some(([url]) => url === '/landing'), 'other origin was reached');
  for (const [url, auth] of seen.b) assert.equal(auth, null, `bearer leaked to other origin at ${url}`);
});
