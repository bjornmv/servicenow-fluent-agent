'use strict';
// Prompt-contract checks, not proof of model behavior or a live terminal/instance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const { renderBaseline, generate, agentPath, baselinePath } = require('../generate-baseline.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const agent = read(agentPath), baseline = read(baselinePath);
const skill = name => read(`payload/.agents/skills/${name}/SKILL.md`);
const policy = read('payload/.agents/reference/sdk-commands.md');
const body = text => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const words = text => text.trim().split(/\s+/).length;
const section = (text, name) => text.split(`## ${name}\n`)[1]?.split('\n## ')[0].trim() || '';
const normalize = text => body(text).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').toLowerCase().match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) || [];
const grams = (tokens, n) => new Set(tokens.slice(0, Math.max(0, tokens.length - n + 1)).map((_, i) => tokens.slice(i, i + n).join(' ')));

test('runtime agent has one host declaration and explicit safety-first precedence', () => {
  assert.deepEqual([...agent.matchAll(/^## (.+)$/gm)].map(m => m[1]), ['Session start', 'Priority order', 'Routing', 'Invariants', 'Approval gates']);
  assert.equal((agent.match(/Supported host:/g) || []).length, 1);
  assert.match(agent, /Supported host: \*\*VS Code Copilot\*\*/);
  assert.match(agent, /Skills supply instructions and helpers, not registered tools/);
  const priority = section(agent, 'Priority order');
  assert.equal((priority.match(/^\d\. /gm) || []).length, 5);
  assert.match(priority, /1\. Follow host security policies and higher-priority instructions/);
  assert.match(priority, /2\. Apply approval gates and hard stops before acting/);
  assert.match(priority, /3\. Honor the user's confirmed scope and current project constraints/);
  assert.match(priority, /without relaxing the preceding constraints/);
  assert.match(priority, /instructions still conflict.*stop and ask/);
});

test('first-session instruction gates the skill on the shared stamp rather than task type', () => {
  const startup = section(agent, 'Session start');
  assert.ok(agent.indexOf('## Session start') < agent.indexOf('## Routing'));
  assert.match(startup, /Before task work in every new session/);
  assert.match(startup, /sn-update-advisor.cjs" session-start/);
  assert.match(startup, /only when missing or older than 48 hours/);
  assert.match(startup, /If `due: true`, follow `sn-update-advisor` for all applicable components/);
  assert.match(startup, /Otherwise continue/);
  assert.match(startup, /attempt, not success/);
  assert.match(startup, /Updates still require approval/);
  const owner = skill('sn-update-advisor');
  for (const term of ['.servicenow-fluent-agent-update-check.stamp', '**before** invoking this skill', 'Do not touch a fresh stamp', 'one shared gate across projects', 'reminder/skip decisions', '**Agent:**', '**now-sdk:**', '**ServiceNowDocs:**', 'without `--force`', 'lastCheckFailedAt']) assert.ok(owner.includes(term), term);
  assert.match(owner, /No ancestor guessing or global-SDK substitution/);
  assert.match(owner, /report a missing checkout without cloning or rebuilding/);
  assert.match(skill('sn-doc-lookup'), /Outside the agent's shared session-start gate/);
});

test('invariants and approval gates are short individual bullets, not semicolon-packed prose', () => {
  const invariants = section(agent, 'Invariants').split('\n').filter(Boolean);
  assert.ok(invariants.length >= 10 && invariants.length <= 12);
  for (const line of invariants) {
    assert.ok(line.startsWith('- '), line);
    assert.doesNotMatch(line, /;/, line);
    assert.ok(words(line) <= 36, 'Split this rule: ' + line);
  }
  const gates = section(agent, 'Approval gates').split('\n').filter(l => l.startsWith('- '));
  assert.equal(gates.length, 8);
  for (const line of gates) { assert.doesNotMatch(line, /;/); assert.ok(words(line) <= 20); }
  assert.ok(invariants.filter(l => /because| so |before considering|rather than/.test(l)).length >= 6, 'Retain reasons for important constraints');
});

test('co-loaded word budgets count both complete files, including frontmatter and routing', () => {
  assert.ok(words(agent) >= 600 && words(agent) <= 700, `Agent: ${words(agent)}`);
  assert.ok(words(baseline) >= 100 && words(baseline) <= 150, `Baseline: ${words(baseline)}`);
  assert.ok(words(agent) + words(baseline) <= 850);
  assert.match(baseline, /load alongside the ServiceNow Fluent agent/);
  assert.doesNotMatch(baseline, /non-agent chats|^## /m);
});

test('baseline has no copied agent sections or twelve-word normalized passages', () => {
  for (const name of ['Priority order', 'Routing', 'Invariants', 'Approval gates']) {
    assert.equal(baseline.includes(section(agent, name)), false, name);
  }
  const agentGrams = grams(normalize(agent), 12), repeated = [...grams(normalize(baseline), 12)].filter(g => agentGrams.has(g));
  assert.deepEqual(repeated, []);
  // Adding a detailed agent section must not silently inflate the baseline.
  assert.equal(renderBaseline(agent + '\n## Incident detail\n\n' + 'Specific workaround. '.repeat(200)), baseline);
});

test('incident diagnostics remain in owning skills rather than either runtime prompt', () => {
  const cases = [
    ['ui_builder_admin', skill('sn-doc-lookup'), /ui\\_builder\\_admin|ui_builder_admin/],
    ['install --info', skill('sn-build-install'), /install --info.*only PRINTS/],
    ['Could not determine app installation status', skill('sn-build-install'), /Could not determine app installation status/],
    ['sys_updated_on', skill('sn-build-install'), /sys_updated_on.*NOT proof/],
    ['tombstone', skill('sn-lux-build'), /Tombstones can delete real records/],
    ['Remind me in 7 days', skill('sn-update-advisor'), /\*\*Update\*\*, \*\*Remind me in 7 days\*\*, \*\*Skip this release\*\*/],
    ['sys_repo_config', skill('sn-build-install'), /Studio → Source Control → Commit Changes/],
    ['move --ids', policy, /move --ids.*changes instance record membership/],
    ['transform --force', skill('sn-transform'), /not\*\* an overwrite or re-transform flag/],
  ];
  for (const [detail, owner, proof] of cases) {
    assert.match(owner, proof, detail);
    assert.equal((agent + baseline).toLowerCase().includes(detail.toLowerCase()), false, detail);
  }
  assert.match(policy, /explicit approval for that reassignment/);
  assert.match(policy, /`--select` selects the output envelope, not the table fields/);
  assert.match(skill('sn-download'), /no list-apps command/);
  assert.match(skill('sn-auth'), /only for an explicit authentication troubleshooting task/);
  assert.match(skill('sn-transform'), /only after explicit confirmation/);
});

test('automation guardrail is independently usable from skills and file instructions', () => {
  const build = skill('sn-build-install'), transform = skill('sn-transform');
  const fluent = read('payload/.agents/instructions/fluent.instructions.md');
  assert.match(build, /## Automation ownership/);
  for (const detail of ['src/fluent/generated/automation/flow/', 'metadata/update/sys_hub_*.xml', 'Flow Designer', '--skip-flow-activation', 'not authored in the current session']) assert.ok(build.includes(detail), detail);
  assert.match(build, /explicit approval before deleting/);
  for (const text of [transform, fluent]) {
    assert.match(text, /sn-build-install\/SKILL.md#automation-ownership/);
    assert.doesNotMatch(text, /canonical in the ServiceNow Fluent agent|guardrail.*in the ServiceNow Fluent agent/i);
  }
});

test('approval categories, UNKNOWN recovery and evidence boundaries survive shortening', () => {
  const gates = section(agent, 'Approval gates');
  for (const phrase of ['explicit approval', 'exact target and change', 'headless delegate cannot grant', 'Installing or deploying', 'Destructive reinstalls', 'legacy choice replacement', 'descendant table', 'Deleting source or live records', 'reassigning records', 'authentication alias', 'access permissions', 'Running ATF', 'execution target confirmed', 'App Repository version', 'tool/dependency versions']) assert.ok(gates.includes(phrase), phrase);
  for (const phrase of ['absolute project directory', 'native completion', '**UNKNOWN**', "original run's evidence", 'package, build, installation, content and rendered-runtime', 'one execution owner', 'actual excerpts and completion evidence', 'session-start gate authorizes advisory checks only, not maintenance']) assert.ok(agent.includes(phrase), phrase);
  assert.match(baseline, /required approval before mutations/);
  assert.match(baseline, /operation-specific target/);
  assert.doesNotMatch(baseline, /Confirm the project, instance.*before mutations/);
  assert.match(baseline, /original evidence before retrying/);
  assert.match(baseline, /unreviewed generated metadata/);
  assert.match(policy, /Do not retry a possibly applied install/);
  assert.match(policy, /Preserve busy or user-owned terminals/);
  assert.match(skill('sn-build-install'), /Deleting local source is not proof that a live record was deleted/);
});

test('routing names and local prompt links resolve without loading whole workflows twice', () => {
  const routing = section(agent, 'Routing');
  for (const [, name] of routing.matchAll(/`([^`]+)`/g)) {
    const file = name.endsWith('.instructions.md') ? `payload/.agents/instructions/${name}` : `payload/.agents/skills/${name}/SKILL.md`;
    assert.ok(fs.existsSync(path.join(root, file)), name);
  }
  for (const [rel, text] of [[agentPath, agent], [baselinePath, baseline]]) {
    for (const [, url] of text.matchAll(/\]\(([^)]+)\)/g)) {
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(rel), url.split('#')[0])), `${rel}: ${url}`);
    }
  }
  for (const name of ['Quiet Update Advisory', 'Documentation Lookup', 'Authoring Defaults', 'Build, Install, Verify', 'UI and Connection Evidence']) assert.equal(agent.includes(`## ${name}`), false);
});

test('maintenance instructions stay in README and memory is capability-neutral', () => {
  assert.doesNotMatch(agent + baseline, /generate-baseline|node tools\/|do not edit|canonical source/i);
  const readme = read('README.md');
  assert.match(readme, /node tools\/generate-baseline.cjs/);
  assert.match(readme, /not restricted to non-agent chats/);
  assert.match(readme, /not an automatic semantic summarizer/);
  for (const text of [agent, baseline, skill('sn-build-install'), skill('sn-explain'), skill('sn-ui-page-vite')]) assert.doesNotMatch(text, /\/memories\/repo\//);
  assert.match(agent, /available workspace memory\/evidence facility or the conversation/);
  assert.match(skill('sn-build-install'), /no specific memory tool or path is required/);
  assert.match(skill('sn-build-install'), /binding change or evidence that the cached result is stale/);
});

test('UI and authentication details remain in their specialized owners', () => {
  assert.match(skill('sn-lux'), /official-skills.md/);
  assert.match(skill('sn-lux'), /Lux\/AIUX owns Lit/);
  assert.match(skill('sn-lux-build'), /Do not patch vendor packages as speculative fixes/);
  assert.match(skill('sn-lux-build'), /Do not overwrite user preferences/);
  assert.match(skill('sn-lux-build'), /registration\/hydration/);
  assert.match(skill('sn-react-ui-design'), /No framework migration merely for styling/);
  assert.match(skill('sn-react-ui-design'), /not tested/);
  assert.match(skill('sn-ui-page-vite'), /Do \*\*not\*\* create `vite.config.js\/ts`/);
  assert.match(skill('sn-auth'), /inventory, not a connection test/);
});

test('generation detects source-contract or output drift in an isolated fixture', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-policy-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const [rel, bytes] of [[agentPath, agent], [baselinePath, baseline]]) { const file = path.join(temp, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
  generate(temp, true);
  fs.appendFileSync(path.join(temp, baselinePath), '\nStale instructions\n');
  assert.throws(() => generate(temp, true), /Generated baseline is stale/);
  assert.throws(() => renderBaseline(agent.replace('## Approval gates', '## Removed')), /Missing canonical section/);
  assert.throws(() => renderBaseline(agent.replace('UNKNOWN', 'SUCCESS')), /Review baseline safety contract/);
  generate(temp);
  assert.equal(fs.readFileSync(path.join(temp, baselinePath), 'utf8'), baseline);
});
