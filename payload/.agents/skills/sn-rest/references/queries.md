# REST CLI query recipes

Use the approved VS Code terminal, the bundled helper and confirmed alias/instance. These are request templates, not a startup checklist. Replace `<...>` values with validated facts before execution. Keep the whole API path quoted in PowerShell, including `&` separators; URL-encode query values. Requests are read-only unless the user explicitly approved a separate write.

## Discover a table

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_db_object?sysparm_query=name=<confirmed-table>&sysparm_fields=name,label,super_class.name&sysparm_limit=1&sysparm_no_count=true"
```

If only a label is known, use `labelLIKE<encoded-label>%5EORDERBYname` with `sysparm_limit=10`. Inspect visible candidates rather than substituting guessed table names. A zero-row response may reflect ACL restrictions.

## Inspect fields and inheritance

After confirming the table, inspect only requested fields:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_dictionary?sysparm_query=name=<confirmed-table>%5EelementIN<confirmed-field-list>%5EORDERBYelement&sysparm_fields=name,element,column_label,internal_type,reference,choice&sysparm_limit=10&sysparm_no_count=true"
```

Use comma-separated field identifiers, not arbitrary query fragments. Follow the table's `super_class.name` and inspect unresolved fields on the parent; repeat only as needed. Stop on an inheritance cycle, more than ten ancestors, inaccessible metadata or an unknown reference target. For dotwalks, inspect each reference field and then its target table. Do not claim that a missing child dictionary entry means an inherited field is absent.

For explicitly requested choice values, query `/api/now/table/sys_choice` with `name=<defining-table>%5Eelement=<field>%5EORDERBYsequence`, fields `name,element,label,value,sequence`, limit 10 and `sysparm_no_count=true`. Follow pagination only as needed and retain inherited-field/language visibility caveats.

## Read and page application records

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_app?sysparm_fields=sys_id,name,scope&sysparm_query=ORDERBYsys_id&sysparm_limit=10&sysparm_offset=<nextOffset>&sysparm_no_count=true"
```

The first page uses offset 0 (or omits it); subsequent pages use the actual `nextOffset`. Do not invent an `active=true` filter without checking that the field exists and matches the user's question. Do not use Table API `sysparm_order_by`; ordering is part of `sysparm_query`.

## Stats and contributors

After verifying the reference fields and collecting the requested applications' sys_ids, use a small scope filter. One request can group multiple confirmed scoped apps without scanning each artifact table:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/stats/sys_metadata?sysparm_query=sys_scopeIN<confirmed-scope-sys-ids>&sysparm_count=true&sysparm_group_by=sys_scope,sys_updated_by&sysparm_order_by=COUNT%5EDESC&sysparm_display_value=false"
```

The scope list contains comma-separated 32-hex reference IDs, not `x_` strings. For raw grouped responses, preserve `stats.count` and every `groupby_fields` field/value pair, plus the app-ID mapping. Do not discard the groups while summarizing execution, merge distinct account names, or count Global toward one application.

Stats group limits/pagination differ from the Table API. A request's `sysparm_limit` does not establish completeness or a reliable preview cap. If too many groups come back, stop and narrow the selected apps/date/grouping; do not export everything or make an unbounded follow-up. An empty or partial result is not proof of no activity. Counts reflect visible current records' last updaters, not live staffing or ownership.
