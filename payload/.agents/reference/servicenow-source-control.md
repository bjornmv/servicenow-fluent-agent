# ServiceNow source control — which model is this project using?

## Recommended model: local Git is the source of truth
ServiceNow's SDK SDLC guide (`now-sdk explain sdlc-guide`) makes Git the source of truth for app state; update sets only group work on the dev instance.
- The project folder is a Git working tree. The developer branches, commits, pushes and opens pull requests with their own Git tooling (VS Code Source Control or the terminal). The agent never commits, pushes or opens PRs.
- Commit Fluent and module source, `src/fluent/generated/keys.ts` and `@types/servicenow`. Never commit credentials.
- Other developers clone the project from Git instead of downloading and transforming it from the instance.
- Changes made on the instance with platform builders come back through **sn-transform**, then get reviewed and committed like any other change.
- `now-sdk install` targets the development instance. Test and production install from the Application Repository (`now-sdk cicd publish/install`, see **sn-cicd**), never through local install to production.
- Do not mix update sets and the Application Repository for the same app on the same instance (KB0715422).

After a successful install in this model, remind the user that the source change still needs review and a commit in their Git repository; the install did not record it anywhere.

## Legacy model: Studio Source Control (instance-bound)
Some apps are linked to a Git repository from the instance instead. There the working copy lives inside the instance and the flow is **local Fluent source → `now-sdk install` → instance → manual "Commit Changes" in Studio → bound branch** (typically `sn_instances/<instance>`). It allows one branch per repository per instance (or sandbox) and is not the recommended model for SDK projects.

SC is OUTBOUND from the instance. It does NOT gate the SDK upload, does NOT pull from git on install, and does NOT alter what `now-sdk install` does.

After a successful `now-sdk install` on a SC-bound app, remind the user: **Studio → Source Control → Commit Changes** is needed to push to the bound branch. The SDK will not do it.

If the project is a local Git repository **and** the app is SC-bound, two writers can push to the same remote. Report both facts and ask the user which path is authoritative; do not pick one or commit from either side.

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
