'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

// Every case here must be refused before the CLI touches the profile, the payload or the
// network. The throwaway home must stay empty afterwards.
const cli = path.join(__dirname, '../../bin/sn-fluent-agent.cjs');

function run(args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-cli-args-'));
  try {
    const result = spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData') },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, written: fs.readdirSync(home) };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const refused = [
  [['--bogus'], /Unknown option --bogus for install/],
  [['install', '--dry-run', '--bogus'], /Unknown option --bogus for install/],
  [['install', 'extra'], /Unexpected argument extra for install/],
  [['install', '--git-exe'], /Missing value for --git-exe/],
  [['install', '--force', '--force'], /Duplicate option --force/],
  [['verify', '--dry-run'], /Unknown option --dry-run for verify/],
  [['status', '--force'], /Unknown option --force for status/],
  [['check-updates', '--bogus'], /Unknown option --bogus for check-updates/],
  [['check-updates', '--only'], /Missing value for --only/],
  [['check-updates', '--only', 'agent', '--only', 'sdk'], /Duplicate option --only/],
  [['check-updates', 'agent'], /Unexpected argument agent for check-updates/],
  [['update-decision', 'remind', 'skip', '--component', 'agent'], /Unexpected argument skip for update-decision/],
  [['update-decision', 'remind', '--component', 'agent', '--bogus'], /Unknown option --bogus for update-decision/],
  [['uninstall', '--no-vscode-settings'], /Unknown option --no-vscode-settings for uninstall/],
  [['help', '--bogus'], /Unknown option --bogus for help/],
  [['frobnicate'], /Unknown command: frobnicate/],
  [['--dry-run', 'install'], /Put the command first: node bin\/sn-fluent-agent\.cjs install/],
  [['--force', 'uninstall'], /Put the command first: node bin\/sn-fluent-agent\.cjs uninstall/],
];

for (const [args, message] of refused) {
  test(`refuses ${args.join(' ')} before doing any work`, () => {
    const r = run(args);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, message);
    assert.deepEqual(r.written, []);
  });
}

test('--help and help print usage and change nothing', () => {
  for (const args of [['--help'], ['-h'], ['help']]) {
    const r = run(args);
    assert.equal(r.status, 0, args.join(' '));
    assert.match(r.stdout, /^Usage:/);
    assert.deepEqual(r.written, []);
  }
});

test('update-decision takes the decision from the positional, not a --component value', () => {
  const source = fs.readFileSync(cli, 'utf8');
  assert.match(source, /const decision = positionalArgs\[0\];/);
  const r = run(['update-decision', '--component', 'agent']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Specify update, remind, or skip after update-decision\./);
});
