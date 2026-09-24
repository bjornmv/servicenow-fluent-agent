---
name: sn-explain
description: Look up the exact Fluent API/guide docs for a now-sdk record type before authoring it, and summarize required/optional fields + a minimal correct snippet. Use whenever about to create or edit ANY Fluent record (table, business rule, ACL, catalog item, scripted REST, SP page, etc.) or when unsure of a record type's Fluent shape.
argument-hint: <record type or topic, e.g. businessrule, table, service-catalog>
---
Look up the Fluent SDK docs for the requested type/topic and report how to author it correctly. Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md). The configured PowerShell function is not the blocked batch shim; do not replace it with per-command resolver scripts.

**Always pass `--format raw`** — `pretty` includes ANSI codes that waste tokens.

1. **Topic discovery first** when the topic name isn't 1:1 obvious. Hyphenation is inconsistent (`businessrule-api` vs `business-rule-guide`, `restapi-api` vs `scripted-rest-api-guide`):
   - `now-sdk explain --list <keyword>` — one-line per matching topic.
   - `now-sdk explain <topic> --peek --format raw` — one-line summary to pick among 2–3 candidates.
2. **`-api` always** — `now-sdk explain <topic>-api --format raw`. This is the data shape.
3. **`-guide` only when needed** — net-new records, complex composition (catalog items, flows, SP pages, scripted REST, security). Skip for "add another X to existing table" or simple edits.
4. **For tables** — run `*column-api` ONLY for non-trivial column types: `choicecolumn-api`, `referencecolumn-api`, `conditionscolumn-api`, `slushbucketcolumn-api`, `recordscolumn-api`, `documentidcolumn-api`, `overridecolumn-api`. Skip for trivial types (`StringColumn`, `IntegerColumn`, `BooleanColumn`, `DateTimeColumn`, `DecimalColumn`, `FloatColumn`, `UrlColumn`, `EmailColumn`, `HtmlColumn`, `JsonColumn`) — shape is obvious from name.

## Topic taxonomy

`<recordtype>-api` is the constructor/type reference (data shape). `<area>-guide` is the end-to-end pattern (workflow + composition). Common intents below; everything else → `explain --list <keyword>`.

| Intent | `-api` | `-guide` (only if net-new / complex) |
|---|---|---|
| Table + columns | `table-api` + per-column `*column-api` | `table-guide` |
| Business rule | `businessrule-api` | `business-rule-guide` |
| Client script | `clientscript-api` | `client-script-guide` |
| UI policy / UI action | `uipolicy-api`, `uiaction-api` | `platform-view-guide` |
| Script include | `scriptinclude-api` | `script-include-guide` |
| Scripted REST | `restapi-api` | `scripted-rest-api-guide` |
| Service Portal page / widget | `sppage-api`, `spwidget-api` | `service-portal-guide` |
| Flow | `flow-api` | `wfa-flow-guide` |
| Subflow | `subflow-api` | `wfa-subflow-guide` |
| Custom action | `custom-action-api` | `wfa-custom-action-guide` |
| ATF test / suite | `test-api`, `testsuite-api` | use the API examples; execution is separate via `cicd` |
| Scripted GraphQL | `graphqlapi-api` | `graphql-api-guide`, `security-guide` |
| Playbook | `playbook-api` | `playbook-guide` plus the relevant `playbook-*-guide` topics |
| UI Page | `uipage-api` | `ui-page-guide`; Vite/HMR also requires the official `react-ui-page-vite-sample` |
| Field style | `record-api` | `field-styles-guide` (`table: 'sys_ui_style'`) |
| Schedule entry | `record-api` | inspect the typed `cmn_schedule_span` table definition; use `explain --list schedule` for related topics |
| ACL / role | `acl-api`, `role-api` | `security-guide` |
| Catalog item / variables | `catalogitem-api`, `*variable-api` | `service-catalog-guide`, `service-catalog-variables-guide` |

### Foundational topics — read ONCE per project
Recur in every artifact, rarely change. Cache takeaways in `/memories/repo/`:
`fluent-overview`, `now-include-guide`, `now-ref-guide`, `now-attach-guide`, `keys-file`, `override-guide`, `data-helpers-guide`, `now-config-reference`.

Then summarize from the ACTUAL output (do NOT invent fields):
- Required fields/properties.
- Key optional fields worth knowing.
- Which syntax class applies: ordinary record, documented callback DSL, GraphQL imported-script form, or transformed/Fluent-locked automation.
- A minimal, correct `.now.ts` snippet for the current project scope from `now.config.json`. Ordinary record script bodies use `Now.include`; GraphQL prefers named imported server functions; documented `Test`, automation, and Playbook callbacks stay inline as SDK DSL. Apply primitive values, `{ label }` choices, matching Table exports, `SPPage.pageId`, stable `$id`s, and no unused bindings. Never use `new TestSuite()` or `new GraphQLApi()`. See [Fluent rules](../../instructions/fluent.instructions.md).

Keep it terse. Cite the exact topic name(s) you read. This is the primary doc tool — run it BEFORE authoring or editing any record.
