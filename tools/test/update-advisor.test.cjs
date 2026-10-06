'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  CHECK_INTERVAL_MS,
  REMINDER_INTERVAL_MS,
  checkUpdates,
  keyFor,
  isNewerVersion,
  recordDecision,
} = require('../../lib/update-advisor.cjs');

// Execute only the reviewed launcher with fake fs/home/process/spawn bindings.
// No real child, network, receipt, user state or Git/SDK invocation.
const launcher = fs.readFileSync(path.join(__dirname, '../../payload/.agents/tools/sn-update-advisor.cjs'), 'utf8');
function runLauncher(args = ['check'], child = { status: 0, stdout: '', stderr: '' }, options = {}) {
  const stop = {};
  const calls = [];
  const stdout = [];
  const stderr = [];
  const fakeHome = options.home || path.resolve(os.tmpdir(), 'advisor-vm-home');
  const fsReads = [];
  const fakeRepo = path.join(fakeHome, 'repo');
  const proc = {
    argv: ['node', 'launcher.cjs', ...args], execPath: 'fixture-node', exitCode: 0,
    exit(code) { if (code !== undefined) this.exitCode = code; throw stop; },
  };
  const mocks = {
    'node:fs': {
      readFileSync(file) {
        fsReads.push(file);
        assert.equal(file, path.join(fakeHome, '.agents', '.servicenow-fluent-agent-install.json'));
        return options.badReceipt ? '{' : JSON.stringify({ repoRoot: fakeRepo });
      },
      existsSync(file) { assert.equal(file, path.join(fakeRepo, 'bin', 'sn-fluent-agent.cjs')); return !options.missingCli; },
      ...options.gateFs,
    },
    'node:os': { homedir: () => fakeHome },
    'node:path': path,
    'node:child_process': { spawnSync(...call) { calls.push(call); if (options.throwSpawn) throw new Error('launch denied'); return child; } },
  };
  try {
    vm.runInNewContext(launcher, {
      require(name) { assert.ok(mocks[name], name); return mocks[name]; },
      process: proc, Buffer, Date: { now: () => options.now ?? Date.now() },
      console: { log: value => stdout.push(String(value)), error: value => stderr.push(String(value)) },
    }, { timeout: 1000 });
  } catch (error) { if (error !== stop) throw error; }
  return { status: proc.exitCode, stdout, stderr, calls, fsReads };
}
const notification = { component: 'agent', id: '222222222222', label: 'ServiceNow Fluent Agent', current: '111111111111', available: '222222222222' };

test('launcher keeps a malformed bare --docs check quiet and forwards the original arguments', () => {
  const r = runLauncher(['check', '--docs'], { status: 1, stdout: '', stderr: 'Error: Missing value for --docs' });
  assert.equal(r.status, 0);
  assert.deepEqual(r.stdout, []);
  assert.deepEqual(r.stderr, []);
  assert.deepEqual(Array.from(r.calls[0][1]).slice(1), ['check-updates', '--docs']);
  assert.deepEqual(Array.from(r.calls[0][2].stdio), ['ignore', 'pipe', 'pipe']);
  assert.equal(r.calls[0][2].maxBuffer, 64 * 1024);
});

test('launcher emits successful actionable JSON only, never stderr diagnostics', () => {
  const r = runLauncher(['check'], { status: 0, stdout: JSON.stringify({ updates: [notification] }), stderr: 'fixture warning' });
  assert.equal(r.status, 0);
  assert.deepEqual(r.stdout.map(JSON.parse), [{ updates: [notification] }]);
  assert.deepEqual(r.stderr, []);
});

test('launcher suppresses empty, malformed, nonactionable and oversized check responses', () => {
  for (const stdout of ['', 'not JSON', '{}', '{"updates":[]}', '{"updates":[{}]}', JSON.stringify({ updates: [{ ...notification, available: notification.current }] }), 'x'.repeat(65537)]) {
    const r = runLauncher(['check'], { status: 0, stdout, stderr: 'error' });
    assert.equal(r.status, 0);
    assert.deepEqual(r.stdout, [], stdout.slice(0,80));
    assert.deepEqual(r.stderr, []);
  }
});

test('launcher does not publish partial success on failure, signal, launch error or absent receipt', () => {
  for (const child of [{ status: 1 }, { status: null }, { status: 0, signal: 'SIGTERM' }, { error: new Error('denied') }]) {
    const r = runLauncher(['check'], { stdout: JSON.stringify({ updates: [notification] }), ...child });
    assert.equal(r.status, 0);
    assert.deepEqual(r.stdout, []);
    assert.deepEqual(r.stderr, []);
  }
  for (const options of [{ throwSpawn: true }, { badReceipt: true }, { missingCli: true }]) {
    const r = runLauncher(['check'], undefined, options);
    assert.equal(r.status, 0);
    assert.deepEqual(r.stdout, []);
    assert.deepEqual(r.stderr, []);
  }
});

