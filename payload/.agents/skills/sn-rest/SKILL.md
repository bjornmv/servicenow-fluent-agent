---
name: sn-rest
description: Discover ServiceNow tables and inherited fields, then run small schema-validated reads or grouped aggregates with the existing SDK OAuth token. Use for instance inventory, contributor evidence, sys_id lookup and record verification. Writes require interactive confirmation.
---
# ServiceNow schema and REST

Use the Pi tools `sn_schema` and `sn_rest`. They reuse the existing `sn-rest.js` OAuth helper. Never extract credentials, invoke raw-token debugging modes, or implement another OAuth client to work around a query error.

## Discover → validate → preview → aggregate

1. If the table is uncertain, use `sn_schema(search="business rules")`. Search matches labels/names and a few curated aliases; aliases are checked against instance metadata.
2. Inspect relevant fields: `sn_schema(table="sys_script",fields="name,active,sys_scope")`. Parent tables and inherited definitions are included. Missing metadata means **not found or not readable**, not proven absence. Add `choices=true` for up to ten visible choice values per explicitly requested field.
3. Read 1–10 rows with a small field projection and **structured filters**. Conditions are ANDed; use `filters=[]` for a deliberate bounded all-record preview.
4. Use Stats mode for totals, grouped counts and top-N, not hundreds of raw rows.
5. After two unexpected results, stop bulk calls. Check metadata and one known-record control. Do not invent table names/operators, assume the wrapper dropped filters, or broaden to Global.

```json
{"table":"sys_script","filters":[{"field":"sys_scope.scope","operator":"eq","value":"x_fs_asset"}],"fields":"sys_id,name,active","limit":3}
```

Structured operators: `eq`, `ne`, `in`, `not_in`, `contains`, `starts_with`, `gt`, `gte`, `lt`, `lte`, `is_empty`, `is_not_empty`. IN values must be arrays. Boolean values are true/false, not 1/0. References require sys_ids; `sys_scope.scope` is the dotwalk to a scope string. No embedded encoded-query syntax or JavaScript in values.

`encoded_query` remains available instead of `filters`. Basic operators and referenced fields are checked; equality is `=`, not literal `IS`. For other platform operators or unavailable dictionary metadata, explicitly use `advanced=true` with an encoded/raw query. This bypasses schema checks, **not** output limits or write confirmation. Do not treat advanced mode as validation.

Table ordering: `sort="-sys_updated_on"` (default sys_id ascending). Stats ordering: `order_by="COUNT^DESC"`. They are different APIs. Do not use raw `sysparm_order_by` on Table API.

## App contributor evidence recipe

- List `sys_app` with `fields="sys_id,name,scope"`, `filters=[]`; page if required.
- For scoped apps, group `sys_metadata` by `sys_scope,sys_updated_by`, filtering `sys_scope` to the collected app sys_ids. This avoids nine separate artifact inventories.
- Example: `sn_rest(stats_table="sys_metadata",group_by="sys_scope,sys_updated_by",filters=[{"field":"sys_scope","operator":"in","value":["<32-hex-sys-id>"]}],limit=10)`.
- A scoped app with no visible matching metadata needs an explicit no-evidence statement, not an inferred owner.
- Keep Global separate: it is shared and cannot identify one global application's files by scope alone.
- These are **current-record counts by last updater**, not edit counts, assigned ownership, or proof of who is currently working. State this caveat. Apply an explicit date filter before calling evidence recent. Shared/service accounts cannot be attributed to a person without more evidence.

## Output and pagination contract

- Default preview/fetch: 10 rows; displayed hard maximum: 20. Larger requested fetch limits are reduced to the preview limit.
- Maximum 8,000 JSON characters per result, 16,000 across one assistant tool batch, 48,000 per user task (small exhaustion notices excepted).
- Values are previewed at 300 characters; `max_field_chars` can explicitly increase to 2,000 for selected fields, still within the total cap.
- Long script/HTML/journal fields must be explicitly selected. Whole-record Table API reads without `fields` are disabled, including raw mode.
- JSON is preserved; `returned_rows`, `truncated_rows`, `shortened_values`, `hasMore`, and `nextOffset` describe omissions. `count` is fetched page rows, **not** total matching records.
- Table reads: continue with `offset=nextOffset`. With changing records or ACL-filtered pages, duplicates are possible; use stable sorting and deduplicate by sys_id.
- Stats: continue with `group_offset=nextOffset`, same filters/grouping/order. Groups are locally paged after the server response; ordering ties can shift. `total_groups` is the number received, not a guarantee of all possible groups. `groups_may_be_incomplete=true` warns of the 1,000-group bound. Narrow grouping/filtering instead of assuming completeness.
- Schema: continue with `offset`; prefer explicit fields over walking an entire dictionary.
- A 2 MB transport-output cap rejects oversized helper responses instead of retaining partial data. No automatic bulk fetch, disk export, or full response in tool details.
- Metadata caches are request-local only, avoiding cross-instance/identity reuse and stale persistent snapshots.

## Raw REST and writes

Use `path` plus `query` for non-table APIs or unusual requests. Raw Table API GETs receive the same projection, validation and preview limits. Do not mix raw and structured parameters. Keep write scope explicit; POST/PATCH/PUT/DELETE require the parent's interactive confirmation and are blocked headlessly. Never reroute a refused write through a script or another tool.

For authentication errors, use the `sn-auth` workflow in the interactive parent. Do not print credentials. The underlying helper is a CLI, not an importable library; normal agent work should use the tools rather than calling it directly.

## Tests and reload

Implementation: `~/.pi/agent/extensions/sn-rest.ts`, with `schema.cjs` and `output.cjs` in this skill directory. After editing, use `/reload` in an interactive Pi session; running sessions retain old tool declarations until reload.

Offline tests: direct Node `--test test/schema.test.cjs test/output.test.cjs` from this directory. `test/live.mjs` is an explicit read-only live integration test; it does not submit writes or expose tokens.
