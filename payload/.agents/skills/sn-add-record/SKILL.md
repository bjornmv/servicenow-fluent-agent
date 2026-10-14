---
name: sn-add-record
description: Authors Fluent records such as tables, business rules, ACLs, UI actions, flows, single ATF tests and Service Portal widgets. Use when adding or editing one; not imports (sn-transform).
argument-hint: <record type, name, scope and required behavior>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; authoring and deployment require separate authorization.
metadata:
  version: '1'
---
# Add a Fluent record

Verified against: now-sdk 4.13.6 docs and local builds; nothing was installed on an instance. On another version the project's `explain` output wins.

1. **Confirm the project.** Read `now.config.json` (scope, `fluentDir`, `generatedDir`, `serverModulesDir`) and the relevant source to confirm the requested behavior. Note the version in `node_modules/@servicenow/sdk/package.json`; if that file is missing, read [missing project SDK](references/missing-project-sdk.md) before any other `now-sdk` command.
   - Importing an instance record, or instance-side edits to one in source: use [sn-transform](../sn-transform/SKILL.md). New records on existing tables (a rule on `incident`, `augments` columns) belong here.
2. **Look up the API** per [sn-explain](../sn-explain/SKILL.md): `now-sdk explain <recordtype>-api --format raw` with the exact topic name, plus the guide for a new record or unfamiliar composition. On a failed or wrong-type lookup, follow its missing-topic stop branch. Do not infer fields or reuse a cached summary without checking its SDK/project provenance. A lookup does not authorize installing or upgrading the SDK.
3. **Load the matching reference, or hand off:**
   - Table/columns: [table](references/table.md). BusinessRule: [business-rule](references/business-rule.md).
   - Other ordinary records (client script, ACL, UI action, ...): use their own API/guide output; do not generalize the table/BR examples.
   - Flow / Subflow / Action / single ATF `Test`: callback DSL. Classify per the [Fluent rules](../../instructions/fluent.instructions.md); for transformed automation apply [Automation ownership](../sn-build-install/SKILL.md#automation-ownership).
   - GraphQL → [sn-add-graphql-api](../sn-add-graphql-api/SKILL.md); Playbook → [sn-add-playbook](../sn-add-playbook/SKILL.md); ATF suite → [sn-add-test-suite](../sn-add-test-suite/SKILL.md); Vite/React UI Page → [sn-ui-page-vite](../sn-ui-page-vite/SKILL.md).
4. **Author** only the requested record and its required external scripts, next to existing hand-authored records of that kind. Leave transform output under the generated directory (default `src/fluent/generated/`). Apply the [Fluent rules](../../instructions/fluent.instructions.md); externalize ordinary runtime scripts (`Now.include`, or a named function imported from a server module where `script` accepts functions), never documented DSL callbacks. If the guide requires an unrequested companion record (such as a new table's default form view), neither add nor drop it silently; the matching reference says how to decide.
5. **Build** unless the user asked for source only or a terminal command is denied: `now-sdk build` in VS Code PowerShell from the confirmed project directory (project `cwd`), per the [SDK command policy](../../reference/sdk-commands.md). It writes only local output (`dist/`, `.now/`, keys file) and deploys nothing.
   - Success = attributable output with the `Build completed successfully` line and exit 0. Unknown completion is not success, nor permission to queue another build.
   - No build ran: report the record as UNBUILT. Compile errors: [sn-fix-build](../sn-fix-build/SKILL.md).
6. **Report** source changes and build evidence separately.
   - Keep the build's new IDs in generated `keys.ts` with the source change; do not edit or revert them.
   - A green build shows the source compiles, not that the record is correct: unknown table, field and role names in a business rule or ACL build without error. Confirm them from project source, the user or a bounded [sn-rest](../sn-rest/SKILL.md) read, never from the build.
   - Do not install directly from this skill. For requested deployment use [sn-build-install](../sn-build-install/SKILL.md) and its flow/action scan, approval and content-verification gates.
