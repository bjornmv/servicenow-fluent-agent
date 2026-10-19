---
name: sn-rest
description: Queries and changes live instance data over REST with existing OAuth. Use when reading schemas, records, counts or deployed content, or making an approved change; not app source (sn-add-record).
argument-hint: <confirmed instance, alias, table or API, fields, filters and read/write intent>
compatibility: Node.js 20+, sn-skill (else node "<user-profile>/.agents/tools/sn-skill.cjs"), an installed ServiceNow SDK and an existing SDK OAuth alias; on Linux a Secret Service credential store.
metadata:
  version: '1'
---
# ServiceNow schema and REST

**This is a skill, not a registered VS Code tool:** run `sn-skill rest` in the approved VS Code terminal. Do not search for a native integration named after this skill, install an extension, or report REST unavailable because no dedicated tool exists. The helper reuses the SDK's OAuth credentials; do not inspect credential storage, print tokens, use raw-token debug modes or implement another OAuth client.

## Run one small request

- Take the instance and alias from the user's task and project facts; if either is not stated, stop and ask. Do not change aliases or probe authentication as routine discovery.
- Always pass both `--alias` and `--instance`: without `--alias` the SDK default alias is used; `--instance` only confirms the alias's stored host, never overrides it.
- Pass the API path as exactly one single-quoted instance-relative argument starting with `/api/` (options may come before or after it), never a full URL, even when the user supplied one.
- Run from the confirmed project directory, whose `node_modules` supplies the SDK keyring dependency before the global SDK ([SDK command policy](../../reference/sdk-commands.md)). Do not depend on variables from an earlier terminal call.
- Run simple reads directly, not through an execution subagent. Never run the helper in parallel with another helper or SDK command: a request may refresh and store back the alias's OAuth token.

Replace every placeholder before running:

```
sn-skill rest --agent --alias '<confirmed-alias>' --instance 'https://<confirmed-host>' '/api/now/table/sys_app?sysparm_fields=sys_id,name,scope&sysparm_query=ORDERBYsys_id&sysparm_limit=10&sysparm_no_count=true'
```

## Read the result

- Exit 0: HTTP 2xx. Exit 1 with `ok:false` on stdout: HTTP error. Exit 1 with only stderr: token-refresh, network, keyring-load or credential-store failure; a write's outcome is then UNKNOWN. Exit 2: refused before sending; correct the command from confirmed facts, do not drop the flag or switch alias. The final stderr line `sn-skill: rest exit=<N>` is the native exit evidence; without it the helper did not complete (UNKNOWN).
- Table lists and grouped Stats come back as `ok`, `count`, `hasMore`, `nextOffset`, `records`; other JSON as `{ok:true,result:<body>}` (data at `result.result`); HTTP errors as `{ok:false,error:{status,statusText,body}}`. HTML from an `/api/` path is a failed request, not data. Read [CLI output](references/cli-output.md) when output does not match these shapes or exit 2 needs diagnosis.
- Content check (GET with `--agent` only): add `--expect-field <field> --expect-contains '<literal>'` to get `expect:{field,rows,present,contains}`; `present` is true only when exactly one row returned that field, and `contains` only when that field holds the literal (case-sensitive). `present:false` means UNKNOWN, not a mismatch. Exit codes still follow the HTTP result.
- Tool status `ok` or a subagent's assertion is not native exit evidence. Blank, delayed, unrelated or truncated output without attributable native completion is UNKNOWN, not an empty result. Recover the original output with terminal/file read tools; do not blindly repeat the query, feed commands into a suspect terminal, or reconstruct wrapped JSON or identifiers from guesses.

## Discover → inspect → read → aggregate

Read [query recipes](references/queries.md) for the exact paths before schema, paging, Stats or contributor requests.

1. If the table is uncertain, query `sys_db_object` by name or label with a small projection and limit. Never guess more tables after an unexpected result.
2. Inspect fields in `sys_dictionary`, following `super_class.name` through parent tables; `sys_choice` only for requested fields. Missing metadata means **not found or not readable**, not proven absence.
3. Read 1–10 rows with explicit `sysparm_fields`, a confirmed filter and `ORDERBYsys_id` inside `sysparm_query`. URL-encode values; equality is `=`, not literal `IS`; `ISEMPTY`/`ISNOTEMPTY` only as operators. No JavaScript queries. Reject encoded-query operators embedded in user-supplied values.
4. Filter `sys_scope.scope=<scope-string>` only after confirming that dotwalk; `sys_scope=<sys-id>` needs verified sys_ids.
5. Use the Stats API for totals and grouped counts. After two unexpected results, stop bulk calls; inspect metadata and one small known-record control. Do not silently broaden to Global.

## Bounds

The helper **does not automatically validate fields/filters, impose the preview budgets below, or prompt for write approval**; the agent applies these gates. Do not call `schema.cjs` or `output.cjs` or write wrappers around them.

- Explicit fields and `sysparm_limit=10` (at most 20 for a preview); long script/HTML/journal fields only when needed, after narrowing the record. No whole records or unbounded exports.
- At most 8,000 output characters per request, 16,000 per batch, 48,000 per task. If output is oversized or incomplete, stop and narrow; do not treat it as complete or export to disk.
- Table `count` is the page's rows, not the table total. Page with `sysparm_offset=<nextOffset>` while `hasMore` is true, and follow the [paging rules](references/queries.md#read-and-page-application-records) before any completeness claim. Grouped Stats do not page this way: `count` is the number of groups and `hasMore` is not a completeness signal.
- An app missing from one page or a filtered/ACL-limited result is **not proof it is uninstalled or inactive**. Never call an inventory complete until pagination and visibility limits are accounted for.

## Writes

GET is the default. POST/PATCH/PUT/DELETE require explicit user intent and approval of the exact confirmed target and change immediately before execution in the interactive parent. The CLI itself does not ask for confirmation. Do not delegate writes to a headless child, reroute a refused operation, or infer approval from permission to inspect records.

1. Create the body as a UTF-8 JSON file with the file-edit tool (no shell redirection or inline `--body`), outside source control; show its content in the approval request.
2. Run with `--method`, `--body-file "<reviewed-absolute-json-file>"` and an explicit `--alias`.
3. Verify with a separate narrow GET, then delete the body file. For an approved bodyless DELETE, capture native completion and verify the target with a narrow GET; never retry solely because the output is blank. Never retry an uncertain write without checking the original outcome.

## Authentication errors

HTTP 401, or stderr starting `Refresh failed`, `No credentials in keychain` or `No OAuth access token` (basic-auth or incomplete alias; OAuth is required): stop and use [sn-auth](../sn-auth/SKILL.md) in the interactive parent. HTTP 403 (access denial), `Cannot load @napi-rs/keyring` (toolchain finding), `Cannot read the OS credential store` / `Platform secure storage failure` (Linux store unavailable; host finding, see [sn-auth Verify results](../sn-auth/references/verify-results.md)) and a missing skill/tool search result are not auth errors. Never use `--raw` or `--dump`, print credentials, or follow diagnostic suggestions that expose token storage.

Start a **new VS Code agent chat** after updating installed skills or instructions; an existing chat may keep old guidance.
