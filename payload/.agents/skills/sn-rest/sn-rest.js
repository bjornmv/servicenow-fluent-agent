#!/usr/bin/env node
/*
 * sn-rest.js — reuse the now-sdk OAuth token for REST calls. Pure Node, no PowerShell.
 *
 * Reads the OAuth alias now-sdk stored in the OS credential store (service "ServiceNow",
 * account "now-sdk", via @napi-rs/keyring) and makes an authed REST call with Node's
 * built-in fetch. Refreshes the token when it is near expiry and once on 401, then
 * stores the refreshed token back for the SDK.
 *
 * RUN  (PowerShell; resolve every <placeholder> first, keep the API path quoted):
 *   node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<alias>" --instance "https://<host>" "/api/now/table/sys_app?sysparm_fields=name,scope,sys_id&sysparm_limit=10"
 *   node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<alias>" --instance "https://<host>" --method PATCH --body-file "<reviewed-json-file>" "/api/now/table/<table>/<sys_id>"
 *
 * OPTIONS
 *   --alias <name>       SDK auth alias. Required for every non-GET request.
 *   --instance <url>     Must equal the instance stored for that alias; it is a check, not an override.
 *   --method <verb>      GET (default), POST, PATCH, PUT or DELETE.
 *   --body-file <path>   UTF-8 JSON request body. --body <json> is the inline form.
 *   --agent              Compact envelope: {ok,count,hasMore,nextOffset,records} or {ok,result}.
 *   --pretty             Indented JSON.
 *   Value options also accept --name=value. With no API path, prints redacted alias metadata.
 *
 * SAFETY CONTRACT (covered by tools/test/sn-rest/cli-guidance.test.cjs in the distribution repo)
 *   - Unknown options, repeated options, missing values and extra arguments exit 2 before
 *     any request, so a typo can never fall back to the default alias or drop a body.
 *   - The API path must be instance-relative ("/api/..."). The token is only ever sent to the
 *     origin stored with the alias; a full URL or a different --instance exits 2.
 *   - POST/PATCH/PUT need a valid JSON body; a body with GET is refused.
 *
 * EXIT CODES
 *   0  HTTP 2xx.
 *   1  HTTP error (with --agent: {ok:false,error:{status,...}} on stdout), or a token-refresh,
 *      network or keyring-load failure (stderr only).
 *   2  Refused before any request was sent: usage, alias, credential or target problem.
 *
 * --raw (token only, no API path) is an internal interface for the bundled
 * sn-doc-export/capture.cjs child process. It is not for interactive or agent use.
 *
 * Acts as YOUR user, scope of the SDK OAuth client. Same OS user that ran `now-sdk auth`.
 */
'use strict';
const path = require('path');
const fs = require('fs');

// Same resolution as the SDK: built-in public OAuth client unless the SDK override is set.
const CLIENT_ID = process.env.SDK_OAUTH_APP_CLIENT_ID ?? '543e5655f77746a28228c6009a599dfb';

const VALUE_FLAGS = new Set(['--alias', '--method', '--body', '--body-file', '--instance']);
const BOOL_FLAGS = new Set(['--raw', '--pretty', '--agent']);
const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const BODY_REQUIRED = new Set(['POST', 'PATCH', 'PUT']);
const AUTH_HELP = 'Run the sn-auth skill.';

class CliError extends Error {
  constructor(exitCode, message) { super(message); this.exitCode = exitCode; }
}
// Exit 2 always means: nothing was sent to any host.
function refuse(message) { throw new CliError(2, message); }

