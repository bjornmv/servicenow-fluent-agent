'use strict';
// Offline contract tests: execute the actual CLI in a VM with fake keyring/fetch.
// No credential storage, SDK, subprocess, live network or user files are touched.
// Refusal tests assert that zero fetch calls happen, so nothing leaves the VM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname, '../../../payload/.agents/skills/sn-rest');
const source = fs.readFileSync(path.join(dir, 'sn-rest.js'), 'utf8');
const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
const recipes = fs.readFileSync(path.join(dir, 'references/queries.md'), 'utf8');

const fixtureStore = () => ({ fixture: { host: 'https://fixture.invalid', access_token: 'offline-fixture-only' } });

async function run(args, { records = [], payload, rawText, next = null, status = 200, store = fixtureStore(), files = {}, env = {}, responses } = {}) {
  const logs = [], errors = [], calls = [], writes = [];
  let storeReads = 0, exitCode = 0;
  class Entry {
    getPassword() { storeReads++; return store === null ? null : JSON.stringify(store); }
    setPassword(value) { writes.push(JSON.parse(value)); }
  }
  const fakeFs = { readFileSync(file) {
    const name = path.basename(String(file));
    if (!(name in files)) { const e = Error('fixture file missing'); e.code = 'ENOENT'; throw e; }
    return files[name];
  } };
  const context = { URL, URLSearchParams, Buffer,
    process: { argv: ['node', 'sn-rest.js', ...args], platform: 'win32', env, cwd: () => '/fixture',
      exit(code) { exitCode = code; throw Error('fixture-exit'); } },
    require(name) {
      if (name === 'path') return path;
      if (name === '@napi-rs/keyring') return { Entry };
      if (name === 'fs') return fakeFs;
      throw Error(`Unexpected module: ${name}`);
    },
    console: { log: x => logs.push(String(x)), error: x => errors.push(String(x)) },
    async fetch(url, options) {
      const call = { url: String(url), method: options.method, authorization: options.headers.Authorization, body: options.body };
      calls.push(call);
      // Transport invariant for every test: credentials only ever reach the alias's stored origin.
      assert.equal(new URL(url).origin, 'https://fixture.invalid');
      if (responses) return responses(call, calls.length);
      const expectedMethod = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
      assert.equal(options.method, expectedMethod);
      assert.equal(options.headers.Authorization, 'Bearer offline-fixture-only');
      return { ok: status >= 200 && status < 300, status, statusText: status === 403 ? 'Forbidden' : 'OK', url: String(url),
        headers: { get: name => name === 'Link' ? next : null },
        text: async () => rawText ?? JSON.stringify(payload ?? { result: records }) };
    } };
  try { await vm.runInNewContext(source, context, { timeout: 1000 }); }
  catch (e) { if (e.message !== 'fixture-exit') throw e; }
  let result = null;
  if (logs.length) { try { result = JSON.parse(logs[0]); } catch {} }
  return { logs, errors, calls, writes, storeReads, exitCode, result };
}
const common = ['--agent', '--alias', 'fixture', '--instance', 'https://fixture.invalid'];
const tablePath = '/api/now/table/sys_app?sysparm_fields=sys_id,name,scope&sysparm_query=ORDERBYsys_id&sysparm_limit=10&sysparm_no_count=true';

