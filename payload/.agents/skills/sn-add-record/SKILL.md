---
name: sn-add-record
description: Use when adding an ordinary Fluent record to a now-sdk project, including tables and business rules; look up the exact API first and load only the relevant type reference.
argument-hint: <record type, name, scope and required behavior>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; authoring and deployment require separate authorization.
metadata:
  version: '1'
---
# Add a Fluent record

This is the shared authoring workflow; [sn-explain](../sn-explain/SKILL.md) owns API discovery and documentation lookup. Metadata version describes the skill format, independently of the distribution or SDK version.

1. Read `now.config.json` and relevant existing source to confirm scope, layout and requested behavior. For records already on the instance, use [sn-transform](../sn-transform/SKILL.md), not a hand-authored replacement.
2. Follow **sn-explain** before editing: read the exact API from the project's SDK documentation and the guide when the record is new or composition is unfamiliar. Do not infer fields or reuse a cached summary without checking its SDK/project provenance. Documentation lookup is not authorization to install or upgrade the SDK.
3. Load only the matching reference:
   - Table/columns: [table](references/table.md).
   - BusinessRule: [business-rule](references/business-rule.md).
   - Other ordinary records: use their actual API/guide output; do not generalize the table/BR examples into an invented API.
   - GraphQL: switch to [sn-add-graphql-api](../sn-add-graphql-api/SKILL.md).
   - Playbook: switch to [sn-add-playbook](../sn-add-playbook/SKILL.md).
   - ATF suite: switch to [sn-add-test-suite](../sn-add-test-suite/SKILL.md).
4. Author only the requested record and required external scripts in the project's hand-authored layout. Leave round-tripped files under `src/fluent/generated/`. Apply the [Fluent rules](../../instructions/fluent.instructions.md): primitives, documented identity/export rules, no unused bindings, and ordinary runtime scripts externalized through the API-supported form (usually `Now.include`). Do not externalize documented DSL callbacks.
5. When execution is authorized, build with the approved [SDK command policy](../../reference/sdk-commands.md): `now-sdk build` in VS Code PowerShell, or `now_sdk` with the project `cwd` in Pi. Require attributable output and native completion; unknown completion is not success or permission to queue another build. Use [sn-fix-build](../sn-fix-build/SKILL.md) for actual compile errors.
6. Report source changes and build evidence separately. Do not install directly from this skill. For requested deployment, use [sn-build-install](../sn-build-install/SKILL.md), including its flow/action scan, approval and content-verification gates.
