# Explain topic names

`<recordtype>-api` is the constructor/type reference (data shape). `<area>-guide` is the end-to-end pattern (workflow + composition). Anything not listed: `now-sdk explain --list "<keyword>" --format raw`. Names with `*` are shorthand, not runnable topics; expand them with the `--list` keyword shown.

| Intent | `-api` | `-guide` (only if net-new / complex) |
|---|---|---|
| Table + columns | `table-api` + per-column `*column-api` (`--list column`) | `table-guide` |
| Business rule | `businessrule-api` | `business-rule-guide` |
| Client script | `clientscript-api` | `client-script-guide` |
| UI policy / UI action | `uipolicy-api`, `uiaction-api` | `ui-policy-guide`, `ui-action-guide` |
| Script include | `scriptinclude-api` | `script-include-guide` |
| Scripted REST | `restapi-api` | `scripted-rest-api-guide` |
| Service Portal page / widget | `sppage-api`, `spwidget-api` | `service-portal-guide` |
| Flow | `flow-api`, plus `trigger-api`, `action-api`, `wfa-flow-logic-api`, `flow-stages-api` for the parts used | `wfa-flow-guide`; per-part guides via `--list wfa` |
| Subflow | `subflow-api` | `wfa-subflow-guide` |
| Custom action | `custom-action-api` | `wfa-custom-action-guide` |
| ATF test / suite | `test-api`, `testsuite-api` | `atf-guide` (`atf-ui-test-script-guide` for custom UI steps); suites → [sn-add-test-suite](../../sn-add-test-suite/SKILL.md); execution is separate and approval-gated → [sn-cicd](../../sn-cicd/SKILL.md) |
| Scripted GraphQL | `graphqlapi-api` | `graphql-api-guide` (has its own security model section); ACL shape (`type: 'graphql'`) is in `acl-api` |
| Playbook | `playbook-api` | `playbook-guide` plus the relevant `playbook-*-guide` topics (`--list playbook`) |
| UI Page | `uipage-api` | `ui-page-guide`, `ui-page-patterns-guide`, `ui-page-theming-guide`; for Vite/HMR follow [sn-ui-page-vite](../../sn-ui-page-vite/SKILL.md) (its sample is a GitHub directory, not an explain topic, and that skill, not the guide's no-build-config rule, governs the Vite setup) |
| Field style | `record-api` | `field-styles-guide` (`table: 'sys_ui_style'`) |
| Schedule entry | `record-api` (`table: 'cmn_schedule_span'`) | no topic; field names are in the SDK's typed table file `node_modules/@servicenow/sdk-core/dist/fluent/tables/cmn_schedule_span.now.d.ts` (or nested under `node_modules/@servicenow/sdk/node_modules/`). Read that one file; do not search |
| ACL / role | `acl-api`, `role-api` | `security-guide` |
| Catalog item / variables | `catalogitem-api`, `*variable-api` (`--list variable`) | `service-catalog-guide`, `service-catalog-variables-guide` |

Non-trivial column types: `choicecolumn-api`, `referencecolumn-api`, `conditionscolumn-api`, `slushbucketcolumn-api`, `recordscolumn-api`, `documentidcolumn-api`, `overridecolumn-api`.

Reference-only topics (no constructor): `keys-file`, `now-config-reference`.

## Foundational topics

Not a prerequisite for every lookup. Read one the first time the task needs it (`--peek` is the cheap relevance check):

- `fluent-overview` — first Fluent work in a project.
- `now-include-guide` — a record field filled from a file with `Now.include()`.
- `now-ref-guide` — a field pointing at a record not defined in the current file.
- `now-attach-guide` — image attachments on a record.
- `keys-file` — `Now.ID` keys and the generated `keys.ts`.
- `override-guide` — setting a field the typed API does not expose (`$override`).
- `data-helpers-guide` — typed values in `Record()` data fields.
- `now-config-reference` — `now.config.json` settings.

Cache verified takeaways with the project and SDK version in an available workspace memory/evidence facility, or keep them in the conversation if none exists. Recheck when the SDK version or relevant evidence changes.

## After an SDK version change

Topic sets grow between releases (4.13.6 ships 13 topics the older verified SDK lacks, e.g. `databaseview-api`, `interceptor-api`). Run one keyword `--list` for the area you are working on and prefer a newer topic it shows.

Return to [sn-explain](../SKILL.md).
