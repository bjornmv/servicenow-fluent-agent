# ServiceNow Fluent Agent

Team distribution package for the **ServiceNow Fluent** VS Code custom agent, its instruction files, and its ServiceNow skills.

The package is designed for locked-down Windows machines where Node, npm, and VS Code are available, but PowerShell/cmd scripts may be restricted. Missing Git can be provisioned through the pinned selective MinGit procedure below. The Agent-file installer is a dependency-free Node program; it does not bypass policy.

## Agent-assisted setup

Use the complete [release-specific 0.3.8 guide](https://bjornmv.github.io/servicenow-fluent-agent/releases/0.3.8/setup.txt), or read local [setup.md](setup.md) in full. Confirm its protocol version, all seven steps and end marker before changes. A successful web fetch can still return stale or excerpted instructions: do not execute those. The release directory includes the SDK worker and a SHA-256 manifest; publishing rejects mismatched release markers and worker versions.

The final step has the installing agent retire only its own idle setup shell after saving all results, then use `run_in_terminal` again to create a fresh SDK-profile terminal. It compares old/new PIDs and verifies Git, the `now-sdk` function and the payload without an extension or injected startup commands. This lifecycle is source-confirmed; a live Copilot run is still needed. If the handoff cannot be performed safely, report installation completion separately from pending terminal integration.

Read [setup.md](setup.md) for the overall sequence. Its Git prerequisite step links to the separate [Windows Git setup procedure](git-setup.md), which reuses the packaged `win-git-bootstrap` skill and worker. Working Git is preserved; only genuinely missing Git is installed, using pinned MinGit 2.54.0.windows.1 with blocked Unix find/sort omitted before extraction.

The Git page provides a directly downloadable, SHA-256-checked worker, so no Git clone is required to bootstrap Git. The Pages workflow publishes both pages and copies the canonical payload script to `/downloads/Ensure-MinGit254.ps1` in the same deployment. These URLs become available after the change is pushed and Pages deployment succeeds.

Maintainers: run the `test:setup` command from `package.json` before publishing (Windows runtime tests skip on other platforms). If the worker changes, review it and update the **worker script** hash in `git-setup.md`; the worker's separate pinned **MinGit ZIP** hash must not be confused with it. Publication fails if the script and page digest disagree. Do not duplicate the worker at the repository root.

## Install with VS Code

VS Code can handle the Git clone.

1. Open Command Palette.
2. Run **Git: Clone**.
3. Paste:

   ```text
   https://github.com/bjornmv/servicenow-fluent-agent.git
   ```

4. Choose a normal local folder, for example `C:\Users\<you>\source`.
5. Open the cloned folder in VS Code.
6. Run **Terminal: Run Task** → **Install/Update ServiceNow Fluent Agent**.

Then restart VS Code, or reload the VS Code window.

## Install with terminal

Clone the repo somewhere normal, not directly into your user-profile agent folders:

```text
git clone https://github.com/bjornmv/servicenow-fluent-agent.git
cd servicenow-fluent-agent
node bin/sn-fluent-agent.cjs install
```

Then restart VS Code, or reload the VS Code window.

## Shell-independent Windows Git PATH

On Windows, installation verifies Git >=2.54.0, registers its directory in **Windows user PATH**, and requests native Windows environment propagation. It does not add Git to any PowerShell/VS Code profile, shell startup script, function or alias. Use `install --git-exe "C:\\path\\to\\git.exe"` to retain the exact executable selected during prerequisites. The Node installer never downloads/reinstalls Git.

Raw PATH and its registry type are backed up and preserved, including long values and `%VARIABLE%` references. `reg.exe` reads the raw value; a typed Windows registry-provider write preserves quotes and the original type. Windows `setx.exe` receives **only** a short owned `SN_FLUENT_ENV_REFRESH` notification marker, never PATH. A missing/blocked native updater or failed readback stops setup. No elevation, machine PATH or policy changes are used. See Microsoft's [setx documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/setx) for future-process behavior and its value-length limit.

For environment repair only, without Git/payload reinstallation:

```text
node bin/sn-fluent-agent.cjs configure-git --git-exe "C:\\path\\to\\git.exe"
```

Known legacy Git profile overrides/startup blocks are removed conservatively, with settings backups. Other profiles and custom settings are preserved. `configure-terminal` now configures only the SDK profile; Git works independently of it. `--no-vscode-settings` does not skip the Windows user environment operation.

Save work and restart affected terminal applications from a refreshed launcher, then verify bare `git --version` in the actual hosts/shells you use. Existing processes cannot be forced to adopt new environments by a registry update or broadcast. Do not claim all terminals are verified from a simulated test, absolute-path probe or successful native-update request.

## SDK package versus terminal readiness

The full setup guide uses the hash-verified `tools/Invoke-SdkSetup.ps1` saved worker in a child PowerShell process. It installs the SDK through Node's npm JavaScript entry, preserving separate stdout/stderr logs, an explicit exit code and `sdk.result.json`. Package installation is verified from metadata and the entry file; it does not require running a batch shim. Never paste the installer inline or append `exit` to the shared terminal command.

If the runner loses its completion result, do not queue diagnostics into the same busy terminal. Re-read the exact run's result files with file tools, or run the same worker in an idle terminal/direct-process tool with the exact `-RunDirectory -WaitSeconds 180` **without `-Install`**. A missing marker in an early sample is not failure; recheck after bounded waiting. This read-only recovery also supports 0.3.4 logs. A verified result resumes setup at step 3 without reinstalling; missing or failed evidence stops for review. The worker refuses `-Install` against an existing run directory.

After agent installation configures **PowerShell with now-sdk**, create a **new terminal using that profile**. Require `Get-Command now-sdk` to resolve to a **Function**, then run `now-sdk --version`. Old terminals do not gain the function retroactively. Do not probe `now-sdk.cmd`, reinstall the SDK to repair an old shell, or treat package presence as CLI acceptance. Policy blocks require review, not alternative-launcher retries.

Timeouts and truncated transcripts mean completion is unknown: inspect the existing operation/logs instead of repeating installation. Git remains shell-independent; its PATH update is separate from this SDK-only function.

## Documentation paths

Windows setup and the documentation lookup CLI share these defaults:

```text
%LOCALAPPDATA%\SNDocs\repo
%LOCALAPPDATA%\SNDocs\index
```

Explicit CLI paths take precedence over `SN_DOCS_HOME` / `SN_DOC_MD_INDEX`, then these defaults. The lookup CLI's `paths` command only reports locations. Installing/updating skill files does not download, move or index docs; the full setup procedure clones and indexes them in its dedicated steps. Existing checkouts elsewhere are left alone, with no silent fallback.

## Update with VS Code

1. Open this repo folder in VS Code.
2. Run **Git: Pull**.
3. Run **Terminal: Run Task** → **Install/Update ServiceNow Fluent Agent**.
4. Restart/reload VS Code.

## Update with terminal

```text
cd servicenow-fluent-agent
git pull --ff-only
node bin/sn-fluent-agent.cjs install
```

Restart/reload VS Code after updates.

## Verify

With VS Code: run **Terminal: Run Task** → **Verify ServiceNow Fluent Agent**.

With terminal:

```text
node bin/sn-fluent-agent.cjs verify
```

## Update Advisor

The installed agent skips advisory checks for documentation-only questions, read-only reviews and simple/time-sensitive command requests. Before substantive implementation/build work it checks only the identified project's SDK, at most every 48 hours. Checks remain quiet and nonblocking. Notices identify the absolute target and version source, offering only **Update**, **Remind me in 7 days**, or **Skip this release**.

Use `--only sdk --project "<absolute-root>"`, `--only agent`, or `--only docs --docs "<checkout>"` to limit discovery. Docs maintenance must be requested; answering a docs question is not maintenance. SDK notices compare exact project declarations, not global installs or range lower bounds. No check installs packages, pulls repositories, rebuilds indexes, changes authentication or deploys anything.

Approved standalone-npm SDK upgrades use the skill's `scripts/update-project-sdk.cjs` worker: explicit cwd and npm prefix, disabled lifecycle scripts, strict engines/no force, manifest/lock backups, separate logs, atomic result and per-project duplicate-run lock. Run `preflight` first; `apply --approved` requires prior human approval and review. `status` is read-only recovery of the original run. Missing, delayed or misattributed output means UNKNOWN, never success or permission to retry. Workspace/linked/unsupported layouts stop for review. Package verification and build acceptance are separate; the worker never runs the SDK. See the installed **sn-update-advisor** skill for the complete contract.

Run an explicit agent-package check with VS Code task **Check ServiceNow Fluent Agent Updates**, or from a terminal:

```text
node bin/sn-fluent-agent.cjs check-updates --only agent --force
```

The advisor records its non-sensitive timing and decision state in `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json`.

## Installed locations

Installation is user-global: skill descriptions are discoverable in every workspace, including non-ServiceNow workspaces—an intentional convenience/context-cost trade-off.

The installer copies runtime files from `payload/` into the current user's profile:

```text
%USERPROFILE%\.copilot\agents\ServiceNow Fluent.agent.md
%USERPROFILE%\.agents\instructions\...
%USERPROFILE%\.agents\reference\...
%USERPROFILE%\.agents\skills\...
%USERPROFILE%\.agents\tools\...
```

It also attempts to add the required VS Code user settings:

```json
{
  "chat.promptFiles": true,
  "github.copilot.chat.codeGeneration.useInstructionFiles": true,
  "chat.agentFilesLocations": {
    "C:/Users/<you>/.copilot/agents": true
  },
  "chat.instructionsFilesLocations": {
    "C:/Users/<you>/.agents/instructions": true,
    ".github/instructions": true
  },
  "chat.skillsFilesLocations": {
    "C:/Users/<you>/.agents/skills": true
  }
}
```

Before modifying VS Code settings, the installer creates a backup next to `settings.json`. On Windows it also configures the SDK profile separately from shell-independent Git user PATH registration, as described above. Edits are surgical rather than reformatting the entire JSONC document.

## Useful commands

```text
node bin/sn-fluent-agent.cjs install
node bin/sn-fluent-agent.cjs install --dry-run
node bin/sn-fluent-agent.cjs install --force
node bin/sn-fluent-agent.cjs install --no-vscode-settings
node bin/sn-fluent-agent.cjs verify
node bin/sn-fluent-agent.cjs status
node bin/sn-fluent-agent.cjs uninstall
```

## Safety behavior

- Existing files are backed up before overwrite.
- Files changed locally after the last install are skipped unless `--force` is used.
- Obsolete managed files are removed only when unchanged from the last installed version.
- Install metadata is stored at `%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json`.

## Skill and instruction maintenance

- Descriptions are version-neutral, explicit **Use when** triggers. `argument-hint`, `compatibility`, and `metadata.version: '1'` are consistent; the latter identifies the skill format, not the distribution or SDK version. Body **Verified against** lines record historical evidence, not runtime pins or newly tested compatibility. Respect each project's SDK and engines.
- `sn-add-record` owns ordinary authoring; table and business-rule traps are lazy-loaded references. `sn-explain` owns API discovery. GraphQL, Playbook and ATF suites retain specialized security/DSL workflows.
- `sn-doc-export` creates PDF/DOCX; `sn-doc-lookup` searches official docs. Optional Python export requires an explicit absolute `SN_AGENT_HOME`, with no personal default. The old `sn-doc`, `sn-add-table` and `sn-add-business-rule` skill entries are retired; unchanged receipt-owned files are backed up/removed on update, while local edits remain for review.
- `win-git-bootstrap` is setup-only; its pinned worker remains at the existing path used by the installer and published checksums.
- Development tests live under `tools/test/` and are excluded from installation. Only `sn-doc-lookup/test/` ships, because setup uses its acceptance harness. Live REST tests/benchmarks are manual opt-in, not part of offline tests.
- Edit the canonical `payload/.copilot/agents/ServiceNow Fluent.agent.md`, then run `node tools/generate-baseline.cjs` (`build:instructions`). The baseline contains only selected high-risk sections. CI and install preflight reject stale generated instructions; detailed workflows stay in skills/file-specific instructions.

## Maintainer refresh

Prefer editing the source payload directly. Only when deliberately importing reviewed installed customizations, refresh from `%USERPROFILE%` (this replaces the source payload and regenerates the baseline):

```text
node tools/refresh-payload.cjs
```

Then review the diff and run `test:setup`. Before a release, align `VERSION`, `package.json`, `manifest.json`, setup guide markers/URLs and SDK worker version/digest; the Pages gate rejects drift. Commit/publish only after approval and verification.

## Per-user ServiceNow auth

This package does **not** include ServiceNow credentials, OAuth tokens, now-sdk auth state, or personal VS Code session data. Each user must configure their own now-sdk auth alias.