test('decision mode preserves inherited output and truthful error/exit status', () => {
  for (const [child, expected] of [[{ status: 0 }, 0], [{ status: 7 }, 7], [{ status: null }, 1], [{ status: null, signal: 'SIGTERM' }, 1]]) {
    const r = runLauncher(['decision', 'remind', '--component', 'agent'], child);
    assert.equal(r.status, expected);
    assert.equal(r.calls[0][2].stdio, 'inherit');
    assert.equal(r.calls[0][1][1], 'update-decision');
  }
  const failure = runLauncher(['decision'], { error: new Error('launch denied') });
  assert.equal(failure.status, 1);
  assert.deepEqual(failure.stderr, ['launch denied']);
  assert.equal(runLauncher(['decision'], undefined, { missingCli: true }).status, 1);
});

function temporaryPath(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-fluent-agent-update-test-'));
  if (t) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function gateFixture(t) {
  const home = temporaryPath(t);
  const agents = path.join(home, '.agents');
  fs.mkdirSync(agents);
  const stamp = path.join(agents, '.servicenow-fluent-agent-update-check.stamp');
  const decisionFile = path.join(agents, '.servicenow-fluent-agent-update.json');
  const decisionBytes = '{"version":1,"components":{"agent":{"lastDecision":"skip"}}}\n';
  fs.writeFileSync(decisionFile, decisionBytes);
  const decisionMtime = fs.statSync(decisionFile).mtimeMs;
  const gateFs = {};
  for (const method of ['lstatSync', 'writeFileSync', 'utimesSync', 'mkdirSync']) {
    gateFs[method] = (file, ...args) => {
      assert.equal(file, method === 'mkdirSync' ? agents : stamp, 'gate may access only its stamp');
      return fs[method](file, ...args);
    };
  }
  const run = (now, overrides = {}) => {
    const r = runLauncher(['session-start'], undefined, { home, now, gateFs: { ...gateFs, ...overrides } });
    assert.deepEqual(r.calls, [], 'gate must not launch any child/repository/network check');
    assert.deepEqual(r.fsReads, [], 'gate must not read receipt or decision state');
    assert.equal(fs.readFileSync(decisionFile, 'utf8'), decisionBytes);
    assert.equal(fs.statSync(decisionFile).mtimeMs, decisionMtime, 'decision mtime is not the startup gate');
    return r;
  };
  return { home, stamp, run };
}

const gateNow = Date.UTC(2026, 0, 10);
test('session gate creates a missing stamp before returning due, without receipt or child calls', t => {
  const f = gateFixture(t);
  const result = f.run(gateNow);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout[0]), { due: true, stamp: f.stamp });
  assert.equal(fs.statSync(f.stamp).mtimeMs, gateNow);
  assert.equal(fs.readFileSync(f.stamp, 'utf8'), '');
  assert.deepEqual(result.stderr, []);
});

test('fresh and exactly-48-hour stamps stay unchanged; a later due session touches only mtime', t => {
  const f = gateFixture(t);
  fs.writeFileSync(f.stamp, 'keep existing stamp contents');
  fs.utimesSync(f.stamp, gateNow / 1000, gateNow / 1000);
  for (const elapsed of [0, 24 * 3600000, CHECK_INTERVAL_MS]) {
    const result = f.run(gateNow + elapsed);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout[0]).due, false);
    assert.equal(fs.statSync(f.stamp).mtimeMs, gateNow, 'fresh sessions must not postpone the next check');
  }
  const staleNow = gateNow + CHECK_INTERVAL_MS + 1000;
  const stale = f.run(staleNow);
  assert.equal(stale.status, 0);
  assert.equal(JSON.parse(stale.stdout[0]).due, true);
  assert.equal(fs.statSync(f.stamp).mtimeMs, staleNow);
  assert.equal(fs.readFileSync(f.stamp, 'utf8'), 'keep existing stamp contents');
  assert.equal(JSON.parse(f.run(staleNow).stdout[0]).due, false, 'next session shares the same gate');
});

for (const phase of ['lstatSync', 'mkdirSync', 'writeFileSync', 'utimesSync']) {
  test(`session gate reports ${phase} failure instead of claiming a fresh or successful check`, t => {
    const f = gateFixture(t);
    const result = f.run(gateNow, { [phase]: () => { throw Object.assign(new Error('fixture permission denial'), { code: 'EACCES' }); } });
    assert.equal(result.status, 1);
    assert.deepEqual(result.stdout, []);
    assert.match(result.stderr.join('\n'), /Session update check failed: fixture permission denial/);
  });
}

