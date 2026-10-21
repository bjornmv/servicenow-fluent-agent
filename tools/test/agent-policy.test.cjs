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

test('session start relies on the agent-scoped SessionStart hook, with no per-session command', () => {
  const startup = section(agent, 'Session start');
  assert.ok(agent.indexOf('## Session start') < agent.indexOf('## Routing'));
  assert.match(startup, /session hook runs the 48-hour update check before your first turn/);
  assert.match(startup, /update notices, withheld updates or an incomplete check, follow `sn-update-advisor` before task work/);
  assert.match(startup, /Otherwise skip update checks unless asked/);
  assert.match(startup, /Updates still require approval/);
  assert.doesNotMatch(body(agent), /sn-skill update session-start|session-hook/, 'the hook replaces the per-session tool call');
  // VS Code reads agent hooks from the frontmatter; YAML scalars arrive as strings, so a timeout key would be ignored.
  const front = agent.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
  assert.equal(front.split('\n').slice(2).join('\n'), [
    'hooks:',
    '  SessionStart:',
    '    - type: command',
    // Kept modified by uninstall, the agent file outlives the launcher: then the hook does nothing.
    `      command: 'f="$HOME/.agents/tools/sn-update-advisor.cjs"; [ ! -f "$f" ] || node "$f" session-hook'`,
    `      windows: "$f = Join-Path $env:USERPROFILE '.agents/tools/sn-update-advisor.cjs'; if (Test-Path -LiteralPath $f) { & node.exe $f session-hook }"`,
  ].join('\n'));
  // Double-quoted YAML processes backslash escapes; the PowerShell line must have none.
  assert.doesNotMatch(front, /\\|timeout/);
  const owner = skill('sn-update-advisor');
  for (const term of ['.servicenow-fluent-agent-update-check.stamp', '`SessionStart` hook', '**before** running the checks', 'do not re-run the checks', 'Do not touch a fresh stamp', 'one shared gate across projects', 'reminder/skip decisions', '**Agent:**', '**now-sdk:**', '**ServiceNowDocs:**', 'without `--force`', 'lastCheckFailedAt']) assert.ok(owner.includes(term), term);
  assert.match(owner, /No ancestor guessing or global-SDK substitution/);
  assert.match(owner, /report a missing checkout without cloning or rebuilding/);
  assert.match(skill('sn-doc-lookup'), /Outside the agent's session update hook/);
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
  // The hooks block is host configuration; VS Code runs it and never shows it to the model.
  const prompt = agent.replace(/^hooks:\r?\n(?: .*\r?\n)*/m, '');
  assert.ok(words(prompt) >= 600 && words(prompt) <= 700, `Agent: ${words(prompt)}`);
  assert.ok(words(baseline) >= 100 && words(baseline) <= 150, `Baseline: ${words(baseline)}`);
  assert.ok(words(prompt) + words(baseline) <= 850);
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

test('adoption chain keeps its verified SDK command shapes and stop rules', () => {
  const download = skill('sn-download'), transform = skill('sn-transform'), build = skill('sn-build-install');
  const fluent = read('payload/.agents/instructions/fluent.instructions.md');
  // init: --from conflicts with --appName/--scopeName; a new app needs all four prompt-skipping flags.
  assert.doesNotMatch(download, /now-sdk init --from[^\n]*--(?:appName|scopeName)/);
  for (const line of skill('sn-new-app').split('\n').filter(l => /^\s*now-sdk init /.test(l))) {
    for (const flag of ['--template', '--appName', '--packageName', '--scopeName']) assert.ok(line.includes(flag), line);
    assert.doesNotMatch(line, /--from/);
  }
  // download only unpacks raw XML; it is never pointed at the project root.
  for (const text of [download, transform]) assert.doesNotMatch(text, /now-sdk download \.(?:\s|$)/m);
  assert.match(download, /REQUIRED before any `transform`/);
  assert.match(download, /Do NOT run `now-sdk install`/);
  // transform: --table alone is a local filter, the bare --auth form is a whole-app sync.
  assert.match(transform, /Never run `--table` without either `--id` or `--from/);
  assert.match(transform, /NOT interactive/);
  assert.match(transform, /Do not pass sys_ids as positional arguments/);
  assert.match(transform, /do NOT run a plain install/);
  // --skip-flow-activation skips publishing; it does not preserve a published flow.
  for (const text of [transform, build]) {
    assert.ok(text.includes('--skip-flow-activation'));
    assert.doesNotMatch(text, /published flow on the instance is preserved/);
  }
  assert.match(build, /does not keep a flow published/);
  // Choice output defaults to the destructive v3 format.
  assert.match(build, /The default is `true`: version 3 `sys_choice_set`/);
  assert.match(fluent, /default choice output is v3 `sys_choice_set`/);
  assert.doesNotMatch(fluent + skill('sn-fix-build'), /v4 additive choice handling by default/);
  assert.match(build, /Installation completed\\\. Access the application at:/);
});

test('authentication and Vite guidance keep their verified failure rules', () => {
  const auth = skill('sn-auth'), vite = skill('sn-ui-page-vite');
  assert.match(auth, /`now-sdk auth --print` — NEVER run it/);
  assert.match(auth, /exit code 0 does not mean success/);
  assert.match(auth, /NEVER pass `all` as the value/);
  assert.match(vite, /Vite 8 and later: `oxc: false`/);
  assert.match(vite, /add `rollup` 4\.x as a devDependency/);
  assert.match(vite, /now-sdk run dev --auth <alias>/);
  assert.match(vite, /## Conditional target-runtime compatibility slice/);
  assert.doesNotMatch(read('payload/.agents/reference/platform-banners.md'), /reads the keychain token/);
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
  for (const phrase of ['absolute project directory', 'native completion', '**UNKNOWN**', "original run's evidence", 'package, build, installation, content and rendered-runtime', 'one execution owner', 'actual excerpts and completion evidence', 'session update hook authorizes advisory checks only, not maintenance']) assert.ok(agent.includes(phrase), phrase);
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

test('build-diagnosis and Lux skills keep reproduced diagnostics and safety polarity', () => {
  const fix = skill('sn-fix-build');
  assert.match(fix, /Table definition should be exported as a named export/);
  assert.match(fix, /Node kind "BarBarToken"/);
  assert.match(fix, /Build completed successfully/);
  assert.match(fix, /sn-build-install\/SKILL\.md#automation-ownership/);
  assert.match(fix, /Do not externalize a documented `Test\(\.\.\.\)`/);
  assert.match(fix, /Never change `legacyChoices`/);
  const fluent = read('payload/.agents/instructions/fluent.instructions.md');
  for (const kind of ['BarBarToken', 'AmpersandAmpersandToken', 'ConditionalExpression', 'SpreadAssignment', 'SpreadElement']) {
    assert.ok(fix.includes(`"${kind}"`) && fluent.includes(`"${kind}"`), kind);
  }
  // GraphQL: Now.include is a raw script, never offered as an equal alternative to an imported module function.
  for (const text of [fix, fluent, skill('sn-build-install'), read('payload/.agents/instructions/scripts.instructions.md')]) {
    assert.doesNotMatch(text, /imported server functions? \(preferred\) or `Now\.include/);
    assert.doesNotMatch(text, /\(preferred\), or use `Now\.include`/);
  }

  const lux = skill('sn-lux'), luxBuild = skill('sn-lux-build');
  for (const pattern of [/vendorprefix/, /not evidence of reservation/, /--ignore-scripts/, /--parentScopeName/, /packageSourceCodeOnInstance/]) assert.match(lux, pattern);
  const packs = read('payload/.agents/skills/sn-lux/references/official-skills.md');
  assert.match(packs, /^## Required task routes$/m);
  assert.match(packs, /^## Leave evidence, not a reading claim$/m);
  for (const pattern of [/Do not use `--reinstall`/, /--demoData=false/, /Do not automatically clear `deleted: true`/, /has two causes/, /needs the user's go-ahead for that alias/]) assert.match(luxBuild, pattern);
  for (const asset of ['assets/now.prebuild.mjs', 'assets/scripts/normalize-aiux-assets.mjs']) {
    assert.ok(fs.existsSync(path.join(root, 'payload/.agents/skills/sn-lux-build', asset)), asset);
  }
  assert.match(read('payload/.agents/skills/sn-lux-build/references/validation-and-troubleshooting.md'), /^## Windows asset 404$/m);
  assert.match(policy, /AIUX \(`aiux\.json`\) project builds only with its project-local SDK/);
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

test('source control guidance recommends local Git and keeps Studio SC as legacy', () => {
  const sc = read('payload/.agents/reference/servicenow-source-control.md');
  assert.match(sc, /## Recommended model: local Git is the source of truth/);
  assert.match(sc, /The agent commits only when the user explicitly asks it to, never on its own initiative/);
  assert.match(sc, /cannot push until a GitHub connection has been configured/);
  assert.match(sc, /never through local install to production/);
  assert.match(sc, /## Legacy model: Studio Source Control \(instance-bound\)/);
  assert.doesNotMatch(sc, /Local project folder is NOT a git working tree/);
  const install = skill('sn-build-install');
  assert.match(install, /\*\*Local Git \(recommended, default for SDK projects\):\*\*/);
  assert.match(install, /Do not commit on your own initiative — only when the user asks/);
});
