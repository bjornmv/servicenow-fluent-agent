'use strict';

// Integration test of the production advisor + installer payload path.
// Real Git/local bare remote and real temporary payload/receipt/state files.
// The installer runs in a trusted-code test host, NOT an OS security sandbox:
// Windows/VS Code configuration is blocked, home/fs are fixture-bound. No SDK,
// live user files, external remote, sleep, reset, or real reminder-state writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { checkUpdates, recordDecision, CHECK_INTERVAL_MS, REMINDER_INTERVAL_MS } = require('../../lib/update-advisor.cjs');
const { payloadFiles } = require('../../lib/payload-files.cjs');
const { generate } = require('../generate-baseline.cjs');
const root = path.resolve(__dirname, '../..');
const installer = fs.readFileSync(path.join(root, 'bin/sn-fluent-agent.cjs'), 'utf8');
// Resolve without a version subprocess: even --version must use fixture env.
function resolveGit() {
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path');
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  const candidates = (process.env[pathKey] || '').split(path.delimiter).filter(Boolean)
    .map(dir => path.join(dir.replace(/^"|"$/g, ''), executable));
  if (process.platform === 'win32') {
    for (const dir of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      candidates.push(path.join(dir, 'Git', 'cmd', 'git.exe'));
    }
  }
  const found = candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile());
  assert.ok(found, 'Existing Git is required; this test never installs it');
  return path.resolve(found);
}
const gitExe = resolveGit();
function gitEnvironment(base, host = process.env) {
  const env = {};
  // Keep only executable lookup / Windows runtime essentials. Inherited Git
  // context, tracing, helpers, URL rewrites and host configuration are excluded.
  for (const key of Object.keys(host)) {
    if (/^(path|systemroot|windir)$/i.test(key)) env[key] = host[key];
  }
  const home = path.join(base, 'git-home');
  return { ...env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home,
    APPDATA: home, LOCALAPPDATA: home, TMP: base, TEMP: base, TMPDIR: base,
    GIT_CONFIG_SYSTEM: path.join(base, 'empty-git-config'),
    GIT_CONFIG_GLOBAL: path.join(base, 'empty-git-config'),
    GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file' };
}
const marker = '.agents/reference/sdk-commands.md';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const failHostMutation = () => { throw new Error('Live host integration is forbidden in this test'); };

function within(base, file) {
  assert.equal(typeof file, 'string', 'fixture paths must be strings');
  const relative = path.relative(base, path.resolve(file));
  assert.ok(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), `outside fixture: ${file}`);
  return file;
}

function fixtureFs(base) {
  const guarded = {};
  for (const method of ['existsSync', 'readFileSync', 'writeFileSync', 'mkdirSync', 'unlinkSync', 'readdirSync', 'rmdirSync']) {
    guarded[method] = (file, ...args) => fs[method](within(base, file), ...args);
  }
  guarded.copyFileSync = (from, to, ...args) => fs.copyFileSync(within(base, from), within(base, to), ...args);
  return guarded;
}

async function runInstaller(fixture, command) {
  assert.ok(['install', 'verify'].includes(command));
  const output = [];
  const proc = {
    argv: ['node', path.join(fixture.checkout, 'bin/sn-fluent-agent.cjs'), command, '--no-vscode-settings'],
    platform: 'fixture', env: {}, exitCode: 0,
  };
  const modules = {
    'node:fs': fixtureFs(fixture.base),
    'node:os': { homedir: () => fixture.home },
    'node:path': path,
    'node:crypto': crypto,
    '../lib/update-advisor.cjs': { checkUpdates: failHostMutation, recordDecision: failHostMutation },
    '../lib/jsonc-settings.cjs': { parseJsonc: failHostMutation, setJsoncValue: failHostMutation },
    '../lib/vscode-terminal.cjs': { prepareTerminalSettings: failHostMutation, writeTerminalSettings: failHostMutation },
    '../lib/windows-git-environment.cjs': { configureWindowsGit: failHostMutation },
    '../lib/payload-files.cjs': { payloadFiles: dir => payloadFiles(within(fixture.base, dir)) },
    '../tools/generate-baseline.cjs': { generate: (repo, check) => {
      assert.equal(check, true, 'baseline generation must remain read-only');
      return generate(within(fixture.base, repo), check);
    } },
  };
  await vm.runInNewContext(installer, {
    __dirname: path.join(fixture.checkout, 'bin'), Buffer, process: proc,
    require(name) { assert.ok(Object.hasOwn(modules, name), `unreviewed installer import: ${name}`); return modules[name]; },
    console: { log: text => output.push(String(text)), error: text => output.push(String(text)) },
  }, { timeout: 10000 });
  return { exitCode: proc.exitCode, output: output.join('\n') };
}