for (const kind of ['directory', 'symlink', 'hardlink']) {
  test(`session gate refuses an unexpected ${kind} stamp without writing`, t => {
    const f = gateFixture(t);
    const result = f.run(gateNow, {
      lstatSync: () => ({ isFile: () => kind !== 'directory', isSymbolicLink: () => kind === 'symlink', nlink: kind === 'hardlink' ? 2 : 1 }),
      writeFileSync: () => assert.fail('unexpected write'), utimesSync: () => assert.fail('unexpected touch'),
    });
    assert.equal(result.status, 1);
    assert.deepEqual(result.stdout, []);
    assert.match(result.stderr.join('\n'), /ordinary unlinked file/);
  });
}

test('SDK notice names the absolute project and declaration source; SDK-only checks never invoke Git', async t => {
  const root = temporaryPath(t);
  const projectPath = path.join(root, 'lux-samples');
  fs.mkdirSync(projectPath);
  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ devDependencies: { '@servicenow/sdk': '4.12.2' } }));
  const updates = await checkUpdates({ only: 'sdk', repoRoot: root, docsPath: root, projectPath,
    statePath: path.join(root, 'state.json'), run: () => assert.fail('Unrelated Git check'), getLatestSdkVersion: async () => '4.13.3' });
  assert.equal(updates.length, 1);
  assert.match(updates[0].label, /Project now-sdk \(lux-samples/);
  assert.ok(updates[0].label.includes(projectPath));
  assert.equal(updates[0].projectPath, projectPath);
  assert.equal(updates[0].currentSource, 'package.json declaration');
  assert.equal(updates[0].current, '4.12.2');
  const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
  assert.deepEqual(Object.keys(state.components), [keyFor('sdk', projectPath)]);
});

test('explicit docs-only maintenance never checks the SDK registry or agent repository', async t => {
  const root = temporaryPath(t);
  const docsPath = path.join(root, 'docs'); fs.mkdirSync(docsPath);
  const updates = await checkUpdates({ only: 'docs', repoRoot: root, projectPath: root, docsPath, docsBranch: 'australia',
    statePath: path.join(root, 'state.json'), getLatestSdkVersion: () => assert.fail('Unrelated SDK lookup'),
    run: (cmd, args, cwd) => { assert.equal(cwd, docsPath); return gitRunner('2222222222222222222222222222222222222222')(cmd, args); } });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].component, keyFor('docs', docsPath));
});

test('invalid component filters/missing targets fail before state writes or discovery', async t => {
  const root = temporaryPath(t); const statePath = path.join(root, 'state.json');
  for (const options of [{ only: 'sdk' }, { only: 'docs' }, { only: 'typo' }]) {
    await assert.rejects(checkUpdates({ ...options, statePath, run: () => assert.fail('Git'), getLatestSdkVersion: () => assert.fail('npm') }));
    assert.equal(fs.existsSync(statePath), false);
  }
});

test('range declarations are not misrepresented as an installed exact version', async t => {
  const root = temporaryPath(t);
  for (const declared of ['^4.12.2', '~4.12.2', '>=4.12.2', '4.12.2 || 4.13.3', 'latest', 'workspace:*']) {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ devDependencies: { '@servicenow/sdk': declared } }));
    assert.deepEqual(await checkUpdates({ only: 'sdk', projectPath: root, statePath: path.join(root, 'state.json'), force: true,
      getLatestSdkVersion: () => assert.fail('Do not query registry for a non-exact pin') }), []);
  }
});

test('prereleases use numeric SemVer ordering, not lexical order', () => {
  assert.equal(isNewerVersion('4.13.3-rc.10', '4.13.3-rc.2'), true);
  assert.equal(isNewerVersion('4.13.3-rc.2', '4.13.3-rc.10'), false);
  assert.equal(isNewerVersion('4.13.3', '4.13.3-rc.10'), true);
  assert.equal(isNewerVersion('4.13.3-rc.10', '4.13.3'), false);
  assert.equal(isNewerVersion('4.13.3', '4.13.3'), false);
  assert.equal(isNewerVersion('4.13.3-alpha.beta', '4.13.3-alpha.1'), true);
});

