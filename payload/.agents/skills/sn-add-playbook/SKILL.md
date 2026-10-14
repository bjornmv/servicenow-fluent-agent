---
name: sn-add-playbook
description: Authors ServiceNow Playbooks in Fluent. Use when creating or changing a playbook; not Flows or Subflows (sn-add-record).
argument-hint: <record-driven/on-demand playbook + stages/activities/permissions>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; target playbook capabilities must be confirmed.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 bundled docs and local `now-sdk build` output; not installed on an instance.

Author a Playbook with the documented `PlaybookDefinition(...)` and `wfa.playbook.*` DSL; its callbacks are Fluent construction syntax, so do not externalize them with `Now.include`. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md). Scope/layout check, placement outside the generated directory and reporting follow [sn-add-record](../sn-add-record/SKILL.md). To enhance, edit the existing `PlaybookDefinition` source; a playbook that exists only on the instance starts with [sn-transform](../sn-transform/SKILL.md).

## Explain first

```powershell
now-sdk explain playbook-api --format raw
now-sdk explain --list playbook --format raw
```

Then read only the listed playbook guides the feature needs. Read `playbook-unsupported-features-guide` for a Questionnaire or other non-Core activity, a custom process type or an existing instance playbook; its "on demand is not supported" sentence is about trigger types, not `executionType: 'on_demand'`.

The project's SDK output is authoritative; if it contradicts a guardrail below, follow the output and say so. If `explain playbook-api` fails with `No matching topics` (non-zero exit), or does not document the requested feature, that SDK cannot build it: stop, report the project SDK version and offer [sn-update-advisor](../sn-update-advisor/SKILL.md) for a separately approved upgrade. Do not author from another SDK's docs.

Before setting an activity's inputs or experience properties, inspect its built-in activity definition and backing flow/action/activity type; never infer one activity's fields from another. The guides cite `src/api/playbook/built-ins/`, which is not installed; the files are in the `@servicenow/sdk-core` package that `@servicenow/sdk` depends on (nested under `@servicenow/sdk/node_modules/` or beside it), under `src/external/playbook/playbook/built-ins/` (`activity-definitions/`, `backing-flows/`, `backing-actions/`, `activity-types/`, `trigger-types/`). Resolve that package from the SDK the launcher uses; do not search the disk.

## Guardrails

- `PlaybookDefinition(config, second, body)` always takes three arguments. Record-driven playbooks require `triggers` in the second argument, even `{ triggers: [] }`.
- On-demand: `executionType: 'on_demand'`; keep the second argument but omit `triggers` entirely (not even `[]`); omit `parentTable`; never use `params.parentRecord`; grant `view: true` plus `launch: true` in at least one permission set. `launcherShowRecordForm`, `launcherRecordFormView`, `launcherTemplateFields`, `publicAccess` and variants are unavailable; `allowAsNested: true` is legal only here.
- Playbook permissions are a `permissions` callback in the second argument; every set needs `view: true` before any other flag takes effect (a build error otherwise). Lane permissions are a plain object on the lane's `config.permissions`. Grant least privilege; do not broaden users, groups, roles or criteria to make runtime access succeed.
- Lane and activity configs both need `startRule` and `restartRule` (several guide examples omit `restartRule` and fail to compile as written).
- `name` is the stable identity of the playbook and each activity; omitted, it is derived from `label`, and a changed `name` creates a new record. Set explicit names on the playbook, lanes and activities at first authoring; never change them after deployment.
- Optional activities: `wfa.playbook.run.Manually()`, `restartRule: 'RUN_ONLY_ONCE'`, and no `order`, `conditionToRun`, delay, `variant` or `variantOverrides`. Nothing may depend on or read a pill from one.
- Declare inputs/outputs with exact Column types. `SetPlaybookOutputs.playbook_outputs` keys must exactly match declared output names. `launcherInputs` values for non-reference inputs are strings (`'true'`, `'3'`) even for Boolean/Integer inputs. Do not emit secrets or unnecessary PII.
- A `mandatory: true` input or experience property of a built-in activity must resolve to a non-empty value at build time: omit it to take the definition default, or pass a real value or data pill, never `''`.
- Choose the table/dependency first and let TypeScript constrain records/fields; never bypass with `any`, unsafe casts or fabricated fields.
- Declare activities and lanes before referencing them, and return them as explicit `key: value` entries. "Lane" and "stage" are the same; a stage-level Decision is a Decision activity returned from the `lanes` body beside the lanes, valid only there. Use data pills for runtime values.
- Optional/manual human gates must stay human-controlled; never auto-complete, bypass or silently reassign them.

Read [references/minimal-shape.md](references/minimal-shape.md) when the project has no `PlaybookDefinition` to copy.

## Advanced features and stops

Read [references/advanced-features.md](references/advanced-features.md) before using variants, `publicAccess`, Go Back, agentic fields, `actionOverrides`, branch `isIdealPath` or a non-default `schemaVersion`. The SDK does not validate their target-version requirements; confirm the target through [sn-rest](../sn-rest/SKILL.md) or the user.

- Set `publicAccess: true` only with explicit approval, never to work around a permission problem.
- Obtain explicit approval before enabling Autonomous mode or agentic actions that update/create records or mark work complete.
- For a Go Back loop, confirm with the user how it exits; never loop back past a human gate.
- A custom process type or a playbook with `schema_version` below 3 cannot be expressed in Fluent: stop and report that it must be handled in Workflow Studio.
- Questionnaire and other non-Core activities can only be scaffolded with `ActivityDefinitions.Core.Placeholder`; do that only when the user agrees, and report what remains to replace in Workflow Studio.
- If transform returns Record API output instead of `PlaybookDefinition(...)`, do not hand-convert it.

## Build and hand-off

Run `now-sdk build`. Success is exit status 0 plus `Build completed successfully`; `Playbook "<label>" built. ...` also appears in failed builds, so it is not evidence. Compile errors go to [sn-fix-build](../sn-fix-build/SKILL.md). Use [sn-build-install](../sn-build-install/SKILL.md) if deployment is requested.

Build and install never activate a playbook. It is emitted with `status` draft: a new playbook does not run, and changes to an existing one do not take effect, until someone activates it in Playbook Designer (Workflow Studio). After deployment, read the `sys_pd_process_definition` record and its `status` through [sn-rest](../sn-rest/SKILL.md) and report activation as an outstanding manual step; do not claim runtime rollout is complete.
