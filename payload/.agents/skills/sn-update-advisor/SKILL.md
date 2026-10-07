---
name: sn-update-advisor
description: Use when the shared session-start stamp is due, explicitly checking updates, or applying an approved advisor choice; checks never authorize installation.
argument-hint: <component, absolute project/checkout path, and check or approved update intent>
compatibility: Node.js and installed advisor launcher; approved package-manager/Git tooling only for the requested component; interactive parent owns mutations.
metadata:
  version: '1'
---

# Quiet Update Advisor

Use after a due session-start stamp, for explicit update requests, or approved advisor choices. The session gate is independent of task type; outside it, ordinary task work does not trigger extra checks. A docs question never authorizes a pull, SDK upgrade, build or index refresh.

## Session-start check

The agent first runs `node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" session-start` once per new session. This local-only command checks `%USERPROFILE%\.agents\.servicenow-fluent-agent-update-check.stamp` by modified time. Missing or **older than 48 hours** means create/touch the stamp **before** invoking this skill; `due: false` means continue without loading the workflow. Do not touch a fresh stamp. This is one shared gate across projects, not a per-project marker. A later project may therefore wait until the next due session unless the user requests a check.

The stamp records an attempt, not successful remote discovery. It is separate from `.servicenow-fluent-agent-update.json`; preserve that file's reminder/skip decisions. Gate errors or missing/malformed gate output are not a fresh-stamp result: report the limitation and continue unrelated work. Never delete/reset either file just to force a notice. There is no extension, scheduler or guaranteed host event; the custom agent instructions initiate this check.

When due, resolve these targets without mutations:

1. **Agent:** read the install receipt and use its absolute `repoRoot`; report a missing/unusable receipt instead of guessing a checkout.
2. **now-sdk:** include only an already identified, absolute ServiceNow project root (`now.config.json` or `aiux.json`). No ancestor guessing or global-SDK substitution; omit this target if none is identified.
3. **ServiceNowDocs:** use the installed lookup CLI's read-only `paths` command to resolve the configured/default checkout. Include an existing checkout and preserve its current release branch; report a missing checkout without cloning or rebuilding it.

If existing decision-state JSON or its component map is unreadable/malformed, report it and stop this advisory pass without resetting it. Run the checks below once for each resolved component, without `--force`. Honor the existing per-component check intervals and reminder/skip choices. Read the selected components' recorded `lastCheckedAt` / `lastCheckFailedAt` before and after checking; report newly recorded failures. Quiet output alone does not certify a successful check. If launcher execution cannot be established, report that gap. Keep the attempt stamp; retry only on explicit request, not in a session loop.

## Check Contract

Run each applicable block separately. Replace placeholders with resolved values before execution. When delegating, send the exact block and require execution unchanged; keep prose and punctuation outside it. Leave stdout/stderr visible and print `$LASTEXITCODE` immediately. Do not add .NET process/capture wrappers, temporary-file capture, or `exit` to these commands.

Resolve documentation paths:

```powershell
$ErrorActionPreference = 'Stop'
& node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" paths
Write-Output "docs-paths-exit=$LASTEXITCODE"
```

Check the receipt's agent checkout:

```powershell
$ErrorActionPreference = 'Stop'
& node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" check --only agent
Write-Output "advisor-exit=$LASTEXITCODE"
```

Check an identified SDK project:

```powershell
$ErrorActionPreference = 'Stop'
& node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" check --only sdk --project "<absolute-project-root>"
Write-Output "advisor-exit=$LASTEXITCODE"
```

Check the resolved documentation checkout:

```powershell
$ErrorActionPreference = 'Stop'
& node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" check --only docs --docs "<resolved-docs-checkout>"
Write-Output "advisor-exit=$LASTEXITCODE"
```

Use each resolved component's `--only` filter for due startup checks; explicit requests check only the requested components. Resolve docs paths with `sn-doc-md.js paths`; `--docs` requires a value. Outside the session gate, documentation-only questions skip update checks and maintenance.