// ---- args ----
// Strict single linear scan. Anything that is not a known option or the one API path is an
// error: a silently ignored token would send the request to a different target or without
// its body.
function parseArgs(argv) {
  const opts = { method: 'GET', raw: false, pretty: false, agent: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (!a.startsWith('-')) {
      if (opts.restPath !== undefined) refuse('Unexpected extra argument. Pass exactly one quoted API path.');
      opts.restPath = a;
      continue;
    }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const name = eq === -1 ? a : a.slice(0, eq);
    const inline = eq === -1 ? undefined : a.slice(eq + 1);
    if (!VALUE_FLAGS.has(name) && !BOOL_FLAGS.has(name)) refuse(`Unknown option ${name}. Nothing was sent.`);
    if (seen.has(name)) refuse(`${name} was given more than once`);
    seen.add(name);
    if (BOOL_FLAGS.has(name)) {
      if (inline !== undefined) refuse(`${name} does not take a value`);
      if (name === '--raw') opts.raw = true;
      if (name === '--pretty') opts.pretty = true;
      if (name === '--agent') opts.agent = true;
      continue;
    }
    let v = inline;
    if (v === undefined) {
      v = argv[++i];
      if (v !== undefined && String(v).startsWith('--')) refuse(`${name} requires a value`);
    }
    if (v === undefined || v === '') refuse(`${name} requires a value`);
    v = String(v);
    switch (name) {
      case '--alias':     opts.alias = v; break;
      case '--method':    opts.method = v.toUpperCase(); break;
      case '--body':      opts.body = v; break;
      case '--body-file': opts.bodyFile = v; break;
      case '--instance':  opts.instance = v; break;
    }
  }

  if (!METHODS.has(opts.method)) refuse(`Unsupported --method ${opts.method}. Use GET, POST, PATCH, PUT or DELETE.`);
  if (opts.body !== undefined && opts.bodyFile !== undefined) refuse('Use either --body or --body-file, not both');
  const hasBody = opts.body !== undefined || opts.bodyFile !== undefined;
  if (opts.restPath === undefined) {
    if (opts.method !== 'GET' || hasBody) refuse('An API path is required with --method, --body or --body-file');
  } else {
    if (opts.raw) refuse('--raw cannot be combined with an API path');
    // Instance-relative only. "//host", "/\host" and full URLs would replace the origin.
    if (!/^\/[^/\\]/.test(opts.restPath) || opts.restPath.includes('\\')) {
      refuse('The API path must be instance-relative and start with a single "/" (for example /api/now/table/...). Do not pass a full URL; the host comes from the alias.');
    }
    if (opts.method === 'GET' && hasBody) refuse('A request body needs --method POST, PATCH or PUT');
    if (BODY_REQUIRED.has(opts.method) && !hasBody) refuse(`--method ${opts.method} requires --body-file with a JSON body`);
    if (opts.method !== 'GET' && opts.alias === undefined) refuse(`--method ${opts.method} requires an explicit --alias`);
  }
  return opts;
}

function loadBody(opts) {
  let text = opts.body;
  let label = '--body';
  if (opts.bodyFile !== undefined) {
    label = `--body-file ${opts.bodyFile}`;
    try { text = fs.readFileSync(path.resolve(opts.bodyFile), 'utf8'); }
    catch (e) { refuse(`Cannot read ${label}: ${e.code || e.message || e}`); }
  }
  if (text === undefined) return undefined;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // UTF-8 byte-order mark
  if (text.includes('\u0000')) refuse(`${label} is not UTF-8 (it looks like UTF-16). Save the JSON as UTF-8. Nothing was sent.`);
  if (!text.trim()) refuse(`${label} is empty. Nothing was sent.`);
  try { JSON.parse(text); }
  catch { refuse(`${label} is not valid JSON. Save the reviewed JSON as UTF-8. Nothing was sent.`); }
  return text;
}

