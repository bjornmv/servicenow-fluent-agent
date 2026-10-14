# Advanced playbook features

Read when the playbook uses variants, `publicAccess`, Go Back loops, agentic fields, `actionOverrides`, branch `isIdealPath` or a non-default `schemaVersion`. Older SDKs lack variants, `publicAccess` and Go Back; confirm `playbook-api` documents the feature first.

## Target-version gates

`publicAccess`, Go Back, `actionOverrides` and branch `isIdealPath` each need a minimum `sn_pa_designer` store-app version named in `playbook-api`, and `schemaVersion` above the default needs a target that accepts it. The SDK does not validate these and a build succeeds either way: confirm the target through [sn-rest](../../sn-rest/SKILL.md) or the user before relying on them.

## Variants

- Declare a `variants: (params) => ({...})` callback in the second argument with `wfa.playbook.variant({...})`.
- Each variant needs a `condition`, and the playbook needs `parentTable`.
- Reference one only as `params.variants.<name>`.
- An activity sets either `variant` or `variantOverrides`, never both.

## Public access

`publicAccess: true` exposes the playbook to unauthenticated users on public pages. Set it only with explicit approval, never to work around a permission problem.

- Requires `parentTable`.
- Use only activity definitions that themselves declare `publicAccess: true` (read the definition file).
- No activity may set `enableAiAgent: true`.
- The flag alone publishes nothing: the public page and guest access are configured outside Fluent. Report them as outstanding and do not widen guest access yourself.

## Go Back loops

- Use `ActivityDefinitions.Core.GoBack` only as the last activity of a `match_first` decision branch, never targeting an optional activity.
- Keep at least one branch that does not end in Go Back.
- Give the target `restartRule: 'RUN_ALWAYS'` (for `start_of_playbook`, `restartable: 'RESTARTABLE_TRUE'` on the playbook); otherwise the build only warns and the target is skipped on the jump back.
- Confirm with the user how the loop exits; never loop back past a human gate to skip it.

## Agentic fields

- Available only on activity definitions that opt in.
- They take effect only when the target has the `sn_genai_platform` store app and `sn_pa_designer.enable_agentic_playbooks` set to `true`. The SDK checks neither and a clean build proves nothing, so confirm through [sn-rest](../../sn-rest/SKILL.md) or the user.
- Obtain explicit approval before enabling Autonomous mode or actions that update/create records or mark work complete.
- Restrict supported actions and run-as roles.