- Checks are quiet and nonblocking. A component is contacted no more often than every 48 hours unless the user explicitly requests `--force`.
- Empty output from this **quiet check only** means no notice to present. This is NOT an exit-code assertion or permission to treat blank search/build/install output as success.
- For actionable JSON, ask once with exactly **Update**, **Remind me in 7 days**, **Skip this release**. Include the full component label, project/checkout path, exact current/available version and version source. SDK `current` is the **project package.json declared pin**, not its global or necessarily installed version. Range declarations are not offered as exact-version upgrades.
- Never say only “now-sdk update” when the target is a project. A global 4.13.3 install does not change a project's 4.12.2 dependency. Inspect global metadata only when relevant; do not reinstall it to update the project.
- Record each selected component key, never unrelated returned keys. Do not add a fourth choice or re-prompt in the same session:

Replace `<selected-decision>` with `update`, `remind`, or `skip`, matching the user's choice:

```powershell
$ErrorActionPreference = 'Stop'
& node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" decision "<selected-decision>" --component "<returned-component>"
Write-Output "advisor-decision-exit=$LASTEXITCODE"
```

Recording **Update** records authorization, not installation or build success.

## Execution Evidence — applies to every component

One owner per mutation: keep the apply operation with the interactive parent. Respect harness delegation/approval rules; if the permitted tools cannot safely execute and observe it, stop for an interactive handoff. Do not have subagents rewrite or independently repeat mutations.

- Require the actual command, absolute working directory, exact target, native exit status and matching stdout/stderr (or their durable paths). Generic tool status `ok` is not native exit code 0.
- **UNKNOWN**: “Command produced no output”, missing exit code/result, timeout, unrelated/delayed output, lost/truncated transcript, shell integration errors or failed directory selection. Do not invent success or failure, queue a build, send probes into that terminal or retry the mutation.
- Recover the **original run** using read-only file tools or the harness's existing execution handle. If it is still running or no trustworthy completion evidence exists, retain UNKNOWN and stop. Do not kill a busy/user terminal, delete a lock, change run IDs to evade duplicate protection or retry via another launcher.
- `Set-Location ...; npm ...` is unsafe: a directory error may still allow npm to run. Delegation prose does not set cwd. Bind cwd in the actual approved process call, and bind npm's prefix to the same project. Do not use npm's ancestor discovery as a fallback.
- A build/typecheck needs its own correctly attributed native completion and error-free output. Package metadata, generated files or a dependency worker's success do not prove a build. No instance deployment follows an upgrade automatically.

## Update Workflow

Approval covers only the displayed component, **absolute target path**, and exact version/revision. Stop on a dirty checkout, non-fast-forward pull, package-manager failure, lifecycle concern, engine mismatch, conflict or failed verification. If Git is genuinely absent for the project, say so; do not equate that with rollback protection. Preserve original files before mutation. No `--force`, `--reinstall`, broad dependency upgrades, automatic Node changes, audit fixes or instance deployment.

### Agent Package

1. Read `%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json`; bind all commands to its `repoRoot`, not the terminal's remembered cwd.
2. Confirm clean Git status; `git -C "<repoRoot>" pull --ff-only` only after approval.
3. Run the repository's `node bin/sn-fluent-agent.cjs install` without `--force`, with explicit cwd and reliable native completion evidence; then `verify` separately.
4. If completion capture fails, read the original receipt/logs and report UNKNOWN; do not repeat the installer. Ask the user to reload VS Code only after verification.

### Project now-sdk — standalone npm fast path

The bundled `scripts/update-project-sdk.cjs` is a small **npm-only** worker, not an SDK launcher. It uses Node argument arrays with explicit cwd **and** npm `--prefix`, disables lifecycle scripts, enforces npm engines, backs up manifest/lockfile, and saves stdout/stderr plus an atomic result. It never calls the SDK, a shell, auth, Git or the network by itself in preflight/status mode. Apply invokes npm, which may contact the configured registry.

