#!/usr/bin/env node
/*
 * capture.js — automated Service Portal screenshot helper for sn-doc.
 *
 * Reuses:
 *   - puppeteer (bundled inside md-to-pdf's node_modules)
 *   - the installed Chrome/Edge browser detected by render.js (via SN_DOC_BROWSER
 *     env var or standard install paths) — same reason: locked-down boxes block
 *     the puppeteer-cached Chromium.
 *   - the OAuth bearer token now-sdk stored, refreshed through a cheap REST
 *     read, then fetched via the bundled sn-rest.js.
 *
 * Two modes:
 *   1. CLI quick-capture:
 *      node capture.js --url <full-url> --out <png> [--alias ven06834] [--width 1400] [--height 900]
 *   2. Programmatic — `require('./capture').createSession({alias, instance})`
 *      returns { browser, page, navigate, shot, close } so recipe scripts can
 *      drive multi-step flows.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const APPDATA = process.env.APPDATA || '';

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

let globalRootCache;
function globalNodeModulesRoot() {
  if (globalRootCache !== undefined) return globalRootCache;
  if (process.platform === 'win32' && APPDATA) {
    const guess = path.join(APPDATA, 'npm', 'node_modules');
    if (fs.existsSync(guess)) {
      globalRootCache = guess;
      return globalRootCache;
    }
  }
  const r = spawnSync(npmCmd(), ['root', '-g'], { encoding: 'utf8', shell: true });
  globalRootCache = r.status === 0 ? r.stdout.trim() : null;
  return globalRootCache;
}

function loadPuppeteer() {
  const bases = [process.cwd(), __dirname];
  const gRoot = globalNodeModulesRoot();
  if (gRoot) {
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
  throw new Error('puppeteer not found. Install md-to-pdf globally or in the project first.');
}

function findBrowser() {
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
  for (const p of candidates) if (p && fs.existsSync(p)) return p;
  return null;
}

function snRestPath() {
  return path.join(process.env.USERPROFILE || '', '.agents', 'skills', 'sn-rest', 'sn-rest.js');
}

function runSnRest(args) {
  const snRest = snRestPath();
  if (!fs.existsSync(snRest)) throw new Error(`sn-rest not found at ${snRest}`);
  const r = spawnSync(process.execPath, [snRest, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`sn-rest exit ${r.status}: ${r.stderr || r.stdout}`);
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
  const tok = runSnRest(args);
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
} = {}) {
  const puppeteer = loadPuppeteer();
  const exe = findBrowser();
  if (!exe) throw new Error('No installed Chrome/Edge found — set SN_DOC_BROWSER');
  const inst = instance || instanceFromAlias(alias);
  if (!inst) throw new Error('Could not determine instance URL — pass --instance');
  const token = getToken(alias, inst);

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless,
    defaultViewport: { width, height },
    args: ['--no-sandbox', `--window-size=${width},${height}`],
  });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width, height });
  await page.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });

  async function navigate(urlOrPath) {
    const url = /^https?:/i.test(urlOrPath) ? urlOrPath : `${inst}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (!response) throw new Error(`navigation produced no HTTP response: ${url}`);
    const status = response.status();
    if (status >= 400) throw new Error(`navigation failed HTTP ${status}: ${page.url()}`);
    const title = await page.title();
    const finalUrl = page.url();
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

  async function shot(name, { fullPage = false, selector = null } = {}) {
    const file = path.join(outDir, name.endsWith('.png') ? name : `${name}.png`);
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

  return { browser, page, navigate, shot, close, instance: inst };
}

// ---- CLI ----
function parseArgs(argv) {
  const out = { width: 1400, height: 900, fullPage: false, headless: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--alias') out.alias = argv[++i];
    else if (a === '--instance') out.instance = argv[++i];
    else if (a === '--width') out.width = parseInt(argv[++i], 10);
    else if (a === '--height') out.height = parseInt(argv[++i], 10);
    else if (a === '--full-page') out.fullPage = true;
    else if (a === '--headed') out.headless = false;
    else if (a === '--selector') out.selector = argv[++i];
  }
  return out;
}

async function cliMain() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !args.out) {
    console.error('Usage: node capture.js --url <url|path> --out <file.png> [--alias <a>] [--instance <url>] [--width N] [--height N] [--full-page] [--selector <css>] [--headed]');
    process.exit(2);
  }
  const outDir = path.dirname(path.resolve(args.out));
  const name = path.basename(args.out);
  const session = await createSession({
    alias: args.alias || null,
    instance: args.instance,
    width: args.width,
    height: args.height,
    headless: args.headless,
    outDir,
  });
  try {
    await session.navigate(args.url);
    await session.shot(name, { fullPage: args.fullPage, selector: args.selector });
  } finally {
    await session.close();
  }
}

if (require.main === module) {
  cliMain().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
}

module.exports = { createSession, loadPuppeteer, findBrowser, getToken };
