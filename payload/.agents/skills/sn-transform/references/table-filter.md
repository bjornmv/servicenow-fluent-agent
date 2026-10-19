# `--table` local filter and `--force`

Read before any `now-sdk transform` run that uses `--table` without `--id`, or when the SDK reports `Cannot transform descendant tables directly`.

## `--table` without `--id` — a LOCAL filter, not an instance pull
- It never contacts the instance. It filters local XML to records of that metadata table (for example `sys_script` or `sys_ui_policy`, not rows of a data table) plus its child tables in the SDK relationship graph. Comma-separate multiple tables.
- Without `--from`, the SDK scans the whole project directory for `*.xml`, including `dist/` build output, and copies every non-matching file into `metadata/`. It still exits 0 with `Transform completed successfully`, and later builds warn `is defined N times in the project` because that XML duplicates the Fluent source.
- Even with `--from`, each XML file with no record in the filtered tables is copied into `metadata/` (`The entire file is preserved as XML in the metadata directory`), where `now-sdk build` packages it and it wins over a matching `.now.ts`. Point `--from` at the narrowest file or directory.

```powershell
now-sdk transform --from metadata --table sys_script
now-sdk transform --from metadata --table 'sys_script,sys_ui_policy'
now-sdk transform --auth <alias> --table sys_script --id <sys_id>
```
bash (Linux, VS Code server):
```bash
now-sdk transform --from metadata --table sys_script
now-sdk transform --from metadata --table 'sys_script,sys_ui_policy'
now-sdk transform --auth <alias> --table sys_script --id <sys_id>
```
Quote a comma-separated list: PowerShell turns an unquoted `a,b` into an array and passes two arguments. Quoting is harmless in bash.

## `--force` detail
- Valid only with `--table`; it affects only the local filter and is ignored with `--id`.
- A descendant is a child metadata table in the SDK's record-relationship graph (for example `sys_ui_policy_action` under `sys_ui_policy`), not a table that extends another.
- Without `--force` the SDK stops with `Cannot transform descendant tables directly ... "<table>" is a descendant of: <root>`.

The approval gate for `--force` is in [sn-transform](../SKILL.md#--force--descendant-table-without-parent-hierarchy).