function createFixture(t) {
  // An inherited Git context can redirect even commands with an explicit cwd.
  // Refuse it rather than clearing user configuration and guessing a target.
  for (const key of Object.keys(process.env)) {
    if (/^GIT_(DIR|COMMON_DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG|CONFIG_COUNT|CONFIG_PARAMETERS)$/i.test(key)) {
      assert.ok(!process.env[key], `unset inherited ${key} before running isolated tests`);
    }
  }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-update-integration-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const seed = path.join(base, 'publisher');
  const remote = path.join(base, 'remote.git');
  const checkout = path.join(base, 'checkout');
  const home = path.join(base, 'home');
  const hooks = path.join(base, 'empty-hooks');
  for (const dir of [seed, home, hooks, path.join(base, 'git-home')]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(base, 'empty-git-config'), '');
  fs.writeFileSync(path.join(base, 'empty-attributes'), '');
  const gitEnv = gitEnvironment(base);
  const calls = [];
  function git(args, cwd = base) {
    within(base, cwd);
    calls.push({ args: [...args], cwd });
    const r = spawnSync(gitExe, ['--no-pager', '-c', `core.hooksPath=${hooks}`, '-c', 'core.fsmonitor=false',
      '-c', `core.attributesFile=${path.join(base, 'empty-attributes')}`, '-c', 'commit.gpgsign=false', ...args], {
      cwd, encoding: 'utf8', shell: false, timeout: 30000,
      env: gitEnv,
    });
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
    return r.stdout.trim();
  }
  const version = git(['--version']);
  assert.match(version, /^git version \d+\.\d+\.\d+(?:\.windows\.\d+)?$/);
  if (process.platform === 'win32') {
    const [, major, minor] = version.match(/^git version (\d+)\.(\d+)/);
    assert.ok(Number(major) > 2 || (Number(major) === 2 && Number(minor) >= 54), 'Windows Git must be stable >=2.54; no replacement');
  }
  const commit = message => git(['-c', 'user.name=Update Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', message], seed);
  git(['init', '--bare', '--initial-branch=main', `--template=${hooks}`, remote]);
  git(['init', '--initial-branch=main', `--template=${hooks}`, seed]);
  fs.writeFileSync(path.join(seed, '.gitattributes'), '* -text\n');
  fs.copyFileSync(path.join(root, 'VERSION'), path.join(seed, 'VERSION'));
  for (const file of payloadFiles(path.join(root, 'payload'))) {
    const destination = path.join(seed, 'payload', path.relative(path.join(root, 'payload'), file));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination);
  }
  const fixtureMarker = path.join(seed, 'payload', marker);
  fs.appendFileSync(fixtureMarker, '\n<!-- isolated update fixture: revision A -->\n');
  git(['add', '--', '.gitattributes', 'VERSION', 'payload'], seed);
  commit('Fixture revision A');
  const oldRevision = git(['rev-parse', 'HEAD'], seed);
  git(['remote', 'add', 'origin', remote], seed);
  git(['push', '-u', 'origin', 'main'], seed);
  git(['clone', '--no-hardlinks', '--branch', 'main', `--template=${hooks}`, remote, checkout]);
  fs.appendFileSync(fixtureMarker, '<!-- isolated update fixture: revision B -->\n');
  git(['add', '--', 'payload'], seed);
  commit('Fixture revision B (same package version)');
  const newRevision = git(['rev-parse', 'HEAD'], seed);
  git(['push', 'origin', 'main'], seed);
  assert.notEqual(oldRevision, newRevision);
  assert.equal(git(['remote', 'get-url', 'origin'], checkout), remote);
  const statePath = path.join(base, 'advisor-state.json');
  const run = (command, args, cwd) => {
    assert.equal(command, 'git');
    assert.equal(cwd, checkout);
    assert.ok(['rev-parse', 'ls-remote', 'status'].includes(args[0]), 'discovery must stay read-only');
    return git(args, cwd);
  };
  return {
    base, seed, remote, checkout, home, statePath, oldRevision, newRevision, calls, git,
    options: { only: 'agent', repoRoot: checkout, statePath, run,
      now: new Date('2026-01-01T00:00:00Z'),
      getLatestSdkVersion: failHostMutation },
  };
}

