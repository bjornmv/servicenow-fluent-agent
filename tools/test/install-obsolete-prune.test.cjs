'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

// Runs the real installer against a throwaway home only; VS Code settings are never touched.
const cli = path.join(__dirname, '../../bin/sn-fluent-agent.cjs');

function run(home, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData') },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('removing an obsolete skill also removes the directories it leaves empty, never user files', { skip: process.platform === 'win32' && 'installer configures Windows Git and the terminal profile on Windows' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-prune-'));
  try {
    run(home, ['install', '--no-vscode-settings']);
    const receiptPath = path.join(home, '.agents', '.servicenow-fluent-agent-install.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    // Simulate a skill that an earlier release installed and this payload no longer ships.
    const obsolete = ['.agents/skills/retired-skill/SKILL.md', '.agents/skills/retired-skill/scripts/run.ps1'];
    for (const rel of obsolete) {
      const target = path.join(home, ...rel.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, rel);
      receipt.files[rel] = { sha256: crypto.createHash('sha256').update(rel).digest('hex'), target };
    }
    const kept = path.join(home, '.agents', 'skills', 'retired-skill', 'notes', 'mine.txt');
    fs.mkdirSync(path.dirname(kept), { recursive: true });
    fs.writeFileSync(kept, 'user file');
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

    assert.match(run(home, ['install', '--no-vscode-settings']), /^removed obsolete: 2$/m);
    assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'retired-skill', 'scripts')), false);
    assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'retired-skill', 'SKILL.md')), false);
    assert.equal(fs.readFileSync(kept, 'utf8'), 'user file');

    // A folder an earlier install left behind with only empty directories is swept; one
    // holding a user file is not.
    const leftover = path.join(home, '.agents', 'skills', 'old-retired', 'references');
    fs.mkdirSync(path.join(home, '.agents', 'skills', 'old-retired', 'scripts'), { recursive: true });
    fs.mkdirSync(leftover, { recursive: true });
    run(home, ['install', '--no-vscode-settings']);
    assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'old-retired')), false);
    assert.equal(fs.readFileSync(kept, 'utf8'), 'user file');

    fs.rmSync(path.join(home, '.agents', 'skills', 'retired-skill'), { recursive: true });
    run(home, ['uninstall']);
    assert.deepEqual(fs.readdirSync(path.join(home, '.agents')).filter((name) => name !== '_backups'), []);
    assert.deepEqual(fs.readdirSync(path.join(home, '.copilot')), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
