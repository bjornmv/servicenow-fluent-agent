'use strict';

// Offline documentation/package tests. Never launch PowerShell or install Git.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { stageSetupPages, validateBootstrapHash, validateSdkSetupHash, workerRelativePath, downloadRelativePath, sdkWorkerRelativePath, sdkDownloadRelativePath } = require('../stage-setup-pages.cjs');

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
  for (const file of ['setup.md', 'git-setup.md', 'VERSION', 'package.json', 'manifest.json', workerRelativePath, sdkWorkerRelativePath]) {
    const destination = path.join(source, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  return source;
}

test('setup scopes approved changes and ensures Git before SDK or clone steps', () => {
  assert.match(setup, /Node\.js must already be installed/);
  assert.match(setup, /global SDK package install\/update/);
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

test('setup configures Windows user PATH, not a shell profile, and requires actual terminal checks', () => {
  assert.match(setup, /install --git-exe "\$GitExe"/);
  assert.match(setup, /configure-git --git-exe "\$GitExe"/);
  assert.match(setup, /SN_FLUENT_ENV_REFRESH/);
  assert.match(setup, /PATH itself is never passed through `setx`/);
  assert.doesNotMatch(setup, /\$env:Path =/);
  assert.match(setup, /\$GitCommand = Get-Command git -ErrorAction Stop/);
  assert.match(setup, /not a restored\/reconnected terminal/);
  assert.match(setup, /Installation complete; fresh-terminal integration check pending/);
  assert.match(setup, /independently of shell type/);
  assert.match(setup, /npm-cli\.js/);
});

test('agent terminal handoff is the final step and the launch prompt stays short', () => {
  const headings = [...setup.matchAll(/^### (\d+)\. (.+)$/gm)];
  assert.deepEqual(headings.map(m => Number(m[1])), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.match(headings.at(-1)[2], /Open a fresh agent terminal and verify \(final step\)/);
  assert.ok(setup.indexOf('SETUP_TERMINAL_PID=') > setup.indexOf('### 6. Build and verify'));
  const prompt = setup.match(/Give a new agent[\s\S]*?```text\n([^`]+)```/)[1].trim();
  assert.equal(prompt, `Read https://bjornmv.github.io/servicenow-fluent-agent/releases/${read('VERSION').trim()}/setup.txt and follow its instructions to perform the full ServiceNow Fluent agent setup.`);
});

test('terminal retirement is one standalone exit after saved completion, never an installer suffix', () => {
  const final = setup.split('### 7.')[1];
  const blocks = [...setup.matchAll(/```powershell\n([\s\S]*?)```/g)].map(m => m[1].trim());
  assert.deepEqual(blocks.filter(block => /(?:^|[;\r\n])\s*exit\b/.test(block)), ['exit']);
  assert.match(setup, /Never append `exit` to a command in a shared interactive terminal/);
  assert.match(final, /confirmed completion of every installation\/clone\/index operation and save their results/);
  assert.match(final, /No pending\/background operations, running jobs or unresolved completion/);
  assert.match(final, /agent's own idle, disposable setup terminal/);
  assert.match(final, /Do not close a user\/shared terminal, lose user work or interrupt any process/);
  assert.match(final, /If ownership, idleness or profile selection is uncertain, stop/);
  assert.match(final, /own separate.*run_in_terminal/);
  assert.match(final, /does not invalidate the already-saved installation results/);
  assert.match(final, /not background mode/);
  assert.ok(final.indexOf('SETUP_TERMINAL_PID=') < final.indexOf('\nexit\n'));
  assert.ok(final.indexOf('\nexit\n') < final.indexOf('VERIFICATION_TERMINAL_PID='));
  assert.ok(final.indexOf('VERIFICATION_TERMINAL_PID=') < final.indexOf('$SdkCommand = Get-Command'));
});

test('fresh terminal acceptance cannot be replaced by configuration or a simulated shell', () => {
  const final = setup.split('### 7.')[1];
  assert.match(final, /do not install an extension, add a task or simulate a terminal with a child PowerShell process/);
  assert.match(final, /Require a different PID/);
  assert.match(final, /missing\/unchanged PID is not fresh-terminal evidence/);
  assert.match(final, /chat\.tools\.terminal\.terminalProfile\.windows/);
  assert.match(final, /rather than silently replacing it/);
  assert.match(final, /Set-Location -LiteralPath/);
  assert.match(final, /Do not assume `\$GitExe`/);
  assert.match(final, /Do not define `now-sdk`, inject PATH or copy startup commands/);
  assert.match(final, /CommandType -ne 'Application'/);
  assert.match(final, /CommandType -ne 'Function'/);
  assert.match(final, /path\/version to match the recorded step-1 values/);
  assert.match(final, /SDK version to match the verified global package/);
  assert.match(final, /source-confirmed, not yet end-to-end tested in Copilot/);
  assert.match(final, /Installation complete; fresh-terminal integration check pending/);
  assert.match(final, /does not certify every terminal/);
  assert.doesNotMatch(final, /\[pscustomobject\]|ExecutionPolicy\s+Bypass|skipCheck|Stop-Process/i);
});

test('fresh MinGit installation registers and publishes user environment before SUCCESS', () => {
  const promote = worker.indexOf('Move-Item -LiteralPath $stage -Destination $target');
  const register = worker.indexOf("Add-UserGitPath (Join-Path $target 'cmd')", promote);
  const success = worker.indexOf('SUCCESS: Official MinGit', register);
  assert.ok(promote > 0 && register > promote && success > register);
  assert.match(worker, /Publish-EnvironmentChange \$publisher/);
});

test('documented worker digest matches exact canonical bytes', () => {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, workerRelativePath))).digest('hex');
  assert.equal(validateBootstrapHash(), actual);
});

test('Pages staging copies both documents and download byte-for-byte', () => withTemp(directory => {
  const output = path.join(directory, 'pages');
  const result = stageSetupPages(output);
  const version = read('VERSION').trim();
  assert.deepEqual(result.files, ['setup.md', 'git-setup.md', downloadRelativePath, sdkDownloadRelativePath, `releases/${version}/setup.txt`, `releases/${version}/Invoke-SdkSetup.ps1`, `releases/${version}/manifest.json`]);
  const release = path.join(output, 'releases', version);
  const text = fs.readFileSync(path.join(release, 'setup.txt'), 'utf8');
  assert.doesNotMatch(text, /^---/);
  assert.equal(text, setup.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
  assert.match(text, /SETUP_PROTOCOL_VERSION=/);
  assert.match(text, /SETUP_GUIDE_END=/);
  const manifest = JSON.parse(fs.readFileSync(path.join(release, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, version);
  assert.equal(manifest.setup.sha256, crypto.createHash('sha256').update(text).digest('hex'));
  assert.equal(manifest.sdkWorker.sha256, validateSdkSetupHash());
  assert.deepEqual(fs.readFileSync(path.join(release, manifest.sdkWorker.file)), fs.readFileSync(path.join(root, sdkWorkerRelativePath)));
  assert.deepEqual(fs.readFileSync(path.join(output, sdkDownloadRelativePath)), fs.readFileSync(path.join(root, sdkWorkerRelativePath)));
  assert.equal(result.sdkSetupSha256, validateSdkSetupHash());
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

test('altered SDK worker blocks publication before output is written', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.appendFileSync(path.join(source, sdkWorkerRelativePath), '\n# altered SDK worker\n');
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /SDK worker SHA-256 mismatch/);
  assert.equal(fs.existsSync(output), false);
}));

test('missing or ambiguous SDK digest blocks publication', () => withTemp(directory => {
  const source = sourceFixture(directory);
  const page = path.join(source, 'setup.md');
  fs.writeFileSync(page, setup.replace('$ExpectedSdkSetupSha256 =', '$RemovedSdkDigest ='));
  assert.throws(() => validateSdkSetupHash(source), /exactly one/);
  fs.writeFileSync(page, setup + "\n$ExpectedSdkSetupSha256 = '" + '0'.repeat(64) + "'\n");
  assert.throws(() => validateSdkSetupHash(source), /exactly one/);
}));

test('release version mismatch blocks publication before writing files', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.writeFileSync(path.join(source, 'VERSION'), '0.0.0\n');
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /release versions disagree/);
  assert.equal(fs.existsSync(output), false);
}));

test('distribution manifest version drift blocks publication before writing output', () => withTemp(dir => {
  const source = sourceFixture(dir);
  const file = path.join(source, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file)); manifest.version = '0.3.0';
  fs.writeFileSync(file, JSON.stringify(manifest));
  const output = path.join(dir, 'output');
  assert.throws(() => stageSetupPages(output, source), /versions disagree/);
  assert.equal(fs.existsSync(output), false);
}));

test('missing guide end marker blocks publication rather than publishing incomplete instructions', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.writeFileSync(path.join(source, 'setup.md'), setup.replace(/^SETUP_GUIDE_END=.*$/m, ''));
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /release versions disagree/);
  assert.equal(fs.existsSync(output), false);
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
  for (const entry of ['VERSION', 'tools/Invoke-SdkSetup.ps1', 'git-setup.md', 'payload/.agents/skills/win-git-bootstrap/**', 'tools/stage-setup-pages.cjs', 'tools/test/setup-pages.test.cjs', 'tools/test/mingit-ssh-probe.test.cjs', 'tools/test/jsonc-settings.test.cjs', 'tools/test/vscode-terminal.test.cjs', 'lib/jsonc-settings.cjs', 'lib/vscode-terminal.cjs', 'lib/windows-git-environment.cjs', 'tools/test/windows-git-environment.test.cjs', 'bin/sn-fluent-agent.cjs']) {
    assert.ok(workflow.includes('      - ' + entry), entry);
  }
  assert.ok(workflow.indexOf('node --test tools/test/setup-pages.test.cjs') < workflow.indexOf('node tools/stage-setup-pages.cjs'));
  assert.match(workflow, /run: node --test tools\/test\/setup-pages\.test\.cjs tools\/test\/mingit-ssh-probe\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/mingit-ssh-probe\.test\.cjs/);
  assert.match(workflow, /run: node --test [^\n]*tools\/test\/vscode-terminal\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/vscode-terminal\.test\.cjs/);
  assert.match(workflow, /run: node --test [^\n]*tools\/test\/windows-git-environment\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/windows-git-environment\.test\.cjs/);
  assert.match(workflow, /run: node --test [^\n]*tools\/test\/setup-sdk-capture\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/setup-sdk-capture\.test\.cjs/);
  assert.match(workflow, /source: \.\/_pages/);
});
