'use strict';
// Offline documentation checks only: no shell, SDK, credentials, network or instance access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const agents = path.resolve(__dirname, '../../../payload/.agents');
const home = path.dirname(agents);
const sdkSkills = [
  'sn-add-record', 'sn-add-graphql-api', 'sn-add-playbook',
  'sn-add-test-suite', 'sn-auth', 'sn-build-install', 'sn-cicd', 'sn-download',
  'sn-explain', 'sn-fix-build', 'sn-new-app', 'sn-transform', 'sn-ui-page-vite',
  'sn-lux', 'sn-lux-build',
];
const agentFile = path.join(home, '.copilot/agents/ServiceNow Fluent.agent.md');
const instructionFiles = ['fluent', 'scripts', 'now-sdk-baseline'].map(n => path.join(agents, 'instructions', n + '.instructions.md'));
const sdkFiles = [...instructionFiles.slice(0, 2), ...sdkSkills.map(n => path.join(agents, 'skills', n, 'SKILL.md'))];
const docs = [agentFile, instructionFiles.at(-1), ...sdkFiles, path.join(agents, 'skills/sn-doc-export/SKILL.md'), path.join(agents, 'skills/sn-doc-export/install.md')];
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

test('every SDK entry point uses VS Code PowerShell with confirmed project cwd', () => {
  for (const file of sdkFiles) {
    const text = read(file);
    assert.match(text, /VS Code/, file);
    assert.match(text, /PowerShell/, file);
    assert.match(text, /`now-sdk(?: build)?`/, file);
    assert.match(text, /confirmed project directory \(project `cwd`\)/, file);
  }
});

test('runtime prompts point to launcher policy instead of copying execution sections', () => {
  const agent = read(agentFile), baseline = read(instructionFiles.at(-1));
  for (const text of [agent, baseline]) {
    assert.match(text, /reference\/sdk-commands.md/);
    assert.doesNotMatch(text, /## SDK and REST Commands/);
  }
  assert.match(agent, /Supported host: \*\*VS Code Copilot\*\*/);
  assert.match(agent, /PowerShell with now-sdk/);
  assert.match(baseline, /load alongside/);
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
  assert.match(policy, /direct Node execution from the confirmed project directory/);
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

test('all payload Markdown has no distribution-incompatible tool guidance', () => {
  const payload = home;
  const forbidden = /\bPi\b|\.pi[\\/]|\b(?:now_sdk|win_process|win_exec|win_list_files|win_search_files|sn_rest|sn_schema|browser_\w+|run_pi_subagent|withNowSdk)\b/i;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) assert.doesNotMatch(read(file), forbidden, file);
    }
  }
  walk(payload); // Includes hidden .agents and .copilot directories.
  assert.doesNotMatch(policy, forbidden);
});

test('offline test command resolves to this repository-local suite', () => {
  const command = policy.match(/`node --test ([^`]+)`/);
  assert.ok(command, 'Missing offline test command');
  assert.equal(command[1], 'tools/test/sdk-guidance/sdk-command-guidance.test.cjs');
  assert.equal(path.resolve(__dirname, '../../..', command[1]), __filename);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../../..', command[1])));
});

test('canonical guidance retains completion and OAuth safety', () => {
  const agent = read(agentFile);
  assert.match(agent, /completion is \*\*UNKNOWN\*\*/);
  assert.match(agent, /original run's evidence/);
  assert.match(agent, /rather than exposing tokens or inspecting credential storage/);
  assert.match(agent, /\| Schema, records, aggregates or REST verification \| `sn-rest`/);
  assert.match(skill('sn-rest'), /invoke the bundled `sn-rest.js` CLI/);
  assert.match(policy, /Authentication\/confirmation belongs in the interactive parent/);
});

test('skill and instruction frontmatter remains present', () => {
  for (const file of docs.filter(f => !f.endsWith('install.md'))) {
    assert.match(read(file), /^---\n[\s\S]+?\n---\n/, file);
  }
});
