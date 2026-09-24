'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CHECK_INTERVAL_MS,
  REMINDER_INTERVAL_MS,
  checkUpdates,
  keyFor,
  recordDecision,
} = require('../../lib/update-advisor.cjs');

function temporaryPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sn-fluent-agent-update-test-'));
}

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