---
name: sn-update-advisor
description: Checks and applies updates to this agent, the project SDK and local docs. Use when the session-start update check is due or the user asks about updates.
argument-hint: <component, absolute project/checkout path, and check or approved update intent>
compatibility: Node.js and sn-skill (else node "<user-profile>/.agents/tools/sn-skill.cjs"); approved package-manager/Git tooling only for the requested component; interactive parent owns mutations.
metadata:
  version: '1'
---

# Quiet Update Advisor

Use after a due session-start stamp, for explicit update requests, or for approved advisor choices. The gate is independent of task type; ordinary task work outside it triggers no extra checks. A docs question never authorizes a pull, SDK upgrade, build or index refresh. Outside the session gate, documentation-only questions skip update checks and maintenance.

## Session-start check

The agent runs `sn-skill update session-start` once per new session. It checks `<user-profile>/.agents/.servicenow-fluent-agent-update-check.stamp` by modified time; when missing or **older than 48 hours**, it touches the stamp and prints `due: true` **before** invoking this skill. `due: false` → continue without this workflow.

- Do not touch a fresh stamp or write the stamp by hand. It is one shared gate across projects; a later project waits for the next due session unless the user asks.
- The stamp records an attempt, not a successful check. Preserve the reminder/skip decisions in `.servicenow-fluent-agent-update.json`. Never delete or reset either file to force a notice.
- Gate errors or missing/malformed gate output are not a fresh-stamp result: report the limitation and continue unrelated work.

When due, resolve these targets without mutations:

1. **Agent:** the absolute `repoRoot` in the install receipt `<user-profile>/.agents/.servicenow-fluent-agent-install.json`; report a missing/unusable receipt instead of guessing a checkout.
2. **now-sdk:** only an already identified, absolute ServiceNow project root (`now.config.json` or `aiux.json`). No ancestor guessing or global-SDK substitution; omit this target if none is identified.
3. **ServiceNowDocs:** the checkout from the lookup CLI's read-only `paths` command; preserve its current release branch and report a missing checkout without cloning or rebuilding it.

Run the checks below once for each resolved component, without `--force`. A due stamp does not make every component due: per-component intervals and reminder/skip choices still apply.

- A non-zero check exit means the check did not run or newly recorded a `lastCheckFailedAt`: report it.
- `check`, `decision` and `state` refuse (non-zero, file untouched) on unreadable/malformed decision-state JSON or component map: report it and stop this pass without resetting it.
- If launcher execution cannot be established, report that gap. Keep the stamp; retry only on explicit request.

## Check commands

Replace placeholders, then run each applicable command separately and unchanged (also when delegating), with stdout/stderr visible. The same line works in PowerShell and bash; its final stderr line `sn-skill: <name> exit=<N>` is the native exit evidence, and without it the command is UNKNOWN. Do not add capture wrappers, temporary-file capture or `exit`.

Resolve documentation paths:

```
sn-skill docs paths
```

Check the receipt's agent checkout:

```
sn-skill update check --only agent
```

Check an identified SDK project:

```
sn-skill update check --only sdk --project "<absolute-project-root>"
```

Check the resolved documentation checkout:

```
sn-skill update check --only docs --docs "<resolved-docs-checkout>"
```

Show the recorded state (read-only; no receipt, Git or network access):

```
sn-skill update state
```

Due startup checks use each resolved component's `--only` filter; explicit requests check only the requested components. `--docs` requires a value.

## Reading results