1. Confirm the approved canonical project path, package-manager/configuration, exact declaration, lock and installed SDK. Review Git state, lifecycle scripts, `.nvmrc`, `engines`, package-manager version/config and outstanding warnings. A global SDK version is not project evidence. Do not proceed past unsupported engines or unreviewed scripts.
2. Use the established npm JavaScript entry and permitted Node executable. Select a new absolute evidence directory outside the project and save that path in the conversation **before launch**. Never assume a missing directory/result means the command did not start.
3. Run read-only `preflight`, with the actual approved values (examples are placeholders, not commands to run literally):

```powershell
node "<skill>\scripts\update-project-sdk.cjs" preflight --project "<absolute-project>" --from "<approved-current>" --to "<approved-version>" --npm-cli "<absolute-npm-bin\npm-cli.js>" --run-dir "<absolute-new-evidence-directory>"
```

4. After approval and successful review, run the **same arguments** with `apply --approved` instead of `preflight`, ONCE, in the parent. Use direct Node execution with the confirmed project cwd; do not bypass a denied tool/approval through this worker. `--approved` is an assertion of already-obtained user approval, not authorization itself.
5. Regardless of the terminal's summary, read `request.json`, `npm.stdout.log`, `npm.stderr.log` and `result.json` from that exact directory using file tools. No result means UNKNOWN. The worker leaves `.sn-sdk-update.lock` on interruptions/failure; do not delete it or automatically rerun. Read-only recovery:

```powershell
node "<skill>\scripts\update-project-sdk.cjs" status --run-dir "<original-evidence-directory>"
```

Prefer file tools if the original terminal remains busy. `status` never installs, unlocks or rewrites results; missing/malformed/mismatched evidence is inconclusive, not permission to retry.

6. Only `state: package-verified` with native exit 0, matching run/project/versions, and all four matching values (declaration, root lock declaration, resolved lock, installed package) proves the package update. Read warnings and review the diff: direct dependency changes other than SDK are unexpected; SDK transitive lock changes may be necessary and must be reviewed. Preserve production versus development dependency placement.
7. Then run the focused build/typecheck **separately**, using the canonical [SDK command policy](../../reference/sdk-commands.md), with explicit project cwd and actual completion evidence. Use `now-sdk` in VS Code PowerShell from the confirmed project directory. If reliable capture is unavailable, report **package updated; build unverified** and stop. Never claim build success from this worker (`build` is always `not-run`).

The worker deliberately refuses linked paths, workspace projects, conflicting package managers, missing/mismatched local state, non-exact pins and a mismatched exact `.nvmrc`. Other project layouts/managers need a separately reviewed equivalent that preserves these cwd, backup, ownership and evidence safeguards; do not silently convert their lockfile or bypass the refusal. It is not a package-manager sandbox. Its lock only coordinates this worker; do not run other package managers concurrently. Failure recovery/lock removal requires review of the original operation and explicit authorization, not a new automatic retry.

### ServiceNowDocs

Applying a docs update requires an approved documentation-maintenance request, not merely a startup check or failed lookup:

1. Confirm the displayed checkout/release branch are clean. Bind Git cwd explicitly.
2. Run `git -C "<checkout>" pull --ff-only`; require real completion evidence.
3. Rebuild into a temporary sibling index, run its lookup benchmark, replace the active index only after successful validation.
4. Record the source/indexed commit in advisor state through the approved workflow. Do not bundle the corpus/index. Unknown completion does not authorize repeating a pull/build.

## State Rules

- **Remind me in 7 days** suppresses notices and remote checks for seven days, even if the remote advances.
- **Skip this release** suppresses only the displayed version/revision; a later release remains eligible after the check gate.
- State: `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json`. Do not delete/edit/reset it unless specifically requested. Preflight/status/verification do not reset the advisor's decisions.
