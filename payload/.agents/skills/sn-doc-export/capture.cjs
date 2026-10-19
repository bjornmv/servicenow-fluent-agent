#!/usr/bin/env node
/*
 * capture.cjs — automated Service Portal screenshot helper for sn-doc-export.
 *
 * Reuses:
 *   - puppeteer (bundled inside md-to-pdf's node_modules)
 *   - an installed Chrome/Edge browser, found like render.js does (--browser for
 *     one run, else SN_DOC_BROWSER / PUPPETEER_EXECUTABLE_PATH, else standard
 *     install paths; on Linux also PATH and /opt) — same reason: locked-down
 *     boxes block the puppeteer-cached Chromium.
 *   - the OAuth bearer token now-sdk stored, refreshed through a cheap REST
 *     read, then read from the bundled sn-rest.js in a child process. The token
 *     is never printed or written to disk by this helper.
 *
 * Credential scope: the bearer is attached ONLY to https requests whose origin
 * equals the configured instance origin. A --url on another host is refused,
 * and third-party subresources and cross-origin redirect hops (for example an
 * SSO identity provider) never receive the header.
 *
 * Two modes:
 *   1. CLI quick-capture:
 *      sn-skill doc-capture --url <path-or-instance-url> --out <png> [--alias <alias>] [--instance https://<host>] [--browser <exe>]
 *   2. Programmatic — `require('./capture.cjs').createSession({alias, instance, browserPath})`
 *      returns { browser, page, navigate, shot, close } so recipe scripts can
 *      drive multi-step flows.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE = 'Usage: sn-skill doc-capture --url <path|instance-url> --out <file.png> [--alias <a>] [--instance https://<host>] [--width N] [--height N] [--full-page] [--selector <css>] [--headed] [--force] [--browser <chrome/edge executable>] [--node-path <global node_modules>]';

// Global node_modules candidates, resolved without spawning a package-manager
// launcher. NODE_PATH is honoured by require.resolve itself; --node-path is searched first.
let nodePathOverride = null;
function globalNodeModulesRoots() {
  const roots = [];
  const add = (p) => { if (p && !roots.includes(p) && fs.existsSync(p)) roots.push(p); };
  if (nodePathOverride !== null) add(nodePathOverride);
  const prefix = process.env.npm_config_prefix;
  const nodeDir = path.dirname(process.execPath);
  if (process.platform === 'win32') {
    if (process.env.APPDATA) add(path.join(process.env.APPDATA, 'npm', 'node_modules'));
    if (prefix) add(path.join(prefix, 'node_modules'));
    add(path.join(nodeDir, 'node_modules'));
  } else {
    if (prefix) add(path.join(prefix, 'lib', 'node_modules'));
    add(path.join(nodeDir, '..', 'lib', 'node_modules'));
  }
  return roots;
}

function loadPuppeteer() {
  const bases = [process.cwd(), __dirname];
  for (const gRoot of globalNodeModulesRoots()) {
    bases.push(path.dirname(gRoot));
    bases.push(path.join(gRoot, 'md-to-pdf'));
  }

  for (const base of bases) {
    try {
      const pkgPath = require.resolve('puppeteer/package.json', { paths: [base] });
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const main = pkg.main || 'lib/cjs/puppeteer/puppeteer.js';
      return require(path.join(path.dirname(pkgPath), main));
    } catch {
      // Try the next resolution base.
    }
  }
  throw new Error('puppeteer not found. It ships with md-to-pdf; see install.md section 2 (installation needs approval).');
}

/** A --browser override wins and has no fallback: it must be a file (executable
 *  outside Windows), else null. */