function state(fixture) { return JSON.parse(fs.readFileSync(fixture.statePath, 'utf8')); }
function readReceipt(fixture) { return JSON.parse(fs.readFileSync(path.join(fixture.home, '.agents/.servicenow-fluent-agent-install.json'), 'utf8')); }
function backupCopies(fixture) {
  const directory = path.join(fixture.home, '.agents/_backups/servicenow-fluent-agent');
  return fs.existsSync(directory) ? fs.readdirSync(directory).map(name => path.join(directory, name, marker)).filter(fs.existsSync) : [];
}
async function approvedPull(fixture, choice) {
  assert.equal(choice, 'update', 'the test driver requires explicit approval');
  assert.equal(fixture.git(['status', '--porcelain'], fixture.checkout), '');
  assert.equal(fixture.git(['remote', 'get-url', 'origin'], fixture.checkout), fixture.remote);
  const approval = state(fixture).components.agent;
  assert.equal(approval.lastDecision, choice);
  assert.equal(approval.available.id, fixture.newRevision, 'approval is bound to the displayed commit');
  fixture.git(['pull', '--ff-only', 'origin', 'main'], fixture.checkout);
  assert.equal(fixture.git(['rev-parse', 'HEAD'], fixture.checkout), fixture.newRevision);
}

test('test Git environment excludes inherited tracing, configuration and executable integrations', () => {
  const base = path.resolve(os.tmpdir(), 'environment-shape-only');
  const env = gitEnvironment(base, { PATH: 'fixture-path', SystemRoot: 'fixture-windows',
    GIT_TRACE: 'outside-fixture', GIT_CONFIG_COUNT: '1', GIT_CONFIG_GLOBAL: 'host-config',
    GIT_WORK_TREE: 'host-worktree', GIT_SSH_COMMAND: 'host-command', HOME: 'host-home',
    GIT_ALLOW_PROTOCOL: 'https', SECRET: 'must-not-forward' });
  assert.equal(env.GIT_ALLOW_PROTOCOL, 'file');
  assert.equal(env.GIT_CONFIG_GLOBAL, path.join(base, 'empty-git-config'));
  assert.equal(env.GIT_CONFIG_SYSTEM, path.join(base, 'empty-git-config'));
  assert.equal(env.HOME, path.join(base, 'git-home'));
  for (const key of ['GIT_TRACE', 'GIT_CONFIG_COUNT', 'GIT_WORK_TREE', 'GIT_SSH_COMMAND', 'SECRET']) assert.equal(env[key], undefined);
});

