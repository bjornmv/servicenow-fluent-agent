# REST CLI query recipes

Use the approved VS Code terminal, the bundled helper and confirmed alias/instance. These are request templates, not a startup checklist. Replace `<...>` values with validated facts before execution. Keep the whole API path quoted in PowerShell, including `&` separators; URL-encode query values. The path is instance-relative; the helper refuses a full URL. Requests are read-only unless the user explicitly approved a separate write.

## Discover a table

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_db_object?sysparm_query=name=<confirmed-table>&sysparm_fields=name,label,super_class.name&sysparm_limit=1&sysparm_no_count=true"
```

If only a label is known, use `labelLIKE<encoded-label>%5EORDERBYname%5EORDERBYsys_id` with `sysparm_limit=10`. Inspect visible candidates rather than substituting guessed table names. A zero-row response may reflect ACL restrictions.

## Inspect fields and inheritance

After confirming the table, inspect only requested fields:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_dictionary?sysparm_query=name=<confirmed-table>%5EelementIN<confirmed-field-list>%5EORDERBYelement%5EORDERBYsys_id&sysparm_fields=name,element,column_label,internal_type,reference,choice&sysparm_limit=10&sysparm_no_count=true"
```

Use comma-separated field identifiers, not arbitrary query fragments. Follow the table's `super_class.name` and inspect unresolved fields on the parent; repeat only as needed. Stop on an inheritance cycle, more than ten ancestors, inaccessible metadata or an unknown reference target. For dotwalks, inspect each reference field and then its target table. Do not claim that a missing child dictionary entry means an inherited field is absent.

For explicitly requested choice values, query `/api/now/table/sys_choice` with `name=<defining-table>%5Eelement=<field>%5EORDERBYsequence%5EORDERBYsys_id`, fields `name,element,label,value,sequence`, limit 10 and `sysparm_no_count=true`. The trailing `ORDERBYsys_id` keeps offsets stable when the first sort key repeats. Follow pagination only as needed and retain inherited-field/language visibility caveats.

## Read and page application records

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_app?sysparm_fields=sys_id,name,scope&sysparm_query=ORDERBYsys_id&sysparm_limit=10&sysparm_offset=<nextOffset>&sysparm_no_count=true"
```

The first page uses offset 0 (or omits it); subsequent pages use the actual `nextOffset`. Do not invent an `active=true` filter without checking that the field exists and matches the user's question. Do not use Table API `sysparm_order_by`; ordering is part of `sysparm_query`.

Paging and completeness:

- Continue deliberately with `sysparm_offset=<nextOffset>`, the same filter/fields/order and a bounded limit while `hasMore` is true.
- With `sysparm_no_count=true`, `hasMore` is inferred only from a full page: a full page can infer another page even when the next one is empty, and a short page reports `hasMore:false` even when ACLs hid rows and more remain.
- For a completeness claim, repeat without `sysparm_no_count` and page until `hasMore` is false.
- With mutable or ACL-filtered data, deduplicate sys_ids and disclose uncertainty.

## Stats and contributors

To find who worked on applications: list visible `sys_app` records with `sys_id,name,scope`, following pagination. For the confirmed scoped apps, group `sys_metadata` by `sys_scope,sys_updated_by`, filtered to their collected sys_ids. Keep Global separate: its shared scope cannot identify a particular global application's files.

After verifying the reference fields and collecting the requested applications' sys_ids, use a small scope filter. One request can group multiple confirmed scoped apps without scanning each artifact table:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/stats/sys_metadata?sysparm_query=sys_scopeIN<confirmed-scope-sys-ids>&sysparm_count=true&sysparm_group_by=sys_scope,sys_updated_by&sysparm_order_by=COUNT%5EDESC&sysparm_display_value=false"
```

The scope list contains comma-separated 32-hex reference IDs, not `x_` strings. With `--agent` the groups are in `records` and `count` is the number of groups, not a record total. Preserve `stats.count` and every `groupby_fields` field/value pair, plus the app-ID mapping. Do not discard the groups while summarizing execution, merge distinct account names, or count Global toward one application.

Stats group limits/pagination differ from the Table API. A request's `sysparm_limit` does not establish completeness or a reliable preview cap, and `sysparm_offset` does not page groups; for grouped Stats `hasMore` is not a completeness signal. If too many groups come back, stop and narrow the selected apps/date/grouping; do not export everything, make an unbounded follow-up, or claim all groups were returned without evidence.

These counts describe **current records by last updater**, not edit totals, assigned owners or people currently working. Preserve account identifiers literally; do not equate accounts with people or infer which is the user. Apply an explicit verified date filter before calling evidence recent. No visible metadata means no visible evidence, not no contributors; an empty or partial result is not proof of no activity.
