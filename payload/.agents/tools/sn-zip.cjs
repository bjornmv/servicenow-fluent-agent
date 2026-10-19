#!/usr/bin/env node
'use strict';

// Dependency-free zip reader for `sn-skill zip`: list entries, or extract into a new or
// empty folder. Same command on Windows PowerShell 5.1 and bash (no Expand-Archive, unzip
// or python). Supports stored and deflate entries; refuses zip64, encryption, symlinks and
// unsafe names before anything is written. Extract also refuses archives over the size
// limits below (list still lists them).
//
//   sn-skill zip list "<zip>"
//   sn-skill zip extract "<zip>" [--out "<dir>"]
//
// Exit 0 = done; 1 = unreadable/corrupt archive or write failure; 2 = usage error or a
// refused archive/output folder (nothing written).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

class ZipError extends Error {
  constructor(message, code) { super(message); this.exitCode = code; }
}
const refuse = message => new ZipError(message, 2);
const corrupt = message => new ZipError(message, 1);

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

const MiB = 1024 * 1024;
const MAX_TOTAL = 1024 * MiB; // declared uncompressed bytes, whole archive
const MAX_ENTRY = 1024 * MiB; // declared uncompressed bytes, one entry
const MAX_ENTRIES = 100000;
const BOMB_RATIO = 200; // refused above this ratio when the entry is also over BOMB_MIN
const BOMB_MIN = 10 * MiB;

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

// Returns a problem description for an entry name, or '' when it is a safe relative path.
function unsafeName(name) {
  if (!name) return 'empty name';
  if (/[\0-\x1f]/.test(name)) return 'control character in name';
  if (name.includes('\\')) return 'backslash in name';
  if (name.startsWith('/')) return 'absolute path';
  if (/^[A-Za-z]:/.test(name) || name.includes(':')) return 'drive letter or colon in name';
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.some(p => p === '..')) return "'..' path segment";
  if (parts.some(p => p === '' || p === '.')) return 'empty or "." path segment';
  // Windows rewrites or rejects these, so they could collide, vanish or (".. ", "...") climb out.
  if (parts.some(p => /[. ]$/.test(p))) return 'path segment ends in "." or space';
  if (/[<>"|?*]/.test(name)) return 'character not allowed in Windows file names';
  if (parts.some(p => /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i.test(p))) return 'reserved Windows device name';
  return '';
}

function readEntries(zipPath) {
  let buf;
  try { buf = fs.readFileSync(zipPath); }
  catch (error) { throw corrupt(`cannot read ${zipPath}: ${error.code || error.message}`); }

  // End of central directory: last 22 bytes plus an optional comment of up to 65535 bytes.
  // The comment may itself contain the signature (even a whole fake record), so take the
  // record whose comment reaches the end of the file and whose central directory ends right
  // before it; fall back to the last signature only for archives with trailing junk.
  let eocd = -1;
  let fallback = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) !== SIG_EOCD) continue;
    if (i + 22 + buf.readUInt16LE(i + 20) === buf.length && buf.readUInt32LE(i + 12) + buf.readUInt32LE(i + 16) === i) { eocd = i; break; }
    if (fallback < 0) fallback = i;
  }
  if (eocd < 0) eocd = fallback;
  if (eocd < 0) throw corrupt(`${zipPath} is not a zip archive (no end-of-central-directory record).`);
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCATOR) throw refuse('zip64 archives are not supported.');
  const disk = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw refuse('zip64 archives are not supported.');
  if (disk !== 0 || cdDisk !== 0 || buf.readUInt16LE(eocd + 8) !== count) throw refuse('multi-part (spanned) archives are not supported.');
  if (cdOffset + cdSize > eocd) throw corrupt('central directory lies outside the archive.');

  const entries = [];
  const seen = new Set();
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== SIG_CENTRAL) throw corrupt(`bad central directory entry ${n + 1}.`);
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const external = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    const nameBuf = buf.subarray(p + 46, p + 46 + nameLen);
    const name = nameBuf.toString(flags & 0x800 ? 'utf8' : 'latin1');
    const extra = buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x41) throw refuse(`encrypted entry ${JSON.stringify(name)}; encrypted archives are not supported.`);
    if (csize === 0xffffffff || usize === 0xffffffff || localOffset === 0xffffffff) throw refuse('zip64 archives are not supported.');
    for (let e = 0; e + 4 <= extra.length;) {
      const id = extra.readUInt16LE(e);
      if (id === 0x0001) throw refuse('zip64 archives are not supported.');
      if (id === 0x9901) throw refuse(`encrypted entry ${JSON.stringify(name)}; encrypted archives are not supported.`);
      e += 4 + extra.readUInt16LE(e + 2);
    }
    const problem = unsafeName(name);
    if (problem) throw refuse(`unsafe entry ${JSON.stringify(name)} (${problem}).`);
    const mode = (madeBy >>> 8) === 3 ? (external >>> 16) & S_IFMT : 0; // Unix host: mode in high word
    if (mode === S_IFLNK) throw refuse(`symbolic link entry ${JSON.stringify(name)}; links are not extracted.`);
    const dir = name.endsWith('/') || mode === S_IFDIR || (external & 0x10) !== 0;
    if (mode && mode !== S_IFREG && mode !== S_IFDIR) throw refuse(`special file entry ${JSON.stringify(name)}.`);
    if (!dir && method !== 0 && method !== 8) throw refuse(`entry ${JSON.stringify(name)} uses compression method ${method}; only stored (0) and deflate (8) are supported.`);
    const key = name.replace(/\/$/, '').toLowerCase(); // case-insensitive: Windows folders collide
    if (seen.has(key)) throw refuse(`duplicate entry ${JSON.stringify(name)}.`);
    seen.add(key);
    entries.push({ name, dir, method, crc, csize, usize, localOffset });
  }
  // A file and a folder may not claim the same path prefix ("a" as file and "a/b").
  const files = new Set(entries.filter(e => !e.dir).map(e => e.name.toLowerCase()));
  for (const entry of entries) {
    const parts = entry.name.replace(/\/$/, '').toLowerCase().split('/');
    for (let i = 1; i < parts.length; i++) {
      if (files.has(parts.slice(0, i).join('/'))) throw refuse(`entry ${JSON.stringify(entry.name)} is inside a file entry.`);
    }
  }
  return { buf, entries };
}

