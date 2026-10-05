'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { preflight, apply, status, parse } = require('../../payload/.agents/skills/sn-update-advisor/scripts/update-project-sdk.cjs');

// Only temporary fixtures and an injected fake npm process. Never invoke npm, SDK, network or a user's project.
function fixture(t, section = 'devDependencies') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-update-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'ancestor', 'nested', 'intended project');
  const runDir = path.join(root, 'evidence', 'run');
  const npmCli = path.join(root, 'npm', 'bin', 'npm-cli.js');
  fs.mkdirSync(path.dirname(npmCli), { recursive: true });
  fs.writeFileSync(npmCli, '// fixture only');
  fs.writeFileSync(path.join(root, 'npm', 'package.json'), JSON.stringify({ name: 'npm', version: '11.6.2' }));
  function versions(version, target = project) {
    fs.mkdirSync(path.join(target, 'node_modules', '@servicenow', 'sdk'), { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'fixture', [section]: { '@servicenow/sdk': version } }));
    fs.writeFileSync(path.join(target, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
      '': { [section]: { '@servicenow/sdk': version } }, 'node_modules/@servicenow/sdk': { version },
    } }));
    fs.writeFileSync(path.join(target, 'node_modules', '@servicenow', 'sdk', 'package.json'), JSON.stringify({ version }));
  }
  versions('4.12.2');
  const ancestor = path.join(root, 'ancestor');
  versions('4.12.2', ancestor);
  return { root, project, ancestor, runDir, npmCli, versions,
    options: { project, runDir, npmCli, from: '4.12.2', to: '4.13.3', approved: true } };
}
function fakeSuccess(f, assertions = () => {}) {
  return (command, args, opts) => {
    assertions(command, args, opts);
    fs.writeSync(opts.stdio[1], 'fixture stdout\n');
    fs.writeSync(opts.stdio[2], 'fixture warning\n');
    f.versions('4.13.3');
    return { status: 0 };
  };
}

test('mutation is project-bound in both cwd and npm prefix; ancestor remains untouched', t => {
  const f = fixture(t);
  const before = fs.readFileSync(path.join(f.ancestor, 'package.json'));
  const r = apply(f.options, fakeSuccess(f, (exe, args, opts) => {
    assert.equal(exe, process.execPath);
    assert.equal(opts.cwd, f.project);
    assert.equal(opts.shell, false);
    assert.deepEqual(args, [f.npmCli, '--prefix', f.project, 'install', '--global=false', '--workspaces=false',
      '--ignore-scripts', '--engine-strict', '--force=false', '--package-lock=true', '--package-lock-only=false', '--save=true', '--save-dev', '--save-exact', '@servicenow/sdk@4.13.3']);
  }));
  assert.equal(r.state, 'package-verified');
  assert.equal(r.exitCode, 0);
  assert.equal(r.build, 'not-run');
  assert.deepEqual(fs.readFileSync(path.join(f.ancestor, 'package.json')), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.runDir, 'package.json.before'))).devDependencies['@servicenow/sdk'], '4.12.2');
  assert.equal(status(f.runDir).state, 'package-verified');
  assert.equal(fs.existsSync(path.join(f.project, '.sn-sdk-update.lock')), false);
});

test('real Node fixture child captures cwd, stdout/stderr and native exit without invoking npm', t => {
  const f = fixture(t);
  // The only executable child is this test-owned JS file, using temporary fixture metadata.
  fs.writeFileSync(f.npmCli, `const fs = require('node:fs'), path = require('node:path');
    const prefix = process.argv[process.argv.indexOf('--prefix') + 1];
    if (process.cwd() !== prefix) throw new Error('cwd mismatch');
    const pkgFile = path.join(prefix, 'package.json'), lockFile = path.join(prefix, 'package-lock.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile)), lock = JSON.parse(fs.readFileSync(lockFile));
    pkg.devDependencies['@servicenow/sdk'] = '4.13.3';
    lock.packages[''].devDependencies['@servicenow/sdk'] = '4.13.3';
    lock.packages['node_modules/@servicenow/sdk'].version = '4.13.3';
    fs.writeFileSync(pkgFile, JSON.stringify(pkg)); fs.writeFileSync(lockFile, JSON.stringify(lock));
    fs.writeFileSync(path.join(prefix, 'node_modules/@servicenow/sdk/package.json'), JSON.stringify({version: '4.13.3'}));
    process.stdout.write('fixture stdout\\n'); process.stderr.write('fixture stderr\\n');`);
  const r = apply(f.options);
  assert.equal(r.state, 'package-verified');
  assert.equal(r.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(f.runDir, 'npm.stdout.log'), 'utf8'), 'fixture stdout\n');
  assert.equal(fs.readFileSync(path.join(f.runDir, 'npm.stderr.log'), 'utf8'), 'fixture stderr\n');
  assert.equal(status(f.runDir).build, 'not-run');
});

test('production dependency remains in dependencies; package-only success never claims build success', t => {
  const f = fixture(t, 'dependencies');
  apply(f.options, fakeSuccess(f, (_exe, args) => assert.ok(args.includes('--save-prod'))));
  assert.equal(status(f.runDir).build, 'not-run');
});

