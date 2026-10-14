---
name: sn-update-advisor
description: Checks and applies updates to this agent, the project SDK and local docs. Use when the session-start update check is due or the user asks about updates.
argument-hint: <component, absolute project/checkout path, and check or approved update intent>
compatibility: Node.js and installed advisor launcher; approved package-manager/Git tooling only for the requested component; interactive parent owns mutations.
metadata:
  version: '1'
---

# Quiet Update Advisor

Use after a due session-start stamp, for explicit update requests, or approved advisor choices. The session gate is independent of task type; outside it, ordinary task work does not trigger extra checks. A docs question never authorizes a pull, SDK upgrade, build or index refresh.

## Session-start check

The agent first runs `node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" session-start` once per new session. This local-only command checks `%USERPROFILE%\.agents\.servicenow-fluent-agent-update-check.stamp` by modified time. When the stamp is missing or **older than 48 hours**, the command itself creates/touches it and prints `due: true`, **before** invoking this skill; `due: false` means continue without loading the workflow. Do not touch a fresh stamp or write the stamp by hand. This is one shared gate across projects, not a per-project marker. A later project may therefore wait until the next due session unless the user requests a check.

The stamp records an attempt, not successful remote discovery. It is separate from `.servicenow-fluent-agent-update.json`; preserve that file's reminder/skip decisions. Gate errors or missing/malformed gate output are not a fresh-stamp result: report the limitation and continue unrelated work. Never delete/reset either file just to force a notice. There is no extension, scheduler or guaranteed host event; the custom agent instructions initiate this check.

When due, resolve these targets without mutations:

1. **Agent:** read the install receipt (`%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json`) and use its absolute `repoRoot`; report a missing/unusable receipt instead of guessing a checkout.
2. **now-sdk:** include only an already identified, absolute ServiceNow project root (`now.config.json` or `aiux.json`). No ancestor guessing or global-SDK substitution; omit this target if none is identified.
3. **ServiceNowDocs:** use the installed lookup CLI's read-only `paths` command to resolve the configured/default checkout. Include an existing checkout and preserve its current release branch; report a missing checkout without cloning or rebuilding it.

The launcher's `check`, `decision` and `state` commands refuse (non-zero exit, file untouched) when existing decision-state JSON or its component map is unreadable/malformed: report it and stop this advisory pass without resetting it. Run the checks below once for each resolved component, without `--force`. Honor the existing per-component check intervals and reminder/skip choices: a due stamp does not make every component due, and a component checked less than 48 hours ago or snoozed is not contacted. A non-zero check exit means the check did not run or newly recorded a `lastCheckFailedAt`; report that failure. Quiet output alone does not certify a successful check. If launcher execution cannot be established, report that gap. Keep the attempt stamp; retry only on explicit request, not in a session loop.

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

Show the recorded state (read-only; no receipt, Git or network access):

```powershell
$ErrorActionPreference = 'Stop'
& node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" state
Write-Output "advisor-state-exit=$LASTEXITCODE"
```

Use each resolved component's `--only` filter for due startup checks; explicit requests check only the requested components. Resolve docs paths with `sn-doc-md.js paths`; `--docs` requires a value. Outside the session gate, documentation-only questions skip update checks and maintenance.