test('skill uses the bundled CLI, not native integration discovery, and states actual safeguards', () => {
  assert.match(skill, /skill, not a registered VS Code tool/);
  assert.match(skill, /Do not search for a native integration/);
  assert.match(skill, /does not automatically validate fields\/filters/);
  assert.match(skill, /CLI itself does not ask for confirmation/);
  assert.match(skill, /immediately before execution in the interactive parent/);
  assert.match(skill, /Do not delegate writes to a headless child/);
  assert.match(skill, /Never use `--raw` or `--dump`/);
  assert.match(skill, /Recover the original output/);
  assert.match(skill, /not proof it is uninstalled or inactive/);
  assert.match(skill, /new VS Code agent chat/);
  assert.match(recipes, /super_class.name/);
  assert.match(recipes, /more than ten ancestors/);
  assert.match(recipes, /do not.*merge distinct account names/i);
  assert.doesNotMatch(skill + recipes, /sn_rest\(|sn_schema\(|\/reload|\.pi[\\/]|\bnow_sdk\b/);
});

test('every documented Node request invokes the actual CLI with mocked transport only', async () => {
  // One OS-neutral dispatcher line per request; single-quoted values are literal in PowerShell and bash.
  const commands = [...(skill + '\n' + recipes).matchAll(/^sn-skill rest --agent --alias '([^'"]+)' --instance '([^'"]+)' '([^'"]+)'$/gm)];
  assert.equal(commands.length, 5);
  assert.doesNotMatch(skill + recipes, /sn-rest\.js"|\$env:USERPROFILE|\$HOME\/\.agents|bash \(Linux/, 'no per-shell helper variants');
  // File paths are double-quoted (literal for ' in both shells); an apostrophe in a query is %27 and reaches the instance unchanged.
  assert.match(source, /--body-file "<reviewed-json-file>"/);
  const apostrophe = await run(['--agent', '--alias', 'fixture', '--instance', 'https://fixture.invalid',
    '/api/now/table/sys_user?sysparm_query=last_name=O%27Neill^active=true&sysparm_fields=sys_id&sysparm_limit=1&sysparm_no_count=true']);
  assert.equal(apostrophe.exitCode, 0);
  assert.match(apostrophe.calls[0].url, /O%27Neill/);
  assert.equal(new URL(apostrophe.calls[0].url).searchParams.get('sysparm_query'), "last_name=O'Neill^active=true");
  const values = { 'confirmed-alias': 'fixture', 'confirmed-host': 'fixture.invalid', 'confirmed-table': 'sys_app',
    'confirmed-field-list': 'sys_id,name,scope', nextOffset: '10', 'confirmed-scope-sys-ids': 'a'.repeat(32) };
  const resolve = s => s.replace(/<([^>]+)>/g, (_, key) => { assert.ok(values[key], key); return values[key]; });
  for (const [, alias, instance, api] of commands) {
    const args = ['--agent', '--alias', resolve(alias), '--instance', resolve(instance), resolve(api)];
    const result = await run(args);
    assert.equal(result.exitCode, 0);
    assert.equal(result.storeReads, 1);
    assert.equal(result.calls.length, 1);
    assert.equal(result.result.ok, true);
    assert.deepEqual(result.errors, []);
    const url = new URL(result.calls[0].url);
    if (url.pathname.startsWith('/api/now/table/')) {
      assert.ok(url.searchParams.get('sysparm_fields'));
      assert.ok(Number(url.searchParams.get('sysparm_limit')) <= 10);
      assert.equal(url.searchParams.get('sysparm_no_count'), 'true');
      assert.equal(url.searchParams.get('sysparm_exclude_reference_link'), 'true');
      assert.equal(url.searchParams.has('sysparm_order_by'), false);
    } else {
      assert.equal(url.searchParams.get('sysparm_group_by'), 'sys_scope,sys_updated_by');
      assert.equal(url.searchParams.get('sysparm_order_by'), 'COUNT^DESC');
    }
  }
});

test('CLI table envelope exposes page count and inferred next offset, not a total', async () => {
  const records = Array.from({ length: 10 }, (_, i) => ({ sys_id: String(i), name: 'fixture' }));
  const a = await run([...common, tablePath], { records });
  assert.equal(a.result.count, 10); assert.equal(a.result.hasMore, true); assert.equal(a.result.nextOffset, 10);
  const b = await run([...common, tablePath + '&sysparm_offset=10']);
  assert.equal(b.result.count, 0); assert.equal(b.result.hasMore, false); assert.equal(b.result.nextOffset, null);
});

test('CLI preserves explicit server pagination and Stats groups without claiming total coverage', async () => {
  const next = '<https://fixture.invalid/api/now/table/sys_app?sysparm_offset=20>;rel="next"';
  const a = await run([...common, tablePath], { records: [{ sys_id: 'one' }], next });
  assert.equal(a.result.nextOffset, 20); assert.equal(a.result.hasMore, true);
  const group = { stats: { count: '7' }, groupby_fields: [{ field: 'sys_updated_by', value: 'account.literal' }] };
  const b = await run([...common, '/api/now/stats/sys_metadata?sysparm_count=true&sysparm_group_by=sys_updated_by'], { payload: { result: [group] } });
  assert.deepEqual(b.result.records, [group]);
  const c = await run([...common, '/api/now/stats/sys_metadata?sysparm_count=true'], { payload: { result: { stats: { count: '7' } } } });
  assert.equal(c.result.result.result.stats.count, '7');
});

test('CLI non-JSON and bodyless successful responses are not invented JSON records', async () => {
  const a = await run([...common, '/api/fixture'], { rawText: 'non-JSON fixture' });
  assert.deepEqual(a.logs, ['non-JSON fixture']); assert.equal(a.result, null); assert.equal(a.exitCode, 0);
  // DELETE is entirely mocked; no transport or credential access leaves the VM.
  const b = await run([...common, '--method', 'DELETE', '/api/now/table/fixture/record'], { status: 204, rawText: '' });
  assert.deepEqual(b.logs, ['']); assert.equal(b.result, null); assert.equal(b.exitCode, 0);
  assert.match(skill, /approved bodyless DELETE/);
  assert.match(skill, /never retry solely because the output is blank/);
});

test('CLI HTTP errors remain failure evidence, not zero-row success', async () => {
  const result = await run([...common, tablePath], { status: 403, payload: { error: { message: 'fixture access denied' } } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.result.ok, false);
  assert.equal(result.result.error.status, 403);
  assert.equal(result.calls.length, 1);
  assert.equal(JSON.stringify(result.logs).includes('offline-fixture-only'), false);
});

const refused = async (args, pattern, options) => {
  const result = await run(args, options);
  assert.equal(result.exitCode, 2, args.join(' '));
  assert.equal(result.calls.length, 0, args.join(' '));
  assert.deepEqual(result.logs, [], args.join(' '));
  assert.match(result.errors.join('\n'), pattern, args.join(' '));
  assert.equal(JSON.stringify(result.errors).includes('offline-fixture-only'), false);
  return result;
};
const twoAliases = () => ({
  fixture: { alias: 'fixture', isDefault: true, creds: { type: 'oauth', instanceUrl: 'https://fixture.invalid', access_token: 'offline-fixture-only', refresh_token: 'offline-refresh-only', expires_at: 4102444800 } },
  other: { alias: 'other', isDefault: false, creds: { type: 'oauth', instanceUrl: 'https://other.invalid/', access_token: 'offline-other-only', refresh_token: 'offline-other-refresh', expires_at: 4102444800 } },
  basic: { alias: 'basic', isDefault: false, creds: { type: 'basic', instanceUrl: 'https://fixture.invalid', username: 'fixture.user', password: 'offline-password-only' } },
});
const writeBody = { files: { 'body.json': '{"short_description":"fixture"}' } };

test('CLI refuses unknown, repeated, valueless and surplus arguments before any request', async () => {
  // A mistyped option used to be dropped, sending the request to the default alias.
  await refused(['--agent', '--alais', 'other', tablePath], /Unknown option --alais/, { store: twoAliases() });
  await refused(['--agent', '--alais=other', tablePath], /Unknown option --alais/, { store: twoAliases() });
  await refused(['--bodyfile', 'body.json', '--alias', 'fixture', '--method', 'POST', '/api/now/table/fixture'], /Unknown option --bodyfile/, writeBody);
  await refused([...common, '-X', tablePath], /Unknown option -X/);
  await refused([...common, '--dump'], /Unknown option --dump/);
  await refused([...common, '--agent=true', tablePath], /--agent was given more than once|does not take a value/);
  await refused(['--agent=true', tablePath], /--agent does not take a value/);
  await refused(['--alias', 'fixture', '--alias', 'other', tablePath], /--alias was given more than once/, { store: twoAliases() });
  await refused(['--alias', '--agent', tablePath], /--alias requires a value/);
  await refused(['--alias=', tablePath], /--alias requires a value/);
  await refused([tablePath, '--alias'], /--alias requires a value/);
  await refused([...common, tablePath, '/api/now/table/second'], /Unexpected extra argument/);
  await refused([...common, '--method', 'TRACE', tablePath], /Unsupported --method TRACE/);
  await refused(['--alias', 'missing', tablePath], /Alias not found in keychain: missing/);
  await refused([...common, tablePath], /No credentials in keychain\. Run the sn-auth skill\./, { store: null });
});

test('CLI accepts the equals form for value options and binds it to the named alias', async () => {
  const result = await run(['--agent', '--alias=fixture', '--instance=https://fixture.invalid', tablePath], { store: twoAliases() });
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].authorization, 'Bearer offline-fixture-only');
});

test('CLI sends credentials only to the origin stored with the alias', async () => {
  const store = twoAliases;
  // Full, protocol-relative and backslash URLs would replace the request origin.
  for (const target of ['https://elsewhere.invalid/api/now/table/sys_user', '//elsewhere.invalid/api/now/table/sys_user',
    '/\\elsewhere.invalid/api/now/table/sys_user', '\\\\elsewhere.invalid\\api', 'api/now/table/sys_user', 'elsewhere.invalid/api']) {
    await refused([...common, target], /instance-relative/, { store: store() });
  }
  // --instance is a confirmation of the alias's stored host, never an override.
  await refused(['--agent', '--alias', 'fixture', '--instance', 'https://other.invalid', tablePath], /does not match the instance stored for alias fixture/, { store: store() });
  await refused(['--agent', '--alias', 'other', '--instance', 'https://fixture.invalid', tablePath], /does not match the instance stored for alias other/, { store: store() });
  await refused(['--alias', 'fixture', '--instance', 'https://other.invalid', '--raw'], /does not match/, { store: store() });
  await refused(['--agent', '--alias', 'fixture', '--instance', 'https://user:secret@fixture.invalid', tablePath], /not a valid instance URL/, { store: store() });
  await refused(['--agent', '--alias', 'fixture', tablePath], /no stored instance URL/, { store: { fixture: { access_token: 'offline-fixture-only' } } });
  // Equivalent spellings of the stored host are accepted.
  for (const instance of ['fixture.invalid', 'https://fixture.invalid/', 'HTTPS://FIXTURE.INVALID']) {
    const ok = await run(['--agent', '--alias', 'fixture', '--instance', instance, tablePath], { store: store() });
    assert.equal(ok.exitCode, 0, instance); assert.equal(ok.calls.length, 1, instance);
  }
  // Without --instance the stored host is used.
  const implicit = await run(['--agent', '--alias', 'fixture', tablePath], { store: store() });
  assert.equal(new URL(implicit.calls[0].url).origin, 'https://fixture.invalid');
});

test('CLI refuses unsafe or malformed writes before any request', async () => {
  const post = ['--method', 'POST', '/api/now/table/fixture'];
  await refused([...common, ...post], /--method POST requires --body-file/);
  await refused([...common, '--method', 'PATCH', '/api/now/table/fixture/record'], /--method PATCH requires --body-file/);
  await refused([...common, '--body-file', '', ...post], /--body-file requires a value/);
  await refused([...common, '--body-file', 'absent.json', ...post], /Cannot read --body-file absent\.json: ENOENT/);
  await refused([...common, '--body-file', 'body.json', ...post], /is empty/, { files: { 'body.json': ' \r\n' } });
  await refused([...common, '--body-file', 'body.json', ...post], /is not valid JSON/, { files: { 'body.json': '{short_description:fixture}' } });
  await refused([...common, '--body-file', 'body.json', ...post], /looks like UTF-16/, { files: { 'body.json': '��{\u0000"\u0000a\u0000"\u0000:\u00001\u0000}\u0000' } });
  await refused([...common, '--body-file', 'body.json', '--body', '{}', ...post], /either --body or --body-file/, writeBody);
  await refused([...common, '--body-file', 'body.json', '/api/now/table/fixture'], /needs --method POST, PATCH or PUT/, writeBody);
  await refused([...common, '--method', 'POST', '--body-file', 'body.json'], /API path is required/, writeBody);
  // A write never falls back to the default alias.
  await refused(['--agent', '--instance', 'https://fixture.invalid', '--body-file', 'body.json', ...post], /--method POST requires an explicit --alias/, { ...writeBody, store: twoAliases() });
  await refused(['--agent', '--method', 'DELETE', '/api/now/table/fixture/record'], /--method DELETE requires an explicit --alias/, { store: twoAliases() });
  await refused([...common, '--raw', tablePath], /--raw cannot be combined with an API path/);
});

test('CLI sends a reviewed JSON body file once, without a byte-order mark', async () => {
  const result = await run([...common, '--method', 'PATCH', '--body-file', 'body.json', '/api/now/table/fixture/record'],
    { files: { 'body.json': '﻿{"short_description":"fixture"}' }, payload: { result: { sys_id: 'record' } } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].body, '{"short_description":"fixture"}');
  assert.equal(result.result.result.result.sys_id, 'record');
});

test('CLI auth failures point to the sn-auth skill, not to credential dumps or launcher workarounds', async () => {
  const basic = await refused(['--agent', '--alias', 'basic', tablePath], /No OAuth access token for alias basic.*basic-auth alias is not supported.*Run the sn-auth skill\./, { store: twoAliases() });
  assert.equal(JSON.stringify(basic.errors).includes('offline-password-only'), false);
  const failing = await run(['--agent', '--alias', 'fixture', tablePath], { store: twoAliases(),
    responses: call => call.url.endsWith('/oauth_token.do')
      ? { ok: false, status: 401, json: async () => ({}) }
      : { ok: false, status: 401, statusText: 'Unauthorized', url: call.url, headers: { get: () => null }, text: async () => '{}' } });
  assert.equal(failing.exitCode, 1);
  assert.deepEqual(failing.logs, []);
  assert.deepEqual(failing.errors, ['Refresh failed (401). Run the sn-auth skill.']);
  assert.deepEqual(failing.calls.map(c => new URL(c.url).pathname), ['/api/now/table/sys_app', '/oauth_token.do']);
  assert.deepEqual(failing.writes, []);
  // Runtime text must obey the same launcher policy as the Markdown guidance.
  assert.doesNotMatch(source, /\$NowSdk|<resolver>|npm\.cmd|npx\.cmd|This box blocks the bare|shim is blocked|--dump|child_process|shell:/);
  assert.doesNotMatch(source, /auth --add/);
});

test('CLI refreshes with the SDK client id rules and stores the token only for the selected alias', async () => {
  const store = twoAliases();
  store.fixture.creds.expires_at = 1;
  const forms = [];
  const responses = call => {
    if (call.url.endsWith('/oauth_token.do')) {
      forms.push(new URLSearchParams(String(call.body)));
      return { ok: true, status: 200, json: async () => ({ access_token: 'offline-rotated-only', refresh_token: 'offline-rotated-refresh', expires_in: 1800 }) };
    }
    return { ok: true, status: 200, statusText: 'OK', url: call.url, headers: { get: () => null }, text: async () => JSON.stringify({ result: [] }) };
  };
  const a = await run(['--agent', '--alias', 'fixture', tablePath], { store, responses });
  assert.equal(a.exitCode, 0);
  assert.equal(forms[0].get('client_id'), '543e5655f77746a28228c6009a599dfb');
  assert.equal(forms[0].get('refresh_token'), 'offline-refresh-only');
  assert.equal(a.calls[1].authorization, 'Bearer offline-rotated-only');
  assert.equal(a.writes.length, 1);
  assert.equal(a.writes[0].fixture.creds.access_token, 'offline-rotated-only');
  assert.deepEqual(a.writes[0].other, twoAliases().other);
  assert.equal(JSON.stringify(a.logs.concat(a.errors)).includes('offline-rotated'), false);
  forms.length = 0;
  const expired = twoAliases(); expired.fixture.creds.expires_at = 1;
  await run(['--agent', '--alias', 'fixture', tablePath], { store: expired, responses, env: { SDK_OAUTH_APP_CLIENT_ID: 'fixture-client' } });
  assert.equal(forms[0].get('client_id'), 'fixture-client');
});

test('CLI alias metadata is redacted and reports the stored instance', async () => {
  const result = await run(['--alias', 'other'], { store: twoAliases() });
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 0);
  assert.deepEqual(result.result, { alias: 'other', host: 'https://other.invalid', has_access_token: true, expires_at: 4102444800 });
  assert.equal(JSON.stringify(result.logs).includes('offline-other'), false);
});

test('CLI content check reports rows and a case-sensitive literal match without changing exit codes', async () => {
  const markerPath = '/api/now/table/sp_widget?sysparm_query=id=fixture&sysparm_fields=template&sysparm_limit=1&sysparm_no_count=true';
  const expect = ['--expect-field', 'template', '--expect-contains', 'marker-v2'];
  const hit = await run([...common, markerPath, ...expect], { records: [{ template: '<div>marker-v2</div>' }] });
  assert.equal(hit.exitCode, 0); assert.equal(hit.calls.length, 1);
  assert.deepEqual(hit.result.expect, { field: 'template', rows: 1, present: true, contains: true });
  assert.equal(hit.result.ok, true); assert.equal(hit.result.count, 1);
  const miss = await run([...common, markerPath, ...expect], { records: [{ template: '<div>MARKER-V2</div>' }] });
  assert.deepEqual(miss.result.expect, { field: 'template', rows: 1, present: true, contains: false });
  const absent = await run([...common, markerPath, ...expect], { records: [{ name: 'marker-v2' }] });
  assert.deepEqual(absent.result.expect, { field: 'template', rows: 1, present: false, contains: false }, 'a missing field is UNKNOWN, not a mismatch');
  const inherited = await run([...common, markerPath, '--expect-field', 'constructor', '--expect-contains', 'native'], { records: [{ template: 'x' }] });
  assert.deepEqual(inherited.result.expect, { field: 'constructor', rows: 1, present: false, contains: false }, 'only own properties count');
  const object = await run([...common, markerPath, ...expect], { records: [{ template: { value: 'marker-v2', display_value: 'marker-v2' } }] });
  assert.deepEqual(object.result.expect, { field: 'template', rows: 1, present: false, contains: false }, 'an object value is not compared');
  const none = await run([...common, markerPath, ...expect]);
  assert.deepEqual(none.result.expect, { field: 'template', rows: 0, present: false, contains: false });
  const two = await run([...common, markerPath, ...expect], { records: [{ template: 'marker-v2' }, { template: 'marker-v2' }] });
  assert.deepEqual(two.result.expect, { field: 'template', rows: 2, present: false, contains: false });
  const single = await run([...common, '/api/now/table/sp_widget/fixture?sysparm_fields=template', '--expect-field=template', '--expect-contains=marker-v2'],
    { payload: { result: { template: 'x marker-v2 y' } } });
  assert.deepEqual(single.result.expect, { field: 'template', rows: 1, present: true, contains: true });
  const denied = await run([...common, markerPath, ...expect], { status: 403, payload: { error: { message: 'fixture access denied' } } });
  assert.equal(denied.exitCode, 1); assert.equal(denied.result.ok, false);
  assert.deepEqual(denied.result.expect, { field: 'template', rows: 0, present: false, contains: false });
  const plain = await run([...common, markerPath]);
  assert.equal('expect' in plain.result, false);
});

test('CLI refuses a half or write-side content check before any request', async () => {
  const markerPath = '/api/now/table/sp_widget?sysparm_fields=template&sysparm_limit=1';
  await refused([...common, markerPath, '--expect-field', 'template'], /--expect-field and --expect-contains together/);
  await refused([...common, markerPath, '--expect-contains', 'marker'], /--expect-field and --expect-contains together/);
  await refused([...common, markerPath, '--expect-field', 'template', '--expect-contains', ''], /--expect-contains requires a value/);
  await refused([...common, markerPath, '--expect-field', 'template', '--expect-contains', '  '], /--expect-contains needs a non-blank marker literal/);
  await refused([...common, markerPath, '--expect-field', 'template', '--expect-contains=\t'], /--expect-contains needs a non-blank marker literal/);
  await refused(['--alias', 'fixture', markerPath, '--expect-field', 'template', '--expect-contains', 'marker'], /need --agent and a GET API path/);
  await refused([...common, '--expect-field', 'template', '--expect-contains', 'marker'], /need --agent and a GET API path/);
  await refused([...common, '--method', 'DELETE', '/api/now/table/fixture/record', '--expect-field', 'template', '--expect-contains', 'marker'], /need --agent and a GET API path/);
  await refused([...common, markerPath, '--expect-field', 'a', '--expect-field', 'b', '--expect-contains', 'marker'], /--expect-field was given more than once/);
});

test('the sn-build-install marker check is one sn-skill rest line that runs through the CLI', async () => {
  const install = fs.readFileSync(path.join(dir, '../sn-build-install/SKILL.md'), 'utf8');
  const section = install.slice(install.indexOf('Example marker check'), install.indexOf('A marker only proves'));
  assert.ok(section.length > 0);
  assert.doesNotMatch(section, /ConvertFrom-Json|node -e|```(?:powershell|bash)/, 'one plain marker-check fence, no per-shell variants');
  const lines = [...install.matchAll(/^sn-skill rest --agent --alias '([^'"]+)' --instance '([^'"]+)' '([^'"]+)' --expect-field (\w+) --expect-contains '([^'"]+)'$/gm)];
  assert.equal(lines.length, 1);
  const [, , , api, field, marker] = lines[0];
  assert.doesNotMatch(api, /sysparm_limit=1(?!\d)/, 'limit 2 keeps a duplicate match visible as rows:2');
  const resolved = api.replace('<widget-id>', 'fixture');
  const result = await run([...common, resolved, '--expect-field', field, '--expect-contains', marker], { records: [{ [field]: `x ${marker} y` }] });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.result.expect, { field, rows: 1, present: true, contains: true });
  assert.match(install, /no quote marks/);
});
