'use strict';
// Offline documentation checks only: no shell, SDK, credentials, network or instance access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const agents = path.resolve(__dirname, '../..');
const home = path.dirname(agents);
const sdkSkills = [
  'sn-add-business-rule', 'sn-add-table', 'sn-add-graphql-api', 'sn-add-playbook',
  'sn-add-test-suite', 'sn-auth', 'sn-build-install', 'sn-cicd', 'sn-download',
  'sn-explain', 'sn-fix-build', 'sn-new-app', 'sn-transform', 'sn-ui-page-vite',
  'sn-lux', 'sn-lux-build',
];
const agentFile = path.join(home, '.copilot/agents/ServiceNow Fluent.agent.md');
const instructionFiles = ['fluent', 'scripts', 'now-sdk-baseline'].map(n => path.join(agents, 'instructions', n + '.instructions.md'));
const sdkFiles = [agentFile, ...instructionFiles, ...sdkSkills.map(n => path.join(agents, 'skills', n, 'SKILL.md'))];
const docs = [...sdkFiles, path.join(agents, 'skills/sn-doc/SKILL.md'), path.join(agents, 'skills/sn-doc/install.md')];
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const policyPath = path.join(agents, 'reference/sdk-commands.md');
const policy = read(policyPath);
const skill = n => read(path.join(agents, 'skills', n, 'SKILL.md'));

test('active command guidance has no copied resolver or blocked launcher examples', () => {
  for (const file of docs) {
    const text = read(file);
    assert.doesNotMatch(text, /\$NowSdk|<resolver>|npm\.cmd|npx\.cmd|This box blocks the bare/, file);
    assert.doesNotMatch(text, /node\s+(?:node_modules\/@servicenow\/sdk\/bin\/index\.js|<resolved-sdk-cli>)/, file);
  }
});

test('all edited documents link to the one existing command policy', () => {
  for (const file of docs) {
    const links = [...read(file).matchAll(/\]\(([^)]+sdk-commands\.md)\)/g)];
    assert.ok(links.length, 'Missing policy link: ' + file);
    for (const [, link] of links) assert.equal(path.resolve(path.dirname(file), link), policyPath, file);
  }
});

test('every SDK entry point explicitly distinguishes VS Code and Pi', () => {
  for (const file of sdkFiles) {
    const text = read(file);
    assert.match(text, /VS Code/, file);
    assert.match(text, /`now_sdk` tool/, file);
    assert.match(text, /project `cwd`/, file);
  }
});

test('agent and fallback baseline mirror launcher and upgrade rules', () => {
  const agent = read(agentFile);
  const baseline = read(instructionFiles.at(-1));
  const launcher = s => s.split('\n').filter(l => /^- (In VS Code|For a simple command|Respect the project)/.test(l));
  assert.equal(launcher(agent).length, 3);
  assert.deepEqual(launcher(agent), launcher(baseline));
  const upgrade = s => s.split('\n').find(l => l.startsWith('Project-local SDK wins.'));
  assert.equal(upgrade(agent), upgrade(baseline));
});

test('fallback is conditional, permission-aware and preserves local SDK precedence', () => {
  assert.match(policy, /Fallback: missing function, not policy bypass/);
  assert.match(policy, /project-local SDK first/);
  assert.match(policy, /not permission to silently substitute the global version/);
  assert.match(policy, /If no allowed entry point exists, stop/);
  assert.match(policy, /never interpret an explicit policy denial/i);
  assert.match(policy, /does not install a profile/);
});

test('package-manager guidance preserves lockfiles and upgrade authorization', () => {
  assert.match(policy, /Respect `packageManager` and the existing lockfile/);
  assert.match(policy, /not `npm\.cmd` \/ `npx\.cmd`/);
  assert.match(policy, /win_process/);
  assert.match(policy, /upgrade requires explicit scope\/version approval/);
  assert.match(skill('sn-new-app'), /Do not replace a pnpm lockfile with an npm lockfile/);
});

test('simple command checks do not expand into auth or discovery work', () => {
  assert.match(policy, /run exactly `now-sdk`/);
  assert.match(policy, /missing-subcommand exit does not mean the executable is unavailable/);
  assert.match(policy, /needs no subagent, authentication probe, recursive file search or package installation/);
  assert.match(policy, /shell\/terminal-integration error makes the SDK result inconclusive/);
});

test('both PowerShell install patterns retain exit, output and launcher-error checks', () => {
  const text = skill('sn-build-install');
  const blocks = [...text.matchAll(/```powershell\n([\s\S]*?)```/g)].map(m => m[1]).filter(b => b.startsWith('$out = now-sdk install'));
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.match(block, /2>&1\n\$commandOk = \$\?\n\$exit = \$LASTEXITCODE/);
    assert.match(block, /\$failed = -not \$commandOk -or \$exit -ne 0/);
    assert.ok(block.includes('ERROR:|Could not determine app installation status'));
    assert.match(block, /if \(\$failed\) \{ throw/);
  }
  assert.match(blocks[1], /--skip-flow-activation/);
  assert.match(text, /REQUIRED BEFORE COMMAND/);
  assert.match(text, /Do NOT use `--reinstall` \(destructive\) without confirming first/);
  assert.match(text, /content-marker verification|content-marker check/);
});

test('CI/CD and headless mutation approvals remain explicit', () => {
  const text = skill('sn-cicd');
  assert.match(text, /explicit approval before every `cicd publish`, `cicd install`, or `cicd rollback`/);
  assert.match(text, /separate explicit approval immediately before rollback/);
  assert.match(text, /Confirm before running ATF/);
  assert.match(policy, /headless child cannot approve mutations/);
});

test('skill and instruction frontmatter remains present', () => {
  for (const file of docs.filter(f => !f.endsWith('install.md'))) {
    assert.match(read(file), /^---\n[\s\S]+?\n---\n/, file);
  }
});