function findBrowser(override = null) {
  if (override !== null) {
    if (process.platform !== 'win32') return usableBrowser(override) ? override : null;
    try { return fs.statSync(override).isFile() ? override : null; } catch { return null; }
  }
  const explicit = process.env.SN_DOC_BROWSER || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const candidates = process.platform === 'win32' ? [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  if (process.platform === 'win32') {
    for (const p of candidates) if (p && fs.existsSync(p)) return p;
    return null;
  }
  // Linux/macOS: same extended search as render.js (PATH, vendor folders).
  const names = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge-stable', 'microsoft-edge'];
  const dirs = (process.env.PATH || '').split(':').filter(Boolean);
  for (const d of ['/usr/bin', '/usr/local/bin', '/snap/bin']) if (!dirs.includes(d)) dirs.push(d);
  for (const n of names) for (const d of dirs) candidates.push(path.join(d, n));
  candidates.push('/opt/google/chrome/chrome', '/opt/microsoft/msedge/msedge', '/opt/chromium/chrome');
  for (const p of candidates) if (p && usableBrowser(p)) return p;
  return null;
}

function usableBrowser(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    // Ubuntu's chromium-browser snap transition shim fails without the snap.
    if (/^chromium/.test(path.basename(p)) && st.size < 65536 && !fs.existsSync('/snap/bin/chromium')) {
      const head = fs.readFileSync(p, 'latin1');
      if (head.startsWith('#!') && /snap/.test(head)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Linux containers often have a 64 MB /dev/shm; other platforms keep --no-sandbox only. */
function browserArgs() {
  return process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : ['--no-sandbox'];
}

// ---- credential scope (pure helpers; unit-tested without a browser) ----

/** Normalise the configured instance to its https origin. Anything else is refused. */
function instanceOrigin(instance) {
  const raw = String(instance || '').trim();
  if (!raw) throw new Error('Could not determine instance URL — pass --instance https://<host>');
  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('Instance is not a valid URL — pass --instance https://<host>');
  }
  if (u.protocol !== 'https:') throw new Error(`Instance must use https (got ${u.protocol}//${u.host}); the bearer is never sent over another scheme.`);
  if (u.username || u.password) throw new Error('Instance URL must not contain credentials.');
  return u.origin;
}

/** Resolve --url against the instance origin. Absolute URLs on any other origin are refused. */
function resolveTarget(urlOrPath, origin) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) throw new Error('navigate: empty URL');
  let u;
  try {
    u = new URL(raw, `${origin}/`);
  } catch {
    throw new Error(`navigate: not a valid URL or path: ${raw}`);
  }
  if (u.origin !== origin) {
    throw new Error(`navigate: refusing ${u.origin} — the URL must be a path or a URL on the instance origin ${origin}`);
  }
  if (u.username || u.password) throw new Error('navigate: URL must not contain credentials.');
  return u.href;
}

/** True only for an https request whose origin is exactly the instance origin. */
function shouldAttachBearer(requestUrl, origin) {
  try {
    const u = new URL(requestUrl);
    return u.protocol === 'https:' && u.origin === origin;
  } catch {
    return false;
  }
}

/** Headers for one intercepted request: Authorization is added for the scoped origin and removed everywhere else. */
function scopedHeaders(requestUrl, headers, scopeOrigin, token, attach = shouldAttachBearer) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() !== 'authorization') out[k] = v;
  }
  if (attach(requestUrl, scopeOrigin)) out.Authorization = `Bearer ${token}`;
  return out;
}

/**
 * Attach the bearer per request instead of page-wide. Every request, including
 * each redirect hop, is intercepted as its own request, so a hop to another
 * origin is continued without the header. `attach` is injectable for tests.
 */
async function installScopedBearer(page, scopeOrigin, token, attach = shouldAttachBearer) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled && req.isInterceptResolutionHandled()) return;
    let headers;
    try {
      headers = scopedHeaders(req.url(), req.headers(), scopeOrigin, token, attach);
    } catch {
      req.abort().catch(() => {});
      return;
    }
    req.continue({ headers }).catch(() => {});
  });
}

// ---- token retrieval (child process; never printed) ----

function snRestPath() {
  return path.join(process.env.USERPROFILE || os.homedir(), '.agents', 'skills', 'sn-rest', 'sn-rest.js');
}

function runSnRest(args, { secret = false } = {}) {
  const snRest = snRestPath();
  if (!fs.existsSync(snRest)) throw new Error(`sn-rest not found at ${snRest}`);
  const r = spawnSync(process.execPath, [snRest, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    // Never echo the child's stdout for a secret-bearing call.
    throw new Error(`sn-rest exit ${r.status}: ${secret ? (r.stderr || '').trim() : (r.stderr || r.stdout)}`);
  }
  return (r.stdout || '').trim();
}

function refreshToken(alias, instance) {
  const args = [];
  if (alias) args.push('--alias', alias);
  if (instance) args.push('--instance', instance);
  args.push('/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id');
  runSnRest(args);
}

function getToken(alias, instance) {
  const args = ['--raw'];
  if (alias) { args.unshift('--alias', alias); }
  if (instance) { args.push('--instance', instance); }
  refreshToken(alias, instance);
  const tok = runSnRest(args, { secret: true });
  if (!tok) throw new Error('sn-rest returned empty token');
  return tok;
}

function instanceFromAlias(alias) {
  const args = [];
  if (alias) { args.push('--alias', alias); }
  try {
    const info = JSON.parse(runSnRest(args) || '{}');
    return info.host ? String(info.host).replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

async function createSession({
  alias = null,
  instance = null,
  width = 1400,
  height = 900,
  headless = true,
  outDir = process.cwd(),
  browserPath = null,
} = {}) {
  // Validate the credential scope before any token is read or browser launched.
  const origin = instanceOrigin(instance || instanceFromAlias(alias));
  if (!headless && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error('--headed needs a display (DISPLAY/WAYLAND_DISPLAY unset, e.g. VS Code server); run headless and review the PNG instead');
  }
  const override = browserPath === null ? null : path.resolve(browserPath);
  const exe = findBrowser(override);
  if (!exe) {
    if (override !== null) throw new Error(`--browser path is not an executable file: ${override}`);
    throw new Error(process.platform === 'win32'
      ? 'No installed Chrome/Edge found — pass --browser "<browser-path>" with a chrome.exe / msedge.exe path'
      : 'No installed Chrome/Chromium/Edge found — pass --browser "<browser-path>" with its executable (e.g. /usr/bin/google-chrome)');
  }
  const puppeteer = loadPuppeteer();
  const token = getToken(alias, origin);

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless,
    defaultViewport: { width, height },
    args: [...browserArgs(), `--window-size=${width},${height}`],
  });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width, height });
  await installScopedBearer(page, origin, token);

  async function navigate(urlOrPath) {
    const url = resolveTarget(urlOrPath, origin);
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (!response) throw new Error(`navigation produced no HTTP response: ${url}`);
    const status = response.status();
    if (status >= 400) throw new Error(`navigation failed HTTP ${status}: ${page.url()}`);
    const title = await page.title();
    const finalUrl = page.url();
    let finalOrigin = null;
    try { finalOrigin = new URL(finalUrl).origin; } catch { /* handled below */ }
    if (finalOrigin !== origin) {
      throw new Error(`navigation left the instance origin (sign-in or external redirect): ${finalUrl}`);
    }
    if (/login|signin|saml/i.test(`${finalUrl} ${title}`)) {
      throw new Error(`navigation landed on a sign-in page: ${finalUrl}`);
    }
    const hasRenderableContent = await page.evaluate(() => {
      const text = document.body && document.body.innerText ? document.body.innerText.trim() : '';
      return Boolean(text || document.querySelector('canvas,img,svg,table,iframe'));
    });
    if (!hasRenderableContent) throw new Error(`navigation produced an apparently blank page: ${finalUrl}`);
    return response;
  }

  async function shot(name, { fullPage = false, selector = null, force = false } = {}) {
    const file = path.join(outDir, name.endsWith('.png') ? name : `${name}.png`);
    if (fs.existsSync(file) && !force) {
      throw new Error(`Output exists: ${file}. Re-run with --force only after confirming overwrite.`);
    }
    if (selector) {
      const el = await page.$(selector);
      if (!el) throw new Error(`shot: selector not found: ${selector}`);
      await el.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage });
    }
    process.stdout.write(`  [OK ] ${path.basename(file)}  (${fs.statSync(file).size} bytes)\n`);
    return file;
  }

  async function close() { await browser.close(); }

  return { browser, page, navigate, shot, close, instance: origin };
}

