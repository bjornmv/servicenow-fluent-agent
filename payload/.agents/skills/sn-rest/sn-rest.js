#!/usr/bin/env node
/*
 * sn-rest.js — reuse the now-sdk OAuth token for REST calls. Pure Node, no PowerShell.
 *
 * Reads the token now-sdk stored in Windows Credential Manager (service "ServiceNow",
 * account "now-sdk", via @napi-rs/keyring) and either prints it or makes an authed
 * REST call with Node's built-in fetch. Auto-refreshes once on 401.
 *
 * RUN  (PowerShell — bare `now-sdk` shim is blocked on locked-down boxes, so use the resolver):
 *   $SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'
 *   node "$SnRest"                                   # redacted token metadata for default alias
 *   node "$SnRest" --raw                             # access token only — exposes bearer; debug use
 *   node "$SnRest" --dump                            # raw keystore JSON — exposes secrets; debug use
 *   node "$SnRest" --alias dev --instance https://devXXXXXX.service-now.com "/api/now/table/sys_app?sysparm_fields=name,scope,sys_id&sysparm_limit=20"
 *   node "$SnRest" --pretty "/api/now/table/sys_app?sysparm_fields=name,scope,sys_id&sysparm_limit=20"   # human-readable JSON
 *   node "$SnRest" --agent "/api/now/table/sys_app?sysparm_fields=name,scope,sys_id&sysparm_limit=20"    # compact {ok,count,hasMore,nextOffset,records}
 *   node "$SnRest" --alias dev --instance https://devXXXXXX.service-now.com --method POST --body '{"short_description":"hi"}' /api/now/table/incident
 *   node "$SnRest" --alias dev --instance https://devXXXXXX.service-now.com --method POST --body-file payload.json /api/now/table/incident
 *
 * Acts as YOUR user, scope of the SDK OAuth client. Same Windows user that ran `now-sdk auth`.
 */
'use strict';
const path = require('path');
const cp = require('child_process');
const fs = require('fs');

const CLIENT_ID = '543e5655f77746a28228c6009a599dfb'; // built-in ServiceNow IDE public OAuth client

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

// ---- args ----
// Single linear scan that distinguishes flag positions from value positions.
// The old indexOf-based approach mis-parsed cases like `--method --alias`
// (alias picked up the value-slot of --method) and over-triggered aliasExplicit
// when `--alias` appeared as another flag's value.
const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--alias', '--method', '--body', '--body-file', '--instance']);
const BOOL_FLAGS = new Set(['--raw', '--dump', '--pretty', '--agent']);

let alias = '';
let aliasExplicit = false;
let method = 'GET';
let body;            // undefined when not passed
let bodyFile;
let instance;
let raw = false;
let dump = false;
let pretty = false;
let agentOutput = false;
let restPath;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUE_FLAGS.has(a)) {
    const v = argv[i + 1];
    switch (a) {
      case '--alias':     aliasExplicit = true; alias = v ?? ''; break;
      case '--method':    method = (v ?? 'GET').toUpperCase(); break;
      case '--body':      body = v; break;
      case '--body-file': bodyFile = v; break;
      case '--instance':  instance = v; break;
    }
    i++; // consume value
  } else if (BOOL_FLAGS.has(a)) {
    if (a === '--raw')    raw = true;
    if (a === '--dump')   dump = true;
    if (a === '--pretty') pretty = true;
    if (a === '--agent')  agentOutput = true;
  } else if (a.startsWith('--')) {
    // Unknown flag — ignore for forward-compat (matches old lenient behavior).
  } else if (restPath === undefined) {
    restPath = a;
  }
}

if (aliasExplicit && (!alias || alias.startsWith('--'))) {
  console.error('--alias requires a value');
  process.exit(2);
}
if (body !== undefined && bodyFile) {
  console.error('Use either --body or --body-file, not both');
  process.exit(2);
}
if (bodyFile) {
  try {
    body = fs.readFileSync(path.resolve(bodyFile), 'utf8');
  } catch (e) {
    console.error(`Cannot read --body-file ${bodyFile}: ${e.message || e}`);
    process.exit(2);
  }
}

// ---- load @napi-rs/keyring (skill-local, project cwd, then global) ----
function tryLoadEntry(tries) {
  for (const t of tries) { try { return require(t).Entry; } catch {} }
  return undefined;
}