test('isolated positive update: detect real newer commit, approve, fast-forward, install, backup and verify', async t => {
  const f = createFixture(t);
  const initial = await runInstaller(f, 'install');
  assert.equal(initial.exitCode, 0, initial.output);
  assert.equal((await runInstaller(f, 'verify')).exitCode, 0);
  const installed = path.join(f.home, marker);
  const beforeHash = hash(installed);
  const receiptBefore = readReceipt(f);
  const notice = await checkUpdates(f.options);
  assert.equal(notice.length, 1);
  assert.equal(notice[0].component, 'agent');
  assert.equal(notice[0].id, f.newRevision);
  assert.equal(notice[0].current, f.oldRevision.slice(0, 12));
  assert.equal(notice[0].available, f.newRevision.slice(0, 12));
  assert.equal(state(f).components.agent.lastCheckFailedAt, undefined);
  assert.equal(hash(installed), beforeHash, 'checking must not install');
  assert.equal(f.git(['rev-parse', 'HEAD'], f.checkout), f.oldRevision, 'checking must not pull');
  await assert.rejects(approvedPull(f, 'update'), { code: 'ERR_ASSERTION' });
  assert.equal(f.calls.some(call => call.args[0] === 'pull'), false, 'test driver cannot apply before recorded approval');

  assert.equal(recordDecision({ statePath: f.statePath, decision: 'update', componentKeys: ['agent'], now: f.options.now }), 1);
  assert.equal(hash(installed), beforeHash, 'recording approval is not installation');
  assert.equal(f.git(['rev-parse', 'HEAD'], f.checkout), f.oldRevision, 'recording approval is not a pull');
  await approvedPull(f, 'update');

  // Important product boundary: repository HEAD is current before payload is.
  assert.deepEqual(await checkUpdates({ ...f.options, force: true }), []);
  const beforeInstall = await runInstaller(f, 'verify');
  assert.equal(beforeInstall.exitCode, 1, 'current checkout alone cannot prove installed payload is updated');
  assert.match(beforeInstall.output, /mismatched: 1/);
  const updated = await runInstaller(f, 'install');
  assert.equal(updated.exitCode, 0, updated.output);
  assert.match(updated.output, /copied\/updated: 1/);
  assert.match(updated.output, /skipped conflicts: 0/);
  const verified = await runInstaller(f, 'verify');
  assert.equal(verified.exitCode, 0, verified.output);
  assert.match(verified.output, /missing: 0\nmismatched: 0/);
  assert.notEqual(hash(installed), beforeHash);
  assert.equal(hash(installed), hash(path.join(f.checkout, 'payload', marker)));
  const receiptAfter = readReceipt(f);
  assert.equal(receiptAfter.version, receiptBefore.version, 'Git revisions, not package-version bump, trigger the update');
  assert.equal(receiptAfter.files[marker].sha256, hash(installed));
  assert.ok(backupCopies(f).some(file => hash(file) === beforeHash), 'old installed file is backed up');
  assert.deepEqual(await checkUpdates({ ...f.options, now: new Date(f.options.now.getTime() + CHECK_INTERVAL_MS) }), []);
  assert.equal(state(f).components.agent.lastCheckFailedAt, undefined, 'silence must be a successful current-state check');
  t.diagnostic(`Real local Git ${f.oldRevision.slice(0, 12)} -> ${f.newRevision.slice(0, 12)}; ${Object.keys(receiptAfter.files).length} payload files verified. Windows configuration and Copilot interaction not exercised.`);
});

test('isolated reminder, skip, dirty checkout and failed discovery never apply an update', async t => {
  const f = createFixture(t);
  const initial = await runInstaller(f, 'install');
  assert.equal(initial.exitCode, 0, initial.output);
  const beforeHash = hash(path.join(f.home, marker));
  assert.equal((await checkUpdates(f.options)).length, 1);
  const freshCalls = f.calls.length;
  assert.deepEqual(await checkUpdates({ ...f.options, now: new Date(f.options.now.getTime() + 60000) }), []);
  assert.equal(f.calls.length, freshCalls, '48-hour gate must prevent remote checks');
  assert.equal(recordDecision({ statePath: f.statePath, decision: 'remind', componentKeys: ['agent'], now: f.options.now }), 1);
  const calls = f.calls.length;
  assert.deepEqual(await checkUpdates({ ...f.options, now: new Date(f.options.now.getTime() + CHECK_INTERVAL_MS) }), []);
  assert.equal(f.calls.length, calls, 'snoozed check must not contact even the local remote');
  const later = new Date(f.options.now.getTime() + REMINDER_INTERVAL_MS + 1);
  assert.equal((await checkUpdates({ ...f.options, now: later })).length, 1);
  assert.equal(recordDecision({ statePath: f.statePath, decision: 'skip', componentKeys: ['agent'], now: later }), 1);
  const skipCheckAt = new Date(later.getTime() + REMINDER_INTERVAL_MS);
  const beforeSkipCalls = f.calls.length;
  assert.deepEqual(await checkUpdates({ ...f.options, now: skipCheckAt, force: true }), []);
  assert.ok(f.calls.slice(beforeSkipCalls).some(call => call.args[0] === 'ls-remote'), 'forced skip check must actually discover the remote release');
  assert.equal(state(f).components.agent.lastCheckedAt, skipCheckAt.toISOString());
  assert.equal(state(f).components.agent.skippedRelease.id, f.newRevision);
  assert.equal(state(f).components.agent.available.id, f.newRevision, 'skip must suppress a successfully discovered release');
  assert.equal(state(f).components.agent.lastCheckFailedAt, undefined);
  assert.equal(hash(path.join(f.home, marker)), beforeHash);
  assert.equal(f.git(['rev-parse', 'HEAD'], f.checkout), f.oldRevision);

  // Separate fixture-only state preserves reminder/skip evidence above.
  const dirtyState = path.join(f.base, 'dirty-state.json');
  fs.appendFileSync(path.join(f.checkout, 'payload', marker), '\nlocal checkout edit\n');
  assert.deepEqual(await checkUpdates({ ...f.options, statePath: dirtyState }), []);
  const dirtyEvidence = JSON.parse(fs.readFileSync(dirtyState)).components.agent;
  assert.equal(dirtyEvidence.lastCheckFailedAt, undefined, 'dirty suppression must not be a hidden discovery error');
  assert.equal(dirtyEvidence.lastCheckedAt, f.options.now.toISOString());
  assert.equal(hash(path.join(f.home, marker)), beforeHash);
  assert.match(fs.readFileSync(path.join(f.checkout, 'payload', marker), 'utf8'), /local checkout edit/);
  const failedState = path.join(f.base, 'failed-state.json');
  assert.deepEqual(await checkUpdates({ ...f.options, statePath: failedState, run: () => { throw new Error('Simulated unavailable Git transport'); } }), []);
  assert.equal(JSON.parse(fs.readFileSync(failedState)).components.agent.lastCheckFailedAt, f.options.now.toISOString(), 'quiet failure remains distinguishable in durable state');
  assert.equal(hash(path.join(f.home, marker)), beforeHash);
  assert.equal(f.calls.some(call => call.args[0] === 'pull'), false);
});

