# Install failures and Upgrade History

Read when `now-sdk install` failed, hung, printed no completion line, or its outcome is UNKNOWN. Do not start another build or install until this is settled.

## Failure lines

- `<message>. See execution details at <host>/sys_execution_tracker.do?sys_id=<id>` — the instance reported the install as failed. Read that tracker and Upgrade History before any further build/install.
- `Unable to track app install status due to a connection error. Monitor progress and verify the outcome at <tracker URL>` — polling broke; the install may still be running or may have completed. Outcome UNKNOWN; do not retry.
- `[now-sdk] ERROR: Could not determine app installation status.` — synchronous fallback only (the instance returned no execution tracker, or `--async=false`): no new finished Upgrade History row appeared in 30 one-second polls. The upload may have applied partially or not at all. Investigate via Upgrade History before any further build/install.
- `The install request was redirected away from the upload endpoint ... The app was not installed.` — session or authentication conflict; nothing was uploaded. Go to **sn-auth**; Upgrade History has nothing to show.
- Long run with no new output past `Starting installation with SDK <version>...` — the tracker loop does not time out. Do not start a second install; check Upgrade History for the actual state.

## Read Upgrade History

`now-sdk install --info --auth <alias>` only prints the URL (`<host>/sys_upgrade_history_list.do`); it does not read install history, test the stored token, or honor `-b`/`--open-browser`. Read the rows headlessly via **sn-rest**, using the selector the SDK itself polls:

```
sn-skill rest --agent --alias '<confirmed-alias>' --instance 'https://<confirmed-host>' '/api/now/table/sys_upgrade_history?sysparm_query=to_version=<scope>%5EORDERBYDESCupgrade_started&sysparm_fields=sys_id,to_version,upgrade_started,upgrade_finished&sysparm_limit=3&sysparm_no_count=true'
```

- The final stderr line `sn-skill: rest exit=<N>` is the native exit evidence; without it the read did not complete (UNKNOWN).
- A row for this scope that started after the install began and has `upgrade_finished` populated shows the instance finished processing a package, not that every record applied.
- Per-record detail is in `sys_upgrade_history_log`; if the instance REST-blocks that table, dot-walk `upgrade_detail.*` from `upgrade_history_task`.
- To confirm the alias is alive, use the `sn-rest` health check from **sn-auth**.