// ---- load @napi-rs/keyring (skill-local, project cwd, then the global SDK install) ----
function loadEntry() {
  // bare require resolves relative to THIS script's directory (skill folder), not the cwd
  const tries = ['@napi-rs/keyring'];
  const roots = [];
  // project-local installs: require() never searches the cwd for a script that
  // lives elsewhere, so add explicit cwd-based candidates (project-pinned SDK)
  roots.push(path.join(process.cwd(), 'node_modules'));
  // Global installs, found without a package-manager subprocess: the default npm
  // prefix, an npm_config_prefix override, then the Node installation's own folder
  // (a version-manager layout keeps global packages there).
  const prefix = process.env.npm_config_prefix;
  const nodeDir = process.execPath ? path.dirname(process.execPath) : '';
  if (process.platform === 'win32') {
    if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
    if (prefix) roots.push(path.join(prefix, 'node_modules'));
    if (nodeDir) roots.push(path.join(nodeDir, 'node_modules'));
  } else {
    if (prefix) roots.push(path.join(prefix, 'lib', 'node_modules'));
    // default global prefix layout: <prefix>/bin/node and <prefix>/lib/node_modules
    if (nodeDir) roots.push(path.join(nodeDir, '..', 'lib', 'node_modules'));
  }
  for (const root of roots) {
    tries.push(
      path.join(root, '@napi-rs', 'keyring'),
      path.join(root, '@servicenow', 'sdk', 'node_modules', '@napi-rs', 'keyring'),
      path.join(root, '@servicenow', 'sdk-cli', 'node_modules', '@napi-rs', 'keyring'),
    );
  }
  for (const t of tries) { try { return require(t).Entry; } catch {} }
  // No package-manager subprocess and no install advice here: launcher and dependency
  // changes follow the SDK command policy, not this helper.
  throw new Error('Cannot load @napi-rs/keyring (a dependency of the ServiceNow SDK). Looked under: ' + roots.join('; ') +
    '. Run the helper from the confirmed project directory that has the SDK installed. This is a toolchain finding, not an authentication error.');
}

function openEntry() {
  const Entry = loadEntry();
  return new Entry('ServiceNow', 'now-sdk');
}

function readStore() {
  const blob = openEntry().getPassword();
  if (!blob) refuse('No credentials in keychain. ' + AUTH_HELP);
  let store;
  try { store = JSON.parse(blob); } catch { store = null; }
  if (!store || typeof store !== 'object') refuse('The SDK credential store is unreadable. ' + AUTH_HELP);
  return store;
}

function writeStore(store) {
  openEntry().setPassword(JSON.stringify(store));
}

function hasTok(v) { return v && (v.access_token || (v.creds && v.creds.access_token) || (v.token && v.token.access_token)); }
function pickCreds(store, alias) {
  // returns { key, entry } so callers can mutate the stored object in place
  const keys = Object.keys(store).filter(k => store[k] && typeof store[k] === 'object');
  if (alias !== undefined) {
    if (!keys.includes(alias)) {
      refuse(`Alias not found in keychain: ${alias}\nAvailable aliases: ${keys.length ? keys.join(', ') : '(none)'}`);
    }
    return { key: alias, entry: store[alias] };
  }
  // No --alias: read-only requests and metadata only (parseArgs refuses writes).
  const def = keys.find(k => store[k].isDefault);
  if (def) return { key: def, entry: store[def] };
  const tok = keys.find(k => hasTok(store[k]));
  if (tok) return { key: tok, entry: store[tok] };
  if (!keys.length) refuse('No credentials in keychain. ' + AUTH_HELP);
  return { key: keys[0], entry: store[keys[0]] };
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

function originOf(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) ? value.trim() : 'https://' + value.trim();
  try {
    const url = new URL(text);
    // Plain http would expose the bearer on the wire; allow it for loopback only.
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch { return null; }
}

// The alias's stored instance is the only place its credentials may go.
// --instance confirms that target; it never redirects the token to another host.
function resolveTarget(storedHost, requested, key) {
  const stored = originOf(storedHost);
  if (!stored) refuse(`Alias ${key} has no stored instance URL. ${AUTH_HELP}`);
  if (requested !== undefined) {
    const given = originOf(requested);
    if (!given) refuse('--instance is not a valid instance URL');
    if (given !== stored) {
      refuse(`--instance ${given} does not match the instance stored for alias ${key} (${stored}). Nothing was sent. Confirm the alias and instance with the user.`);
    }
  }
  return stored;
}

function requestUrl(origin, restPath, method) {
  const url = new URL(restPath, origin + '/');
  if (url.origin !== origin) refuse('The API path resolves to a different host. Nothing was sent.');

  // Match now-sdk query's context-friendly default for Table API reads.
  // Callers can still override explicitly with sysparm_exclude_reference_link=false.
  if (method === 'GET' && url.pathname.startsWith('/api/now/table/') && !url.searchParams.has('sysparm_exclude_reference_link')) {
    url.searchParams.set('sysparm_exclude_reference_link', 'true');
  }

  return url.toString();
}

async function rest(url, method, body, token) {
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
  // Never follow redirects: a 307/308 hop would replay the request, and its body, to another host.
  const init = { method, headers, redirect: 'manual' };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = body; }
  return fetch(url, init);
}