test('isolated update preserves a customized installed file and verifier rejects false completion', async t => {
  const f = createFixture(t);
  assert.equal((await runInstaller(f, 'install')).exitCode, 0);
  const installed = path.join(f.home, marker);
  fs.appendFileSync(installed, '\nuser customization to preserve\n');
  const customizedHash = hash(installed);
  assert.equal((await checkUpdates(f.options)).length, 1);
  assert.equal(recordDecision({ statePath: f.statePath, decision: 'update', componentKeys: ['agent'], now: f.options.now }), 1);
  await approvedPull(f, 'update');
  const updated = await runInstaller(f, 'install');
  assert.equal(updated.exitCode, 0, 'installer completion alone is not verification');
  assert.match(updated.output, /skipped conflicts: 1/);
  assert.equal(hash(installed), customizedHash);
  assert.notEqual(readReceipt(f).files[marker].sha256, customizedHash, 'original ownership retained for conflict review');
  const verified = await runInstaller(f, 'verify');
  assert.equal(verified.exitCode, 1);
  assert.match(verified.output, /mismatched: 1/);
  assert.equal(hash(installed), customizedHash);
});

// Real installed-launcher process -> real checkout CLI -> real library, with a fixture home.
// No network: the SDK fixture declares a range (never queried) and the docs path does not exist.
function launcherFixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-launcher-e2e-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home');
  const agents = path.join(home, '.agents');
  const project = path.join(base, 'project');
  fs.mkdirSync(agents, { recursive: true });
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ devDependencies: { '@servicenow/sdk': '^4.0.0' } }));
  const receipt = path.join(agents, '.servicenow-fluent-agent-install.json');
  fs.writeFileSync(receipt, JSON.stringify({ repoRoot: root }));
  const stateFile = path.join(agents, '.servicenow-fluent-agent-update.json');
  const env = { ...gitEnvironment(base), HOME: home, USERPROFILE: home };
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'payload/.agents/tools/sn-update-advisor.cjs'), ...args],
    { cwd: base, env, encoding: 'utf8', shell: false, timeout: 30000 });
  return { base, home, project, receipt, stateFile, run };
}

