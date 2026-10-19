'use strict';

// The OS-neutral `sn-skill <name> <args>` entry point: dispatcher, argument and exit
// fidelity, the shell-script shim (Linux/macOS, Git Bash) and the installer wiring.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { SHIM_MARK, skillShimText, skillShimFile, ensureSkillShim, removeSkillShim, findGitBash } = require('../../lib/posix-terminal.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const payloadAgents = path.join(repoRoot, 'payload', '.agents');
const dispatcherSource = path.join(payloadAgents, 'tools', 'sn-skill.cjs');
const { COMMANDS } = require(dispatcherSource);
const cli = path.join(repoRoot, 'bin', 'sn-fluent-agent.cjs');
const posixOnly = { skip: process.platform === 'win32' ? 'POSIX shell shim' : false };

// Characters that break through cmd.exe or Windows PowerShell quoting, plus non-ASCII.
const hardArgs = ['--agent', 'active=true^priority=1', '/api/now/table/x?a=1&b=2|c', 'æøå ÆØÅ', "it's", 'two words', '$HOME', '%PATH%', '--', '-x'];

function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-skill-'));
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// A copy of the dispatcher in <home>/.agents/tools with a fake `rest` helper that
// echoes its argv and cwd as JSON and exits with SN_FAKE_EXIT.
function fakeAgents(home) {
  const agents = path.join(home, '.agents');
  fs.mkdirSync(path.join(agents, 'tools'), { recursive: true });
  fs.copyFileSync(dispatcherSource, path.join(agents, 'tools', 'sn-skill.cjs'));
  const helper = path.join(agents, ...COMMANDS.rest.script.split('/'));
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.writeFileSync(helper, "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\nprocess.exitCode = Number(process.env.SN_FAKE_EXIT || 0);\n");
  return path.join(agents, 'tools', 'sn-skill.cjs');
}

function run(file, args, options = {}) {
  return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', ...options });
}

test('every sn-skill name resolves to a payload helper', () => {
  for (const [name, { script }] of Object.entries(COMMANDS)) {
    assert.ok(fs.statSync(path.join(payloadAgents, ...script.split('/'))).isFile(), `${name} -> ${script}`);
  }
});

test('arguments, cwd and exit codes pass through unchanged', () => withTemp(home => {
  const dispatcher = fakeAgents(home);
  const cwd = fs.mkdtempSync(path.join(home, 'project-'));
  for (const exit of [0, 1, 2, 7]) {
    const result = run(dispatcher, ['rest', ...hardArgs], { cwd, env: { ...process.env, SN_FAKE_EXIT: String(exit) } });
    assert.equal(result.status, exit);
    assert.deepEqual(JSON.parse(result.stdout), { argv: hardArgs, cwd: fs.realpathSync(cwd) });
    assert.equal(result.stderr, `sn-skill: rest exit=${exit}\n`, 'one native-exit line on stderr, nothing on stdout');
  }
}));

test('unknown, missing and absent names run nothing and exit 2', () => withTemp(home => {
  const dispatcher = fakeAgents(home);
  const unknown = run(dispatcher, ['nope', '--agent']);
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, '');
  assert.match(unknown.stderr, /unknown name "nope"\. Nothing was run\./);
  assert.match(unknown.stderr, /^\s+rest\s/m, 'lists the valid names');
  assert.equal(run(dispatcher, []).status, 2);
  const missing = run(dispatcher, ['docs']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /docs helper is missing at .*Nothing was run; reinstall the agent\./);
  const list = run(dispatcher, ['list']);
  assert.equal(list.status, 0);
  for (const name of Object.keys(COMMANDS)) assert.match(list.stdout, new RegExp(`^  ${name} `, 'm'));
}));

