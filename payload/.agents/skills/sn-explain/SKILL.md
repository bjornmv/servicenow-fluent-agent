---
name: sn-explain
description: Use when researching a Fluent record type, column/variable type or SDK topic with now-sdk explain before authoring or editing it, or when an explain lookup fails or the project SDK lacks a topic; summarize exact documented fields and syntax without inventing API shapes.
argument-hint: <record type or topic, e.g. business rule, table, catalog item>
compatibility: ServiceNow Fluent project and its installed SDK documentation; now-sdk explain is a local read-only lookup through the approved SDK launcher and needs no instance access or authentication.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 and 4.11.2 `explain` runs (every topic named below, exit codes, `--list` / `--peek` output) and the typed-table file under "Schedule entry". 4.13.6 ships 13 topics the older one lacks (e.g. `databaseview-api`, `interceptor-api`); the project's installed SDK is authoritative.
Look up the Fluent SDK docs for the requested type/topic and report how to author it correctly. Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md). The configured PowerShell function is not the blocked batch shim; do not replace it with per-command resolver scripts.

**Always pass `--format raw`** — in a terminal `pretty` includes ANSI codes that waste tokens.

1. **Exact topic names only.** Pass `explain` a full topic name from the table below or from `--list`; hyphenation is inconsistent (`businessrule-api` vs `business-rule-guide`, `restapi-api` vs `scripted-rest-api-guide`). A bare keyword is not rejected: `explain table` prints `# Multiple matching topics for "table":` with one-line summaries (a candidate list, not documentation), and `explain schedule` prints the whole `sla-api` document, both with exit 0. Check that the first heading is the type you asked for. When the name is not in the table:
   - `now-sdk explain --list "<keyword>" --format raw` — `# Matching topics:` then `# Possibly related topics:`, one `name [tags]` line per topic. Quote multi-word keywords (unquoted, the second word fails as `Unknown command`) and prefer the spaced phrase to the hyphenated one: `--list "service catalog"` matches `catalogitem-api` and the variable APIs, `--list service-catalog` matches only flow-trigger topics. Never run `--list` without a keyword; the full list is about 260 topics.
   - `now-sdk explain <topic> --peek --format raw` — one-line summary to pick among 2–3 candidates.
2. **`-api` for the data shape** — `now-sdk explain <recordtype>-api --format raw`, using the exact name from the table or `--list`, not a guessed `<keyword>-api` (`service-catalog-api` does not exist; the topic is `catalogitem-api`). Types without a dedicated API (field style, schedule entry) use `record-api`; a few topics are reference-only (`keys-file`, `now-config-reference`).
3. **`-guide` only when needed** — net-new records, complex composition (catalog items, flows, SP pages, scripted REST, security). Skip for "add another X to existing table" or simple edits.
4. **For tables** — read `*column-api` for non-trivial column types: `choicecolumn-api`, `referencecolumn-api`, `conditionscolumn-api`, `slushbucketcolumn-api`, `recordscolumn-api`, `documentidcolumn-api`, `overridecolumn-api`. A separate lookup for a simple column is unnecessary only when the current `table-api` documentation already establishes its exact shape; never infer properties from a name.
5. **Report** — summarize from the ACTUAL output (do NOT invent fields):
   - Required fields/properties.
   - Key optional fields worth knowing.
   - Which syntax class applies: ordinary record, documented callback DSL, GraphQL imported-script form, or transformed/Fluent-locked automation.
   - A minimal, correct `.now.ts` snippet for the current project scope from `now.config.json`. Ordinary record script bodies use `Now.include` or, where the API's `script` accepts a function, a named function imported from a server module (follow the project's existing form); GraphQL prefers named imported server functions; documented `Test`, automation, and Playbook callbacks stay inline as SDK DSL. Apply primitive values, `{ label }` choices, matching Table exports, `SPPage.pageId`, stable `$id`s, and no unused bindings. Never use `new TestSuite()` or `new GraphQLApi()`. See [Fluent rules](../../instructions/fluent.instructions.md).

For authorized record creation, continue with [sn-add-record](../sn-add-record/SKILL.md), which owns the shared author/build workflow and table/business-rule traps. Keep GraphQL, Playbook, ATF suite and Vite UI Page authoring in their specialized skills. This lookup skill does not itself authorize source edits or deployment.

## Missing topic or older SDK — stop branch

Other skills point here when an `explain` lookup does not return the documentation they name.