- Checks are quiet and nonblocking. A component is contacted no more often than every 48 hours unless `--force` is appended to its check command; only the user's explicit request to check that component now licenses `--force`.
- `advisor-exit=0` with empty output from this **quiet check only** means the check command completed with no notice to present: no newer release was found, the component was not due, or a notice is being withheld (see State Rules). It is not proof of being up to date, and not permission to treat blank search/build/install output as success. A non-zero exit prints the reason on stderr (bad arguments, unusable receipt or state, failed Git/registry discovery): report it as not checked.
- The agent check compares local `HEAD` with `origin` branch `main`; the docs check compares it with `origin` for the checkout's current branch. A dirty checkout, or a docs checkout on a detached `HEAD`, produces no notice even when the remote is ahead.
- **Explicit “check now” request:** run that component's check with `--force`, then the `state` block. Component keys are `agent`, `sdk:<lowercased absolute project path>` and `docs:<lowercased absolute checkout path>`. A recorded `available` release is a known update even when the check printed nothing (a notice shown in the last seven days, a reminder or a skip withholds it, also under `--force`): report its `current`/`available` and the recorded decision; the explicit request permits offering the three choices for it. No `available` means no newer release was found; for the agent/docs, confirm `git -C "<path>" status --porcelain` prints nothing before saying so.
- For actionable JSON, collect the notices from this pass and present them together in one message, asking for exactly **Update**, **Remind me in 7 days**, **Skip this release** per component. Include the full component label, project/checkout path, exact current/available version and version source. SDK `current` is the **project package.json declared pin** (`currentSource`), not its global or necessarily installed version; SDK `available` is the public npmjs.org `latest` dist-tag, fetched by Node directly and not through the project's npm registry/proxy configuration. Agent/docs versions are 12-character Git revisions and `id` is the full revision. Range declarations are not offered as exact-version upgrades.
- Never say only “now-sdk update” when the target is a project. A global 4.13.3 install does not change a project's 4.12.2 dependency. Inspect global metadata only when relevant; do not reinstall it to update the project.
- Out of scope, report instead of improvising: updating the global SDK install (covered by `setup.md` in the receipt's checkout, with its own approval), and a project whose SDK declaration is a range (the check stays silent and the worker refuses; report the declared range and the installed version).
- Do not add a fourth choice or re-prompt in the same session. Record each component's own choice under its own key, never unrelated returned keys:

Replace `<selected-decision>` with `update`, `remind`, or `skip`, matching the user's choice. `<returned-component>` is the JSON-decoded `component` value: lowercase as returned, with single backslashes (raw JSON text shows them doubled). Repeat `--component` only for components that received the same choice:

```powershell
$ErrorActionPreference = 'Stop'
& node "$env:USERPROFILE\.agents\tools\sn-update-advisor.cjs" decision "<selected-decision>" --component "<returned-component>"
Write-Output "advisor-decision-exit=$LASTEXITCODE"
```

Recorded means exit 0 **and** the line `Recorded <selected-decision> for N update component(s).` with N equal to the number of `--component` values. On a non-zero exit treat the decision as not recorded: the launcher refuses, before changing anything, a key that has no recorded notice (mistyped key, or a later failed/forced check cleared the notice) and lists the keys that have one. Report “decision not recorded”; do not retry with guessed keys.

Recording **Update** records authorization, not installation or build success.

## Execution Evidence — applies to every component

One owner per mutation: keep the apply operation with the interactive parent. Respect harness delegation/approval rules; if the permitted tools cannot safely execute and observe it, stop for an interactive handoff. Do not have subagents rewrite or independently repeat mutations.

- Require the actual command, absolute working directory, exact target, native exit status and matching stdout/stderr (or their durable paths). Generic tool status `ok` is not native exit code 0.
- **UNKNOWN**: “Command produced no output”, missing exit code/result, timeout, unrelated/delayed output, lost/truncated transcript, shell integration errors or failed directory selection. Do not invent success or failure, queue a build, send probes into that terminal or retry the mutation.
- Recover the **original run** using read-only file tools or the harness's existing execution handle. If it is still running or no trustworthy completion evidence exists, retain UNKNOWN and stop. Do not kill a busy/user terminal, delete a lock, change run IDs to evade duplicate protection or retry via another launcher.
- `Set-Location ...; npm ...` is unsafe: a directory error may still allow npm to run. Delegation prose does not set cwd. Bind cwd in the actual approved process call, and bind npm's prefix to the same project. Do not use npm's ancestor discovery as a fallback.
- A build/typecheck needs its own correctly attributed native completion and error-free output. Package metadata, generated files or a dependency worker's success do not prove a build. No instance deployment follows an upgrade automatically.

## Update Workflow

Approval covers only the displayed component, **absolute target path**, and exact version/revision. Stop on a dirty checkout, non-fast-forward pull, package-manager failure, lifecycle concern, engine mismatch, conflict or failed verification. If Git is genuinely absent for the project, say so; do not equate that with rollback protection. Preserve original files before mutation. No `--force` (sole exception: the separately approved index `build --force` under ServiceNowDocs), `--reinstall`, broad dependency upgrades, automatic Node changes, audit fixes or instance deployment.

### Agent Package

1. Read `%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json`; bind all commands to its `repoRoot`, not the terminal's remembered cwd.
2. Confirm clean Git status and that the checkout is on branch `main` (`git -C "<repoRoot>" branch --show-current`), the branch the notice was computed against; `git -C "<repoRoot>" pull --ff-only origin main` only after approval. Afterwards `git -C "<repoRoot>" rev-parse HEAD` must equal the notice's `id`; if `origin` moved further, report the actual revision before installing.
3. Run `node "<repoRoot>\bin\sn-fluent-agent.cjs" install` without `--force`, with reliable native completion evidence; then the same path with `verify` separately. `install` also re-applies the installer's VS Code user settings and, on Windows, its user PATH registration for Git: say so when asking for approval. Exit 0 is not enough: `skipped conflicts` or `skipped obsolete conflicts` above 0 in the install summary, or a non-zero `verify`, is a stop.
4. If completion capture fails, read the original receipt/logs and report UNKNOWN; do not repeat the installer. Ask the user to reload VS Code only after verification.

### Project now-sdk — standalone npm fast path

The bundled [scripts/update-project-sdk.cjs](scripts/update-project-sdk.cjs) is a small **npm-only** worker, not an SDK launcher. It uses Node argument arrays with explicit cwd **and** npm `--prefix`, disables lifecycle scripts, enforces npm engines, backs up manifest/lockfile, and saves stdout/stderr plus an atomic result. It never calls the SDK, a shell, auth, Git or the network by itself in preflight/status mode. Apply invokes npm, which may contact the configured registry.

1. Confirm the approved canonical project path, package-manager/configuration, exact declaration, lock and installed SDK. Review Git state, lifecycle scripts, `.nvmrc`, `engines`, package-manager version/config and outstanding warnings. A global SDK version is not project evidence. Do not proceed past unsupported engines or unreviewed scripts.
2. Use the established npm JavaScript entry and permitted Node executable: resolve the absolute `npm-cli.js` once as the [SDK command policy](../../reference/sdk-commands.md) describes (the worker runs it with the same Node that runs the worker). Select a new absolute evidence directory that does not exist yet, outside the project and readable by your file tools (for example a new sibling of the project directory), and save that path in the conversation **before launch**. Never assume a missing directory/result means the command did not start.
3. Run read-only `preflight`, with the actual approved values (examples are placeholders, not commands to run literally). Exit 0 prints the plan; a non-zero exit is a refusal whose reason is on stderr:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-update-advisor\scripts\update-project-sdk.cjs" preflight --project "<absolute-project>" --from "<approved-current>" --to "<approved-version>" --npm-cli "<resolved-npm-cli.js>" --run-dir "<absolute-new-evidence-directory>"
Write-Output "sdk-update-exit=$LASTEXITCODE"
```

4. After approval and successful review, run the **same arguments** with `apply --approved` instead of `preflight`, ONCE, in the parent. Use direct Node execution with the confirmed project cwd; do not bypass a denied tool/approval through this worker. `--approved` is an assertion of already-obtained user approval, not authorization itself.
5. Regardless of the terminal's summary or exit code, read `request.json`, `npm.stdout.log`, `npm.stderr.log` and `result.json` from that exact directory using file tools. No result means UNKNOWN. The worker leaves `.sn-sdk-update.lock` on interruptions/failure; do not delete it or automatically rerun. Read-only recovery:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-update-advisor\scripts\update-project-sdk.cjs" status --run-dir "<original-evidence-directory>"
Write-Output "sdk-update-exit=$LASTEXITCODE"
```

Prefer file tools if the original terminal remains busy. `status` never installs, unlocks or rewrites results; missing/malformed/mismatched evidence is inconclusive, not permission to retry.

6. Only `state: package-verified` with native exit 0, matching run/project/versions, and all four matching values (declaration, root lock declaration, resolved lock, installed package) proves the package update. Read warnings and review the diff: direct dependency changes other than SDK are unexpected; SDK transitive lock changes may be necessary and must be reviewed. Preserve production versus development dependency placement.
7. Then run `now-sdk build` **separately**, using the canonical [SDK command policy](../../reference/sdk-commands.md), with explicit project cwd and actual completion evidence. Use `now-sdk` in VS Code PowerShell from the confirmed project directory, and pass the project path so the build target does not depend on the terminal's cwd:

```powershell
now-sdk --version
now-sdk build "<absolute-project>"
Write-Output "sdk-build-exit=$LASTEXITCODE"
```

The version line must print the approved version. Any other version means the terminal was not in the project directory and another SDK answered: that build does not verify the update. If reliable capture is unavailable, report **package updated; build unverified** and stop. Never claim build success from this worker (`build` is always `not-run`).

The worker deliberately refuses linked paths, workspace projects, conflicting package managers, missing/mismatched local state, non-exact pins and any `.nvmrc` that is not an exact `x.y.z` equal to the running Node (major-only or alias values such as `20` or `lts/*` are refused too; that is a worker limit, not proof of a wrong Node). Other project layouts/managers need a separately reviewed equivalent that preserves these cwd, backup, ownership and evidence safeguards; do not silently convert their lockfile or bypass the refusal. It is not a package-manager sandbox. Its lock only coordinates this worker; do not run other package managers concurrently. Failure recovery/lock removal requires review of the original operation and explicit authorization, not a new automatic retry.

That review, when the user asks for it, is read-only: `result.json` `state` (`failed` = npm exited non-zero, `verification-failed` = npm exited 0 but the four values or the manifest do not match, `unknown` = no trustworthy completion) and both logs; whether the project's `package.json` and `package-lock.json` still equal the run directory's `package.json.before` / `package-lock.json.before`; and whether the installed `node_modules\@servicenow\sdk\package.json` version is still the approved current one. Report those facts. Deleting `.sn-sdk-update.lock` (only after confirming its `runDir` is this run), restoring the `.before` copies or reinstalling dependencies are each separate mutations needing explicit approval of that exact step; a new attempt then needs a fresh preflight and a new evidence directory.

### ServiceNowDocs

Applying a docs update requires an approved documentation-maintenance request, not merely a startup check or failed lookup. Choosing **Update** on the displayed ServiceNowDocs notice is that approval; a check with no choice, or a failed lookup, authorizes nothing. The index commands belong to [sn-doc-lookup](../sn-doc-lookup/SKILL.md); it has no staged-swap or promote command, so the active index is replaced only by an in-place `build --force`:

1. Confirm the displayed checkout/release branch are clean and still the branch named in the notice. Bind Git cwd explicitly.
2. Run `git -C "<checkout>" pull --ff-only origin "<release-branch>"`; require real completion evidence.
3. Rebuild the active index in place. State the cost when asking for this approval: `--force` deletes the existing recognized index first, the build prints nothing until it finishes and takes minutes for the full corpus, and lookup is unavailable until it completes (a failed build leaves no usable index). `--family` is only a label; use the checkout's release branch. Do not rename, move or delete index directories by hand.

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" build --family "<release-branch>" --force
Write-Output "doc-lookup-exit=$LASTEXITCODE"
```

4. Run the lookup benchmark against the rebuilt index and require exit 0:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-lookup\bin\sn-doc-md.js" test
Write-Output "doc-lookup-exit=$LASTEXITCODE"
```

5. Report the build's `manifest.git_head` (it must equal `git -C "<checkout>" rev-parse HEAD`), any build `warnings` and the benchmark result. The index manifest is the provenance record: advisor state has no indexed-commit field. Do not bundle the corpus/index. Unknown completion does not authorize repeating a pull/build.

A lookup `warnings` entry naming `sn-doc-md@0.1.0` is a reason to offer steps 3-5 even when the corpus commit is unchanged. Both commands resolve the docs and index locations as `paths` reports them; confirm its `docs` is the checkout just pulled, and add explicit `--docs` / `--out` (build) or `--index` (test) only when lookup itself runs with explicit paths.

## State Rules

- **Remind me in 7 days** suppresses notices and unforced remote checks for seven days, even if the remote advances. A `--force` check still contacts the remote; its notice stays withheld.
- **Skip this release** suppresses only the displayed version/revision; a later release becomes eligible once the 48-hour check gate has elapsed **and** seven days have passed since the last notice shown for that component.
- Every shown notice, whatever the answer (including **Update** and no answer), withholds further notices for that component for seven days, also under `--force`. For an approved update that stopped before it was applied, take the approved target from `state` (`available`, `lastDecision: update`); do not wait for or force a new notice.
- Each check that contacts the remote rewrites `lastCheckedAt`, so repeated `--force` checks postpone the next natural one. A failed check clears the recorded `available` release and is not retried unforced for 48 hours.
- State: `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json`. Do not delete/edit/reset it unless specifically requested. Preflight/status/verification do not reset the advisor's decisions.