function loadEntry() {
  // bare require resolves relative to THIS script's directory (skill folder), not the cwd
  const tries = ['@napi-rs/keyring'];
  // project-local installs: require() never searches the cwd for a script that
  // lives elsewhere, so add explicit cwd-based candidates (project-pinned SDK)
  const cwdRoot = path.join(process.cwd(), 'node_modules');
  tries.push(
    path.join(cwdRoot, '@napi-rs', 'keyring'),
    path.join(cwdRoot, '@servicenow', 'sdk', 'node_modules', '@napi-rs', 'keyring'),
    path.join(cwdRoot, '@servicenow', 'sdk-cli', 'node_modules', '@napi-rs', 'keyring'),
  );
  if (process.platform === 'win32' && process.env.APPDATA) {
    const root = path.join(process.env.APPDATA, 'npm', 'node_modules');
    tries.push(
      path.join(root, '@napi-rs', 'keyring'),
      path.join(root, '@servicenow', 'sdk', 'node_modules', '@napi-rs', 'keyring'),
      path.join(root, '@servicenow', 'sdk-cli', 'node_modules', '@napi-rs', 'keyring'),
    );
  }

  const found = tryLoadEntry(tries);
  if (found) return found;

  try {
    // Last-resort discovery only. Avoid this on the happy path because Node 25
    // warns for .cmd + shell args and the extra subprocess adds latency/noise.
    const root = cp.execFileSync(npmCmd(), ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
    const fallbackTries = [
      path.join(root, '@napi-rs', 'keyring'),
      path.join(root, '@servicenow', 'sdk', 'node_modules', '@napi-rs', 'keyring'),
      path.join(root, '@servicenow', 'sdk-cli', 'node_modules', '@napi-rs', 'keyring'),
    ];
    const fallback = tryLoadEntry(fallbackTries);
    if (fallback) return fallback;
  } catch {}
  throw new Error('Cannot load @napi-rs/keyring. Run from your now-sdk project dir (has node_modules), or where now-sdk is installed globally, or install it next to this skill: npm.cmd install @napi-rs/keyring (in the sn-rest skill folder).');
}

function openEntry() {
  const Entry = loadEntry();
  return new Entry('ServiceNow', 'now-sdk');
}

function readStore() {
  const blob = openEntry().getPassword();
  if (!blob) {
    console.error('No credentials in keychain. Run the sn-auth skill, or run the SDK through node: $NowSdk = if (Test-Path \'node_modules\\@servicenow\\sdk\\bin\\index.js\') { \'node_modules\\@servicenow\\sdk\\bin\\index.js\' } else { Join-Path $env:APPDATA \'npm\\node_modules\\@servicenow\\sdk\\bin\\index.js\' }; node "$NowSdk" auth --add <instance>');
    process.exit(2);
  }
  return { blob, store: JSON.parse(blob) };
}

function writeStore(store) {
  openEntry().setPassword(JSON.stringify(store));
}

function hasTok(v) { return v && (v.access_token || (v.creds && v.creds.access_token) || (v.token && v.token.access_token)); }
function pickCreds(store, alias, explicit) {
  // returns { key, entry } so callers can mutate the stored object in place
  const keys = Object.keys(store).filter(k => store[k] && typeof store[k] === 'object');
  if (explicit) {
    if (!alias || alias.startsWith('--')) {
      console.error('--alias requires a value');
      process.exit(2);
    }
    if (!store[alias]) {
      console.error(`Alias not found in keychain: ${alias}`);
      console.error(`Available aliases: ${keys.length ? keys.join(', ') : '(none)'}`);
      process.exit(2);
    }
    return { key: alias, entry: store[alias] };
  }
  if (store[alias]) return { key: alias, entry: store[alias] };
  const def = keys.find(k => store[k].isDefault);
  if (def) return { key: def, entry: store[def] };
  const tok = keys.find(k => hasTok(store[k]));
  if (tok) return { key: tok, entry: store[tok] };
  return { key: keys[0], entry: store[keys[0]] || {} };
}

function tokenBag(c) {
  // returns the nested object that actually holds access_token (so we can mutate in place)
  if (c.access_token) return c;
  if (c.creds && (c.creds.access_token || c.creds.instanceUrl)) return c.creds;
  if (c.token && c.token.access_token) return c.token;
  if (c.credentials && c.credentials.access_token) return c.credentials;
  return c;
}

function fields(c) {
  const t = tokenBag(c);
  const host = c.host || c.instanceUrl || c.instance || c.url ||
               t.host || t.instanceUrl || t.instance || t.url || '';
  return {
    access_token: t.access_token || '',
    refresh_token: t.refresh_token || '',
    expires_at: t.expires_at || 0,
    host,
  };
}

function requestUrl(inst) {
  const base = inst.replace(/\/$/, '') + '/';
  const url = new URL(restPath, base);

  // Match now-sdk query's context-friendly default for Table API reads.
  // Callers can still override explicitly with sysparm_exclude_reference_link=false.
  if (method === 'GET' && url.pathname.startsWith('/api/now/table/') && !url.searchParams.has('sysparm_exclude_reference_link')) {
    url.searchParams.set('sysparm_exclude_reference_link', 'true');
  }

  return url.toString();
}

async function rest(inst, token) {
  const url = requestUrl(inst);
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
  const init = { method, headers };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = body; }
  return fetch(url, init);
}

