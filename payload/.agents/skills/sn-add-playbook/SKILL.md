---
name: sn-add-playbook
description: Authors ServiceNow Playbooks in Fluent. Use when creating or changing a playbook; not Flows or Subflows (sn-add-record).
argument-hint: <record-driven/on-demand playbook + stages/activities/permissions>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; target playbook capabilities must be confirmed.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 bundled docs (`playbook-api` and the `playbook-*-guide` topics) and local `now-sdk build` output for the shape and guardrails below; variants, `publicAccess` and `ActivityDefinitions.Core.GoBack` did not compile on now-sdk 4.11.2. Nothing was installed on an instance. On another SDK version the project's own `explain` output is authoritative.

Author a Playbook with the documented `PlaybookDefinition(...)` and `wfa.playbook.*` DSL. Its callbacks are valid Fluent construction syntax; do not externalize them with `Now.include`.

Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md). The scope/layout check, placement outside the generated directory and reporting follow the shared workflow in [sn-add-record](../sn-add-record/SKILL.md). When enhancing, edit the existing `PlaybookDefinition` source; a playbook that exists only on the instance starts with [sn-transform](../sn-transform/SKILL.md).

## Explain first

Read the exact API plus only the guides needed for the requested feature:

```powershell
now-sdk explain playbook-api --format raw
now-sdk explain --list playbook --format raw
```

Use the project's installed SDK output as authoritative; if it contradicts a guardrail below, follow the output and say so. If `explain playbook-api` fails with `No matching topics` (non-zero exit), the project SDK has no Playbook DSL; if the topic exists but does not document the requested feature (variants, `publicAccess` and Go Back are absent from older SDKs), that SDK cannot build it. In either case stop, report the project SDK version and offer [sn-update-advisor](../sn-update-advisor/SKILL.md) for a separately approved upgrade. Do not author from another SDK's docs.

Typical guides: `playbook-guide`, `playbook-activities-guide`, `playbook-permissions-guide`, `playbook-triggers-guide`, `playbook-datapills-guide`, `playbook-lanes-guide`, `playbook-patterns-guide`, `playbook-anti-patterns-guide`. Read `playbook-unsupported-features-guide` when the request involves a Questionnaire or other non-Core activity, a custom process type or an existing instance playbook; its "on demand is not supported" sentence is about trigger types, not `executionType: 'on_demand'`.

Inspect the specific built-in activity definition and its backing flow/action/activity type before setting inputs or experience properties; never infer one activity's fields from another. The guides cite `src/api/playbook/built-ins/`, which is not in the installed package. The files are in the `@servicenow/sdk-core` package that `@servicenow/sdk` depends on (nested under `@servicenow/sdk/node_modules/` or beside it), under `src/external/playbook/playbook/built-ins/`: `activity-definitions/`, `backing-flows/`, `backing-actions/`, `activity-types/`, `trigger-types/`. Resolve that package from the SDK the launcher uses; do not search the disk.

## Playbook guardrails