test('installed launcher end to end: check exit status reflects whether the check ran and succeeded', t => {
  const f = launcherFixture(t);
  const quiet = f.run('check', '--only', 'sdk', '--project', f.project);
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stdout, '');
  assert.equal(quiet.stderr, '');
  const sdkKey = `sdk:${path.resolve(f.project).toLowerCase()}`;
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.stateFile, 'utf8')).components), [sdkKey]);

  const shown = f.run('state');
  assert.equal(shown.status, 0, shown.stderr);
  assert.deepEqual(Object.keys(JSON.parse(shown.stdout).components), [sdkKey]);

  const bareDocs = f.run('check', '--only', 'docs', '--docs');
  assert.equal(bareDocs.status, 1);
  assert.equal(bareDocs.stdout, '');
  assert.match(bareDocs.stderr, /Update check failed: checkout CLI exited 1 \(.*Missing value for --docs/);

  const missingProject = f.run('check', '--only', 'sdk');
  assert.equal(missingProject.status, 1);
  assert.match(missingProject.stderr, /SDK checks require an explicit project/);

  const docs = path.join(f.base, 'no-such-checkout');
  const failed = f.run('check', '--only', 'docs', '--docs', docs);
  assert.equal(failed.status, 1, 'a discovery failure is not a quiet success');
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /Update check failed for docs:.*lastCheckFailedAt/);
  const notDue = f.run('check', '--only', 'docs', '--docs', docs);
  assert.equal(notDue.status, 0, 'a component that is not due is not contacted, so nothing new failed');

  fs.unlinkSync(f.receipt);
  const noReceipt = f.run('check', '--only', 'agent');
  assert.equal(noReceipt.status, 1);
  assert.equal(noReceipt.stdout, '');
  assert.match(noReceipt.stderr, /Update check not run: the install receipt/);
});

test('installed launcher end to end: malformed state is preserved byte for byte', t => {
  const f = launcherFixture(t);
  fs.writeFileSync(f.stateFile, '{bad');
  for (const args of [['check', '--only', 'sdk', '--project', f.project], ['decision', 'skip', '--component', 'agent'], ['state']]) {
    const r = f.run(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /left unchanged; do not reset it/);
    assert.equal(fs.readFileSync(f.stateFile, 'utf8'), '{bad');
  }
});

test('installed launcher end to end: decisions are recorded for a shown notice and refused otherwise', t => {
  const f = launcherFixture(t);
  const available = { id: '2222222222222222222222222222222222222222', label: 'ServiceNow Fluent Agent', current: '111111111111', available: '222222222222' };
  const initial = JSON.stringify({ version: 1, components: { agent: { lastCheckedAt: '2026-01-01T00:00:00.000Z', available }, 'docs:c:\\docs': { lastCheckedAt: '2026-01-01T00:00:00.000Z' } } }, null, 2) + '\n';
  fs.writeFileSync(f.stateFile, initial);
  for (const key of ['Agent', 'docs:c:\\docs', 'sdk:c:\\\\escaped']) {
    const refused = f.run('decision', 'skip', '--component', key);
    assert.equal(refused.status, 1, key);
    assert.equal(refused.stdout, '', 'the CLI line "Recorded skip for 0 update component(s)." must never be reached');
    assert.match(refused.stderr, /decision not recorded: no recorded notice for .*Components with a recorded notice: agent\./);
    assert.equal(fs.readFileSync(f.stateFile, 'utf8'), initial);
  }
  const unsupported = f.run('decision', 'later', '--component', 'agent');
  assert.equal(unsupported.status, 1);
  assert.equal(fs.readFileSync(f.stateFile, 'utf8'), initial);

  const recorded = f.run('decision', 'skip', '--component', 'agent');
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.match(recorded.stdout, /^Recorded skip for 1 update component\(s\)\.\s*$/);
  const agent = JSON.parse(fs.readFileSync(f.stateFile, 'utf8')).components.agent;
  assert.equal(agent.lastDecision, 'skip');
  assert.deepEqual(agent.skippedRelease, available);

  // The checkout CLI itself (no launcher guard) must not report an unmatched key as a recorded decision.
  const direct = spawnSync(process.execPath, [path.join(root, 'bin/sn-fluent-agent.cjs'), 'update-decision', 'remind', '--component', 'agent', '--component', 'docs:c:\\docs'],
    { cwd: f.base, env: { ...gitEnvironment(f.base), HOME: f.home, USERPROFILE: f.home }, encoding: 'utf8', shell: false, timeout: 30000 });
  assert.equal(direct.status, 1);
  assert.match(direct.stdout, /^Recorded remind for 1 update component\(s\)\./);
  assert.match(direct.stderr, /Only 1 of 2 update component\(s\) had a recorded notice/);
});