test('shim text is LF-only, absolute and single-quote safe', () => {
  const text = skillShimText("/home/o'brien/.agents/tools/sn-skill.cjs");
  assert.equal(text, `#!/bin/sh\n${SHIM_MARK}\nexec node '/home/o'\\''brien/.agents/tools/sn-skill.cjs' "$@"\n`);
  assert.ok(!text.includes('\r'));
  assert.match(skillShimText('C:\\Users\\a\\.agents\\tools\\sn-skill.cjs'), /exec node 'C:\/Users\/a\/\.agents\/tools\/sn-skill\.cjs'/, 'Git Bash gets a forward-slash Windows path');
  assert.equal(skillShimFile('/h', { windows: false }), path.join('/h', '.local', 'bin', 'sn-skill'));
  assert.equal(skillShimFile('/h', { windows: true }), path.join('/h', 'bin', 'sn-skill'));
});

test('shim install is idempotent and never touches an unmanaged sn-skill', () => withTemp(home => {
  assert.equal(ensureSkillShim(home, { dryRun: true, windows: false }).status, 'would be added');
  assert.equal(fs.existsSync(skillShimFile(home, { windows: false })), false);
  const added = ensureSkillShim(home, { windows: false });
  assert.equal(added.status, 'added');
  if (process.platform !== 'win32') assert.equal(fs.statSync(added.file).mode & 0o111, 0o111);
  assert.equal(ensureSkillShim(home, { windows: false }).status, 'unchanged');
  fs.writeFileSync(added.file, '#!/bin/sh\necho mine\n');
  assert.match(ensureSkillShim(home, { windows: false }).status, /left unchanged/);
  assert.match(removeSkillShim(home, { windows: false }).status, /left unchanged/);
  assert.equal(fs.readFileSync(added.file, 'utf8'), '#!/bin/sh\necho mine\n');
  fs.rmSync(added.file);
  ensureSkillShim(home, { windows: false });
  assert.equal(removeSkillShim(home, { windows: false }).status, 'removed');
  assert.equal(removeSkillShim(home, { windows: false }).status, 'absent');
}));

test('Git Bash is detected only from a full Git for Windows install', () => {
  const env = { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
  assert.equal(findGitBash(env, () => false), null, 'MinGit has no bash');
  assert.equal(findGitBash(env, f => f === 'C:\\Users\\a\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'), 'C:\\Users\\a\\AppData\\Local\\Programs\\Git\\bin\\bash.exe');
});

test('shim runs the dispatcher from sh with arguments intact', posixOnly, () => withTemp(home => {
  fakeAgents(home);
  const shim = ensureSkillShim(home, { windows: false }).file;
  const result = spawnSync(shim, ['rest', ...hardArgs], { encoding: 'utf8', env: { ...process.env, HOME: '/nonexistent' } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).argv, hardArgs, 'absolute path: a remapped HOME does not redirect the shim');
}));

test('installer adds the shim and PATH guard; bash finds sn-skill; uninstall removes both', posixOnly, () => withTemp(home => {
  const env = { ...process.env, HOME: home, USERPROFILE: home, SN_FLUENT_VSCODE_SETTINGS: path.join(home, 'settings.json') };
  delete env.XDG_CONFIG_HOME;
  const install = spawnSync(process.execPath, [cli, 'install'], { encoding: 'utf8', env });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.match(install.stdout, /sn-skill command: added \(.*\/\.local\/bin\/sn-skill\)/);
  const bash = spawnSync('bash', ['-ic', 'type -t sn-skill; sn-skill list'], { encoding: 'utf8', env: { ...env, PATH: '/usr/local/bin:/usr/bin:/bin' } });
  assert.equal(bash.status, 0, bash.stderr);
  assert.match(bash.stdout, /^file\n/, 'a PATH command, not a function');
  assert.match(bash.stdout, /^  rest /m);
  const uninstall = spawnSync(process.execPath, [cli, 'uninstall'], { encoding: 'utf8', env });
  assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
  assert.match(uninstall.stdout, /sn-skill command \(.*\): removed/);
  assert.equal(fs.existsSync(path.join(home, '.local', 'bin', 'sn-skill')), false);
}));
