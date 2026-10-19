#!/usr/bin/env node
// sn-doc-export renderer: Markdown to PDF, DOCX or HTML, in Node.
//
// Usage (same line in PowerShell and bash, from the confirmed project directory):
//   sn-skill doc-render --check --format 'pdf,docx' --archetype runbook
//   sn-skill doc-render --in "docs/runbook.md" --archetype runbook --format 'pdf,docx' --out "docs/dist/"
//
// PDF/HTML: md-to-pdf with an installed Chrome/Edge. DOCX: @adobe/helix-md2docx,
// then docx-frame.cjs adds the archetype frame. Archetypes live in frames.cjs.
// Metadata comes from flat front matter in the Markdown, overridden by --meta.
//
// Preflight is mandatory before render. Missing deps point to install.md; this
// tool never installs anything and never spawns a package-manager launcher.

import { spawnSync } from 'node:child_process';
import { accessSync, constants as fsConstants, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const frames = require('./frames.cjs');
const { frameDocx, readZip, writeZip } = require('./docx-frame.cjs');

const NODE_MIN = 18;
const ARCHETYPE_NAMES = Object.keys(frames.ARCHETYPES);
const VALID_FORMATS = ['pdf', 'docx', 'html'];

// ---------------------------------------------------------------------------
// arg parsing — minimal, no external deps
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    check: false,
    in: null,
    out: 'docs/dist',
    format: 'pdf,docx',
    backend: null,
    archetype: 'plain',
    imageMap: [],
    meta: {},
    referenceDocx: null,
    stylesheet: null,
    browser: null,
    nodePath: null,
    force: false,
    explicit: new Set(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) {
        console.error(`Missing value for ${a}`);
        process.exit(2);
      }
      return argv[++i];
    };
    switch (a) {
      case '--check': args.check = true; break;
      case '--in': args.in = next(); break;
      case '--out': args.out = next(); break;
      case '--format': args.format = next(); args.explicit.add('format'); break;
      case '--backend': args.backend = next(); args.explicit.add('backend'); break;
      case '--archetype': args.archetype = next(); args.explicit.add('archetype'); break;
      case '--reference-docx': args.referenceDocx = next(); break;
      case '--stylesheet': args.stylesheet = next(); break;
      case '--browser': {
        const v = next();
        if (!v || v.startsWith('--')) {
          console.error('Missing value for --browser');
          process.exit(2);
        }
        args.browser = v;
        break;
      }
      case '--node-path': {
        const v = next();
        if (!v || v.startsWith('--')) {
          console.error('Missing value for --node-path');
          process.exit(2);
        }
        args.nodePath = v;
        break;
      }
      case '--force': args.force = true; break;
      case '--image-map': {
        const v = next();
        const eq = v.indexOf('=');
        if (eq > 0) args.imageMap.push([v.slice(0, eq), v.slice(eq + 1)]);
        else console.error(`  warn: --image-map ignored (no '='): ${v}`);
        break;
      }
      case '--meta': {
        const v = next();
        const eq = v.indexOf('=');
        if (eq > 0) args.meta[frames.metaKey(v.slice(0, eq))] = v.slice(eq + 1);
        else console.error(`  warn: --meta ignored (no '='): ${v}`);
        break;
      }
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        if (a.startsWith('--meta-')) {
          // Compatibility: --meta-title "x" same as --meta title=x
          args.meta[frames.metaKey(a.slice(7))] = next();
        } else {
          console.error(`Unknown flag: ${a}`);
          process.exit(2);
        }
    }
  }
  return args;
}

function printHelp() {
  console.log(`sn-doc-export — render Markdown to PDF, DOCX or HTML

Usage:
  sn-skill doc-render --check [--format 'pdf,docx,html'] [--archetype <name>]
                      [--browser <chrome/edge executable>] [--node-path <global node_modules>]
  sn-skill doc-render --in body.md [--out docs/dist] [--format 'pdf,docx,html'] [--force]
                      [--archetype <name>] [--meta 'key=value' ...]
                      [--image-map name.png=${process.platform === 'win32' ? 'C:\\path\\file.png' : '/abs/path/file.png'} ...]
                      [--reference-docx template.docx] [--stylesheet extra.css]
                      [--browser <chrome/edge executable>] [--node-path <global node_modules>]

Formats: pdf, docx, html (default pdf,docx). An unknown format is an error.
Output:  <out>/<slug of the title from front matter or --meta, else of the input file name>.<format>

Archetypes (cover, contents, running header, footer with Page N of M):
${ARCHETYPE_NAMES.map((n) => {
    const a = frames.ARCHETYPES[n];
    return `  ${n.padEnd(21)} ${a.cover.padEnd(8)} required: ${a.required.join(', ') || '-'}`;
  }).join('\n')}
  'compliance' is accepted for compliance_report.

Metadata: a leading front-matter block of flat 'key: value' lines in the
Markdown; --meta 'key=value' overrides it. The title falls back to the first
'# ' heading (moved onto the cover). Missing required keys exit 2 and are listed.

Options:
  --reference-docx  DOCX styles from a template; its headers/footers replace the archetype ones.
  --stylesheet      extra CSS for PDF/HTML, applied after the archetype CSS.
  --browser         Chrome/Edge executable for PDF/HTML (overrides SN_DOC_BROWSER).
  --node-path       a node_modules folder (for example the global npm root) searched after the
                    project and before the standard global folders.

PDF page header/footer use CSS page margin boxes (Chromium 131+, clean
cover page). Older browsers fall back to header/footer templates, which also
print on the cover; the run warns. --check reports the browser version.

Preflight:
  --check reports [OK ] / [BAD] / [WARN] lines. Alone it exits 0 when any
  output is possible. With --format/--archetype it exits 0 only when that
  selection is ready. It never installs anything.

Exit codes:
  0 all requested formats written   2 bad arguments, missing metadata, input or
  1 unexpected error                  image, existing output or not ready
  3 a format failed to render (earlier formats may already be written)

Safety:
  Existing output files are not overwritten unless --force is passed.
`);
}

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

