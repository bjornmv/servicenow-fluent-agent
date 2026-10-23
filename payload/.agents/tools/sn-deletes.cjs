#!/usr/bin/env node
'use strict';

// Read-only pre-install check for `sn-skill deletes`: lists the records the last build will
// DELETE on the instance. A package project turns every keys.ts entry without matching source
// into a delete record (keys.ts `deleted: true`), and `Now.del()` adds more; `now-sdk install`
// applies them, Flow/Subflow/Action records included. Scans the build output, not the source,
// so run it after the final `now-sdk build`.
//
//   sn-skill deletes "<project-root>"
//
// Exit 0 = no delete records; 1 = delete records listed (review before install);
// 2 = usage error or nothing to scan (no now.config.json or build output).

const fs = require('node:fs');
const path = require('node:path');

const USAGE = 'Usage: sn-skill deletes "<project-root>"\n';
const HEX = /^[0-9a-f]{32}$/;

function readConfig(root) {
  const file = path.join(root, 'now.config.json');
  if (!fs.existsSync(file)) throw new Error(`no now.config.json in ${root}; pass the project root`);
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fluentDir = config.fluentDir || path.join('src', 'fluent');
  let generatedDir = config.generatedDir || 'generated';
  // Same rule as the SDK: a generatedDir outside fluentDir is relative to it.
  if (!path.normalize(generatedDir).startsWith(path.normalize(fluentDir))) generatedDir = path.join(fluentDir, generatedDir);
  return {
    type: config.type || 'package',
    outDir: path.resolve(root, config.appOutputDir || config.compileOutputDir || path.join('dist', 'app')),
    keysFile: path.resolve(root, generatedDir, 'keys.ts'),
  };
}

// keys.ts sys_id -> { label, deleted }. Explicit entries are `<name>: { table id [deleted] }`,
// composite ones `{ table id [deleted] key: {...} }`; the top-level `deleted` map holds bare ids.
// Tracks block nesting, so nested `{ id, key }` references inside a composite key are not entries.
// Quote style, semicolons and indentation follow the project's prettier config: accept both.
function readKeys(file) {
  const keys = new Map();
  if (!fs.existsSync(file)) return keys;
  const stack = [];
  let section = -1, kind = '';
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^[}\]]/.test(line)) {
      const block = stack.pop();
      if (block?.id && !keys.has(block.id)) keys.set(block.id, { label: block.label, deleted: block.deleted });
      if (stack.length <= section) section = -1;
      continue;
    }
    const top = stack[stack.length - 1];
    if (section >= 0 && kind === 'deleted') for (const [, id] of line.matchAll(/['"]([0-9a-f]{32})['"]/g)) if (!keys.has(id)) keys.set(id, { label: 'tombstone', deleted: true });
    if (/[{[]$/.test(line)) {
      const m = line.match(/^(?:'([^']*)'|"([^"]*)"|([^\s'":]+))\s*:/), name = m ? m[1] ?? m[2] ?? m[3] : '';
      const block = { name };
      stack.push(block);
      if (section < 0 && /^(?:explicit|composite|deleted)$/.test(name)) { section = stack.length - 1; kind = name; }
      else if (section >= 0 && kind !== 'deleted' && stack.length - 1 === section + 1) Object.assign(block, { entry: true, label: kind === 'explicit' ? name : 'composite', deleted: false });
      continue;
    }
    if (!top?.entry) continue;
    const id = line.match(/^id:\s*['"]([0-9a-f]{32})['"]/)?.[1];
    if (id) top.id = id;
    else if (/^deleted:\s*true\b/.test(line)) top.deleted = true;
  }
  return keys;
}

function xmlFiles(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...xmlFiles(full));
    else if (item.isFile() && item.name.toLowerCase().endsWith('.xml')) out.push(full);
  }
  return out;
}

// One row per file with a DELETE: its record_update table's record, plus child deletes.
function scan(root) {
  const config = readConfig(root);
  if (!fs.existsSync(config.outDir)) throw new Error(`no build output at ${config.outDir}; run now-sdk build first`);
  const keys = readKeys(config.keysFile);
  const rows = [];
  for (const file of xmlFiles(config.outDir)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/\baction="(?:DELETE|delete_multiple)"/.test(text)) continue;
    const table = text.match(/<record_update\b[^>]*\btable="([^"]+)"/)?.[1];
    const deletes = [...text.matchAll(/<([\w.]+)\b[^>]*\baction="DELETE"[^>]*>([\s\S]*?)<\/\1>/g)]
      .map(([, element, inner]) => ({ table: element, id: inner.match(/<sys_id>([^<]*)<\/sys_id>/)?.[1] || '' }));
    const children = (text.match(/\baction="delete_multiple"/g) || []).length;
    if (!deletes.length) continue; // delete_multiple alone prunes children of a record that is updated
    const primary = deletes.find(d => d.table === table) || deletes[0];
    const key = HEX.test(primary.id) ? keys.get(primary.id) : undefined;
    rows.push({ ...primary, key: key ? key.label : 'none', keysDeleted: !!key?.deleted, children: deletes.length - 1 + children,
      file: path.relative(root, file).replace(/\\/g, '/') });
  }
  return { ...config, rows };
}

function main(argv, out = process.stdout, err = process.stderr) {
  if (argv[0] === '--help' || argv[0] === '-h') { out.write(USAGE); return 0; }
  if (argv.length !== 1 || !argv[0] || argv[0].startsWith('-')) { err.write(USAGE); return 2; }
  const root = path.resolve(argv[0]);
  let result;
  try { result = scan(root); } catch (error) { err.write(`sn-deletes: ${error.message}. Nothing to review; this is not a clean result.\n`); return 2; }
  for (const r of result.rows) out.write(`DELETE ${r.table} ${r.id} key=${r.key}${r.keysDeleted ? ' (keys.ts deleted)' : ''}${r.children ? ` children=${r.children}` : ''} ${r.file}\n`);
  const automation = result.rows.filter(r => /^sys_hub_/.test(r.table)).length;
  const rel = file => path.relative(root, file).replace(/\\/g, '/');
  // keys= is the path to diff (fluentDir/generatedDir may move it); `none` = no keys.ts found.
  out.write(`deletes=${result.rows.length} automation=${automation} type=${result.type} output=${rel(result.outDir)} keys=${fs.existsSync(result.keysFile) ? rel(result.keysFile) : 'none'}\n`);
  return result.rows.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, scan, readKeys, readConfig };