- `sn-skill: update exit=0` with empty output from this **quiet check only** means no notice to present: nothing newer, not due, or withheld (see State). Not proof of being up to date; blank search/build/install output is never success. Non-zero → reason on stderr; report "not checked".
- `sn-skill: update exit=0` with an `Update not offered for <component>` line on stderr: a newer release exists but its checkout has local changes. Report the line verbatim and ask the user how to handle the listed changes. Do not commit, stash, discard or delete them yourself, and offer no update until a later check shows the notice.
- Agent compares local `HEAD` with `origin` `main`; docs with `origin` of the current branch. A dirty checkout, or a detached docs `HEAD`, gives no notice even when the remote is ahead.
- **Explicit "check now":** only this request licenses `--force`. Run that component's check with `--force`, then `state`. Keys: `agent`, `sdk:<lowercased absolute project path>`, `docs:<lowercased absolute checkout path>`. A recorded `available` is a known update even if the check printed nothing: report `current`/`available` and the recorded decision, and offer the three choices. No `available` means nothing newer; for agent/docs, first confirm `git -C "<path>" status --porcelain` prints nothing.
- SDK `current` is the **project package.json declared pin** (`currentSource`), not the global or installed version; `available` is the npmjs.org `latest` dist-tag, fetched directly, not via the project's registry/proxy. Agent/docs versions are 12-character Git revisions; `id` is the full revision.
- Name the project in an SDK notice, never just "now-sdk update": a global 4.13.3 install does not change a project's 4.12.2 dependency. Inspect global metadata only when relevant; do not reinstall the global SDK to update a project.
- Out of scope, report instead of improvising: updating the global SDK (`setup.md` in the receipt's checkout, own approval); a range SDK declaration (check stays silent, worker refuses; report the declared range and installed version).

## Present and record choices

Present this pass's notices in one message, asking per component for exactly **Update**, **Remind me in 7 days**, **Skip this release**, with the full component label, project/checkout path, exact current/available version and version source. Range declarations are not offered as exact-version upgrades. Do not add a fourth choice or re-prompt in the same session.

Record each component's choice under its own key, never unrelated returned keys. `<selected-decision>`: `update`, `remind` or `skip`. `<returned-component>`: the JSON-decoded `component` value (lowercase as returned; Windows paths have single backslashes, shown doubled in raw JSON text; Linux paths use forward slashes). Repeat `--component` only for components with the same choice:

```
sn-skill update decision '<selected-decision>' --component "<returned-component>"
```

Recorded means exit 0 **and** the line `Recorded <selected-decision> for N update component(s).` with N equal to the number of `--component` values. Non-zero → report "decision not recorded" (the launcher refuses a key without a recorded notice, changes nothing and lists valid keys). Do not retry with guessed keys.

Recording **Update** records authorization, not installation or build success.

## State

- Every shown notice, whatever the answer (including **Update** and no answer), withholds further notices for that component for seven days, also under `--force`. For an approved update that stopped before it was applied, take the target from `state` (`available`, `lastDecision: update`); do not wait for or force a new notice.
- Do not delete/edit/reset the state file `<user-profile>/.agents/.servicenow-fluent-agent-update.json` unless specifically requested. Preflight/status/verification do not reset decisions.
- Read [references/state-rules.md](references/state-rules.md) when explaining why a notice was or was not shown, or what **Remind me in 7 days** / **Skip this release** suppress.

## Execution evidence — every component

One owner per mutation: the interactive parent runs each apply operation; subagents never rewrite or repeat it. If permitted tools cannot safely execute and observe it, stop for an interactive handoff. Follow the [command policy's evidence rules](../../reference/sdk-commands.md#execution-evidence-and-recovery) (native exit and attributable output, **UNKNOWN** handling, original-run recovery, cwd binding). In addition:

- Timeout, shell integration errors and lost/truncated transcript are also **UNKNOWN**. In any UNKNOWN case do not kill a busy/user terminal, delete a lock, change run IDs to evade duplicate protection or retry via another launcher.
- Bind npm's prefix to the same project as its cwd; never fall back to npm's ancestor discovery.
- A build/typecheck needs its own native completion and error-free output; package metadata, generated files or the worker's success do not prove it. No instance deployment follows an upgrade automatically.

## Apply an approved update

Approval covers only the displayed component, **absolute target path** and exact version/revision. Stop on a dirty checkout, non-fast-forward pull, package-manager failure, lifecycle concern, engine mismatch, conflict or failed verification. If the project has no Git, say so; that is not rollback protection. Preserve original files before mutation. Never use `--force` (except the approved ServiceNowDocs index `build --force`), `--reinstall`, broad dependency upgrades, automatic Node changes, audit fixes or instance deployment.

### Agent package

1. Bind every command to the receipt's `repoRoot` (`<user-profile>/.agents/.servicenow-fluent-agent-install.json`), not the terminal's cwd.
2. Confirm a clean checkout on branch `main` (`git -C "<repoRoot>" branch --show-current`): `git -C "<repoRoot>" status --porcelain` may list only untracked (`??`) files outside `payload/`; any other line stops the update. Untracked payload files would be installed. After approval: `git -C "<repoRoot>" pull --ff-only origin main`. Then `git -C "<repoRoot>" rev-parse HEAD` must equal the notice's `id`; if `origin` moved further, report the actual revision before installing.
3. Run `node "<repoRoot>/bin/sn-fluent-agent.cjs" install` without `--force`, with native completion evidence; then the same path with `verify` separately. When asking approval, say that `install` also re-applies the `sn-skill` command, the installer's VS Code user settings and, on Windows, its user PATH registration for Git; on Linux, the `~/.bashrc` now-sdk function and the settings file the install summary reports (on a VS Code server, repeat the original `--settings-file` or `SN_FLUENT_VSCODE_SETTINGS`). Stop if `skipped conflicts` or `skipped obsolete conflicts` is above 0 in the install summary or `verify` is non-zero; exit 0 alone is not enough.
4. If completion capture fails, read the original receipt/logs and report UNKNOWN; do not repeat the installer. After verification, ask the user to open a NEW **PowerShell with now-sdk** terminal (bash on Linux); a window reload can restore old terminals. Require `Get-Command sn-skill -CommandType Function` (Linux: `sn-skill list`) before using skills.

### Project now-sdk (npm)

The bundled worker `sn-skill project-sdk` is npm-only; for another package manager or a refused layout, do not convert its lockfile or bypass the refusal. Read [references/project-sdk-worker.md](references/project-sdk-worker.md) when it refuses, for read-only `status` recovery, or when a run failed or is UNKNOWN. Lock removal, restoring backups or reinstalling each need explicit approval of that exact step.

1. Confirm the approved project path, package manager/config, exact declaration, lock and installed SDK. Review Git state, lifecycle scripts, `.nvmrc`, `engines` and outstanding warnings. A global SDK version is not project evidence. Stop on unsupported engines or unreviewed scripts.
2. Resolve the absolute `npm-cli.js` once per the [SDK command policy](../../reference/sdk-commands.md) (on Linux, `<npm root -g>/npm/bin/npm-cli.js`); the worker runs it with the same permitted Node that runs the worker. Choose a new, not-yet-existing absolute evidence directory outside the project, readable by your file tools (e.g. a new sibling of the project); state it in the conversation **before launch**. A missing directory/result does not mean the command did not start.
3. Run read-only `preflight` with the approved values. Exit 0 prints the plan; non-zero is a refusal with the reason on stderr:

```
sn-skill project-sdk preflight --project "<absolute-project>" --from '<approved-current>' --to '<approved-version>' --npm-cli "<resolved-npm-cli.js>" --run-dir "<absolute-new-evidence-directory>"
```

4. After approval and review, run the **same arguments** with `apply --approved` instead of `preflight`, ONCE, in the parent, through `sn-skill project-sdk` with the confirmed project cwd. `--approved` asserts approval already obtained; it is not authorization, and never a way around a denied tool or approval.
5. Whatever the terminal shows, read `request.json`, `npm.stdout.log`, `npm.stderr.log` and `result.json` from that directory with file tools. No result means UNKNOWN. The worker leaves `.sn-sdk-update.lock` on interruption/failure: do not delete it or automatically rerun; recover read-only per the worker reference.
6. Only `state: package-verified` with native exit 0, matching run/project/versions, and all four matching values (declaration, root lock declaration, resolved lock, installed package) proves the package update. Review warnings and the diff: other direct dependency changes are unexpected; SDK transitive lock changes must be reviewed. Preserve production versus development placement.
7. Run `now-sdk build` **separately** per the command policy, in the VS Code terminal (PowerShell with now-sdk on Windows; bash with the now-sdk function on Linux) from the confirmed project directory, passing the project path:

```powershell
now-sdk --version
now-sdk build "<absolute-project>"
Write-Output "sdk-build-exit=$LASTEXITCODE"
```

   In bash, run the same two commands and end the build line with `; echo "sdk-build-exit=$?"` ([bash notes](../../reference/sdk-commands.md#linux-and-vs-code-server-bash)).

   The version line must print the approved version; any other means the terminal was not in the project directory, another SDK answered, and the build does not verify the update. Without reliable capture, report **package updated; build unverified** and stop. Never claim build success from the worker.

### ServiceNowDocs

Choosing **Update** on the displayed ServiceNowDocs notice is the required documentation-maintenance approval; a check with no choice, or a failed lookup, authorizes nothing. The index commands belong to [sn-doc-lookup](../sn-doc-lookup/SKILL.md); it has no staged-swap or promote command, so the active index is replaced only by an in-place `build --force`. Read [references/docs-index.md](references/docs-index.md) when a lookup warning names `sn-doc-md@0.1.0` or lookup runs with explicit paths.

1. Confirm the checkout is clean and still on the release branch named in the notice. Bind Git cwd explicitly.
2. Run `git -C "<checkout>" pull --ff-only origin "<release-branch>"`; require real completion evidence.
3. Rebuild the active index in place. When asking approval, state the cost: `--force` deletes the existing index first; the build is silent until done and takes minutes for the full corpus; lookup is unavailable until it completes, and a failed build leaves no usable index. `--family` is only a label; use the checkout's release branch. `build` and `test` use the locations `paths` reports: confirm its `docs` is the checkout just pulled. Do not rename, move or delete index directories by hand.

```
sn-skill docs build --family '<release-branch>' --force
```

4. Run the lookup benchmark against the rebuilt index; require exit 0:

```
sn-skill docs test
```

5. Report the build's `manifest.git_head` (must equal `git -C "<checkout>" rev-parse HEAD`), any build `warnings` and the benchmark result. The index manifest is the provenance record: advisor state has no indexed-commit field. Do not bundle the corpus/index. Unknown completion does not authorize repeating a pull/build.
