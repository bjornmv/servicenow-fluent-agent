'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const { payloadFiles, excluded } = require('../../lib/payload-files.cjs');
const { generate, renderBaseline, agentPath, baselinePath } = require('../generate-baseline.cjs');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const payload = path.join(root, 'payload');
const files = payloadFiles(payload);
const rel = file => path.relative(payload, file).replace(/\\/g, '/');
const skillFiles = files.filter(f => f.endsWith(`${path.sep}SKILL.md`));

test('every runtime skill has consistent portable trigger metadata', () => {
  assert.equal(skillFiles.length, 21);
  for (const file of skillFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
    const name = front.match(/^name: (.+)$/m)?.[1];
    assert.equal(name, path.basename(path.dirname(file)), file);
    const description = front.match(/^description: (.+)$/m)?.[1];
    assert.match(description, /Use when\b/, file);
    assert.doesNotMatch(description, /(?:now-sdk|SDK)\s+\d+\.\d+|[A-Z]:\\|\bPDI\b|Pelican/i, file);
    for (const field of ['argument-hint', 'compatibility']) assert.match(front, new RegExp(`^${field}: .+`, 'm'), file);
    assert.match(front, /metadata:\n  version: '1'/, file);
    // Disallow invalid unquoted YAML mapping delimiters in flat scalar values.
    for (const line of front.split('\n').filter(l => /^(description|compatibility|argument-hint): /.test(l))) {
      const value = line.slice(line.indexOf(': ') + 2);
      if (!/^["']/.test(value)) assert.doesNotMatch(value, /: /, file);
    }
    for (const [, link] of text.matchAll(/\]\(((?:\.\.\/|references\/)[^)]+\.md)(?:#[^)]*)?\)/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), link)), `${file}: broken ${link}`);
    }
  }
});

test('payload is free of personal examples, and SDK version claims are historical evidence only', () => {
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /C:\\Personal\\|bvelsrud|Pelican/, file);
    for (const line of text.split('\n').filter(l => /(?:now-sdk|SDK)\s+4\.11/.test(l))) assert.match(line, /^Verified against:/, file);
  }
  assert.match(read('payload/.agents/skills/win-git-bootstrap/SKILL.md'), /Routine Git-dependent work does not trigger/);
  assert.match(read('payload/.agents/skills/sn-doc-export/render.py'), /SN_AGENT_HOME/);
  assert.match(read('payload/.agents/skills/sn-doc-export/render.js'), /process.env.SN_AGENT_HOME \|\| ''/);
});

test('thin authoring wrappers and ambiguous export name are retired, with type traps preserved', () => {
  for (const name of ['sn-add-table', 'sn-add-business-rule', 'sn-doc']) assert.equal(fs.existsSync(path.join(payload, '.agents/skills', name, 'SKILL.md')), false);
  const record = read('payload/.agents/skills/sn-add-record/SKILL.md');
  assert.match(record, /sn-explain/);
  assert.match(record, /references\/table.md/);
  assert.match(record, /references\/business-rule.md/);
  assert.match(read('payload/.agents/skills/sn-add-record/references/table.md'), /named export must equal the table name/);
  assert.match(read('payload/.agents/skills/sn-add-record/references/business-rule.md'), /Now.include/);
  for (const type of ['graphql-api', 'playbook', 'test-suite']) assert.ok(skillFiles.some(f => f.endsWith(path.join(`sn-add-${type}`, 'SKILL.md'))));
});

test('payload enumeration excludes development tests but retains setup docs acceptance tests', () => {
  const rels = files.map(rel);
  assert.ok(rels.includes('.agents/skills/sn-doc-lookup/test/run-tests.js'));
  assert.ok(rels.includes('.agents/skills/sn-doc-lookup/test/benchmarks.json'));
  for (const name of ['.agents/skills/sn-rest/test/live.mjs', '.agents/tools/test/fixture.cjs', '.agents/skills/sn-doc-export/test/foo.cjs', '.agents/skills/sn-doc-lookup/tests/dev.cjs']) assert.equal(excluded(name), true);
  assert.equal(excluded('.agents/skills/sn-doc-lookup/test/run-tests.js'), false);
  assert.equal(rels.some(r => /\/(?:test|tests)\//.test(r) && !r.startsWith('.agents/skills/sn-doc-lookup/test/')), false);
  assert.match(read('tools/refresh-payload.cjs'), /excluded\(path.relative\(payloadRoot, targetPath\)/);
  assert.match(read('bin/sn-fluent-agent.cjs'), /payloadFiles\(payloadRoot\)/);
});

test('baseline is generated, has fewer words and cannot silently drift', () => {
  generate(root, true);
  const agent = read(agentPath), baseline = read(baselinePath);
  assert.equal(baseline, renderBaseline(agent));
  const words = s => s.trim().split(/\s+/).length;
  assert.ok(words(agent) >= 600 && words(agent) <= 700, 'Agent word budget');
  assert.ok(words(baseline) >= 100 && words(baseline) <= 150, 'Baseline word budget');
  assert.ok(words(agent) + words(baseline) <= 850, 'Budget includes both co-loaded prompts');
  assert.doesNotMatch(baseline, /^## /m, 'No copied workflow sections');
  assert.throws(() => renderBaseline(agent.replace('## Approval gates', '## Changed heading')), /Missing canonical section/);
  assert.match(baseline, /\.\.\/reference\/sdk-commands.md/);
});

test('completed install prints the PDI guide and safe next action, but dry runs/conflicts do not', () => {
  const source = read('bin/sn-fluent-agent.cjs');
  const body = source.slice(source.indexOf('function printInstallSummary('), source.indexOf('\nfunction help()'));
  const messages = [];
  const print = vm.runInNewContext('(' + body + ')', { console: { log: message => messages.push(message) } });
  const summary = { version: 'fixture', home: '/fixture', dryRun: false, force: false,
    copied: [], unchanged: [], removedObsolete: [], skippedConflicts: [], skippedObsoleteConflicts: [], backups: [] };
  const guide = 'https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/connect-pdi.md';
  print(summary, 67);
  assert.ok(messages.some(message => message.includes(guide)));
  const login = messages.findIndex(message => message.includes('log in first'));
  const terminal = messages.findIndex(message => message === '2. In VS Code, choose Terminal -> New Terminal.');
  const command = messages.findIndex(message => message.includes('now-sdk auth --add dev123456'));
  assert.ok(login >= 0 && terminal > login && command > terminal, 'login, new terminal, then manual command');
  assert.ok(messages.some(message => message.includes('Replace dev123456 with your own instance name')));
  assert.equal(messages.some(message => message.includes('new ServiceNow Fluent chat')), false);
  assert.ok(messages.some(message => message.includes('never paste passwords or OAuth codes into chat')));
  for (const override of [{ dryRun: true }, { skippedConflicts: ['edited.md'] }, { skippedObsoleteConflicts: ['old.md'] }]) {
    messages.length = 0;
    print({ ...summary, ...override }, 67);
    assert.equal(messages.some(message => message.includes(guide)), false);
  }
});

test('PDI guide has local screenshots, valid links and login-first manual authentication', () => {
  const guide = read('docs/connect-pdi.md');
  const images = [...guide.matchAll(/!\[[^\]]+\]\(([^)]+)\)/g)];
  assert.equal(images.length, 3);
  assert.match(guide, /Request your instance\*\*, wait until the instance is available, then click \*\*Start building/);
  for (const [, image] of images) {
    const bytes = fs.readFileSync(path.join(root, 'docs', image));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', image);
  }
  for (const [, link] of guide.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^https?:/.test(link)) assert.ok(fs.existsSync(path.join(root, 'docs', link.split('#')[0])), link);
  }
  assert.match(guide, /now-sdk auth --add dev123456/);
  assert.match(guide, /Replace `dev123456` with your own instance name/);
  assert.match(guide, /Choose \*\*oauth\*\*/);
  for (const button of ['**Start Building**', '**ServiceNow studio**', '**Build Agent**']) assert.ok(guide.includes(button));
  assert.match(guide, /automatically log you in/);
  assert.doesNotMatch(guide, /Manage my instance/);
  assert.ok(guide.indexOf('## 1. Log in to your PDI first') < guide.indexOf('now-sdk auth --add dev123456'));
  assert.match(guide, /\*\*Terminal -> New Terminal\*\*/);
  assert.doesNotMatch(guide, /PowerShell with now-sdk|With Profile|Read-Host|\$Instance|--type oauth --alias|Quick start: ask the agent/);
  assert.doesNotMatch(guide, /auth --print|--type basic|dev426577|ven06834|bvelsrud/);
  const url = 'https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/connect-pdi.md';
  assert.ok(read('setup.md').includes(url));
  assert.ok(read('README.md').includes('(docs/connect-pdi.md)'));
});

test('installer backs up retired owned files and preserves local edits (isolated virtual host)', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-install-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'), home = path.join(temp, 'home');
  const put = (base, rel, bytes) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return f; };
  put(repo, 'VERSION', read('VERSION'));
  put(repo, 'payload/.agents/skills/sn-doc-export/SKILL.md', 'new export');
  put(repo, 'payload/.agents/skills/sn-rest/test/live.mjs', 'must never install');
  put(repo, 'payload/.agents/skills/sn-doc-lookup/test/run-tests.js', 'keep acceptance harness');
  put(repo, agentPath, read(agentPath)); put(repo, baselinePath, read(baselinePath));
  const retired = ['.agents/skills/sn-doc/SKILL.md', '.agents/skills/sn-add-table/SKILL.md', '.agents/tools/test/owned.cjs'];
  const owned = Object.fromEntries(retired.map(r => [r, { target: put(home, r, 'owned'), sha256: crypto.createHash('sha256').update('owned').digest('hex') }]));
  put(home, retired[1], 'local customization');
  put(home, '.agents/.servicenow-fluent-agent-install.json', JSON.stringify({ version: '0.3.8', files: owned }));
  const entry = path.join(root, 'bin/sn-fluent-agent.cjs');
  const nativeRequire = createRequire(entry);
  const fakeProcess = { argv: ['node', entry, 'install', '--no-vscode-settings'], platform: 'fixture', env: {}, exitCode: 0 };
  await vm.runInNewContext(fs.readFileSync(entry, 'utf8'), { __dirname: path.join(repo, 'bin'), Buffer, process: fakeProcess,
    require: name => name === 'node:os' ? { homedir: () => home } : nativeRequire(name), console: { log() {}, error(msg) { throw new Error(msg); } } });
  assert.equal(fakeProcess.exitCode, 0);
  const receipt = JSON.parse(fs.readFileSync(path.join(home, '.agents/.servicenow-fluent-agent-install.json')));
  assert.equal(fs.existsSync(path.join(home, retired[0])), false);
  assert.equal(fs.existsSync(path.join(home, retired[2])), false);
  assert.equal(fs.readFileSync(path.join(home, retired[1]), 'utf8'), 'local customization');
  assert.ok(receipt.files[retired[1]], 'retain ownership for conflict review');
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/sn-rest/test/live.mjs')), false);
  assert.ok(receipt.files['.agents/skills/sn-doc-lookup/test/run-tests.js']);
  const backups = path.join(home, '.agents/_backups/servicenow-fluent-agent');
  const run = fs.readdirSync(backups)[0];
  assert.equal(fs.readFileSync(path.join(backups, run, retired[0]), 'utf8'), 'owned');
  fakeProcess.argv = ['node', entry, 'verify'];
  const messages = [];
  await vm.runInNewContext(fs.readFileSync(entry, 'utf8'), { __dirname: path.join(repo, 'bin'), Buffer, process: fakeProcess,
    require: name => name === 'node:os' ? { homedir: () => home } : nativeRequire(name), console: { log(msg) { messages.push(msg); }, error(msg) { throw new Error(msg); } } });
  assert.equal(fakeProcess.exitCode, 1, 'Preserved old skill is not a clean migration');
  assert.ok(messages.some(m => m.includes('retained obsolete managed files: 1')));
});
