'use strict';
// Offline contract tests: execute the actual CLI in a VM with fake keyring/fetch.
// No credential storage, SDK, subprocess, live network or user files are touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname, '../../../payload/.agents/skills/sn-rest');
const source = fs.readFileSync(path.join(dir, 'sn-rest.js'), 'utf8');
const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
const recipes = fs.readFileSync(path.join(dir, 'references/queries.md'), 'utf8');

async function run(args, { records = [], payload, rawText, next = null, status = 200 } = {}) {
  const logs = [], errors = [], calls = [];
  let storeReads = 0, exitCode = 0;
  class Entry {
    getPassword() {
      storeReads++;
      return JSON.stringify({ fixture: { host: 'https://fixture.invalid', access_token: 'offline-fixture-only' } });
    }
    setPassword() { throw Error('Unexpected credential write'); }
  }
  const context = { URL, URLSearchParams, Buffer,
    process: { argv: ['node', 'sn-rest.js', ...args], platform: 'win32', env: {}, cwd: () => '/fixture',
      exit(code) { exitCode = code; throw Error('fixture-exit'); } },
    require(name) {
      if (name === 'path') return path;
      if (name === '@napi-rs/keyring') return { Entry };
      if (name === 'fs' || name === 'child_process') return new Proxy({}, { get() { throw Error('Unexpected filesystem/subprocess access'); } });
      throw Error(`Unexpected module: ${name}`);
    },
    console: { log: x => logs.push(String(x)), error: x => errors.push(String(x)) },
    async fetch(url, options) {
      calls.push({ url: String(url), method: options.method });
      assert.equal(new URL(url).origin, 'https://fixture.invalid');
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
  return { logs, errors, calls, storeReads, exitCode, result };
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
  const commands = [...(skill + '\n' + recipes).matchAll(/^node "\$env:USERPROFILE\\.agents\\skills\\sn-rest\\sn-rest.js" --agent --alias "([^"]+)" --instance "([^"]+)" "([^"]+)"$/gm)];
  assert.equal(commands.length, 5);
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
