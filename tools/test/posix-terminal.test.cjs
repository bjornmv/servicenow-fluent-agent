'use strict';

// Linux/macOS installer support: the managed now-sdk bash function and the
// settings-file target (desktop User settings, or a VS Code server's Machine settings).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { BEGIN, END, FUNCTION_BLOCK, planShellFunction, ensureShellFunction, removeShellFunction } = require('../../lib/posix-terminal.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const cli = path.join(repoRoot, 'bin', 'sn-fluent-agent.cjs');
const posixOnly = { skip: process.platform === 'win32' ? 'POSIX installer behaviour' : false };

function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-fluent-posix-'));
  try {
    return fn(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function runCli(home, args, env = {}) {
  const childEnv = { ...process.env, HOME: home, USERPROFILE: home, ...env };
  delete childEnv.SN_FLUENT_VSCODE_SETTINGS;
  delete childEnv.XDG_CONFIG_HOME;
  Object.assign(childEnv, env);
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: childEnv });
}

test('function block mirrors the PowerShell precedence: project-local SDK, then global', () => {
  assert.match(FUNCTION_BLOCK, /^# >>> servicenow-fluent-agent now-sdk >>>/);
  assert.match(FUNCTION_BLOCK, /# <<< servicenow-fluent-agent now-sdk <<<$/);
  assert.match(FUNCTION_BLOCK, /local sdk="\.\/node_modules\/@servicenow\/sdk\/bin\/index\.js"/);
  assert.match(FUNCTION_BLOCK, /\$\(npm root -g 2>\/dev\/null\)\/@servicenow\/sdk\/bin\/index\.js/);
  assert.match(FUNCTION_BLOCK, /node "\$sdk" "\$@"/);
});

test('ensure adds once, is idempotent, keeps user content, and remove restores it', () => withHome(home => {
  const rc = path.join(home, '.bashrc');
  const user = '# user stuff\nalias ll="ls -l"\n';
  fs.writeFileSync(rc, user);
  assert.equal(ensureShellFunction(home).status, 'added');
  const once = fs.readFileSync(rc, 'utf8');
  assert.ok(once.startsWith(user));
  assert.equal(once.split(BEGIN).length - 1, 1);
  assert.equal(ensureShellFunction(home).status, 'unchanged');
  assert.equal(fs.readFileSync(rc, 'utf8'), once);
  assert.equal(removeShellFunction(home).status, 'removed');
  assert.equal(fs.readFileSync(rc, 'utf8'), user);
  assert.equal(removeShellFunction(home).status, 'absent');
}));

test('an outdated managed block is replaced in place; dry run writes nothing', () => withHome(home => {
  const rc = path.join(home, '.bashrc');
  fs.writeFileSync(rc, `a\n\n${BEGIN}\nold-body\n${END}\nb\n`);
  assert.equal(ensureShellFunction(home, { dryRun: true }).status, 'would be updated');
  assert.match(fs.readFileSync(rc, 'utf8'), /old-body/);
  assert.equal(ensureShellFunction(home).status, 'updated');
  const text = fs.readFileSync(rc, 'utf8');
  assert.doesNotMatch(text, /old-body/);
  assert.ok(text.startsWith('a\nb\n'));
  assert.ok(text.includes(FUNCTION_BLOCK));
}));

test('an unterminated managed block is refused, never rewritten', () => withHome(home => {
  fs.writeFileSync(path.join(home, '.bashrc'), `${BEGIN}\nhalf\n`);
  assert.throws(() => planShellFunction(home), /unterminated/);
  assert.equal(removeShellFunction(home).status, 'unterminated (left untouched)');
}));

test('bash resolves the managed function to the project-local SDK first', posixOnly, () => withHome(home => {
  ensureShellFunction(home);
  const project = path.join(home, 'project');
  fs.mkdirSync(path.join(project, 'node_modules', '@servicenow', 'sdk', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(project, 'node_modules', '@servicenow', 'sdk', 'bin', 'index.js'), 'console.log("local-sdk " + process.argv.slice(2).join(" "))');
  const r = spawnSync('bash', ['-c', `source "${path.join(home, '.bashrc')}"; type -t now-sdk; cd "${project}" && now-sdk --version x`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), ['function', 'local-sdk --version x']);
}));

test('install on POSIX: --settings-file / SN_FLUENT_VSCODE_SETTINGS target, tilde keys, shell function; uninstall removes it', posixOnly, () => withHome(home => {
  const machine = path.join(home, 'server', 'data', 'Machine', 'settings.json');
  const r = runCli(home, ['install', '--settings-file', machine]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /VS Code settings file: .*Machine\/settings\.json/);
  assert.match(r.stdout, /now-sdk shell function: added/);
  assert.doesNotMatch(r.stdout, /PowerShell with now-sdk/);
  assert.doesNotMatch(r.stdout, /settings backup/i, 'a new settings file has no backup');
  assert.equal(fs.existsSync(path.join(home, 'AppData')), false, 'no Windows AppData path on POSIX');
  const settings = JSON.parse(fs.readFileSync(machine, 'utf8'));
  assert.equal(settings['chat.agentFilesLocations']['~/.copilot/agents'], true);
  assert.equal(settings['chat.instructionsFilesLocations']['~/.agents/instructions'], true);
  assert.equal(settings['chat.instructionsFilesLocations']['.github/instructions'], true);
  assert.equal(settings['chat.agentSkillsLocations']['~/.agents/skills'], true);
  assert.ok(fs.readFileSync(path.join(home, '.bashrc'), 'utf8').includes(BEGIN));

  const again = runCli(home, ['install'], { SN_FLUENT_VSCODE_SETTINGS: machine });
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /VS Code settings: unchanged/);
  assert.match(again.stdout, /now-sdk shell function: unchanged/);

  const un = runCli(home, ['uninstall']);
  assert.equal(un.status, 0, un.stdout + un.stderr);
  assert.match(un.stdout, /now-sdk shell function .*: removed/);
  assert.equal(fs.readFileSync(path.join(home, '.bashrc'), 'utf8').includes(BEGIN), false);
}));

test('install on Linux defaults to XDG/desktop User settings, never AppData', { skip: process.platform !== 'linux' ? 'Linux default path' : false }, () => withHome(home => {
  const dry = runCli(home, ['install', '--dry-run', '--no-shell-function']);
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  assert.match(dry.stdout, new RegExp(`VS Code settings file: ${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.config/Code/User/settings\\.json`));
  assert.match(dry.stdout, /now-sdk shell function: skipped/);
  const xdg = path.join(home, 'xdg');
  const custom = runCli(home, ['install', '--dry-run', '--no-shell-function'], { XDG_CONFIG_HOME: xdg });
  assert.match(custom.stdout, /VS Code settings file: .*\/xdg\/Code\/User\/settings\.json/);
  assert.equal(fs.existsSync(path.join(home, '.bashrc')), false, 'dry run / --no-shell-function writes no rc file');
}));

test('configure-terminal on POSIX ensures the function instead of failing', posixOnly, () => withHome(home => {
  const r = runCli(home, ['configure-terminal']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /now-sdk shell function .*: added/);
}));