// Extraction limits, checked from the central directory before anything is written. Inflate
// is also capped at the declared size (entryData), so a lying header cannot use more memory.
// archiveSize (bytes of the zip file) adds the same ratio check for the archive as a whole,
// so many entries just under 10 MiB cannot get around it.
function checkLimits(entries, archiveSize = Infinity) {
  if (entries.length > MAX_ENTRIES) throw refuse(`archive has ${entries.length} entries; the limit is ${MAX_ENTRIES}. Nothing was written.`);
  let total = 0;
  for (const e of entries) {
    if (e.dir) continue;
    if (e.usize > MAX_ENTRY) throw refuse(`entry ${JSON.stringify(e.name)} declares ${e.usize} bytes; the limit is 1 GiB per entry. Nothing was written.`);
    if (e.usize > BOMB_MIN && e.usize > e.csize * BOMB_RATIO) throw refuse(`entry ${JSON.stringify(e.name)} expands ${e.csize} to ${e.usize} bytes (over ${BOMB_RATIO}:1 for an entry over 10 MiB; possible zip bomb). Nothing was written.`);
    total += e.usize;
  }
  if (total > MAX_TOTAL) throw refuse(`archive declares ${total} uncompressed bytes; the limit is 1 GiB in total. Nothing was written.`);
  if (total > BOMB_MIN && total > archiveSize * BOMB_RATIO) throw refuse(`archive expands ${archiveSize} to ${total} bytes (over ${BOMB_RATIO}:1 in total; possible zip bomb). Nothing was written.`);
}

// File entries must each own their compressed data: several central-directory records that
// point at the same or overlapping local data multiply one payload (possible zip bomb).
// A missing local header is left for entryData to report as corrupt.
function checkOverlap(buf, entries) {
  const files = entries.filter(e => !e.dir).sort((a, b) => a.localOffset - b.localOffset);
  let end = 0;
  for (const e of files) {
    if (e.localOffset < end) throw refuse('entries share or overlap compressed data (possible zip bomb). Nothing was written.');
    const at = e.localOffset;
    if (at + 30 > buf.length || buf.readUInt32LE(at) !== SIG_LOCAL) continue;
    end = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28) + e.csize;
  }
}

