'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { parseJsonc } = require('../../lib/jsonc-settings.cjs');
const terminal = require('../../lib/vscode-terminal.cjs');
const { windowsChatSettings, planLocalChatSettings, writeTerminalSettings } = terminal;
const root = path.resolve(__dirname, '../..');
const cli = path.join(root, 'bin/sn-fluent-agent.cjs');
const expected = {
  'chat.editor.localAgent.enabled': true,
  'chat.editor.preferCopilotHarness': false,
  'chat.defaultToCopilotHarness': false,
};

function withTemp(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-chat-'));
  try { return fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

const original = '\uFEFF// preserve comment and CRLF\r\n{\r\n  "editor.fontSize": 16,\r\n  "chat.editor.preferCopilotHarness": true, // previous preference\r\n  "terminal.integrated.profiles.windows": {"Custom":{"path":"custom.exe"}},\r\n  "chat.tools.global.autoApprove": false,\r\n}\r\n';

test('Local plan changes exactly three preferences, preserving JSONC and unrelated settings', () => {
  assert.deepEqual(windowsChatSettings, expected);
  const { text } = planLocalChatSettings(original, 'win32');
  assert.deepEqual(parseJsonc(text), { ...parseJsonc(original), ...expected });
  assert.ok(text.startsWith('\uFEFF// preserve comment and CRLF\r\n'));
  assert.ok(text.includes('// previous preference'));
  assert.equal(text.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(planLocalChatSettings(text, 'win32').text, text);
  assert.doesNotMatch(text, /temporaryDefaultToLocalHarness|sandbox|ExecutionPolicy/);
});

test('Local plan refuses malformed/ambiguous settings and non-Windows platforms', () => {
  for (const input of ['[]', 'null', '{broken', '{"chat.editor.localAgent.enabled":true,"chat.editor.localAgent.enabled":false}']) {
    assert.throws(() => planLocalChatSettings(input, 'win32'));
  }
  const unrelatedDuplicate = '{"x":1,"x":2}';
  assert.ok(planLocalChatSettings(unrelatedDuplicate, 'win32').text.startsWith('{"x":1,"x":2,'), 'unrelated duplicate keys are not rewritten');
  for (const platform of ['linux', 'darwin']) assert.throws(() => planLocalChatSettings('{}', platform), /Windows-only/);
});

test('Local writer keeps exact backup, no-op/dry-run behavior and concurrency guard', () => withTemp(home => {
  const file = path.join(home, 'settings.json');
  fs.writeFileSync(file, original);
  const plan = { file, original, ...planLocalChatSettings(original, 'win32') };
  const preview = writeTerminalSettings(plan, { dryRun: true });
  assert.equal(preview.status, 'would update');
  assert.deepEqual(fs.readdirSync(home), ['settings.json']);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const written = writeTerminalSettings(plan);
  assert.equal(fs.readFileSync(written.backup, 'utf8'), original);
  assert.equal(fs.readFileSync(file, 'utf8'), plan.text);
  assert.equal(writeTerminalSettings({ file, original: plan.text, text: plan.text }).status, 'unchanged');
  assert.throws(() => writeTerminalSettings(plan), /changed during/);
}));

// Exercise production install settings / manual fallback without running install,
// Git, SDK, registry, payload writes or any live-home configuration. Help is the
// only main() command; then call configureVsCodeSettings against a temp target.
function installSettingsFixture(home, platform, skip = false) {
  const file = path.join(home, 'settings.json');
  fs.writeFileSync(file, original);
  const fromCli = createRequire(cli);
  const blocked = () => { throw new Error('Host process/configuration forbidden in fixture'); };
  const context = vm.createContext({
    __dirname: path.dirname(cli), Buffer,
    process: { platform, argv: ['node', cli, 'help'], env: { SN_FLUENT_VSCODE_SETTINGS: file }, exitCode: 0 },
    console: { log() {}, error: blocked },
    require(name) {
      if (name === 'node:os') return { homedir: () => home };
      if (name === '../lib/windows-git-environment.cjs') return { configureWindowsGit: blocked, detectPathShadow: blocked };
      if (name === '../lib/vscode-terminal.cjs') return {
        ...terminal, findGit: blocked,
        prepareTerminalSettings(target) {
          assert.equal(target, file);
          const text = fs.readFileSync(target, 'utf8');
          return { file: target, original: text, text, git: { executable: 'fixture-only' }, warnings: [] };
        },
        writeTerminalSettings(plan, options) {
          assert.equal(plan.file, file);
          return writeTerminalSettings(plan, options);
        },
      };
      return fromCli(name);
    },
  });
  // Set the fixture's opt-out without adding a fake production CLI flag.
  let source = fs.readFileSync(cli, 'utf8');
  if (skip) source = source.replace("const noVscodeSettings = flags.has('--no-vscode-settings');", 'const noVscodeSettings = true;');
  vm.runInContext(source, context);
  const result = vm.runInContext('const summary = {}; configureVsCodeSettings(summary); ({ summary, manual: requiredSettingsBlock() })', context);
  return { ...result, file, settings: parseJsonc(fs.readFileSync(file, 'utf8')) };
}

test('Windows install and manual fallback share Local settings; POSIX and opt-out preserve preferences', () => {
  for (const platform of ['win32', 'linux', 'darwin']) withTemp(home => {
    const result = installSettingsFixture(home, platform);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(result.settings[key], platform === 'win32' ? value : parseJsonc(original)[key]);
      assert.equal(result.manual[key], platform === 'win32' ? value : undefined);
    }
    assert.equal(fs.readFileSync(result.summary.vscodeSettingsBackup, 'utf8'), original);
    assert.equal(result.settings['chat.tools.global.autoApprove'], false);
  });
  withTemp(home => {
    const result = installSettingsFixture(home, 'win32', true);
    assert.equal(result.summary.vscodeSettings, 'skipped (--no-vscode-settings)');
    assert.equal(fs.readFileSync(result.file, 'utf8'), original);
    assert.deepEqual(fs.readdirSync(home), ['settings.json']);
  });
});

function runCli(home, args, override) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData') };
  delete env.SN_FLUENT_VSCODE_SETTINGS;
  if (override) env.SN_FLUENT_VSCODE_SETTINGS = override;
  // Block subprocesses inside the CLI: this settings repair must not run Git,
  // PowerShell, the SDK, or any installer. The outer Node itself is direct.
  const guard = path.join(home, 'no-children.cjs');
  fs.writeFileSync(guard, "const cp = require('node:child_process'); for (const k of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) cp[k] = () => { throw Error('Unexpected subprocess'); };\n");
  return spawnSync(process.execPath, ['--require', guard, cli, ...args], { env, encoding: 'utf8', timeout: 15000 });
}

test('configure-chat CLI repairs only selected settings without subprocesses or payload install', { skip: process.platform !== 'win32' }, () => withTemp(home => {
  const file = path.join(home, 'settings.json');
  fs.writeFileSync(file, original);
  let result = runCli(home, ['configure-chat', '--settings-file', file, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /would update/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  result = runCli(home, ['configure-chat', '--settings-file', file]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NEW Local chat/);
  assert.match(result.stdout, /not policy overrides/);
  assert.deepEqual(parseJsonc(fs.readFileSync(file, 'utf8')), { ...parseJsonc(original), ...expected });
  const backup = fs.readdirSync(home).find(name => name.endsWith('.bak'));
  assert.equal(fs.readFileSync(path.join(home, backup), 'utf8'), original);
  result = runCli(home, ['configure-chat'], file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /unchanged/);
  assert.equal(fs.readdirSync(home).filter(name => name.endsWith('.bak')).length, 1);
  assert.equal(fs.existsSync(path.join(home, '.agents')), false);
  assert.equal(fs.existsSync(path.join(home, 'AppData')), false);
}));

test('configure-chat dry-run leaves absent settings and parent directories absent', { skip: process.platform !== 'win32' }, () => withTemp(home => {
  const result = runCli(home, ['configure-chat', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /would update/);
  assert.doesNotMatch(result.stdout, /Settings backup/);
  assert.deepEqual(fs.readdirSync(home), ['no-children.cjs']);
}));

test('configure-chat explicit target wins over environment override', { skip: process.platform !== 'win32' }, () => withTemp(home => {
  const explicit = path.join(home, 'explicit.json');
  const inherited = path.join(home, 'inherited.json');
  fs.writeFileSync(inherited, original);
  const result = runCli(home, ['configure-chat', '--settings-file', explicit], inherited);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parseJsonc(fs.readFileSync(explicit, 'utf8')), expected);
  assert.equal(fs.readFileSync(inherited, 'utf8'), original);
  assert.equal(fs.readdirSync(home).some(name => name.endsWith('.bak')), false);
}));

test('configure-chat creates the default Windows settings target, with no imaginary backup', { skip: process.platform !== 'win32' }, () => withTemp(home => {
  const result = runCli(home, ['configure-chat']);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Settings backup/);
  assert.deepEqual(parseJsonc(fs.readFileSync(path.join(home, 'AppData/Code/User/settings.json'), 'utf8')), expected);
}));

test('configure-chat refuses bad settings without changing them', { skip: process.platform !== 'win32' }, () => withTemp(home => {
  const file = path.join(home, 'settings.json');
  fs.writeFileSync(file, '{bad');
  const result = runCli(home, ['configure-chat', '--settings-file', file]);
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
  assert.equal(fs.readdirSync(home).some(name => name.endsWith('.bak')), false);
}));

test('configure-chat refuses non-Windows without writing settings', { skip: process.platform === 'win32' }, () => withTemp(home => {
  const result = runCli(home, ['configure-chat']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Windows-only/);
  assert.deepEqual(fs.readdirSync(home), ['no-children.cjs']);
}));

test('Windows manifest, repair instructions and test suite match production preferences', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.windowsVscodeSettings, expected);
  const guide = fs.readFileSync(path.join(root, 'docs/fix-powershell-chat.md'), 'utf8');
  for (const [key, value] of Object.entries(expected)) assert.ok(guide.includes(`"${key}": ${value}`));
  for (const file of ['README.md', 'setup.md']) assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes('fix-powershell-chat.md'));
  assert.match(guide, /ConstrainedLanguage/);
  assert.match(guide, /policy/i);
  assert.match(guide, /rollback/i);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['test:setup'].includes('tools/test/vscode-chat.test.cjs'));
});
