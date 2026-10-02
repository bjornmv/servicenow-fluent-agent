'use strict';

// Offline documentation/package tests. Never launch PowerShell or install Git.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { stageSetupPages, validateBootstrapHash, workerRelativePath, downloadRelativePath } = require('../stage-setup-pages.cjs');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const setup = read('setup.md');
const gitSetup = read('git-setup.md');
const worker = read(workerRelativePath);
const skill = read('payload/.agents/skills/win-git-bootstrap/SKILL.md');
const workflow = read('.github/workflows/deploy-setup-page.yml');

function withTemp(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-setup-pages-'));
  try { return fn(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function sourceFixture(directory) {
  const source = path.join(directory, 'source');
  for (const file of ['setup.md', 'git-setup.md', workerRelativePath]) {
    const destination = path.join(source, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  return source;
}

test('setup delegates Git-only prerequisite installation before SDK or clone steps', () => {
  assert.match(setup, /The only missing prerequisite you may install is Git/);
  assert.match(setup, /If Node\.js is missing or fails, report it and stop/);
  assert.match(setup, /https:\/\/bjornmv\.github\.io\/servicenow-fluent-agent\/git-setup\//);
  assert.match(setup, /-InstallIfMissing/);
  assert.ok(setup.indexOf('git-setup/') < setup.indexOf('### 2. Install now-sdk'));
  assert.match(setup, /Do not require a Git clone to install missing Git/);
  assert.doesNotMatch(setup, /If either command is missing or fails/);
  assert.doesNotMatch(setup, /Do not install missing prerequisites,/);
});

test('existing, blocked and stale-PATH cases do not authorize replacement', () => {
  assert.match(setup, /Keep a working stable Git \*\*>=2\.54\.0\*\* unchanged/);
  assert.match(setup, /older Git, an executable that cannot run, or a broken registration requires review/);
  assert.match(setup, /Never invoke migration\/replacement modes/);
  assert.match(setup, /& \$GitExe clone/);
  assert.match(setup, /& \$GitExe pull --ff-only/);
});

test('separate page reuses the single canonical skill and worker', () => {
  assert.match(gitSetup, /permalink: \/git-setup\//);
  assert.match(gitSetup, /raw\.githubusercontent\.com\/bjornmv\/servicenow-fluent-agent\/main\/payload\/\.agents\/skills\/win-git-bootstrap\/SKILL\.md/);
  assert.match(gitSetup, /not another installer implementation/);
  assert.match(skill, /references\/validation\.md/);
  assert.ok(fs.existsSync(path.join(root, 'payload/.agents/skills/win-git-bootstrap/references/validation.md')));
});

test('HTTPS handoff needs no Git and hashes the saved script before execution', () => {
  const url = gitSetup.match(/\$BootstrapUrl = '([^']+)'/)[1];
  assert.equal(url, 'https://bjornmv.github.io/servicenow-fluent-agent/' + downloadRelativePath);
  const blocks = [...gitSetup.matchAll(/```powershell\n([\s\S]*?)```/g)].map(match => match[1]);
  assert.match(blocks[0], /Invoke-WebRequest/);
  assert.match(blocks[0], /Get-FileHash -LiteralPath \$BootstrapPath -Algorithm SHA256/);
  assert.doesNotMatch(blocks[0], /-File \$BootstrapPath/);
  assert.match(blocks[1], /-File \$BootstrapPath -InstallIfMissing/);
  assert.match(blocks[1], /\$LASTEXITCODE -ne 0/);
  for (const block of blocks) {
    assert.doesNotMatch(block, /git(?:\.exe)? clone/i);
    assert.doesNotMatch(block, /ExecutionPolicy\s+Bypass|Unblock-File|Invoke-Expression|\biex\b/i);
  }
  assert.match(gitSetup, /Read the saved script before executing it/);
});

test('documented worker digest matches exact canonical bytes', () => {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, workerRelativePath))).digest('hex');
  assert.equal(validateBootstrapHash(), actual);
});

test('Pages staging copies both documents and download byte-for-byte', () => withTemp(directory => {
  const output = path.join(directory, 'pages');
  const result = stageSetupPages(output);
  assert.deepEqual(result.files, ['setup.md', 'git-setup.md', downloadRelativePath]);
  assert.equal(fs.readFileSync(path.join(output, 'setup.md'), 'utf8'), setup);
  assert.equal(fs.readFileSync(path.join(output, 'git-setup.md'), 'utf8'), gitSetup);
  assert.deepEqual(fs.readFileSync(path.join(output, downloadRelativePath)), fs.readFileSync(path.join(root, workerRelativePath)));
}));

test('altered worker blocks publication before any output is written', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.appendFileSync(path.join(source, workerRelativePath), '\n# deliberate test alteration\n');
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /SHA-256 mismatch/);
  assert.equal(fs.existsSync(output), false);
}));

test('missing or ambiguous worker digest blocks publication', () => withTemp(directory => {
  const source = sourceFixture(directory);
  const page = path.join(source, 'git-setup.md');
  fs.writeFileSync(page, gitSetup.replace('$ExpectedBootstrapSha256 =', '$RemovedDigest ='));
  assert.throws(() => validateBootstrapHash(source), /exactly one/);
  fs.writeFileSync(page, gitSetup + "\n$ExpectedBootstrapSha256 = '" + '0'.repeat(64) + "'\n");
  assert.throws(() => validateBootstrapHash(source), /exactly one/);
}));

test('worker retains the exact ZIP pin, absent-only guard and pre-extraction exclusions', () => {
  assert.match(worker, /\[switch\]\$InstallIfMissing/);
  assert.match(worker, /if \(\$InstallIfMissing\)/);
  assert.match(worker, /Absent-only agent setup will not upgrade or replace/);
  assert.match(worker, /v2\.54\.0\.windows\.1\/MinGit-2\.54\.0-64-bit\.zip/);
  assert.match(worker, /04F937E1F0918B17B9BE6F2294CB2BB66E96E1D9832D1C298E2DE088A1D0E668/);
  assert.match(worker, /\$excludedFiles = @\('usr\/bin\/find\.exe', 'usr\/bin\/sort\.exe'\)/);
  const verify = worker.indexOf('Pre-extraction exclusions verified:');
  const extract = worker.indexOf('& $tar @excludeArguments -xf $archive -C $stage');
  assert.ok(verify > 0 && extract > verify);
  assert.doesNotMatch(worker, /Expand-Archive/);
  assert.match(worker, /Confirm-NoDeploymentBlocks \$auditStart/);
});

test('Pages rebuilds for docs, canonical worker and staging/test changes', () => {
  for (const entry of ['git-setup.md', 'payload/.agents/skills/win-git-bootstrap/**', 'tools/stage-setup-pages.cjs', 'tools/test/setup-pages.test.cjs']) {
    assert.ok(workflow.includes('      - ' + entry), entry);
  }
  assert.ok(workflow.indexOf('node --test tools/test/setup-pages.test.cjs') < workflow.indexOf('node tools/stage-setup-pages.cjs'));
  assert.match(workflow, /source: \.\/_pages/);
});