// Global node_modules candidates, found without spawning a package-manager
// launcher (batch shims are blocked by the command policy). NODE_PATH is
// honoured by require.resolve itself, so it covers a redirected npm prefix.
// --node-path (one run) is searched before the standard global folders.
let nodePathOverride = null;
let _globalRootsCache;
function globalNodeModulesRoots() {
  if (_globalRootsCache) return _globalRootsCache;
  const roots = [];
  const add = (p) => { if (p && !roots.includes(p) && existsSync(p)) roots.push(p); };
  if (nodePathOverride !== null) roots.push(nodePathOverride);
  const prefix = process.env.npm_config_prefix;
  const nodeDir = dirname(process.execPath);
  if (process.platform === 'win32') {
    if (process.env.APPDATA) add(join(process.env.APPDATA, 'npm', 'node_modules'));
    if (prefix) add(join(prefix, 'node_modules'));
    add(join(nodeDir, 'node_modules'));
  } else {
    if (prefix) add(join(prefix, 'lib', 'node_modules'));
    add(join(nodeDir, '..', 'lib', 'node_modules'));
  }
  _globalRootsCache = roots;
  return roots;
}

function tryRequire(name) {
  // require.resolve(..., {paths}) treats each path as a starting dir and appends
  // node_modules — so for global packages we pass the PARENT of the global root.
  const tryPaths = [process.cwd()];
  const gRoots = globalNodeModulesRoots();
  for (const gRoot of gRoots) tryPaths.push(dirname(gRoot));
  let resolved = null;
  for (const base of tryPaths) {
    try {
      resolved = require.resolve(`${name}/package.json`, { paths: [base] });
      break;
    } catch { /* try next */ }
  }
  if (!resolved) {
    return { ok: false, error: `not installed (searched: cwd${gRoots.map(r => ', ' + r).join('')}, NODE_PATH)` };
  }
  try {
    const version = JSON.parse(readFileSync(resolved, 'utf8')).version || '?';
    return { ok: true, version, pkgJsonPath: resolved };
  } catch (e) {
    return { ok: false, error: `package.json unreadable: ${e.message}` };
  }
}

/** Dynamic-import a package that may be installed globally. ESM import() ignores
 *  npm global root, so we resolve via tryRequire then import by absolute file URL. */
async function importPackage(name) {
  const info = tryRequire(name);
  if (!info.ok) throw new Error(`${name}: ${info.error}`);
  const pkgDir = dirname(info.pkgJsonPath);
  const pkg = JSON.parse(readFileSync(info.pkgJsonPath, 'utf8'));
  // Honor "exports"."." or "main"; fall back to index.js.
  let entry = null;
  const exp = pkg.exports;
  if (typeof exp === 'string') entry = exp;
  else if (exp && typeof exp === 'object') {
    const dot = exp['.'] ?? exp;
    if (typeof dot === 'string') entry = dot;
    else if (dot) entry = dot.import || dot.default || dot.require || null;
    if (entry && typeof entry === 'object') entry = entry.default || entry.import || entry.require;
  }
  entry = entry || pkg.module || pkg.main || 'index.js';
  const abs = resolve(pkgDir, entry);
  return import(pathToFileURL(abs).href);
}

// Set from --browser for this run; it wins over the environment and has no fallback.
let browserOverride = null;

/** Find an installed Chromium-family browser. Prefers --browser, then the
 *  SN_DOC_BROWSER env var, then PUPPETEER_EXECUTABLE_PATH, then standard
 *  Chrome/Edge install paths. A --browser path that is not an executable file
 *  returns null.
 *  Returning null makes PDF/HTML not ready: the puppeteer-bundled Chromium is
 *  deliberately never used (it is commonly blocked on locked-down machines). */