1. **Recognize the miss.** An unknown topic prints `[now-sdk] ERROR: No matching topics for "<name>"` and exits 1. `--list` with no hit prints `# No matches found.` and exits 0. A `# Multiple matching topics` list or a document whose heading is a different type is also a miss. None of these is documentation; never summarize or author from them. A launcher or terminal error (function not found, no exit status) is not a missing topic: the result is UNKNOWN, follow the SDK command policy.
2. **One bounded rediscovery.** Ignore the error's hint to run bare `now-sdk explain --list`. Run `now-sdk explain --list "<keyword>" --format raw` with the spaced phrase, then at most once more with a single distinctive word, and read the exact topic it names.
3. **Still missing: the SDK that ran does not document it.** The launcher prefers the project-local SDK, and topic sets grow between releases. Run `now-sdk --version`, then STOP authoring that type and report the topic name, the keywords tried and the SDK version. Do not write the shape from memory, from another SDK version's docs, from a sibling type, or from type/constructor names.
4. **Offer, do not choose:** (a) an SDK upgrade, which needs explicit scope/version approval (a global upgrade does not change a project pin; see the SDK command policy and the **sn-update-advisor** skill); (b) the generic `Record()` form, only after reading `record-api` and with field names taken from evidence such as an authorized read-only dictionary lookup through the **sn-rest** skill, stated as a fallback without the dedicated API's type safety; (c) leaving the record out of scope. [sn-doc-lookup](../sn-doc-lookup/SKILL.md) answers product-behaviour questions; it is not a source for Fluent field shapes.

## Topic taxonomy

`<recordtype>-api` is the constructor/type reference (data shape). `<area>-guide` is the end-to-end pattern (workflow + composition). Common intents below; everything else → `now-sdk explain --list "<keyword>" --format raw`. Names with `*` are shorthand, not runnable topics; expand them with the `--list` keyword shown.

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
| ATF test / suite | `test-api`, `testsuite-api` | `atf-guide` (`atf-ui-test-script-guide` for custom UI steps); suites → [sn-add-test-suite](../sn-add-test-suite/SKILL.md); execution is separate and approval-gated → [sn-cicd](../sn-cicd/SKILL.md) |
| Scripted GraphQL | `graphqlapi-api` | `graphql-api-guide` (has its own security model section); ACL shape (`type: 'graphql'`) is in `acl-api` |
| Playbook | `playbook-api` | `playbook-guide` plus the relevant `playbook-*-guide` topics (`--list playbook`) |
| UI Page | `uipage-api` | `ui-page-guide`, `ui-page-patterns-guide`, `ui-page-theming-guide`; for Vite/HMR follow [sn-ui-page-vite](../sn-ui-page-vite/SKILL.md) (its sample is a GitHub directory, not an explain topic, and that skill, not the guide's no-build-config rule, governs the Vite setup) |
| Field style | `record-api` | `field-styles-guide` (`table: 'sys_ui_style'`) |
| Schedule entry | `record-api` (`table: 'cmn_schedule_span'`) | no topic; field names are in the SDK's typed table file `node_modules/@servicenow/sdk-core/dist/fluent/tables/cmn_schedule_span.now.d.ts` (or nested under `node_modules/@servicenow/sdk/node_modules/`). Read that one file; do not search |
| ACL / role | `acl-api`, `role-api` | `security-guide` |
| Catalog item / variables | `catalogitem-api`, `*variable-api` (`--list variable`) | `service-catalog-guide`, `service-catalog-variables-guide` |

### Foundational topics — read when the task first touches them
These topics recur across artifacts; they are not a prerequisite for every lookup. Read one the first time the task needs it (`--peek` is the cheap relevance check). Cache verified takeaways with the project and SDK version in an available workspace memory/evidence facility, or keep them in the conversation if none exists. Recheck when the SDK version or relevant evidence changes:

- `fluent-overview` — first Fluent work in a project.
- `now-include-guide` — a record field filled from a file with `Now.include()`.
- `now-ref-guide` — a field pointing at a record not defined in the current file.
- `now-attach-guide` — image attachments on a record.
- `keys-file` — `Now.ID` keys and the generated `keys.ts`.
- `override-guide` — setting a field the typed API does not expose (`$override`).
- `data-helpers-guide` — typed values in `Record()` data fields.
- `now-config-reference` — `now.config.json` settings.

Topic sets grow between SDK releases; after an SDK version change, run one keyword `--list` for the area you are working on and prefer a newer topic it shows.

Keep it terse. Cite the exact topic name(s) you read. This is the primary Fluent API doc tool — run it BEFORE authoring or editing any record; general product documentation questions go to sn-doc-lookup.
