'use strict';

// `sn-skill deletes`: the read-only pre-install delete scan. Fixtures mirror now-sdk 4.13.6
// output after a transformed flow's source was removed: keys.ts entries marked
// `deleted: true` and a DELETE record_update (with child deletes) under dist/app.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tools = path.resolve(__dirname, '..', '..', 'payload', '.agents', 'tools');
const script = path.join(tools, 'sn-deletes.cjs');
const dispatcher = path.join(tools, 'sn-skill.cjs');
const { readKeys, readConfig } = require(script);

const FLOW = 'd45f95b1891944ecbc74cc47cbf02eec', STEP = '77bc96b7365c4ee9bc352837920876f2';
const DOC = 'e90ac58bb9454f958085a61edb2a6cbb', BR = '706abcca40b8468ebc04cf91ef1947d9', OLD = '0123456789abcdef0123456789abcdef';

const KEYS = `import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    'br-vendor-push': {
                        table: 'sys_script'
                        id: '${BR}'
                    }
                    'flow-note-review': {
                        table: 'sys_hub_flow'
                        id: '${FLOW}'
                        deleted: true
                    }
                    flow_log_done: {
                        table: 'sys_hub_action_instance_v2'
                        id: '${STEP}'
                        deleted: true
                    }
                }
                composite: [
                    {
                        table: 'sys_documentation'
                        id: '${DOC}'
                        deleted: true
                        key: {
                            name: 'var__m_sys_hub_flow_input_${FLOW}'
                            element: 'note'
                            language: 'en'
                        }
                    },
                ]
                deleted: {
                    sys_script_include: ['${OLD}']
                }
            }
        }
    }
}
`;

const deleteXml = (table, id, extra = '') => `<?xml version="1.0"?>
<record_update table="${table}">
  <${table} action="DELETE" apply_defaults="true">
    <sys_id>${id}</sys_id>
    <sys_update_name>${table}_${id}</sys_update_name>
  </${table}>${extra}
</record_update>`;

const flowChildren = `
  <sys_hub_flow_input action="delete_multiple" query="model=${FLOW}^sys_idNOT IN${DOC}"/>
  <sys_hub_flow_input action="DELETE" apply_defaults="true">
    <sys_id>${DOC}</sys_id>
    <element>note</element>
  </sys_hub_flow_input>`;

// An update that only prunes children (delete_multiple) is not a record delete.
const updateXml = `<?xml version="1.0"?>
<record_update table="sys_script">
  <sys_script action="INSERT_OR_UPDATE">
    <sys_id>${BR}</sys_id>
  </sys_script>
  <sys_variable_value action="delete_multiple" query="document_key=${BR}"/>
</record_update>`;

function project(dir, { config = { scope: 'x_acme_app' }, out = 'dist/app', files = {} } = {}) {
  fs.writeFileSync(path.join(dir, 'now.config.json'), JSON.stringify(config));
  fs.mkdirSync(path.join(dir, 'src', 'fluent', 'generated'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'fluent', 'generated', 'keys.ts'), KEYS);
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-deletes-'));
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('keys.ts parser maps explicit, composite and tombstone ids with their deleted flag', () => withTemp(dir => {
  project(dir);
  const keys = readKeys(path.join(dir, 'src', 'fluent', 'generated', 'keys.ts'));
  assert.deepEqual(keys.get(BR), { label: 'br-vendor-push', deleted: false });
  assert.deepEqual(keys.get(FLOW), { label: 'flow-note-review', deleted: true });
  assert.deepEqual(keys.get(STEP), { label: 'flow_log_done', deleted: true });
  assert.deepEqual(keys.get(DOC), { label: 'composite', deleted: true });
  assert.deepEqual(keys.get(OLD), { label: 'tombstone', deleted: true });
}));

test('removed transformed flow source is listed as DELETE records with keys and exit 1', () => withTemp(dir => {
  project(dir, { files: {
    [`author_elective_update/sys_hub_flow_${FLOW}.xml`]: deleteXml('sys_hub_flow', FLOW, flowChildren),
    [`author_elective_update/sys_hub_action_instance_v2_${STEP}.xml`]: deleteXml('sys_hub_action_instance_v2', STEP),
    [`update/sys_script_${BR}.xml`]: updateXml,
  } });
  const result = run([dir]);
  assert.equal(result.status, 1, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.deepEqual(lines, [
    `DELETE sys_hub_action_instance_v2 ${STEP} key=flow_log_done (keys.ts deleted) dist/app/author_elective_update/sys_hub_action_instance_v2_${STEP}.xml`,
    `DELETE sys_hub_flow ${FLOW} key=flow-note-review (keys.ts deleted) children=2 dist/app/author_elective_update/sys_hub_flow_${FLOW}.xml`,
    'deletes=2 automation=2 type=package output=dist/app',
  ]);
}));

test('a build without delete records exits 0; Now.del records without a key are still listed', () => withTemp(dir => {
  project(dir, { files: { [`update/sys_script_${BR}.xml`]: updateXml } });
  let result = run([dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'deletes=0 automation=0 type=package output=dist/app\n');
  const other = 'fedcba9876543210fedcba9876543210';
  fs.writeFileSync(path.join(dir, 'dist', 'app', 'update', `sys_ui_policy_${other}.xml`), deleteXml('sys_ui_policy', other));
  result = run([dir]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`^DELETE sys_ui_policy ${other} key=none dist/app/update/`, 'm'));
}));

test('appOutputDir and generatedDir from now.config.json are honored', () => withTemp(dir => {
  project(dir, { config: { scope: 'x_acme_app', appOutputDir: 'build/out' }, out: 'build/out', files: { [`a/sys_hub_flow_${FLOW}.xml`]: deleteXml('sys_hub_flow', FLOW) } });
  const result = run([dir]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /key=flow-note-review .*build\/out\/a\//);
  assert.match(result.stdout, /output=build\/out\n$/);
  // generatedDir is relative to fluentDir unless it already starts with it, as in the SDK.
  fs.writeFileSync(path.join(dir, 'now.config.json'), JSON.stringify({ fluentDir: 'fl', generatedDir: 'gen' }));
  assert.equal(readConfig(dir).keysFile, path.join(dir, 'fl', 'gen', 'keys.ts'));
  fs.writeFileSync(path.join(dir, 'now.config.json'), JSON.stringify({ fluentDir: 'fl', generatedDir: 'fl/gen2' }));
  assert.equal(readConfig(dir).keysFile, path.join(dir, 'fl', 'gen2', 'keys.ts'));
}));

test('missing project config or build output is exit 2, never a clean result', () => withTemp(dir => {
  let result = run([dir]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no now\.config\.json.*not a clean result/);
  project(dir);
  result = run([dir]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no build output .*run now-sdk build first/);
  for (const args of [[], [dir, dir], ['--out']]) assert.equal(run(args).status, 2, args.join(' '));
  assert.equal(run(['--help']).status, 0);
}));

test('sn-skill deletes dispatches to the helper with exit evidence', () => withTemp(dir => {
  project(dir, { files: { [`x/sys_hub_flow_${FLOW}.xml`]: deleteXml('sys_hub_flow', FLOW) } });
  const result = spawnSync(process.execPath, [dispatcher, 'deletes', dir], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^DELETE sys_hub_flow /);
  assert.equal(result.stderr, 'sn-skill: deletes exit=1\n');
}));