// ---- CLI ----
function parseArgs(argv) {
  const out = { width: 1400, height: 900, fullPage: false, headless: true, force: false };
  const value = (i, flag) => {
    if (i >= argv.length) throw new Error(`${flag} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = value(++i, a);
    else if (a === '--out') out.out = value(++i, a);
    else if (a === '--alias') out.alias = value(++i, a);
    else if (a === '--instance') out.instance = value(++i, a);
    else if (a === '--width') out.width = parseInt(value(++i, a), 10);
    else if (a === '--height') out.height = parseInt(value(++i, a), 10);
    else if (a === '--full-page') out.fullPage = true;
    else if (a === '--headed') out.headless = false;
    else if (a === '--force') out.force = true;
    else if (a === '--selector') out.selector = value(++i, a);
    else if (a === '--browser' || a === '--node-path') {
      const v = value(++i, a);
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      if (a === '--browser') out.browser = v; else out.nodePath = v;
    }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isInteger(out.width) || out.width <= 0 || !Number.isInteger(out.height) || out.height <= 0) {
    throw new Error('--width and --height must be positive integers');
  }
  return out;
}

async function cliMain() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    if (!args.url || !args.out) throw new Error('--url and --out are required');
  } catch (e) {
    console.error(`[FAIL] ${e.message}`);
    console.error(USAGE);
    process.exit(2);
  }
  const outFile = path.resolve(args.out.endsWith('.png') ? args.out : `${args.out}.png`);
  if (fs.existsSync(outFile) && !args.force) {
    console.error(`[FAIL] Output exists: ${outFile}. Re-run with --force only after confirming overwrite.`);
    process.exit(2);
  }
  if (args.nodePath) {
    nodePathOverride = path.resolve(args.nodePath);
    let isDir = false;
    try { isDir = fs.statSync(nodePathOverride).isDirectory(); } catch { /* reported below */ }
    if (!isDir) {
      console.error(`[FAIL] --node-path is not a directory: ${nodePathOverride}`);
      process.exit(2);
    }
  }
  // With an explicit --instance, refuse a bad scope before any token is read.
  if (args.instance) resolveTarget(args.url, instanceOrigin(args.instance));
  const session = await createSession({
    alias: args.alias || null,
    instance: args.instance,
    width: args.width,
    height: args.height,
    headless: args.headless,
    outDir: path.dirname(outFile),
    browserPath: args.browser ?? null,
  });
  try {
    await session.navigate(args.url);
    await session.shot(path.basename(outFile), { fullPage: args.fullPage, selector: args.selector, force: args.force });
  } finally {
    await session.close();
  }
}

if (require.main === module) {
  cliMain().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
}

module.exports = {
  createSession, loadPuppeteer, findBrowser,
  instanceOrigin, resolveTarget, shouldAttachBearer, scopedHeaders, installScopedBearer, parseArgs,
};
