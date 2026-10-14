---
name: sn-add-record
description: Authors Fluent records such as tables, business rules, ACLs, UI actions, flows, single ATF tests and Service Portal widgets. Use when adding or editing one; not imports (sn-transform).
argument-hint: <record type, name, scope and required behavior>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; authoring and deployment require separate authorization.
metadata:
  version: '1'
---
# Add a Fluent record

Verified against: now-sdk 4.13.6 bundled docs (`table-api`, `table-guide`, `table-augments-guide`, `businessrule-api`, `business-rule-guide`, `module-guide`, `now-include-guide`, `keys-file`, `now-config-reference`) and local `now-sdk build` output for the shapes and error codes in this skill and its references; nothing was installed on an instance. On another SDK version the project's own `explain` output is authoritative.

This is the shared authoring workflow; [sn-explain](../sn-explain/SKILL.md) owns API discovery and documentation lookup.

1. Read `now.config.json` and relevant existing source to confirm scope, layout (including `fluentDir`, `generatedDir` and `serverModulesDir` when set) and requested behavior. Confirm `node_modules/@servicenow/sdk/package.json` exists in the project and note its version: without it the launcher serves the global SDK, so say so, do not treat that output as the project's, and resolve dependencies through the package-manager section of the [SDK command policy](../../reference/sdk-commands.md) before building (a build without them fails with TS2307 on `@servicenow/sdk/core`). To bring an existing instance record, or instance-side edits to a record already in source, into the project, use [sn-transform](../sn-transform/SKILL.md) rather than re-authoring it. New records that target existing tables (a rule on `incident`, columns added through `augments`) are authored here.
2. Follow [sn-explain](../sn-explain/SKILL.md) before editing: run `now-sdk explain <recordtype>-api --format raw` with the exact topic name, and the matching guide when the record is new or composition is unfamiliar. If the lookup fails or returns a different type, follow that skill's missing-topic stop branch. Do not infer fields or reuse a cached summary without checking its SDK/project provenance. Documentation lookup is not authorization to install or upgrade the SDK.
3. Load only the matching reference, or hand off:
   - Table/columns: [table](references/table.md).
   - BusinessRule: [business-rule](references/business-rule.md).
   - Other ordinary records (client script, script include, ACL, role, UI action, property, ...): use their actual API/guide output; do not generalize the table/BR examples into an invented API.
   - Flow / Subflow / Action / single ATF `Test`: documented callback DSL, not ordinary records. Classify per the [Fluent rules](../../instructions/fluent.instructions.md) first; for transformed automation apply [Automation ownership](../sn-build-install/SKILL.md#automation-ownership).
   - GraphQL: switch to [sn-add-graphql-api](../sn-add-graphql-api/SKILL.md).
   - Playbook: switch to [sn-add-playbook](../sn-add-playbook/SKILL.md).
   - ATF suite: switch to [sn-add-test-suite](../sn-add-test-suite/SKILL.md).
   - Vite/React UI Page: switch to [sn-ui-page-vite](../sn-ui-page-vite/SKILL.md).
4. Author only the requested record and required external scripts, next to the project's existing hand-authored records of the same kind. Do not relocate transform output: leave round-tripped files under the project's generated directory (default `src/fluent/generated/`). Apply the [Fluent rules](../../instructions/fluent.instructions.md): primitives, documented identity/export rules, no unused bindings, and ordinary runtime scripts externalized through the API-supported form (`Now.include`, or a named function imported from a server module where the API's `script` accepts functions). Do not externalize documented DSL callbacks. When the guide requires a companion record that was not requested (for example a default form view for a new table), neither add it silently nor drop it silently; the matching reference says how to decide.
5. Adding a record includes a local build unless the user asked for source only or a terminal command is denied. Build with the approved [SDK command policy](../../reference/sdk-commands.md): `now-sdk build` in VS Code PowerShell from the confirmed project directory (project `cwd`). It writes only local output (`dist/`, `.now/` and the generated keys file) and deploys nothing. Require attributable output and native completion (the `Build completed successfully` line with exit 0); unknown completion is not success or permission to queue another build. If no build ran, report the record as UNBUILT. Use [sn-fix-build](../sn-fix-build/SKILL.md) for actual compile errors.
6. Report source changes and build evidence separately. The build adds the new records' IDs to the generated `keys.ts`; keep that diff with the source change and do not edit or revert it. A green build shows that the source compiles, not that the record is correct: unknown table, field and role names in a business rule or ACL built without error. Confirm such names from project source, the user or a bounded [sn-rest](../sn-rest/SKILL.md) read, and do not cite the build as evidence for them. Do not install directly from this skill. For requested deployment, use [sn-build-install](../sn-build-install/SKILL.md), including its flow/action scan, approval and content-verification gates.
