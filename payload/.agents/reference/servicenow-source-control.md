# ServiceNow Source Control (SC) — app ↔ git binding

## Flow direction (DO NOT confuse)
**Local Fluent source → `now-sdk install` (uploads to instance) → instance → manual "Commit Changes" in Studio → GitHub branch.**

SC is OUTBOUND from the instance. It does NOT gate the SDK upload, does NOT pull from git on install, and does NOT alter what `now-sdk install` does. Local project folder is NOT a git working tree (typically has no `.git`); the git working copy is managed inside the instance.

After every successful `now-sdk install` on a SC-bound app, remind the user: **Studio → Source Control → Commit Changes** is needed to push to the bound branch. The SDK will not do it.

## Tables
- `sys_repo_config` — the binding. Fields: `sys_app` (sys_id of `sys_app`), `url` (e.g. `https://github.com/org/repo.git`), `current_branch` (typical: `sn_instances/<instance>`), `current_ref` (HEAD commit), `credential` (`discovery_credentials` sys_id), `authentication`.
- `sys_repo_branch`, `sys_repo_stash`, `sys_repo_tag`, `sys_repo_removed_files` — branch state, stashed changes, tags, deletions tracked since last commit.
- `sys_app_repo` does NOT exist (HTTP 400 on query).

## Detect SC binding for the current app
Two REST calls through the **sn-rest** helper, each run as its own command — the first resolves the `sys_app` sys_id from the project scope in `now.config.json`, the second queries the binding with that sys_id:
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_app?sysparm_query=scope=<scope>&sysparm_fields=sys_id,name&sysparm_limit=1&sysparm_no_count=true"
```
```powershell
node "$env:USERPROFILE\.agents\skills\sn-rest\sn-rest.js" --agent --alias "<confirmed-alias>" --instance "https://<confirmed-host>" "/api/now/table/sys_repo_config?sysparm_query=sys_app=<sys_app_sys_id>&sysparm_fields=url,current_branch,current_ref&sysparm_limit=1&sysparm_no_count=true"
```
Second call `ok` true with `count` 0 = no binding visible to this user (no commit step needed). Row present = bound (mention the commit step after install). A failed read is UNKNOWN, not unbound.

## Common misdiagnosis to avoid
SC binding is NOT a cause of `now-sdk install` returning HTTP 200 with empty body / no `executionTracker` / no `sys_upgrade_history` row. The Fluent install endpoint accepts uploads on SC-bound apps the same as on unbound apps. If install symptoms appear, look elsewhere (auth scope, version match, processor state) — not at the SC binding.