async function refresh(inst, refreshToken) {
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID });
  const r = await fetch(inst.replace(/\/$/, '') + '/oauth_token.do', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  if (!r.ok) throw new Error('Refresh failed (' + r.status + '). Run the sn-auth skill, or run the SDK through node: node "$NowSdk" auth --add ' + inst);
  return r.json(); // { access_token, refresh_token?, expires_in, token_type, scope }
}

function persistRefresh(store, key, tok) {
  // mutate the token bag in place, recompute expires_at, write store back to keychain
  const entry = store[key];
  if (!entry) return;
  const bag = tokenBag(entry);
  bag.access_token = tok.access_token;
  if (tok.refresh_token) bag.refresh_token = tok.refresh_token; // ServiceNow may rotate
  if (tok.expires_in)    bag.expires_at = Math.floor(Date.now() / 1000) + Number(tok.expires_in);
  try { writeStore(store); }
  catch (e) { console.error('[sn-rest] warn: refreshed token but failed to persist to keychain:', e.message || e); }
}

function parseNextOffset(linkHeader) {
  if (!linkHeader) return null;
  const nextMatch = linkHeader.match(/<[^>]*sysparm_offset=(\d+)[^>]*>;\s*rel="next"/);
  if (!nextMatch) return null;
  const offset = parseInt(nextMatch[1], 10);
  return Number.isNaN(offset) ? null : offset;
}

function agentEnvelope(parsed, response) {
  let nextOffset = parseNextOffset(response.headers.get('Link'));
  if (parsed && Array.isArray(parsed.result)) {
    // Some instances suppress the Link header when sysparm_no_count=true.
    // In that case, infer a safe next offset when the page is full. The next
    // request may return zero rows if the result size equals the page size, but
    // this is better for agents than incorrectly reporting hasMore=false.
    try {
      const url = new URL(response.url);
      const noCount = url.searchParams.get('sysparm_no_count') === 'true';
      const limit = Number(url.searchParams.get('sysparm_limit') || 0);
      const offset = Number(url.searchParams.get('sysparm_offset') || 0);
      if (nextOffset === null && noCount && limit > 0 && parsed.result.length >= limit) {
        nextOffset = offset + limit;
      }
    } catch {}
    return {
      ok: true,
      count: parsed.result.length,
      hasMore: nextOffset !== null,
      nextOffset,
      records: parsed.result,
    };
  }
  return { ok: true, result: parsed };
}

(async () => {
  const { blob, store } = readStore();
  if (dump) { console.log(blob); return; }

  const picked = pickCreds(store, alias, aliasExplicit);
  let c = fields(picked.entry);
  if (!c.access_token) {
    console.error("No access_token for selected alias/default. Inspect shape: node sn-rest.js --dump");
    process.exit(2);
  }
  if (!instance) instance = c.host;
  if (instance && !/^https?:\/\//.test(instance)) instance = 'https://' + instance;

  let bearer = c.access_token;
  async function refreshSelectedIfNeeded(force = false) {
    c = fields(picked.entry);
    if (!c.refresh_token || !instance) return false;
    const now = Math.floor(Date.now() / 1000);
    const shouldRefresh = force || (c.expires_at && c.expires_at - now < 60);
    if (!shouldRefresh) return false;
    const tok = await refresh(instance, c.refresh_token);
    bearer = tok.access_token;
    persistRefresh(store, picked.key, tok);
    c = fields(picked.entry);
    return true;
  }

  if (!restPath) {
    await refreshSelectedIfNeeded(false);
    if (raw) console.log(bearer);
    else console.log(JSON.stringify({
      alias: picked.key,
      host: instance || '(pass --instance)',
      has_access_token: Boolean(c.access_token),
      expires_at: c.expires_at,
    }, null, 2));
    return;
  }
  if (!instance) { console.error('No instance host stored — pass --instance https://devXXXXXX.service-now.com'); process.exit(2); }

  // proactive refresh if stored token is expired/near-expiry (60s skew)
  await refreshSelectedIfNeeded(false);

  let res = await rest(instance, bearer);
  if (res.status === 401 && c.refresh_token) {
    const tok = await refresh(instance, c.refresh_token);
    bearer = tok.access_token;
    persistRefresh(store, picked.key, tok);
    res = await rest(instance, bearer);
  }
  const text = await res.text();
  if (!res.ok) {
    if (agentOutput) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      const error = { ok: false, error: { status: res.status, statusText: res.statusText, body: parsed } };
      console.log(pretty ? JSON.stringify(error, null, 2) : JSON.stringify(error));
    } else {
      console.error('HTTP ' + res.status);
      console.error(text);
    }
    process.exit(1);
  }
  try {
    const parsed = JSON.parse(text);
    const output = agentOutput ? agentEnvelope(parsed, res) : parsed;
    console.log(pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output));
  } catch { console.log(text); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