function entryData(buf, entry) {
  const at = entry.localOffset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== SIG_LOCAL) throw corrupt(`bad local header for ${JSON.stringify(entry.name)}.`);
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  if (start + entry.csize > buf.length) throw corrupt(`data for ${JSON.stringify(entry.name)} runs past the end of the archive.`);
  const raw = buf.subarray(start, start + entry.csize);
  let data;
  if (entry.method === 0) data = raw;
  else {
    try { data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(entry.usize, 1) }); }
    catch (error) {
      if (error.code === 'ERR_BUFFER_TOO_LARGE') throw corrupt(`${JSON.stringify(entry.name)} inflates past its declared ${entry.usize} bytes.`);
      throw corrupt(`cannot inflate ${JSON.stringify(entry.name)}: ${error.code || error.message}`);
    }
  }
  if (data.length !== entry.usize) throw corrupt(`size mismatch for ${JSON.stringify(entry.name)}.`);
  if (crc32(data) !== entry.crc) throw corrupt(`CRC mismatch for ${JSON.stringify(entry.name)}.`);
  return data;
}

function list(zipPath, out) {
  const { entries } = readEntries(zipPath);
  let total = 0;
  for (const e of entries) {
    total += e.dir ? 0 : e.usize;
    out.write(`${String(e.dir ? '-' : e.usize).padStart(10)}  ${e.name}\n`);
  }
  out.write(`${entries.filter(e => !e.dir).length} files, ${total} bytes\n`);
}

function prepareOut(outArg) {
  if (!outArg) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-zip-'));
    return { dir, created: dir };
  }
  const dir = path.resolve(outArg);
  let stat;
  try { stat = fs.lstatSync(dir); }
  catch (error) { if (error.code !== 'ENOENT') throw corrupt(`cannot inspect ${dir}: ${error.code}`); }
  // created = the topmost folder this run made (parents included), removed again on failure
  if (!stat) return { dir, created: fs.mkdirSync(dir, { recursive: true }) };
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw refuse(`--out ${dir} exists and is not a plain folder. Nothing was written.`);
  if (fs.readdirSync(dir).length) throw refuse(`--out ${dir} is not empty. Choose a new or empty folder. Nothing was written.`);
  return { dir, created: null };
}

function extract(zipPath, outArg, out) {
  const { buf, entries } = readEntries(zipPath); // every refusal happens before any write
  checkLimits(entries, buf.length);
  checkOverlap(buf, entries);
  const { dir: root, created } = prepareOut(outArg);
  const realRoot = fs.realpathSync(root);
  let bytes = 0;
  try {
    for (const entry of entries) {
      const target = path.resolve(realRoot, ...entry.name.replace(/\/$/, '').split('/'));
      if (!target.startsWith(realRoot + path.sep)) throw refuse(`unsafe entry ${JSON.stringify(entry.name)} (outside the output folder).`);
      if (entry.dir) { fs.mkdirSync(target, { recursive: true }); continue; }
      const data = entryData(buf, entry);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data, { flag: 'wx' }); // never follow or overwrite an existing path
      bytes += data.length;
    }
  } catch (error) {
    // The folder was new or empty, so everything in it is ours to remove.
    if (created) fs.rmSync(created, { recursive: true, force: true });
    else for (const item of fs.readdirSync(root)) fs.rmSync(path.join(root, item), { recursive: true, force: true });
    if (error instanceof ZipError) throw error;
    throw corrupt(`extraction failed: ${error.code || error.message}. Partial output was removed.`);
  }
  out.write(`extracted ${entries.filter(e => !e.dir).length} files, ${bytes} bytes\n${realRoot}\n`);
}

const USAGE = 'Usage: sn-skill zip list "<zip>"\n       sn-skill zip extract "<zip>" [--out "<new-or-empty-dir>"]\n';

function main(argv, out = process.stdout, err = process.stderr) {
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h') { out.write(USAGE); return 0; }
  let outDir = null;
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out' && command === 'extract' && outDir === null && rest[i + 1]) outDir = rest[++i];
    else if (rest[i].startsWith('-') || positional.length) { err.write(`sn-zip: unexpected argument ${rest[i]}. Nothing was run.\n${USAGE}`); return 2; }
    else if (rest[i]) positional.push(rest[i]);
  }
  if (!['list', 'extract'].includes(command) || positional.length !== 1) { err.write(USAGE); return 2; }
  try {
    if (command === 'list') list(positional[0], out);
    else extract(positional[0], outDir, out);
    return 0;
  } catch (error) {
    err.write(`sn-zip: ${error instanceof ZipError ? error.message : `unexpected failure: ${error.message}`}\n`);
    return error instanceof ZipError ? error.exitCode : 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, readEntries, checkLimits, checkOverlap, unsafeName, crc32 };
