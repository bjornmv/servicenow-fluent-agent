---
name: sn-rest
description: Use when discovering ServiceNow schemas, reading bounded records or aggregates, or verifying instance content with existing OAuth; writes require explicit user approval.
argument-hint: <confirmed instance, alias, table or API, fields, filters and read/write intent>
compatibility: VS Code terminal with Node.js, the bundled sn-rest.js helper and an existing SDK OAuth alias.
metadata:
  version: '1'
---
# ServiceNow schema and REST

**This is a skill, not a registered VS Code tool.** Read these instructions, then invoke the bundled `sn-rest.js` CLI with Node through the approved VS Code terminal. Do not search for a native integration named after this skill, install an extension, or report REST unavailable merely because no dedicated tool exists. The helper reuses the SDK's existing OAuth credentials; do not inspect credential storage, print tokens, use raw-token debug modes or implement another OAuth client.

## Execute one small request

Confirm the instance and alias from the user's task and current project facts. Do not change aliases or probe authentication as routine discovery. Use the confirmed project directory for local SDK dependency resolution; follow the [SDK command policy](../../reference/sdk-commands.md). A new terminal call must not depend on variables assigned in an earlier call. Replace every placeholder before running this example:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_app?sysparm_fields=sys_id,name,scope&sysparm_query=ORDERBYsys_id&sysparm_limit=10&sysparm_no_count=true"
```

Run a simple read directly, not through an execution subagent just to launch Node. Capture actual native completion and response; tool status `ok` or a subagent's assertion is not native exit evidence. Blank output without attributable native completion, or delayed, unrelated or truncated output, is UNKNOWN, not an empty result. Recover the original output using terminal/file read tools; do not blindly repeat the query or feed more commands into a suspect terminal. Do not reconstruct hard-wrapped JSON or identifiers from guesses.

`--agent` envelopes JSON responses: Table API results normally have `ok`, `count`, `hasMore`, `nextOffset` and `records`; other APIs may use `result` instead. Successful non-JSON or empty bodies are printed unchanged. Blank output alone proves neither failure nor success. For an approved bodyless DELETE, capture native completion and verify the target with a separate narrow GET; never retry solely because the output is blank. Check the actual envelope, HTTP errors and native exit before interpreting records. Preserve response excerpts, pagination and completion evidence if delegation is genuinely needed.

## Discover → inspect → read → aggregate

1. If the table is uncertain, query `sys_db_object` by name or label with a small projection and limit. Never guess more tables after an unexpected result.
2. Inspect fields in `sys_dictionary`, following `super_class.name` through the parent tables. Consult `sys_choice` only for requested fields. Missing metadata means **not found or not readable**, not proven absence. [Schema and aggregate recipes](references/queries.md) contain the exact API paths.
3. Read 1–10 rows with explicit `sysparm_fields`, a confirmed filter and stable `ORDERBYsys_id` inside `sysparm_query`. URL-encode query values; equality is `=`, not literal `IS`. Use `ISEMPTY`/`ISNOTEMPTY` only as actual operators. Do not use JavaScript queries. Reject embedded encoded-query operators in user-supplied values instead of blindly interpolating them.
4. Use `sys_scope.scope=<scope-string>` only after confirming that reference dotwalk. Direct reference filters such as `sys_scope=<sys-id>` require verified sys_ids. Do not confuse scope strings with reference IDs.
5. Use the Stats API for totals/grouped counts rather than fetching hundreds of records. After two unexpected results, stop bulk calls; inspect metadata and one small known-record control. Do not silently broaden to Global.

## Bounds and pagination — actual CLI behavior

The helper is a lower-level HTTP CLI. It **does not automatically validate fields/filters, impose the preview budgets below, or prompt for write approval**. The agent must apply these gates. `schema.cjs` and `output.cjs` are reusable libraries, not callable tools, and are not automatically applied by `sn-rest.js`.

- Request explicit fields and `sysparm_limit=10` (at most 20 for a normal preview). Select long script/HTML/journal fields only when needed; narrow the record/filter first. Do not request whole records or unbounded exports.
- Aim for at most 8,000 output characters per request, 16,000 per batch and 48,000 per task. These are workflow budgets, not CLI-enforced truncation. If output is oversized/incomplete, stop and narrow the request; do not treat it as complete or automatically export everything to disk.
- Table `count` is returned page rows, not the table total. Continue deliberately with `sysparm_offset=<nextOffset>`, the same filter/fields/order and a bounded limit while `hasMore` is true. A full page with `sysparm_no_count=true` can infer another page even when the next one will be empty. With mutable/ACL-filtered data, deduplicate sys_ids and disclose uncertainty.
- An app missing from one page or a filtered/ACL-limited result is **not proof it is uninstalled or inactive**. Never call an inventory complete until pagination and visibility limits are accounted for.
- Stats output is not ordinary table pagination. Do not assume `sysparm_limit` bounds groups or that `sysparm_offset` pages them. Narrow grouping/filters if needed; do not claim all groups were returned without evidence.

## Application contributor evidence

List visible `sys_app` records with `sys_id,name,scope`, following pagination. For the confirmed scoped apps, group `sys_metadata` by `sys_scope,sys_updated_by`, filtered to their collected sys_ids; see the [Stats recipe](references/queries.md#stats-and-contributors). Keep Global separate: its shared scope cannot identify a particular global application's files.

These counts describe **current records by last updater**, not edit totals, assigned owners or people currently working. Preserve account identifiers literally; do not merge accounts, equate accounts with people or infer which is the user. Apply an explicit verified date filter before calling evidence recent. No visible metadata means no visible evidence, not no contributors.

## Writes and authentication

GET is the default. POST/PATCH/PUT/DELETE require explicit user intent and approval of the exact confirmed target and change immediately before execution in the interactive parent. The CLI itself does not ask for confirmation. Do not delegate writes to a headless child, reroute a refused operation, or infer approval from permission to inspect records. For an approved write, use the helper's `--method` and `--body-file "<reviewed-absolute-json-file>"`; verify the resulting content with a separate narrow GET. Do not retry an uncertain write without checking the original outcome.

For an authentication error, stop and use [sn-auth](../sn-auth/SKILL.md) in the interactive parent. A missing skill/tool search result is not an auth error. Never use `--raw` or `--dump`, print credentials, or follow diagnostic suggestions to expose token storage.

## Maintenance

Start a **new VS Code agent chat** after updating installed skills/instructions; an existing chat may retain old guidance. No tool registration or extension reload is required. Development tests live in the distribution repository, not the installed skill: `node --test tools/test/sn-rest/schema.test.cjs tools/test/sn-rest/output.test.cjs`. Offline tests do not prove live terminal, OAuth or instance acceptance.