- `PlaybookDefinition(config, second, body)` always takes three arguments. Record-driven playbooks require `triggers` in the second argument, even when `{ triggers: [] }`.
- On-demand playbooks use `executionType: 'on_demand'`: keep the second argument but omit `triggers` entirely (not even `[]`), omit `parentTable`, never use `params.parentRecord`, and grant `view: true` plus `launch: true` in at least one permission set. `launcherShowRecordForm`, `launcherRecordFormView`, `launcherTemplateFields`, `publicAccess` and variants are not available; `allowAsNested: true` is legal only here.
- Playbook permissions are a `permissions` callback in the second argument, and every set needs `view: true` before any other flag takes effect (a build error otherwise); lane permissions are a plain object on the lane's `config.permissions`. Grant least privilege. Do not broaden users, groups, roles, or criteria merely to make runtime access succeed.
- Lane and activity configs both need `startRule` and `restartRule`; several guide examples omit `restartRule` and fail to compile as written.
- `name` is the stable identity of the playbook and of each activity; when omitted it is derived from `label`, and a changed `name` is treated as a new record rather than an update. Set an explicit `name` on the playbook, lanes and activities at first authoring and do not change it after deployment.
- Optional activities use `wfa.playbook.run.Manually()`, no `order`, no `conditionToRun`, no delay, no `variant`/`variantOverrides`, and `restartRule: 'RUN_ONLY_ONCE'`. Nothing may depend on or read a pill from an optional activity.
- Declare inputs/outputs with the exact Column types. `SetPlaybookOutputs.playbook_outputs` keys must exactly match declared output element names. `launcherInputs` values for non-reference inputs are strings (`'true'`, `'3'`) even for Boolean/Integer inputs; this is the documented exception to the primitive rule. Do not emit secrets or unnecessary PII.
- A `mandatory: true` input or experience property of a built-in activity must resolve to a non-empty value at build time: omit the property to take the definition default, or pass a real value or data pill, never `''`.
- Input-dependent types are intentional. Choose the table/dependency first and let TypeScript constrain records/fields; never bypass with `any`, unsafe casts, or fabricated fields.
- Variants are declared as a `variants: (params) => ({...})` callback in the second argument with `wfa.playbook.variant({...})`; each needs a `condition`, and the playbook needs `parentTable`. Reference one only as `params.variants.<name>`. An activity sets either `variant` or `variantOverrides`, never both.
- `publicAccess: true` exposes the playbook to unauthenticated users on public pages: set it only with explicit approval, never to work around a permission problem. It requires `parentTable`, only activity definitions that themselves declare `publicAccess: true` (read the definition file), and no activity with `enableAiAgent: true`. The flag alone does not publish anything; the public page and guest access are configured outside Fluent, so report them as outstanding and do not widen guest access yourself.
- Loops use `ActivityDefinitions.Core.GoBack` only as the last activity of a `match_first` decision branch, never targeting an optional activity, with at least one branch that does not end in Go Back. Give the target `restartRule: 'RUN_ALWAYS'` (for `start_of_playbook`, `restartable: 'RESTARTABLE_TRUE'` on the playbook); otherwise the build only warns and the target is skipped on the jump back. Confirm with the user how the loop exits; never loop back past a human gate to skip it.
- Agentic fields are available only on activity definitions that opt in. They take effect only when the target has the `sn_genai_platform` store app and `sn_pa_designer.enable_agentic_playbooks` set to `true`; the SDK checks neither and a clean build proves nothing, so confirm through [sn-rest](../sn-rest/SKILL.md) or the user. Obtain explicit approval before enabling Autonomous mode or actions that update/create records or mark work complete. Restrict supported actions and run-as roles.
- Target-version gates the SDK does not validate: `publicAccess`, Go Back, `actionOverrides` and branch `isIdealPath` each need a minimum `sn_pa_designer` store-app version named in `playbook-api`, and `schemaVersion` above the default needs a target that accepts it. Confirm the target through [sn-rest](../sn-rest/SKILL.md) or the user before relying on them; a build succeeds either way.
- Optional/manual human gates must stay human-controlled; never auto-complete, bypass, or silently reassign them.
- Fluent cannot express a custom process type or a playbook with `schema_version` below 3: stop and report that it must be handled in Workflow Studio. Questionnaire and other non-Core activities can only be scaffolded with `ActivityDefinitions.Core.Placeholder`; do that only when the user agrees, and report what remains to be replaced in Workflow Studio. If transform returns Record API output instead of `PlaybookDefinition(...)`, do not hand-convert it.

Activities and lanes must be declared before references and returned with explicit `key: value` object entries as the guide requires. "Lane" and "stage" are the same thing; a stage-level Decision is a Decision activity returned from the `lanes` body beside the lanes, and is valid only in that documented position. Use data pills for runtime values.

## Minimal shape

```typescript
import { ActivityDefinitions, PlaybookDefinition, wfa } from '@servicenow/sdk/automation'

PlaybookDefinition(
    { $id: Now.ID['intake_pb'], label: 'Intake', name: 'intake', parentTable: 'incident' },
    { triggers: [] },
    {
        lanes: () => {
            const review = wfa.playbook.lane({
                config: { $id: Now.ID['lane_review'], label: 'Review', name: 'review', order: 1, startRule: wfa.playbook.run.Immediately(), restartRule: 'RUN_ONLY_ONCE' },
                activities: () => {
                    const brief = wfa.playbook.activity(
                        ActivityDefinitions.Core.Instruction,
                        { $id: Now.ID['act_brief'], label: 'Brief', name: 'brief', order: 1, startRule: wfa.playbook.run.Immediately(), restartRule: 'RUN_ONLY_ONCE' },
                        { message: 'Review the record.' },
                    )
                    return { brief: brief }
                },
            })
            return { review: review }
        },
    },
)
```

For on-demand, the first argument drops `parentTable` and adds `executionType: 'on_demand'`, and the second becomes `{ permissions: () => ({ roles: [{ role: '<sys_user_role sys_id>', view: true, launch: true }] }) }`.

## Build and hand-off

Run `now-sdk build`. Success is exit status 0 plus `Build completed successfully`; the line `Playbook "<label>" built. ...` is also printed by builds that then fail, so it is not evidence. Compile errors go to [sn-fix-build](../sn-fix-build/SKILL.md). Use [sn-build-install](../sn-build-install/SKILL.md) if deployment is requested.

Build and install never activate a playbook. The build emits it with `status` draft: a new playbook does not execute until someone activates it in Playbook Designer (Workflow Studio), and changes to an existing one take effect at runtime only after it is activated again there. After deployment, read the `sys_pd_process_definition` record and its `status` through [sn-rest](../sn-rest/SKILL.md) and report activation as an outstanding manual step instead of claiming runtime rollout is complete.
