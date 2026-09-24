---
name: sn-add-playbook
description: Author or enhance now-sdk 4.11 PlaybookDefinition DSL with triggers, lanes, permissions, optional/manual activities, outputs, and agentic controls.
argument-hint: <record-driven/on-demand playbook + stages/activities/permissions>
---
Author a Playbook with the documented `PlaybookDefinition(...)` and `wfa.playbook.*` DSL. Its callbacks are valid Fluent construction syntax; do not externalize them with `Now.include`.

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

## Explain first

Read the exact API plus only the guides needed for the requested feature:

```powershell
now-sdk explain playbook-api --format raw
now-sdk explain --list playbook
```

Typical guides: `playbook-guide`, `playbook-activities-guide`, `playbook-permissions-guide`, `playbook-triggers-guide`, lanes/patterns/anti-patterns guides. Inspect the specific built-in activity definition and its backing flow/action/activity type before setting inputs or experience properties; never infer one activity's fields from another.

## SDK 4.11 guardrails

- Record-driven playbooks require the second argument with `triggers`, even when `{ triggers: [] }`.
- On-demand playbooks use `executionType: 'on_demand'`: omit triggers entirely, omit `parentTable`, never use `params.parentRecord`, and grant `launch: true` to at least one permission set.
- Playbook permissions use the documented callback; lane permissions use `config.permissions`. Grant least privilege. Do not broaden users, groups, roles, or criteria merely to make runtime access succeed.
- Optional activities use `wfa.playbook.run.Manually()`, no `order`, no `conditionToRun`, no delay, and `restartRule: 'RUN_ONLY_ONCE'`. Nothing may depend on or read a pill from an optional activity.
- Declare inputs/outputs with the exact Column types. `SetPlaybookOutputs.playbook_outputs` keys must exactly match declared output element names. Do not emit secrets or unnecessary PII.
- Input-dependent types are intentional. Choose the table/dependency first and let TypeScript constrain records/fields; never bypass with `any`, unsafe casts, or fabricated fields.
- Agentic fields are available only on activity definitions that opt in. Confirm the target has the required plugin/property. Obtain explicit approval before enabling Autonomous mode or actions that update/create records or mark work complete. Restrict supported actions and run-as roles.
- Optional/manual human gates must stay human-controlled; never auto-complete, bypass, or silently reassign them.

Activities and lanes must be declared before references and returned with explicit `key: value` object entries as the guide requires. Use stage-level Decisions only in the documented lanes-body position. Use data pills for runtime values.

Run `now-sdk build`, then **sn-build-install** if deployment is requested. After deployment, existing running playbook instances do not automatically adopt changes; report the Designer reactivation requirement instead of claiming runtime rollout is complete.