test('missing exact project manifest cannot fall back to an ancestor; no process starts', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.project, 'package.json'));
  assert.throws(() => apply(f.options, () => assert.fail('must not launch')));
  assert.equal(fs.existsSync(f.runDir), false);
});

test('relative paths, stale approval and unapproved mutations fail closed', t => {
  const f = fixture(t);
  for (const override of [{ project: '.' }, { runDir: 'run' }, { npmCli: 'npm.cmd' }, { from: '4.11.0' }, { to: 'latest' }, { approved: false }]) {
    assert.throws(() => apply({ ...f.options, ...override }, () => assert.fail('must not launch')));
  }
  assert.equal(fs.existsSync(f.runDir), false);
});

test('mismatched lock, installed SDK, engine pin or competing manager blocks npm', t => {
  for (const kind of ['lock', 'installed', 'engine', 'manager', 'workspace']) {
    const f = fixture(t);
    if (kind === 'lock') fs.writeFileSync(path.join(f.project, 'package-lock.json'), '{}');
    if (kind === 'installed') fs.writeFileSync(path.join(f.project, 'node_modules/@servicenow/sdk/package.json'), '{"version":"4.11.0"}');
    if (kind === 'engine') fs.writeFileSync(path.join(f.project, '.nvmrc'), '0.0.1');
    if (kind === 'manager') fs.writeFileSync(path.join(f.project, 'yarn.lock'), 'fixture');
    if (kind === 'workspace') fs.writeFileSync(path.join(f.ancestor, 'package.json'), '{"workspaces":["nested/*"]}');
    assert.throws(() => apply(f.options, () => assert.fail('must not launch')), kind);
  }
});

test('delayed process has durable request/logs, UNKNOWN status and refuses duplicate execution', t => {
  const f = fixture(t);
  apply(f.options, fakeSuccess(f, () => {
    const before = fs.readFileSync(path.join(f.runDir, 'request.json'));
    const entries = fs.readdirSync(f.runDir);
    assert.equal(status(f.runDir).state, 'unknown');
    assert.deepEqual(fs.readFileSync(path.join(f.runDir, 'request.json')), before);
    assert.deepEqual(fs.readdirSync(f.runDir), entries);
    assert.throws(() => apply({ ...f.options, runDir: f.runDir + '-duplicate' }, () => assert.fail('duplicate npm')), /Existing update lock/);
  }));
  assert.equal(status(f.runDir).state, 'package-verified');
  assert.throws(() => apply(f.options, () => assert.fail('retry')), /already exists/);
  assert.throws(() => apply({ ...f.options, runDir: f.runDir + '-new' }, () => assert.fail('stale retry')), /match the exact/);
});

test('missing exit, signal, empty response or spawn error never becomes success, even with changed metadata', t => {
  for (const response of [{}, undefined, { status: null }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('denied') }]) {
    const f = fixture(t);
    const r = apply(f.options, () => { f.versions('4.13.3'); return response; });
    assert.equal(r.state, 'unknown');
    assert.equal(fs.existsSync(path.join(f.project, '.sn-sdk-update.lock')), true);
    assert.equal(status(f.runDir).state, 'unknown');
  }
});

test('nonzero native exit and silent no-op are not package verification', t => {
  for (const [exit, expected] of [[1, 'failed'], [0, 'verification-failed']]) {
    const f = fixture(t);
    const r = apply(f.options, () => ({ status: exit }));
    assert.equal(r.state, expected);
    assert.equal(fs.existsSync(path.join(f.project, '.sn-sdk-update.lock')), true);
  }
});

test('unrelated delayed output does not substitute for native completion or metadata verification', t => {
  const f = fixture(t);
  const r = apply(f.options, (_exe, _args, opts) => {
    fs.writeSync(opts.stdio[1], '[now-sdk] AIUX build produced 14 record(s)\n');
    return { status: null };
  });
  assert.equal(r.state, 'unknown');
  assert.equal(r.build, 'not-run');
});

test('status rejects wrong-run evidence and notices metadata changed after completion without rewriting anything', t => {
  const f = fixture(t);
  apply(f.options, fakeSuccess(f));
  const resultFile = path.join(f.runDir, 'result.json');
  const bytes = fs.readFileSync(resultFile);
  f.versions('4.12.2');
  assert.equal(status(f.runDir).state, 'verification-failed');
  assert.deepEqual(fs.readFileSync(resultFile), bytes);
  const tampered = JSON.parse(bytes); tampered.project = f.ancestor;
  fs.writeFileSync(resultFile, JSON.stringify(tampered));
  assert.throws(() => status(f.runDir), /Mismatched run/);
});

test('ambient force cannot override the worker engine gate', t => {
  const f = fixture(t);
  const previous = process.env.NPM_CONFIG_FORCE;
  try {
    process.env.NPM_CONFIG_FORCE = 'true';
    const plan = preflight(f.options);
    assert.ok(plan.args.includes('--force=false'));
    assert.ok(plan.args.includes('--engine-strict'));
  } finally {
    if (previous === undefined) delete process.env.NPM_CONFIG_FORCE; else process.env.NPM_CONFIG_FORCE = previous;
  }
});