async function refresh(origin, refreshToken) {
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID });
  const r = await fetch(origin + '/oauth_token.do', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    redirect: 'manual', // the refresh token must not follow a redirect to another host
  });
  if (!r.ok) throw new CliError(1, 'Refresh failed (' + r.status + '). ' + AUTH_HELP);
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
  catch (e) { console.error('[sn-rest] warn: refreshed token but failed to persist to keychain: ' + (e.message || e)); }
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const body = loadBody(opts);
  const { method, restPath, pretty } = opts;

  const store = readStore();
  const picked = pickCreds(store, opts.alias);
  let c = fields(picked.entry);
  if (!c.access_token) {
    refuse(`No OAuth access token for alias ${picked.key}. This helper needs an SDK OAuth alias; a basic-auth alias is not supported. ${AUTH_HELP}`);
  }
  const origin = resolveTarget(c.host, opts.instance, picked.key);
  const url = restPath === undefined ? undefined : requestUrl(origin, restPath, method);

  let bearer = c.access_token;
  async function refreshSelectedIfNeeded() {
    if (!c.refresh_token) return;
    const now = Math.floor(Date.now() / 1000);
    if (!(c.expires_at && c.expires_at - now < 60)) return;
    const tok = await refresh(origin, c.refresh_token);
    bearer = tok.access_token;
    persistRefresh(store, picked.key, tok);
    c = fields(picked.entry);
  }

  // proactive refresh if stored token is expired/near-expiry (60s skew)
  await refreshSelectedIfNeeded();

  if (url === undefined) {
    if (opts.raw) console.log(bearer);
    else console.log(JSON.stringify({
      alias: picked.key,
      host: origin,
      has_access_token: Boolean(c.access_token),
      expires_at: c.expires_at,
    }, null, 2));
    return;
  }

  let res = await rest(url, method, body, bearer);
  if (res.status === 401 && c.refresh_token) {
    const tok = await refresh(origin, c.refresh_token);
    bearer = tok.access_token;
    persistRefresh(store, picked.key, tok);
    res = await rest(url, method, body, bearer);
  }
  const text = await res.text();
  if (!res.ok) {
    if (opts.agent) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      const error = { ok: false, error: { status: res.status, statusText: res.statusText, body: parsed } };
      console.log(pretty ? JSON.stringify(error, null, 2) : JSON.stringify(error));
    } else {
      console.error('HTTP ' + res.status);
      console.error(text);
    }
    throw new CliError(1, '');
  }
  try {
    const parsed = JSON.parse(text);
    const output = opts.agent ? agentEnvelope(parsed, res) : parsed;
    console.log(pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output));
  } catch { console.log(text); }
}

main().catch(e => {
  const message = (e && e.message) || (e instanceof CliError ? '' : String(e));
  if (message) console.error(message);
  process.exit(e instanceof CliError ? e.exitCode : 1);
});