test('routing and owning skill preserve update scope and UNKNOWN without mirrored recipes', () => {
  const load = rel => fs.readFileSync(path.join(__dirname, '../../', rel), 'utf8');
  const agent = load('payload/.copilot/agents/ServiceNow Fluent.agent.md');
  const baseline = load('payload/.agents/instructions/now-sdk-baseline.instructions.md');
  assert.match(agent, /session-start gate authorizes advisory checks only, not maintenance/);
  assert.match(agent, /`sn-update-advisor`/);
  assert.doesNotMatch(agent + baseline, /## Quiet Update Advisory|## Documentation Lookup|Sync commands return when/);
  assert.match(agent, /completion is \*\*UNKNOWN\*\*/);
  assert.match(baseline, /UNKNOWN completion/);
  const skill = load('payload/.agents/skills/sn-update-advisor/SKILL.md');
  assert.match(skill, /Outside the session gate, documentation-only questions skip update checks and maintenance/);
  assert.match(skill, /Run the checks below once for each resolved component, without `--force`/);
  for (const target of ['**Agent:**', '**now-sdk:**', '**ServiceNowDocs:**']) assert.ok(skill.includes(target));
  assert.match(skill, /--only sdk --project/);
  assert.match(skill, /package updated; build unverified/);
  assert.match(skill, /Recording \*\*Update\*\* records authorization, not installation/);
  assert.match(skill, /One owner per mutation/);
  assert.match(skill, /scripts\\update-project-sdk\.cjs/);
});

function gitRunner(remoteRevision) {
  return (_command, args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return '1111111111111111111111111111111111111111\n';
    if (args[0] === 'status') return '';
    if (args[0] === 'ls-remote') return `${remoteRevision}\trefs/heads/main\n`;
    throw new Error(`Unexpected git invocation: ${args.join(' ')}`);
  };
}

test('a fresh agent update is emitted once, then remains quiet for seven days', async () => {
  const root = temporaryPath();
  const statePath = path.join(root, 'state.json');
  const now = new Date('2026-09-24T10:00:00.000Z');
  const remoteRevision = '2222222222222222222222222222222222222222';
  const options = { repoRoot: root, statePath, now, run: gitRunner(remoteRevision) };

  const first = await checkUpdates(options);
  assert.equal(first.length, 1);
  assert.equal(first[0].label, 'ServiceNow Fluent Agent');

  const second = await checkUpdates({ ...options, now: new Date(now.getTime() + CHECK_INTERVAL_MS) });
  assert.deepEqual(second, []);

  const third = await checkUpdates({ ...options, now: new Date(now.getTime() + REMINDER_INTERVAL_MS) });
  assert.equal(third.length, 1);
});

test('remind and skip decisions suppress only the selected release', async () => {
  const root = temporaryPath();
  const statePath = path.join(root, 'state.json');
  const now = new Date('2026-09-24T10:00:00.000Z');
  const componentKey = 'agent';
  const remoteRevision = '2222222222222222222222222222222222222222';
  const options = { repoRoot: root, statePath, now, run: gitRunner(remoteRevision) };

  await checkUpdates(options);
  assert.equal(recordDecision({ statePath, decision: 'remind', componentKeys: [componentKey], now }), 1);
  const snoozed = await checkUpdates({ ...options, force: true, now: new Date(now.getTime() + 60_000) });
  assert.deepEqual(snoozed, []);

  const quietDuringReminder = await checkUpdates({
    ...options,
    now: new Date(now.getTime() + CHECK_INTERVAL_MS + 60_000),
    run: () => {
      throw new Error('Snoozed checks must not contact Git.');
    },
  });
  assert.deepEqual(quietDuringReminder, []);

  const afterReminder = new Date(now.getTime() + REMINDER_INTERVAL_MS + 60_000);
  const promptedAgain = await checkUpdates({ ...options, force: true, now: afterReminder });
  assert.equal(promptedAgain.length, 1);
  assert.equal(recordDecision({ statePath, decision: 'skip', componentKeys: [componentKey], now: afterReminder }), 1);

  const skipped = await checkUpdates({ ...options, force: true, now: new Date(afterReminder.getTime() + REMINDER_INTERVAL_MS) });
  assert.deepEqual(skipped, []);

  const newerRevision = '3333333333333333333333333333333333333333';
  const newer = await checkUpdates({ ...options, force: true, now: new Date(afterReminder.getTime() + REMINDER_INTERVAL_MS * 2), run: gitRunner(newerRevision) });
  assert.equal(newer.length, 1);
  assert.equal(newer[0].available, newerRevision.slice(0, 12));
});

test('non-due checks do not invoke the SDK registry', async () => {
  const root = temporaryPath();
  const projectPath = path.join(root, 'project');
  fs.mkdirSync(projectPath);
  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ devDependencies: { '@servicenow/sdk': '4.12.2' } }));
  const statePath = path.join(root, 'state.json');
  const now = new Date('2026-09-24T10:00:00.000Z');
  let calls = 0;

  const first = await checkUpdates({
    projectPath,
    statePath,
    now,
    getLatestSdkVersion: async () => {
      calls += 1;
      return '4.12.3';
    },
  });
  assert.equal(first.length, 1);
  assert.equal(calls, 1);

  const second = await checkUpdates({
    projectPath,
    statePath,
    now: new Date(now.getTime() + CHECK_INTERVAL_MS - 1),
    getLatestSdkVersion: async () => {
      calls += 1;
      return '4.12.4';
    },
  });
  assert.deepEqual(second, []);
  assert.equal(calls, 1);
  assert.equal(keyFor('sdk', projectPath).startsWith('sdk:'), true);
});