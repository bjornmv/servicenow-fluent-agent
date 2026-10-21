'use strict';

// The installer ships the agent-scoped SessionStart hook, and the exact installed hook
// command runs end to end under sh. Throwaway home only; no VS Code settings, no network:
// the agent component is recorded as just checked, and there is no docs checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const cli = path.join(__dirname, '../../bin/sn-fluent-agent.cjs');
const agentRel = path.join('.copilot', 'agents', 'ServiceNow Fluent.agent.md');
const posixOnly = { skip: process.platform === 'win32' && 'installer configures Windows Git and the terminal profile on Windows' };

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-session-hook-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData'), XDG_DATA_HOME: path.join(home, 'data') };
  for (const key of ['SN_DOCS_HOME', 'SN_DOC_MD_INDEX', 'SN_FLUENT_UPDATE_DEADLINE']) delete env[key];
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 60000, env });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  return { home, env, run, agent: path.join(home, agentRel) };
}

const count = (output, label) => Number(output.match(new RegExp(`^${label}: (\\d+)$`, 'm'))[1]);
const hookCommand = file => fs.readFileSync(file, 'utf8').match(/^ {6}command: '(.+)'$/m)[1];

test('install writes the agent hook idempotently, dry-run writes nothing, uninstall removes only what it owns', posixOnly, t => {
  const f = fixture(t);
  const dry = f.run('install', '--dry-run', '--no-vscode-settings', '--no-shell-function');
  assert.ok(count(dry, 'copied/updated') > 0);
  assert.equal(fs.existsSync(path.join(f.home, '.copilot')), false, 'dry-run reports but writes nothing');

  f.run('install', '--no-vscode-settings', '--no-shell-function');
  assert.match(fs.readFileSync(f.agent, 'utf8'), /^hooks:\n {2}SessionStart:\n {4}- type: command\n/m);
  const again = f.run('install', '--no-vscode-settings', '--no-shell-function');
  assert.equal(count(again, 'copied/updated'), 0);
  assert.equal(count(again, 'skipped conflicts'), 0);

  // A user edit to the managed agent file is never overwritten or removed without --force.
  fs.appendFileSync(f.agent, '\nMy own note.\n');
  assert.equal(count(f.run('install', '--no-vscode-settings', '--no-shell-function'), 'skipped conflicts'), 1);
  assert.equal(count(f.run('uninstall', '--dry-run', '--no-shell-function'), 'skipped modified'), 1);
  assert.match(fs.readFileSync(f.agent, 'utf8'), /My own note\.\n$/);
  f.run('uninstall', '--no-shell-function');
  assert.ok(fs.existsSync(f.agent));
  // The kept agent file still declares the hook, but its launcher is gone: no warning, no output.
  assert.equal(fs.existsSync(path.join(f.home, '.agents', 'tools', 'sn-update-advisor.cjs')), false);
  const orphan = spawnSync('/bin/sh', ['-c', hookCommand(f.agent)], { cwd: f.home, env: f.env, encoding: 'utf8', timeout: 30000 });
  assert.deepEqual([orphan.status, orphan.stdout, orphan.stderr], [0, '', '']);

  // Unmodified, it goes with the rest of the receipt.
  fs.rmSync(path.join(f.home, '.copilot'), { recursive: true });
  fs.rmSync(path.join(f.home, '.agents'), { recursive: true });
  f.run('install', '--no-vscode-settings', '--no-shell-function');
  assert.equal(count(f.run('uninstall', '--no-shell-function'), 'skipped modified'), 0);
  assert.equal(fs.existsSync(f.agent), false);
  assert.deepEqual(fs.readdirSync(path.join(f.home, '.copilot')), []);
});

test('the installed hook command runs under sh: silent when fresh or nothing to act on, context when a check fails', posixOnly, t => {
  const f = fixture(t);
  f.run('install', '--no-vscode-settings', '--no-shell-function');
  const command = hookCommand(f.agent);
  assert.equal(command, 'f="$HOME/.agents/tools/sn-update-advisor.cjs"; [ ! -f "$f" ] || node "$f" session-hook');
  const project = path.join(f.home, 'project');
  fs.mkdirSync(project);
  const stdin = JSON.stringify({ timestamp: new Date().toISOString(), hook_event_name: 'SessionStart', session_id: 'fixture', source: 'new', model: 'fixture' });
  const hook = () => spawnSync('/bin/sh', ['-c', command], { cwd: project, env: f.env, input: stdin, encoding: 'utf8', timeout: 30000 });
  const stamp = path.join(f.home, '.agents', '.servicenow-fluent-agent-update-check.stamp');
  const statePath = path.join(f.home, '.agents', '.servicenow-fluent-agent-update.json');
  fs.writeFileSync(statePath, JSON.stringify({ version: 1, components: { agent: { lastCheckedAt: new Date().toISOString() } } }));

  const due = hook();
  assert.deepEqual([due.status, due.stdout, due.stderr], [0, '', '']);
  assert.ok(fs.existsSync(stamp), 'the due run created the stamp');
  const fresh = hook();
  assert.deepEqual([fresh.status, fresh.stdout, fresh.stderr], [0, '', '']);

  const old = (Date.now() - 49 * 3600000) / 1000;
  fs.utimesSync(stamp, old, old);
  fs.unlinkSync(path.join(f.home, '.agents', '.servicenow-fluent-agent-install.json'));
  const failed = hook();
  assert.equal(failed.status, 0);
  assert.equal(failed.stderr, '');
  const context = JSON.parse(failed.stdout).hookSpecificOutput;
  assert.equal(context.hookEventName, 'SessionStart');
  assert.match(context.additionalContext, /Not checked \(agent: Update check not run: the install receipt .* is missing or unreadable/);
});
