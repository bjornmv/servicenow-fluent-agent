#!/usr/bin/env node
// sn-doc render shim — Node backend (default).
//
// Usage (from PowerShell, via the resolver):
//   $SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'
//   node "$SnDoc" --check
//   node "$SnDoc" --in body.md --format pdf,docx --out docs/dist/
//   node "$SnDoc" --in body.md --backend python --archetype runbook --out docs/dist/
//
// Backends:
//   node    (default) — md-to-pdf (PDF) + @adobe/helix-md2docx (DOCX). Plain archetype only.
//   python  — calls render.py against C:\Personal\SNagent libs. Full archetype set.
//
// Preflight is mandatory before render. Missing deps print the exact install command.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const NODE_MIN = 18;
const SN_AGENT_HOME = process.env.SN_AGENT_HOME || 'C:\\Personal\\SNagent';
const PY_SHIM = process.env.SN_DOC_PY_BIN || join(__dirname, 'render.py');

// Archetypes the Python backend supports (mirrors SNagent registry).
const PYTHON_ARCHETYPES = [
  'plain', 'knowledge_article', 'runbook', 'compliance_report',
  'release_notes', 'architecture', 'customer_deliverable', 'letter',
];
// Node backend currently only renders 'plain'. Asking for others routes to Python automatically.
const NODE_ARCHETYPES = new Set(['plain']);

// ---------------------------------------------------------------------------
// arg parsing — minimal, no external deps
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    check: false,
    in: null,
    out: 'docs/dist',
    format: 'pdf,docx',
    backend: 'auto',
    archetype: 'plain',
    imageMap: [],
    meta: {},
    referenceDocx: null,
    stylesheet: null,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--check': args.check = true; break;
      case '--in': args.in = next(); break;
      case '--out': args.out = next(); break;
      case '--format': args.format = next(); break;
      case '--backend': args.backend = next(); break;
      case '--archetype': args.archetype = next(); break;
      case '--reference-docx': args.referenceDocx = next(); break;
      case '--stylesheet': args.stylesheet = next(); break;
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
        if (eq > 0) args.meta[v.slice(0, eq)] = v.slice(eq + 1);
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
          args.meta[a.slice(7)] = next();
        } else {
          console.error(`Unknown flag: ${a}`);
          process.exit(2);
        }
    }
  }
  return args;
}

function printHelp() {
  console.log(`sn-doc — render MyST/Markdown to PDF + DOCX

Usage:
  node render.js --check
  node render.js --in body.md [--out docs/dist] [--format pdf,docx] [--force]
                 [--backend node|python|auto] [--archetype <name>]
                 [--image-map name.png=C:\\path\\file.png ...]
                 [--meta title=Foo --meta author=Bar ...]

Backends:
  node    md-to-pdf + @adobe/helix-md2docx. Fast, no Python.
          Supports archetype: plain only.
  python  C:\\Personal\\SNagent libs (WeasyPrint + python-docx).
          Supports all archetypes incl. runbook/compliance_report.
  auto    (default) picks node for plain and python for framed archetypes.
          Missing dependencies fail fast instead of switching backends.

Preflight:
  --check inspects both backends and reports OK/MISSING with install
  commands. Run before authoring.

Safety:
  Existing output files are not overwritten unless --force is passed.
`);
}

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

let _globalRootCache;
function globalNodeModulesRoot() {
  if (_globalRootCache !== undefined) return _globalRootCache;
  // Try the conventional Windows path first; fallback spawning uses shell:true
  // for Node 25 command-spawning hardening.
  if (process.platform === 'win32' && process.env.APPDATA) {
    const guess = join(process.env.APPDATA, 'npm', 'node_modules');
    if (existsSync(guess)) { _globalRootCache = guess; return _globalRootCache; }
  }
  // Fallback — spawn npm with shell:true.
  const r = spawnSync(npmCmd(), ['root', '-g'], { encoding: 'utf8', shell: true });
  _globalRootCache = r.status === 0 ? r.stdout.trim() : null;
  return _globalRootCache;
}