test('junction evidence paths into the project are refused without writes', t => {
  const f = fixture(t);
  const alias = path.join(f.root, 'external-alias');
  fs.symlinkSync(f.project, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => apply({ ...f.options, runDir: path.join(alias, 'run') }, () => assert.fail('must not launch')), /Linked/);
  assert.equal(fs.existsSync(path.join(f.project, '.sn-sdk-update.lock')), false);
  assert.equal(fs.existsSync(path.join(f.project, 'run')), false);
});

test('linked project and hard-linked manifest are refused', t => {
  const f = fixture(t);
  const alias = path.join(f.root, 'project-alias');
  fs.symlinkSync(f.project, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => preflight({ ...f.options, project: alias }), /Linked/);
  fs.linkSync(path.join(f.project, 'package.json'), path.join(f.root, 'linked-package.json'));
  assert.throws(() => preflight(f.options), /unlinked file/);
});

test('unrelated manifest changes keep verification failed and the lock intact', t => {
  const f = fixture(t);
  const r = apply(f.options, () => {
    f.versions('4.13.3');
    const file = path.join(f.project, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file)); pkg.scripts = { unrelated: 'changed' };
    fs.writeFileSync(file, JSON.stringify(pkg));
    return { status: 0 };
  });
  assert.equal(r.state, 'verification-failed');
  assert.match(r.verificationError, /Unexpected manifest/);
  assert.equal(fs.existsSync(path.join(f.project, '.sn-sdk-update.lock')), true);
});

test('each lock mismatch and package-manager pin is checked independently', t => {
  for (const kind of ['root', 'resolved', 'manager', 'workspace']) {
    const f = fixture(t);
    const file = path.join(f.project, kind === 'root' || kind === 'resolved' ? 'package-lock.json' : 'package.json');
    const doc = JSON.parse(fs.readFileSync(file));
    if (kind === 'root') doc.packages[''].devDependencies['@servicenow/sdk'] = '4.11.0';
    if (kind === 'resolved') doc.packages['node_modules/@servicenow/sdk'].version = '4.11.0';
    if (kind === 'manager') doc.packageManager = 'npm@0.0.1';
    if (kind === 'workspace') doc.workspaces = ['child/*'];
    fs.writeFileSync(file, JSON.stringify(doc));
    assert.throws(() => apply(f.options, () => assert.fail('must not launch')), kind);
  }
});

test('status detects dependency placement drift and wrong request identity without writing', t => {
  const f = fixture(t);
  apply(f.options, fakeSuccess(f));
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(f.project, name); const doc = JSON.parse(fs.readFileSync(file));
    const root = name === 'package.json' ? doc : doc.packages[''];
    root.dependencies = root.devDependencies; delete root.devDependencies;
    fs.writeFileSync(file, JSON.stringify(doc));
  }
  assert.equal(status(f.runDir).state, 'verification-failed');
  const file = path.join(f.runDir, 'request.json'); const request = JSON.parse(fs.readFileSync(file));
  request.runDir += '-other'; fs.writeFileSync(file, JSON.stringify(request));
  const bytes = fs.readFileSync(file);
  assert.throws(() => status(f.runDir), /Mismatched/);
  assert.deepEqual(fs.readFileSync(file), bytes);
});

test('launch exceptions and missing/malformed result evidence never trigger an install or rewrite', t => {
  const f = fixture(t);
  assert.equal(status(f.runDir).state, 'unknown');
  assert.equal(fs.existsSync(f.runDir), false);
  const r = apply(f.options, () => { throw new Error('fixture launch denied'); });
  assert.equal(r.state, 'unknown');
  assert.match(r.launchError, /launch denied/);
  const result = path.join(f.runDir, 'result.json');
  fs.writeFileSync(result, '{');
  const lock = fs.readFileSync(path.join(f.project, '.sn-sdk-update.lock'));
  assert.throws(() => status(f.runDir));
  assert.equal(fs.readFileSync(result, 'utf8'), '{');
  assert.deepEqual(fs.readFileSync(path.join(f.project, '.sn-sdk-update.lock')), lock);
});

test('preflight is read-only; CLI status cannot accept apply flags or arbitrary commands', t => {
  const f = fixture(t);
  assert.equal(preflight(f.options).project, f.project);
  assert.equal(fs.existsSync(f.runDir), false);
  assert.equal(fs.existsSync(path.join(f.project, '.sn-sdk-update.lock')), false);
  assert.throws(() => parse(['status', '--run-dir', f.runDir, '--approved']));
  assert.throws(() => parse(['apply', '--project', f.project, '--project', f.ancestor]));
  assert.throws(() => parse(['apply', '--command', 'anything']));
  assert.deepEqual(parse(['status', '--run-dir', f.runDir]), { mode: 'status', options: { runDir: f.runDir } });
});
