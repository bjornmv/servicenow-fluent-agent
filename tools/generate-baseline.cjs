'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const agentPath = 'payload/.copilot/agents/ServiceNow Fluent.agent.md';
const baselinePath = 'payload/.agents/instructions/now-sdk-baseline.instructions.md';
const requiredSections = ['Priority order', 'Routing', 'Invariants', 'Approval gates'];

// Deliberately summarize, never copy whole agent sections: both files can load together.
// Keep this small fallback contract aligned with the agent via agent-policy tests.
function renderBaseline(agent) {
  for (const heading of requiredSections) {
    if (!agent.split(/\r?\n/).includes(`## ${heading}`)) throw new Error(`Missing canonical section: ${heading}`);
  }
  for (const term of ['VS Code Copilot', 'UNKNOWN', 'absolute project directory', 'unreviewed', 'credential', 'Approval gates']) {
    if (!agent.includes(term)) throw new Error(`Review baseline safety contract: missing ${term}`);
  }
  return `---
applyTo: "**/now.config.json,**/aiux.json,**/*.now.ts,**/metadata/**/*.xml"
description: "ServiceNow hard stops and references; complements the custom agent."
---
# ServiceNow safety baseline

These file instructions can load alongside the ServiceNow Fluent agent.

- Stop on policy denial or requests to expose credentials.
- Confirm the project, operation-specific target and required approval before mutations.
- Recover original evidence before retrying an operation with UNKNOWN completion.
- Hold deployment of unreviewed generated metadata until ownership is confirmed.
- Limit verification claims to stages actually checked.

Consult the task's skill for its procedure:
- [Command policy](../reference/sdk-commands.md) for permitted execution and recovery.
- [Fluent rules](fluent.instructions.md) and [sn-explain](../skills/sn-explain/SKILL.md) for authoring.
- [sn-build-install](../skills/sn-build-install/SKILL.md) for automation checks, deployment approvals and verification.
- [sn-rest](../skills/sn-rest/SKILL.md) for bounded instance reads.
`;
}
function generate(sourceRoot = root, check = false) {
  const expected = renderBaseline(fs.readFileSync(path.join(sourceRoot, agentPath), 'utf8'));
  const target = path.join(sourceRoot, baselinePath);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) throw new Error('Generated baseline is stale; run node tools/generate-baseline.cjs');
  } else fs.writeFileSync(target, expected);
  return expected;
}
module.exports = { generate, renderBaseline, requiredSections, agentPath, baselinePath };
if (require.main === module) {
  try { generate(root, process.argv.includes('--check')); console.log('Instruction baseline is current.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