function tryRequire(name) {
  // require.resolve(..., {paths}) treats each path as a starting dir and appends
  // node_modules — so for global packages we pass the PARENT of `npm.cmd root -g` on Windows.
  const tryPaths = [process.cwd()];
  const gRoot = globalNodeModulesRoot();
  if (gRoot) tryPaths.push(dirname(gRoot));
  let resolved = null;
  for (const base of tryPaths) {
    try {
      resolved = require.resolve(`${name}/package.json`, { paths: [base] });
      break;
    } catch { /* try next */ }
  }
  if (!resolved) {
    return { ok: false, error: `not installed (searched: cwd${gRoot ? ', ' + gRoot : ''})` };
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

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

/** Find an installed Chromium-family browser. Prefers SN_DOC_BROWSER env var,
 *  then PUPPETEER_EXECUTABLE_PATH, then standard Chrome/Edge install paths.
 *  Returning null is fine — puppeteer will use its bundled Chromium then
 *  (which may be blocked on locked-down boxes). */
function findBrowser() {
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
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function which(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(probe, [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

function preflightNode() {
  const out = {
    backend: 'node',
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
    out.lines.push([true, `browser: ${browser}`]);
  } else {
    out.lines.push([false, 'no installed browser found — PDF/HTML render is not ready on locked-down systems. Set $env:SN_DOC_BROWSER to chrome.exe / msedge.exe path to override.']);
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

function preflightPython() {
  const out = { backend: 'python', ok: true, lines: [], available: false };
  const py = which('python') || which('python3');
  if (!py) {
    out.lines.push([false, 'python not on PATH']);
    out.ok = false;
    return out;
  }
  out.lines.push([true, `python found: ${py}`]);
  if (!existsSync(PY_SHIM)) {
    out.lines.push([false, `render.py missing: ${PY_SHIM}`]);
    out.ok = false;
    return out;
  }
  out.available = true;
  // Delegate to the Python shim's --check for the real report.
  const r = spawnSync(py, [PY_SHIM, '--check'], {
    encoding: 'utf8',
    env: { ...process.env, SN_AGENT_HOME },
  });
  out.subreport = (r.stdout || '').trimEnd();
  out.substderr = (r.stderr || '').trimEnd();
  out.ok = r.status === 0;
  return out;
}

function preflight() {
  console.log('sn-doc preflight');
  console.log('='.repeat(60));

  const n = preflightNode();
  const nodeState = n.nodeOk && n.pdfOk && n.docxOk ? '(READY)' : n.ok ? '(PARTIAL)' : '(NOT READY)';
  console.log(`Backend: node ${nodeState}`);
  for (const [ok, msg] of n.lines) console.log(`  [${ok ? 'OK ' : 'BAD'}] ${msg}`);
  if (!n.nodeOk || (!n.pdfPackageOk && !n.docxOk)) {
    console.log('');
    console.log('  Fix:');
    console.log(`    ${npmCmd()} install -g md-to-pdf "@adobe/helix-md2docx"`);
    console.log('  Note: md-to-pdf downloads Chromium (~170 MB) on first install.');
  } else if (!n.pdfPackageOk) {
    console.log('');
    console.log('  Fix for PDF/HTML:');
    console.log(`    ${npmCmd()} install -g md-to-pdf`);
    console.log('  Note: md-to-pdf downloads Chromium (~170 MB) on first install.');
  } else if (!n.docxOk) {
    console.log('');
    console.log('  Fix for DOCX:');
    console.log(`    ${npmCmd()} install -g "@adobe/helix-md2docx"`);
  }
  if (n.pdfPackageOk && !n.pdfOk) {
    console.log('');
    console.log('  Fix for PDF/HTML:');
    console.log('    Install Chrome or Edge, or set $env:SN_DOC_BROWSER to chrome.exe / msedge.exe.');
  }
  console.log('');

  const p = preflightPython();
  console.log(`Backend: python ${p.ok ? '(READY)' : '(NOT READY, optional)'}`);
  for (const [ok, msg] of p.lines) console.log(`  [${ok ? 'OK ' : 'BAD'}] ${msg}`);
  if (p.subreport) {
    for (const line of p.subreport.split('\n')) console.log(`    | ${line}`);
  }
  if (p.substderr) {
    for (const line of p.substderr.split('\n')) console.log(`    | ${line}`);
  }

  console.log('='.repeat(60));
  if (n.nodeOk && n.pdfOk && n.docxOk) {
    console.log('READY — node backend available for PDF/DOCX.');
    if (!p.ok) console.log('Note: python backend not ready. Framed archetypes (runbook, compliance_report, etc.) need it. See install.md.');
    return true;
  }
  if (n.ok) {
    const ready = [];
    if (n.pdfOk) ready.push('PDF/HTML');
    if (n.docxOk) ready.push('DOCX');
    console.log(`PARTIAL — node backend can render ${ready.join(' and ')}.`);
    if (p.ok) console.log('READY — python backend available for PDF/DOCX framed output.');
    return true;
  }
  if (p.ok) {
    console.log('READY — python backend available (node backend not installed).');
    return true;
  }
  console.log('NOT READY — neither backend can render. See install.md.');
  return false;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function slugify(s) {
  return (s || 'document').toString().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';
}

const IMG_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

function rewriteImageSources(md, imageMap) {
  if (!imageMap.length) return md;
  const lookup = new Map();
  for (const [k, v] of imageMap) {
    lookup.set(k, v);
    lookup.set(basename(k), v);
  }
  // ![alt](src "optional title")  — leave title intact
  return md.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m, alt, src, title) => {
    const hit = lookup.get(src) || lookup.get(basename(src));
    if (!hit) return m;
    // Embed as a data: URI immediately. file:// URLs are unloadable by BOTH
    // node renderers (md-to-pdf serves the HTML from an http origin, which
    // blocks file:// subresources; helix-md2docx only fetches http/https/data),
    // and a plain path containing spaces would no longer match the image
    // regex on the later resolveRelativeImages pass.
    const abs = resolve(hit);
    if (!existsSync(abs)) return m;
    const type = IMG_MIME[extname(abs).toLowerCase()] || 'image/png';
    const data = readFileSync(abs).toString('base64');
    return `![${alt}](data:${type};base64,${data}${title || ''})`;
  });
}

// MyST :::{kind} ... ::: → callout HTML md-to-pdf / docx can render.
function expandAdmonitions(md) {
  const kinds = ['note', 'tip', 'important', 'warning', 'caution', 'danger'];
  const colors = {
    note: '#2563eb', tip: '#10b981', important: '#7c3aed',
    warning: '#f59e0b', caution: '#f97316', danger: '#dc2626',
  };
  // Match block: ::: {kind} title?\n body \n:::
  const re = /^:::\s*\{(\w+)\}\s*(.*)$([\s\S]*?)^:::\s*$/gm;
  return md.replace(re, (m, kind, title, body) => {
    const k = kinds.includes(kind.toLowerCase()) ? kind.toLowerCase() : 'note';
    const c = colors[k];
    const head = (title || k[0].toUpperCase() + k.slice(1)).trim();
    return `\n<div style="border-left:4px solid ${c};background:${c}10;padding:8px 12px;margin:8px 0;">\n<strong style="color:${c}">${head}</strong>\n\n${body.trim()}\n\n</div>\n`;
  });
}

function preprocessMd(md, imageMap) {
  let out = md;
  out = expandAdmonitions(out);
  out = rewriteImageSources(out, imageMap);
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
function resolveRelativeImages(md, baseDir) {
  return md.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m, alt, src, title) => {
    // scheme needs >= 2 letters so Windows drive letters (C:\...) fall through
    // to the absolute-path branch below instead of being skipped as a scheme
    if (/^([a-z]{2,}:|\/\/)/i.test(src)) return m; // http:, https:, data:, file:, //...
    const abs = /^[a-zA-Z]:[\\/]|^\//.test(src) ? src : resolve(baseDir, src);
    if (!existsSync(abs)) return m;
    const ext = extname(abs).toLowerCase();
    const type = IMG_MIME[ext];
    if (!type) return m;
    const data = readFileSync(abs).toString('base64');
    return `![${alt}](data:${type};base64,${data}${title || ''})`;
  });
}

async function loadJSZip() {
  const searchBases = [process.cwd()];
  const helix = tryRequire('@adobe/helix-md2docx');
  if (helix.ok) searchBases.unshift(dirname(helix.pkgJsonPath));
  const gRoot = globalNodeModulesRoot();
  if (gRoot) searchBases.push(dirname(gRoot));

  for (const base of searchBases) {
    try {
      const resolved = require.resolve('jszip', { paths: [base] });
      const mod = require(resolved);
      return mod.default || mod;
    } catch { /* try next */ }
  }
  throw new Error('Cannot load jszip. Install @adobe/helix-md2docx or jszip where Node can resolve it.');
}

// Copy headers/footers (and their referenced media) from a reference .docx into
// a generated docx buffer. Inherits page geometry only via the existing sectPr;
// header/footer references are injected so Word renders the corporate chrome.
async function mergeReferenceChrome(generatedBuf, referenceDocx) {
  const JSZip = await loadJSZip();
  const out = await JSZip.loadAsync(generatedBuf);
  const tpl = await JSZip.loadAsync(readFileSync(referenceDocx));

  const tplDocRels = await tpl.file('word/_rels/document.xml.rels')?.async('string');
  if (!tplDocRels) return generatedBuf;
  const tplDocXml = await tpl.file('word/document.xml')?.async('string') || '';

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
  let outRels = await out.file(outRelsPath).async('string');
  const ctPath = '[Content_Types].xml';
  let ctXml = await out.file(ctPath).async('string');

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
    const partXml = await tpl.file(partName)?.async('string');
    if (!partXml) continue;

    // Copy part rels file (if any) — and rewrite media targets to prefixed names
    // to avoid collisions with helix-generated hashed media filenames.
    const partRelsPath = `word/_rels/${ch.target}.rels`;
    const partRelsXml = await tpl.file(partRelsPath)?.async('string');
    let newPartRelsXml = partRelsXml;
    if (partRelsXml) {
      // For every relationship targeting media/, copy that media file under a
      // tpl_-prefixed name and rewrite the target.
      const mediaTargets = [...partRelsXml.matchAll(/Target="(media\/[^"]+)"/g)].map(m => m[1]);
      for (const t of mediaTargets) {
        const tplMediaPath = `word/${t}`;
        const data = await tpl.file(tplMediaPath)?.async('uint8array');
        if (!data) continue;
        const base = t.replace(/^media\//, '');
        const newName = `media/tpl_${base}`;
        out.file(`word/${newName}`, data);
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
      out.file(partRelsPath, newPartRelsXml);
    }

    // Write the part itself.
    out.file(partName, partXml);

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

  let docXml = await out.file('word/document.xml').async('string');
  if (/<w:sectPr\b[^>]*\/>/.test(docXml)) {
    docXml = docXml.replace(/<w:sectPr\b([^>]*)\/>/, `<w:sectPr$1>${newRefs.join('')}</w:sectPr>`);
  } else if (/<w:sectPr\b[^>]*>/.test(docXml)) {
    // Insert references at the start of the existing sectPr's body.
    docXml = docXml.replace(/<w:sectPr\b[^>]*>/, (match) => `${match}${newRefs.join('')}`);
  }
  out.file('word/document.xml', docXml);
  out.file(outRelsPath, outRels);
  out.file(ctPath, ctXml);

  return await out.generateAsync({ type: 'nodebuffer' });
}

async function renderNode({ inPath, outDir, formats, title, processedMd, referenceDocx, stylesheet, force }) {
  const results = [];
  const slug = slugify(title);
  processedMd = resolveRelativeImages(processedMd, dirname(resolve(inPath)));

  // Extract word/styles.xml from a reference .docx so generated DOCX inherits
  // its paragraph/character styles (corporate template support).
  let stylesXML = null;
  if (referenceDocx) {
    if (!existsSync(referenceDocx)) {
      throw new Error(`--reference-docx not found: ${referenceDocx}`);
    }
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(readFileSync(referenceDocx));
    const entry = zip.file('word/styles.xml');
    if (!entry) throw new Error(`reference docx has no word/styles.xml: ${referenceDocx}`);
    stylesXML = await entry.async('string');
  }

  for (const fmt of formats) {
    const outPath = resolve(join(outDir, `${slug}.${fmt}`));
    try {
      if (existsSync(outPath) && !force) {
        throw new Error(`Output exists: ${outPath}. Re-run with --force only after confirming overwrite.`);
      }
      if (fmt === 'pdf') {
        const { mdToPdf } = await importPackage('md-to-pdf');
        const browser = findBrowser();
        const launchOptions = { args: ['--no-sandbox'] };
        if (browser) launchOptions.executablePath = browser;
        const pdfOpts = {
          dest: outPath,
          stylesheet_encoding: 'utf-8',
          pdf_options: { format: 'A4', margin: '20mm', printBackground: true },
          launch_options: launchOptions,
        };
        if (stylesheet) {
          if (!existsSync(stylesheet)) throw new Error(`--stylesheet not found: ${stylesheet}`);
          pdfOpts.stylesheet = [stylesheet];
        }
        const pdf = await mdToPdf(
          { content: processedMd },
          pdfOpts,
        );
        if (!pdf) throw new Error('md-to-pdf returned no content');
      } else if (fmt === 'docx') {
        const mod = await importPackage('@adobe/helix-md2docx');
        const md2docx = mod.md2docx || mod.default || mod;
        if (typeof md2docx !== 'function') {
          throw new Error(`@adobe/helix-md2docx export shape unexpected: ${Object.keys(mod).join(', ')}`);
        }
        const docxOpts = {};
        if (stylesXML) docxOpts.stylesXML = stylesXML;
        let buf = await md2docx(processedMd, docxOpts);
        if (referenceDocx) {
          buf = await mergeReferenceChrome(buf, referenceDocx);
        }
        writeFileSync(outPath, buf);
      } else if (fmt === 'html') {
        const { mdToPdf } = await importPackage('md-to-pdf');
        const browser = findBrowser();
        const launchOptions = { args: ['--no-sandbox'] };
        if (browser) launchOptions.executablePath = browser;
        const html = await mdToPdf(
          { content: processedMd },
          { as_html: true, launch_options: launchOptions },
        );
        writeFileSync(outPath, html.content, 'utf8');
      } else {
        console.error(`  unsupported format: ${fmt}`);
        continue;
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
// render — python backend (delegates)
// ---------------------------------------------------------------------------

function renderPython(args) {
  const py = which('python') || which('python3');
  if (!py) { console.error('python not on PATH'); return 2; }
  const passthrough = [
    PY_SHIM,
    '--in', args.in,
    '--out', args.out,
    '--archetype', args.archetype,
    '--format', args.format,
  ];
  for (const [k, v] of args.imageMap) passthrough.push('--image-map', `${k}=${v}`);
  // Python shim uses --meta-<key> flags individually; bridge here.
  for (const [k, v] of Object.entries(args.meta)) passthrough.push(`--meta-${k}`, v);
  if (args.force) passthrough.push('--force');

  const r = spawnSync(py, passthrough, {
    stdio: 'inherit',
    env: { ...process.env, SN_AGENT_HOME },
  });
  return r.status ?? 1;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    process.exit(preflight() ? 0 : 2);
  }
  if (!args.in) {
    console.error('--in is required unless --check is used');
    printHelp();
    process.exit(2);
  }
  if (!existsSync(args.in)) {
    console.error(`Input not found: ${args.in}`);
    process.exit(2);
  }

  const formats = args.format.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  // Resolve backend.
  let backend = args.backend;
  if (backend === 'auto') {
    const wantsFramed = !NODE_ARCHETYPES.has(args.archetype);
    backend = wantsFramed ? 'python' : 'node';
  }
  if (backend === 'node' && !NODE_ARCHETYPES.has(args.archetype)) {
    console.error(`Node backend supports archetype 'plain' only (asked: '${args.archetype}'). Use --backend python or --backend auto.`);
    process.exit(2);
  }
  console.log(`Backend: ${backend}`);

  mkdirSync(resolve(args.out), { recursive: true });

  if (backend === 'python') {
    process.exit(renderPython(args));
  }

  // Node path
  const np = preflightNode();
  if (!nodeReadyForFormats(np, formats)) {
    console.error('Node backend not ready for the requested format(s). Run --check.');
    process.exit(2);
  }

  const raw = readFileSync(args.in, 'utf8');
  const processedMd = preprocessMd(raw, args.imageMap);
  const title = args.meta.title || basename(args.in, extname(args.in));
  console.log(`Parsing ${args.in} (${raw.length.toLocaleString()} bytes) …`);
  const code = await renderNode({
    inPath: args.in,
    outDir: resolve(args.out),
    formats,
    title,
    processedMd,
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