function findBrowser() {
  if (browserOverride !== null) return overrideUsable(browserOverride) ? browserOverride : null;
  const explicit = process.env.SN_DOC_BROWSER || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const candidates = process.platform === 'win32' ? [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ] : [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  if (process.platform === 'win32') {
    for (const p of candidates) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }
  // Linux/macOS: also search PATH and vendor install folders; skip non-executables
  // and Ubuntu's snap transition shim when the snap is not installed.
  const names = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge-stable', 'microsoft-edge'];
  const dirs = (process.env.PATH || '').split(':').filter(Boolean);
  for (const d of ['/usr/bin', '/usr/local/bin', '/snap/bin']) if (!dirs.includes(d)) dirs.push(d);
  for (const n of names) for (const d of dirs) candidates.push(join(d, n));
  candidates.push('/opt/google/chrome/chrome', '/opt/microsoft/msedge/msedge', '/opt/chromium/chrome');
  for (const p of candidates) {
    if (p && usableBrowser(p)) return p;
  }
  return null;
}

/** The --browser path must be a file (and executable outside Windows). */
function overrideUsable(p) {
  if (process.platform !== 'win32') return usableBrowser(p);
  try { return statSync(p).isFile(); } catch { return false; }
}

function usableBrowser(p) {
  try {
    const st = statSync(p);
    if (!st.isFile()) return false;
    accessSync(p, fsConstants.X_OK);
    if (/^chromium/.test(basename(p)) && st.size < 65536 && !existsSync('/snap/bin/chromium')) {
      const head = readFileSync(p, 'latin1');
      if (head.startsWith('#!') && /snap/.test(head)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Chrome launch args. Containers often have a 64 MB /dev/shm, so Linux adds
 *  --disable-dev-shm-usage; Windows/macOS args are unchanged. */
function browserArgs() {
  return process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : ['--no-sandbox'];
}

/** Platform-specific browser remediation text for preflight. */
function browserFixHint() {
  if (browserOverride !== null) return 'Check the --browser path, or omit it to use SN_DOC_BROWSER and the standard install paths.';
  return process.platform === 'win32'
    ? 'Install Chrome or Edge, or pass its chrome.exe / msedge.exe path: sn-skill doc-render --check --browser "<browser-path>"'
    : 'Install Chrome/Chromium (approval required), or pass its path: sn-skill doc-render --check --browser "<browser-path>"';
}

// Browser version without launching it where possible: Chrome/Edge on
// Windows keep a "<version>" folder beside the executable, macOS bundles a
// Framework "Versions/<version>" folder, elsewhere `--version` prints it.
function browserVersionStatic(p) {
  const pick = (names) => names.filter((n) => /^\d+\.\d+\.\d+\.\d+$/.test(n))
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))[0] || null;
  try {
    if (process.platform === 'win32') return pick(readdirSync(dirname(p)));
    const app = p.match(/^(.*\.app)\/Contents\/MacOS\//);
    if (app) {
      const fw = join(app[1], 'Contents', 'Frameworks');
      for (const f of readdirSync(fw).filter((n) => n.endsWith('.framework'))) {
        const v = pick(readdirSync(join(fw, f, 'Versions')));
        if (v) return v;
      }
      return null;
    }
    const r = spawnSync(p, ['--version'], { encoding: 'utf8', timeout: 15000 });
    return (String(r.stdout || '').match(/(\d+\.\d+\.\d+(?:\.\d+)?)/) || [])[1] || null;
  } catch {
    return null;
  }
}

// Fallback: launch it through md-to-pdf's puppeteer and ask (same launch as a render).
async function browserVersionProbe(p) {
  const mdToPdf = tryRequire('md-to-pdf');
  if (!mdToPdf.ok) return null;
  let browser;
  try {
    const mod = require(require.resolve('puppeteer', { paths: [dirname(mdToPdf.pkgJsonPath)] }));
    const puppeteer = mod.default || mod;
    browser = await puppeteer.launch({ executablePath: p, args: browserArgs(), headless: true, timeout: 30000 });
    return (String(await browser.version()).match(/(\d+\.\d+\.\d+(?:\.\d+)?)/) || [])[1] || null;
  } catch {
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

let _versionCache;
async function browserVersion(p) {
  if (_versionCache && _versionCache.path === p) return _versionCache.version;
  const version = browserVersionStatic(p) || await browserVersionProbe(p);
  _versionCache = { path: p, version };
  return version;
}

// How PDF page headers/footers are drawn: 'boxes' (CSS margin boxes, clean
// cover page) or 'templates' (puppeteer header/footer templates, fallback for
// browsers before Chromium 131). SN_DOC_MARGIN_BOXES=off forces the fallback.
function pageMode(version) {
  const major = version ? parseInt(version, 10) : NaN;
  const min = frames.MARGIN_BOX_MIN_CHROMIUM;
  if (/^(off|0|false|no)$/i.test(process.env.SN_DOC_MARGIN_BOXES || '')) {
    return { mode: 'templates', ok: null, note: `SN_DOC_MARGIN_BOXES=off — page header/footer use templates, which also print on the cover page` };
  }
  if (Number.isNaN(major)) {
    return { mode: 'boxes', ok: null, note: `browser version unknown — assuming Chromium ${min}+ (CSS page margin boxes); header/footer may be missing on an older browser` };
  }
  if (major >= min) {
    return { mode: 'boxes', ok: true, note: `browser version ${version} — page header/footer via CSS page margin boxes (Chromium ${min}+)` };
  }
  return { mode: 'templates', ok: null, note: `browser version ${version} is older than Chromium ${min} — page header/footer use templates, which also print on the cover page` };
}

async function preflightNode() {
  const out = {
    ok: false,
    nodeOk: false,
    pdfPackageOk: false,
    pdfOk: false,
    htmlOk: false,
    docxOk: false,
    lines: [],
  };
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  const nodeOk = nodeMajor >= NODE_MIN;
  out.nodeOk = nodeOk;
  out.lines.push([nodeOk, `Node v${process.versions.node} (need >= ${NODE_MIN})`]);

  for (const [name, label] of [
    ['md-to-pdf', 'PDF renderer'],
    ['@adobe/helix-md2docx', 'DOCX renderer'],
  ]) {
    const r = tryRequire(name);
    if (name === 'md-to-pdf') out.pdfPackageOk = r.ok;
    if (name === '@adobe/helix-md2docx') out.docxOk = r.ok;
    if (r.ok) out.lines.push([true, `${name} ${r.version}  (${label})`]);
    else out.lines.push([false, `${name} — ${r.error}  (${label})`]);
  }

  // Browser detection — PDF needs a launchable Chromium. On locked-down boxes
  // the puppeteer-bundled Chromium fails to launch (AppLocker/AV), so we look
  // for an installed Chrome/Edge and report its path.
  const browser = findBrowser();
  if (browser) {
    out.pdfOk = nodeOk && out.pdfPackageOk;
    out.htmlOk = out.pdfOk;
    out.lines.push([true, `browser: ${browser}${browserOverride !== null ? '  (--browser)' : ''}`]);
    out.page = pageMode(await browserVersion(browser));
    out.lines.push([out.page.ok, out.page.note]);
  } else if (browserOverride !== null) {
    out.lines.push([false, existsSync(browserOverride)
      ? `browser: --browser path is not an executable file: ${browserOverride} — PDF/HTML render is not ready.`
      : `browser: --browser path not found: ${browserOverride} — PDF/HTML render is not ready.`]);
  } else {
    out.lines.push([false, process.platform === 'win32'
      ? 'no installed browser found — PDF/HTML render is not ready on locked-down systems. Pass --browser with a chrome.exe / msedge.exe path, or set SN_DOC_BROWSER, to override.'
      : 'no installed browser found — PDF/HTML render is not ready. Pass --browser with a Chrome/Chromium/Edge executable, or set SN_DOC_BROWSER, to override.']);
    // Not fatal for DOCX-only renders, but PDF/HTML renders are not ready on
    // locked-down systems until an installed browser is configured.
  }
  out.browser = browser;
  out.ok = nodeOk && (out.pdfOk || out.htmlOk || out.docxOk);
  return out;
}

function nodeReadyForFormats(status, formats) {
  return status.nodeOk &&
    (!formats.includes('pdf') || status.pdfOk) &&
    (!formats.includes('html') || status.htmlOk) &&
    (!formats.includes('docx') || status.docxOk);
}

const tag = (ok) => (ok === true ? '[OK ]' : ok === false ? '[BAD]' : '[WARN]');

async function preflight(selection = null) {
  console.log('sn-doc-export preflight');
  console.log('='.repeat(60));

  const n = await preflightNode();
  for (const [ok, msg] of n.lines) console.log(`  ${tag(ok)} ${msg}`);
  const installHint = 'needs explicit approval; follow install.md (no install is run by this tool).';
  if (!n.nodeOk) {
    console.log('');
    console.log(`  Fix: use Node ${NODE_MIN} or newer.`);
  } else if (!n.pdfPackageOk && !n.docxOk) {
    console.log('');
    console.log(`  Fix: md-to-pdf and @adobe/helix-md2docx are not resolvable. Installing them ${installHint}`);
  } else if (!n.pdfPackageOk) {
    console.log('');
    console.log(`  Fix for PDF/HTML: md-to-pdf is not resolvable. Installing it ${installHint}`);
  } else if (!n.docxOk) {
    console.log('');
    console.log(`  Fix for DOCX: @adobe/helix-md2docx is not resolvable. Installing it ${installHint}`);
  }
  if (n.pdfPackageOk && !n.pdfOk) {
    console.log('');
    console.log('  Fix for PDF/HTML:');
    console.log(`    ${browserFixHint()}`);
  }

  console.log('='.repeat(60));
  if (selection) {
    // Scoped check: the exit status answers "can THIS archetype and format selection render?".
    const ready = nodeReadyForFormats(n, selection.formats);
    const cfg = frames.getArchetype(selection.archetype);
    console.log(`Selected: archetype=${cfg.name} formats=${selection.formats.join(',')} required metadata: ${cfg.required.join(', ') || '(none)'}`);
    console.log(ready
      ? 'READY — the selected archetype and formats can render.'
      : 'NOT READY — a selected format cannot render. See the [BAD] lines above and install.md.');
    return ready;
  }
  if (n.nodeOk && n.pdfOk && n.docxOk) {
    console.log('READY — PDF, HTML and DOCX can render, every archetype.');
    return true;
  }
  if (n.ok) {
    const ready = [];
    if (n.pdfOk) ready.push('PDF/HTML');
    if (n.docxOk) ready.push('DOCX');
    console.log(`PARTIAL — only ${ready.join(' and ')} can render.`);
    return true;
  }
  console.log('NOT READY — nothing can render. See install.md.');
  return false;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// File-name slug: Norwegian/German letters transliterated, accents dropped,
// other characters to '-', cut at a word boundary within 80 characters.
function slugify(s) {
  let slug = (s || 'document').toString().toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > 80) {
    slug = slug.slice(0, 81);
    const cut = slug.lastIndexOf('-');
    slug = (cut > 40 ? slug.slice(0, cut) : slug.slice(0, 80)).replace(/-+$/, '');
  }
  return slug || 'document';
}

const IMG_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

// Split Markdown into [isCode, text] segments so rewrites never touch fenced
// code blocks (a doc may show admonition or image syntax as an example). A
// fence opens with >= 3 backticks or tildes and closes with the same character
// repeated at least as many times.
function splitFences(md) {
  const segments = [];
  let buf = [];
  let fence = null;
  const flush = (isCode) => {
    if (buf.length) segments.push([isCode, buf.join('')]);
    buf = [];
  };
  for (const line of md.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fence) {
      if (m) { flush(false); fence = m[1]; }
      buf.push(line);
    } else {
      buf.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*$/.test(line.slice(line.indexOf(m[1]) + m[1].length))) {
        flush(true);
        fence = null;
      }
    }
  }
  flush(Boolean(fence));
  return segments;
}

// As splitFences, and additionally isolates inline code spans.
function splitCode(md) {
  const out = [];
  for (const [isCode, text] of splitFences(md)) {
    if (isCode) { out.push([true, text]); continue; }
    text.split(/(`+[^`\n]+`+)/).forEach((part, i) => { if (part) out.push([i % 2 === 1, part]); });
  }
  return out;
}

function mapOutsideCode(md, fn) {
  return splitCode(md).map(([isCode, text]) => (isCode ? text : fn(text))).join('');
}

const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;

function rewriteImageSources(md, imageMap, problems = []) {
  if (!imageMap.length) return md;
  const lookup = new Map();
  for (const [k, v] of imageMap) {
    if (!existsSync(resolve(v))) problems.push(`--image-map target not found: ${k}=${resolve(v)}`);
    lookup.set(k, v);
    lookup.set(basename(k), v);
  }
  // ![alt](src "optional title")  — leave title intact
  return mapOutsideCode(md, (text) => text.replace(IMG_RE, (m, alt, src, title) => {
    const hit = lookup.get(src) || lookup.get(basename(src));
    if (!hit) return m;
    // Embed as a data: URI immediately. file:// URLs are unloadable by BOTH
    // node renderers (md-to-pdf serves the HTML from an http origin, which
    // blocks file:// subresources; helix-md2docx only fetches http/https/data),
    // and a plain path containing spaces would no longer match the image
    // regex on the later resolveRelativeImages pass.
    const abs = resolve(hit);
    if (!existsSync(abs)) return m; // already reported above
    const type = IMG_MIME[extname(abs).toLowerCase()];
    if (!type) { problems.push(`unsupported image type for ${src}: ${abs}`); return m; }
    const data = readFileSync(abs).toString('base64');
    return `![${alt}](data:${type};base64,${data}${title || ''})`;
  }));
}

// MyST :::{kind} title? / body / ::: → callout HTML md-to-pdf can render.
// The title is whatever follows the directive ON THE SAME LINE; without one
// the kind label ("Note", "Warning", ...) is used. With a `boxes` array (DOCX)
// the callout becomes ⟦sn-box:N⟧ ... ⟦/sn-box⟧ marker paragraphs instead, and
// docx-frame.cjs turns them into a shaded, bordered box.
function expandAdmonitions(md, boxes = null) {
  const kinds = ['note', 'tip', 'important', 'warning', 'caution', 'danger'];
  const colors = {
    note: '#2563eb', tip: '#10b981', important: '#7c3aed',
    warning: '#f59e0b', caution: '#f97316', danger: '#dc2626',
  };
  const expand = (kind, title, body) => {
    const k = kinds.includes(kind.toLowerCase()) ? kind.toLowerCase() : 'note';
    const c = colors[k];
    const head = (title || '').trim() || k[0].toUpperCase() + k.slice(1);
    if (boxes) {
      boxes.push({ kind: k, title: head, color: c });
      return `\n⟦sn-box:${boxes.length - 1}⟧\n\n${body.trim()}\n\n⟦/sn-box⟧\n`;
    }
    return `\n<div style="border-left:4px solid ${c};background:${c}10;padding:8px 12px;margin:8px 0;">\n<strong style="color:${c}">${head}</strong>\n\n${body.trim()}\n\n</div>\n`;
  };
  // Line scan: a `:::{kind}` line outside a fence opens a callout, the next
  // bare `:::` outside a fence closes it; fenced code inside stays in the body.
  // An unclosed callout is left as written.
  const out = [];
  let fence = null;
  let open = null;
  for (const line of md.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^\s*$/.test(line.slice(line.indexOf(f[1]) + f[1].length))) fence = null;
    } else if (f) {
      fence = f[1];
    } else if (!open) {
      const m = line.match(/^:::[ \t]*\{(\w+)\}[ \t]*([^\r\n]*)/);
      if (m) { open = { kind: m[1], title: m[2], first: line, body: [] }; continue; }
    } else if (/^:::[ \t]*\r?\n?$/.test(line)) {
      out.push(expand(open.kind, open.title, open.body.join('')), line.endsWith('\n') ? '\n' : '');
      open = null;
      continue;
    }
    (open ? open.body : out).push(line);
  }
  if (open) out.push(open.first, ...open.body);
  return out.join('');
}

function preprocessMd(md, imageMap, problems = [], boxes = null) {
  let out = md;
  out = expandAdmonitions(out, boxes);
  out = rewriteImageSources(out, imageMap, problems);
  return out;
}

// ---------------------------------------------------------------------------
// render — node backend
// ---------------------------------------------------------------------------

// Convert relative ![alt](rel/path.png) into base64 data: URIs so downstream
// renderers (md-to-pdf which loads in-memory HTML, helix-md2docx which fetches
// resources) embed them regardless of working directory or Chromium's
// restrictions on file:// inclusion from data: documents. Absolute URLs and
// existing data: URIs are passed through untouched.
function resolveRelativeImages(md, baseDir, problems = []) {
  return mapOutsideCode(md, (text) => text.replace(IMG_RE, (m, alt, src, title) => {
    // scheme needs >= 2 letters so Windows drive letters (C:\...) fall through
    // to the absolute-path branch below instead of being skipped as a scheme
    if (/^([a-z]{2,}:|\/\/)/i.test(src)) return m; // http:, https:, data:, file:, //...
    let local = src;
    try { local = decodeURI(src); } catch { /* keep the literal source */ }
    const abs = /^[a-zA-Z]:[\\/]|^\//.test(local) ? local : resolve(baseDir, local);
    if (!existsSync(abs)) { problems.push(`image not found: ${src} (looked for ${abs})`); return m; }
    const ext = extname(abs).toLowerCase();
    const type = IMG_MIME[ext];
    if (!type) { problems.push(`unsupported image type: ${src}`); return m; }
    const data = readFileSync(abs).toString('base64');
    return `![${alt}](data:${type};base64,${data}${title || ''})`;
  }));
}

// A --reference-docx template: its styles, and whether it brings headers/footers.
function readReferenceDocx(referenceDocx) {
  if (!existsSync(referenceDocx)) throw new Error(`--reference-docx not found: ${referenceDocx}`);
  const zip = readZip(readFileSync(referenceDocx));
  const styles = zip.get('word/styles.xml');
  if (!styles) throw new Error(`reference docx has no word/styles.xml: ${referenceDocx}`);
  const rels = zip.get('word/_rels/document.xml.rels')?.toString('utf8') || '';
  return { zip, stylesXML: styles.toString('utf8'), hasChrome: /Type="[^"]*\/(?:header|footer)"/.test(rels) };
}

// Copy headers/footers (and their referenced media) from a reference .docx into
// a generated docx buffer. Inherits page geometry only via the existing sectPr;
// header/footer references are injected so Word renders the corporate chrome.
function mergeReferenceChrome(generatedBuf, tpl) {
  const out = readZip(generatedBuf);
  const text = (zip, name) => zip.get(name)?.toString('utf8');

  const tplDocRels = text(tpl, 'word/_rels/document.xml.rels');
  if (!tplDocRels) return generatedBuf;
  const tplDocXml = text(tpl, 'word/document.xml') || '';

  // Find header/footer relationships in template's document.xml.rels.
  const relRe = /<Relationship\s+([^>]*?)\/>/g;
  const attr = (s, n) => (s.match(new RegExp(`${n}="([^"]*)"`)) || [])[1];
  const tplChrome = []; // { oldRid, kind:'header'|'footer', target }
  for (const m of tplDocRels.matchAll(relRe)) {
    const a = m[1];
    const t = attr(a, 'Type') || '';
    let kind = null;
    if (t.endsWith('/header')) kind = 'header';
    else if (t.endsWith('/footer')) kind = 'footer';
    if (!kind) continue;
    tplChrome.push({ oldRid: attr(a, 'Id'), kind, target: attr(a, 'Target') });
  }
  if (tplChrome.length === 0) return generatedBuf;

  // Read target's existing rels + content types.
  const outRelsPath = 'word/_rels/document.xml.rels';
  let outRels = text(out, outRelsPath);
  const ctPath = '[Content_Types].xml';
  let ctXml = text(out, ctPath);

  // Highest existing rId in target.
  let maxRid = 0;
  for (const m of outRels.matchAll(/Id="rId(\d+)"/g)) {
    const n = parseInt(m[1], 10);
    if (n > maxRid) maxRid = n;
  }
  const nextRid = () => `rId${++maxRid}`;

  const oldToNewRid = {}; // template's chrome rId -> target rId
  const addedExt = new Set(); // extensions added as Default to content-types

  // Default extensions already present in target's CT.
  const ctExtPresent = new Set(
    [...ctXml.matchAll(/<Default[^/]*Extension="([^"]+)"/g)].map(m => m[1].toLowerCase())
  );

  for (const ch of tplChrome) {
    const partName = `word/${ch.target}`;
    const partXml = text(tpl, partName);
    if (!partXml) continue;

    // Copy part rels file (if any) — and rewrite media targets to prefixed names
    // to avoid collisions with helix-generated hashed media filenames.
    const partRelsPath = `word/_rels/${ch.target}.rels`;
    const partRelsXml = text(tpl, partRelsPath);
    let newPartRelsXml = partRelsXml;
    if (partRelsXml) {
      // For every relationship targeting media/, copy that media file under a
      // tpl_-prefixed name and rewrite the target.
      const mediaTargets = [...partRelsXml.matchAll(/Target="(media\/[^"]+)"/g)].map(m => m[1]);
      for (const t of mediaTargets) {
        const data = tpl.get(`word/${t}`);
        if (!data) continue;
        const base = t.replace(/^media\//, '');
        const newName = `media/tpl_${base}`;
        out.set(`word/${newName}`, data);
        newPartRelsXml = newPartRelsXml.split(`Target="${t}"`).join(`Target="${newName}"`);
        // Ensure CT has Default for this extension.
        const ext = (base.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
        if (ext && !ctExtPresent.has(ext) && !addedExt.has(ext)) {
          addedExt.add(ext);
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : ext === 'png' ? 'image/png'
            : ext === 'gif' ? 'image/gif'
            : ext === 'bmp' ? 'image/bmp'
            : ext === 'svg' ? 'image/svg+xml'
            : 'application/octet-stream';
          ctXml = ctXml.replace('</Types>', `<Default Extension="${ext}" ContentType="${mime}"/></Types>`);
        }
      }
      out.set(partRelsPath, newPartRelsXml);
    }

    // Write the part itself.
    out.set(partName, partXml);

    // Add Override for this part to content types.
    const ctType = ch.kind === 'header'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
    if (!ctXml.includes(`PartName="/${partName}"`)) {
      ctXml = ctXml.replace('</Types>', `<Override PartName="/${partName}" ContentType="${ctType}"/></Types>`);
    }

    // Add relationship to document.xml.rels.
    const newRid = nextRid();
    oldToNewRid[ch.oldRid] = newRid;
    const relType = ch.kind === 'header'
      ? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'
      : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
    outRels = outRels.replace('</Relationships>',
      `<Relationship Id="${newRid}" Type="${relType}" Target="${ch.target}"/></Relationships>`);
  }

  // Inject header/footer references into target's <w:sectPr>. Mirror the
  // template's references (preserving w:type) but with remapped rIds.
  const refRe = /<w:(headerReference|footerReference)\b[^/]*?\/>/g;
  const newRefs = [];
  for (const m of tplDocXml.matchAll(refRe)) {
    const elem = m[0];
    const oldRid = (elem.match(/r:id="([^"]+)"/) || [])[1];
    if (!oldRid || !oldToNewRid[oldRid]) continue;
    newRefs.push(elem.replace(/r:id="[^"]+"/, `r:id="${oldToNewRid[oldRid]}"`));
  }
  if (newRefs.length === 0) {
    // Fallback: synthesise default refs for every chrome part we copied.
    for (const ch of tplChrome) {
      if (!oldToNewRid[ch.oldRid]) continue;
      newRefs.push(`<w:${ch.kind}Reference w:type="default" r:id="${oldToNewRid[ch.oldRid]}"/>`);
    }
  }
  // A template with a distinct first-page header keeps it distinct.
  const titlePg = /<w:titlePg\b(?![^>]*w:val="(?:0|false)")/.test(tplDocXml);

  let docXml = text(out, 'word/document.xml');
  const sectAt = docXml.lastIndexOf('<w:sectPr');
  let tail = docXml.slice(sectAt).replace(/^<w:sectPr\b([^>]*?)\/>/, '<w:sectPr$1></w:sectPr>');
  tail = tail.replace(/<w:(header|footer)Reference\b[^>]*\/>/g, '');
  tail = tail.replace(/^<w:sectPr\b[^>]*>/, (match) => `${match}${newRefs.join('')}`);
  if (titlePg && !/<w:titlePg/.test(tail)) {
    tail = /<w:(?:textDirection|bidi|rtlGutter|docGrid|printerSettings)\b/.test(tail)
      ? tail.replace(/<w:(textDirection|bidi|rtlGutter|docGrid|printerSettings)\b/, '<w:titlePg/><w:$1')
      : tail.replace('</w:sectPr>', '<w:titlePg/></w:sectPr>');
  }
  docXml = docXml.slice(0, sectAt) + tail;
  out.set('word/document.xml', docXml);
  out.set(outRelsPath, outRels);
  out.set(ctPath, ctXml);

  return writeZip(out);
}

function launchOptions() {
  const browser = findBrowser();
  const opts = { args: browserArgs() };
  if (browser) opts.executablePath = browser;
  return opts;
}

// doc: { cfg, meta, title, htmlMd, docxMd, boxes, pageMode }
async function renderNode({ outDir, formats, doc, referenceDocx, stylesheet, force }) {
  const results = [];
  const slug = slugify(doc.title);
  const { cfg, meta } = doc;
  const extraCss = stylesheet ? `\n/* --stylesheet */\n${readFileSync(stylesheet, 'utf8')}` : '';

  // A reference .docx lends its styles (and headers/footers, when it has them).
  const reference = referenceDocx ? readReferenceDocx(referenceDocx) : null;
  if (reference?.hasChrome && formats.includes('docx')) {
    console.log('  note: --reference-docx headers/footers replace the archetype header/footer in DOCX.');
  }

  for (const fmt of formats) {
    const outPath = resolve(join(outDir, `${slug}.${fmt}`));
    try {
      if (existsSync(outPath) && !force) {
        throw new Error(`Output exists: ${outPath}. Re-run with --force only after confirming overwrite.`);
      }
      if (fmt === 'pdf') {
        const { mdToPdf } = await importPackage('md-to-pdf');
        const boxes = doc.pageMode === 'boxes';
        const pdf = await mdToPdf(
          { content: frames.framedMarkdown(cfg, meta, doc.htmlMd) },
          {
            dest: outPath,
            document_title: escapeHtml(doc.title),
            stylesheet_encoding: 'utf-8',
            css: frames.frameCss(cfg, meta, boxes ? 'boxes' : 'templates') + extraCss,
            marked_options: { headerIds: true, headerPrefix: '' },
            pdf_options: {
              format: 'A4',
              printBackground: true,
              outline: true,
              margin: { top: '24mm', bottom: '22mm', left: '20mm', right: '20mm' },
              ...(boxes ? { displayHeaderFooter: false } : frames.pdfTemplates(cfg, meta)),
            },
            launch_options: launchOptions(),
          },
        );
        if (!pdf) throw new Error('md-to-pdf returned no content');
      } else if (fmt === 'docx') {
        const mod = await importPackage('@adobe/helix-md2docx');
        const md2docx = mod.md2docx || mod.default || mod;
        if (typeof md2docx !== 'function') {
          throw new Error(`@adobe/helix-md2docx export shape unexpected: ${Object.keys(mod).join(', ')}`);
        }
        const docxOpts = {};
        if (reference) docxOpts.stylesXML = reference.stylesXML;
        // The DOCX renderer drops task-list checkbox state; keep it as text.
        const docxMd = mapOutsideCode(doc.docxMd, (text) => text.replace(
          /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\][ \t]+/gm,
          (m, lead, mark) => `${lead}${mark === ' ' ? '☐' : '☑'} `,
        ));
        let buf = Buffer.from(await md2docx(docxMd, docxOpts));
        buf = frameDocx(buf, cfg, meta, doc.docxMd, {
          chrome: !reference?.hasChrome,
          styles: !reference,
          boxes: doc.boxes,
        });
        if (reference?.hasChrome) buf = mergeReferenceChrome(buf, reference.zip);
        writeFileSync(outPath, buf);
      } else if (fmt === 'html') {
        const { mdToPdf } = await importPackage('md-to-pdf');
        const html = await mdToPdf(
          { content: frames.framedMarkdown(cfg, meta, doc.htmlMd) },
          {
            as_html: true,
            document_title: escapeHtml(doc.title),
            css: frames.frameCss(cfg, meta, 'screen') + extraCss,
            marked_options: { headerIds: true, headerPrefix: '' },
            launch_options: launchOptions(),
          },
        );
        writeFileSync(outPath, html.content, 'utf8');
      } else {
        throw new Error(`unsupported format: ${fmt}`);
      }
      const size = statSync(outPath).size;
      console.log(`  [OK ] ${fmt.padEnd(4)} -> ${outPath}  (${size.toLocaleString()} bytes)`);
      results.push([fmt, outPath]);
    } catch (e) {
      console.error(`  [FAIL] ${fmt}: ${e.constructor.name}: ${e.message}`);
      if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
      return 3;
    }
  }
  return results.length ? 0 : 1;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function parseFormats(value) {
  const formats = [...new Set(String(value).split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
  const bad = formats.filter(f => !VALID_FORMATS.includes(f));
  if (!formats.length || bad.length) {
    return { error: `Unsupported --format value: ${bad.join(', ') || '(empty)'}. Valid formats: ${VALID_FORMATS.join(', ')}.` };
  }
  return { formats };
}

// Validate names before anything is read or written, so a typo is reported as
// a typo. --backend is retired: node/auto are accepted with a note.
function resolveArchetype(name, backend) {
  if (backend === 'python') {
    return { error: 'The python backend was removed; all archetypes render in Node. Drop --backend.' };
  }
  if (backend !== null && backend !== 'node' && backend !== 'auto') {
    return { error: `Unknown backend: ${backend}. --backend is no longer needed; drop it.` };
  }
  const cfg = frames.getArchetype(name);
  if (!cfg) {
    return { error: `Unknown archetype: ${name}. Valid values: ${ARCHETYPE_NAMES.join(', ')}.` };
  }
  return { cfg, note: backend !== null ? '--backend is no longer needed (every archetype renders in Node); ignored.' : null };
}

// Front matter + --meta -> metadata; required keys checked. Returns
// { doc } or { error } (exit 2, nothing written).
function prepareDocument(raw, cfg, cliMeta, inPath) {
  const front = frames.parseFrontMatter(raw);
  const { meta, body, titleFrom } = frames.resolveMetadata(cfg, front.meta, cliMeta, front.md);
  const warnings = front.ignored.map((l) => `front matter line ignored (only flat 'key: value' lines are read): ${l}`);
  for (const k of front.comments) warnings.push(`front matter ${k}: text after ' #' was read as a comment and dropped; quote the value to keep it`);
  const unused = frames.unusedMetadata(cfg, meta);
  if (unused.length) warnings.push(`metadata not used by archetype ${cfg.name}: ${unused.join(', ')}`);
  const missing = frames.missingMetadata(cfg, meta);
  if (missing.length) {
    return {
      warnings,
      error: `Archetype ${cfg.name}: missing required metadata: ${missing.join(', ')}. `
        + `Add them to the front matter ('key: value' lines between --- markers) or pass --meta 'key=value'. No output written.`,
    };
  }
  const title = titleFrom === 'meta' ? meta.title : basename(inPath, extname(inPath));
  if (!meta.title) meta.title = title;
  return { warnings, doc: { cfg, meta, title, body } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.browser !== null) browserOverride = resolve(args.browser);
  if (args.nodePath !== null) {
    nodePathOverride = resolve(args.nodePath);
    if (!existsSync(nodePathOverride) || !statSync(nodePathOverride).isDirectory()) {
      console.error(`--node-path is not a directory: ${nodePathOverride}`);
      process.exit(2);
    }
  }

  const parsed = parseFormats(args.format);
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  const formats = parsed.formats;
  const routed = resolveArchetype(args.archetype, args.backend);
  if (routed.error) { console.error(routed.error); process.exit(2); }
  if (routed.note) console.error(`  note: ${routed.note}`);
  const cfg = routed.cfg;

  if (args.check) {
    const scoped = args.explicit.has('format') || args.explicit.has('archetype');
    const ok = await preflight(scoped ? { archetype: cfg.name, formats } : null);
    process.exit(ok ? 0 : 2);
  }
  if (!args.in) {
    console.error('--in is required unless --check is used');
    printHelp();
    process.exit(2);
  }
  if (!existsSync(args.in) || !statSync(args.in).isFile()) {
    console.error(`Input not found: ${args.in}`);
    process.exit(2);
  }
  if (args.stylesheet && !existsSync(args.stylesheet)) {
    console.error(`--stylesheet not found: ${args.stylesheet}`);
    process.exit(2);
  }
  if (args.referenceDocx && !existsSync(args.referenceDocx)) {
    console.error(`--reference-docx not found: ${args.referenceDocx}`);
    process.exit(2);
  }

  const raw = readFileSync(args.in, 'utf8');
  const prepared = prepareDocument(raw, cfg, args.meta, args.in);
  for (const w of prepared.warnings) console.error(`  warn: ${w}`);
  if (prepared.error) { console.error(prepared.error); process.exit(2); }
  const doc = prepared.doc;
  console.log(`Archetype: ${cfg.name}${cfg.name !== args.archetype ? ` (from '${args.archetype}')` : ''}`);

  const np = await preflightNode();
  if (!nodeReadyForFormats(np, formats)) {
    console.error('Not ready for the requested format(s). Run --check.');
    process.exit(2);
  }
  if (np.page && (formats.includes('pdf'))) {
    doc.pageMode = np.page.mode;
    if (np.page.ok !== true) console.error(`  warn: ${np.page.note}`);
  }

  const problems = [];
  const baseDir = dirname(resolve(args.in));
  doc.htmlMd = resolveRelativeImages(preprocessMd(doc.body, args.imageMap, problems), baseDir, problems);
  doc.boxes = [];
  doc.docxMd = resolveRelativeImages(preprocessMd(doc.body, args.imageMap, [], doc.boxes), baseDir, []);
  if (problems.length) {
    for (const problem of problems) console.error(`  [FAIL] ${problem}`);
    console.error('No output written. Fix the image paths or --image-map entries and re-run.');
    process.exit(2);
  }
  // Refuse an overwrite before anything is written, so no partial set is produced.
  const existing = formats.map(f => resolve(args.out, `${slugify(doc.title)}.${f}`)).filter(f => existsSync(f));
  if (existing.length && !args.force) {
    for (const file of existing) console.error(`  [FAIL] Output exists: ${file}`);
    console.error('No output written. Re-run with --force only after confirming overwrite.');
    process.exit(2);
  }
  console.log(`Parsing ${args.in} (${raw.length.toLocaleString()} bytes) …`);
  mkdirSync(resolve(args.out), { recursive: true });
  const code = await renderNode({
    outDir: resolve(args.out),
    formats,
    doc,
    referenceDocx: args.referenceDocx,
    stylesheet: args.stylesheet,
    force: args.force,
  });
  process.exit(code);
}

main().catch((e) => {
  console.error(`fatal: ${e.constructor.name}: ${e.message}`);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
