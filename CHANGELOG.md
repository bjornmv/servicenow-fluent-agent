# Changelog

## 0.4.1 — Update check as a VS Code SessionStart hook

The agent no longer spends its first tool call of every session on `sn-skill update session-start`. A VS Code chat `SessionStart` hook declared in the agent file runs the 48-hour gate and, when due, the quiet checks before the first reply. The agent hears about updates only when there is something to act on.

### Upgrade notes

- **Re-run install after pulling.** The hook ships inside `.copilot/agents/ServiceNow Fluent.agent.md` (frontmatter `hooks:`), so install and uninstall add and remove it with that file; no new file or VS Code setting. A locally modified agent file is skipped as before and keeps the old per-session instruction until resolved. If uninstall keeps a modified agent file, its hook finds no launcher and does nothing.
- **Hooks must be allowed:** `chat.useHooks` (default on; policy `ChatHooks`) and a trusted workspace. Where hooks do not run, nothing is checked automatically; run **Check ServiceNow Fluent Agent Updates** or `sn-skill update check --only agent`. The **GitHub Copilot Chat Hooks** output channel shows each run.
- `node` must be on VS Code's PATH (Windows: `node.exe`, run through `powershell.exe -NoProfile`, so profile functions do not apply).

### Behavior changes

- **New launcher command `session-hook`** (`~/.agents/tools/sn-update-advisor.cjs`): runs the shared stamp gate (the workspace folder is its working directory; stdin is not read), and when due runs its own `check` for the agent, the workspace folder's SDK (only when the folder itself holds `now.config.json` or `aiux.json`) and an existing docs checkout (`sn-doc-md paths`). It always exits 0 with nothing on stderr. stdout is empty unless there are notices, withheld (`Update not offered`) updates or failed checks; then one ASCII-escaped `hookSpecificOutput.additionalContext` line tells the agent which components, that updates need approval, and to follow `sn-update-advisor`.
- **Time limit:** the hook starts no check after 20 seconds (VS Code kills hooks at 30; a frontmatter `timeout` is ignored) and hands each run its absolute end as `SN_FLUENT_UPDATE_DEADLINE`; `check` then times the checkout CLI out (`Update check failed: checkout CLI timed out after N s.`) before the hook's own 3-second-later kill. A notice printed by a check that also failed is still passed on. On Windows the checks put the Git selected at install (new receipt field `gitExe`) first in PATH, as VS Code terminals do. Git runs with `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`. Manual checks keep no limit.
- **Agent:** `## Session start` now says to act on hook context with `sn-update-advisor` and otherwise run no update checks; there is no per-session fallback command. `sn-skill update session-start` stays for manual use.
- Docs: README Update Advisor, technical guide (gate, hook contract, no-fallback reason), uninstall, `sn-update-advisor` and `sn-doc-lookup` skills.

## 0.4.0 — One sn-skill command, Linux and VS Code server, Node-only documents

Skill helpers now run through one OS-neutral command, `sn-skill <name> ...`, that works the same in the **PowerShell with now-sdk** terminal and in bash. The agent also runs on Linux (desktop VS Code, Remote-SSH, dev containers, `code serve-web`). `sn-doc-export` renders every archetype in Node; the Python backend is gone.

### Upgrade notes

- **Re-run install after pulling** (`node bin/sn-fluent-agent.cjs install`, or the agent update flow). Skills now call `sn-skill`, which exists only after install: on Windows it adds an `sn-skill` function beside `now-sdk` in the **PowerShell with now-sdk** profile (0.3.x profiles get it added; a custom `now-sdk` function is kept); on Linux/macOS it adds an `~/.local/bin/sn-skill` shim plus a PATH guard in the managed `~/.bashrc` block; on Windows with Git for Windows bash it also adds `~/bin/sn-skill` for Git Bash hosts.
- **Open a new SDK terminal** after install. An already-open terminal does not have the `sn-skill` function. Setup step 7 and the install summary now require `Get-Command now-sdk -CommandType Function` and `Get-Command sn-skill -CommandType Function`, plus `sn-skill list`.
- **Python document backend removed.** Framed archetypes (cover, Contents, header/footer) now render in Node. `render.py` and `requirements.txt` are deleted, `SN_AGENT_HOME` is no longer read, and `--backend python` exits 2 (`node`/`auto` are accepted and ignored with a note). An existing `SN_AGENT_HOME` Python environment can be removed.
- **Document metadata comes from front matter.** Put flat `key: value` front matter at the top of the Markdown; `--meta` overrides it. Missing required metadata for the chosen archetype exits 2 and writes nothing.
- **Installing from a downloaded ZIP** (GitHub "Download ZIP") needs `Unblock-File` on the ZIP before extracting; PowerShell refuses the unsigned Git setup script otherwise. A Git clone is not affected. Never change the execution policy.

### Behavior changes

- **`sn-skill` dispatcher** (`payload/.agents/tools/sn-skill.cjs`): names `rest`, `docs`, `doc-render`, `doc-capture`, `update`, `project-sdk`, `zip`; `sn-skill list` prints them. It runs the helper in a child Node with no shell, so arguments pass through unchanged, and ends with a stderr line `sn-skill: <name> exit=<N>` as native exit evidence. Unknown or missing helpers run nothing and exit 2. If the command is missing, skills fall back to `node "<user-profile>/.agents/tools/sn-skill.cjs"` with the same arguments (one wording everywhere) and report it; no reinstall or shell switch.
- **Skills converted:** every helper call in skills, references, the agent's session-start (`sn-skill update session-start`), `setup.md` (docs index build/test/paths) and `docs/uninstall.md` is one `sn-skill` line for both shells. The PowerShell/bash pairs for helpers are gone; a few `now-sdk` build/install and scan steps keep a bash variant beside the PowerShell block.
- **Quoting rule** in `sdk-commands.md` ([Skill helpers](payload/.agents/reference/sdk-commands.md#skill-helpers-sn-skill)): double-quote file paths, single-quote other values, no quote marks inside values (`%27` in paths/URLs), no empty argument, `--` or inline JSON.
- **Linux and VS Code server (bash):** `install` adds a managed `now-sdk` function to `~/.bashrc` (`lib/posix-terminal.cjs`; project-local SDK first, then `$(npm root -g)`); `configure-terminal` ensures it on POSIX instead of failing; `uninstall` removes the block and the managed shims (unmanaged files are left alone); `--no-shell-function` opts out. Settings target: `--settings-file <path>` or `SN_FLUENT_VSCODE_SETTINGS` (a VS Code server's `<server-data-dir>/data/Machine/settings.json`); otherwise `$XDG_CONFIG_HOME|~/.config/Code/User` on Linux and `~/Library/Application Support/Code/User` on macOS. Windows still uses `%APPDATA%\Code\User`. A Linux install without a D-Bus session warns that now-sdk cannot keep OAuth credentials.
- **Settings (all platforms):** home-relative location keys (`~/.copilot/agents`, `~/.agents/instructions`) beside the absolute ones, and `chat.agentSkillsLocations` (VS Code 1.142) beside `chat.skillsFilesLocations`. The settings file path is printed; a backup path only when a file existed.
- **`sn-rest`:** `--expect-field <f> --expect-contains <literal>` (GET with `--agent`, both together) adds an `expect` object (`field`, `rows`, `present`, `contains`) for read-only post-install content checks; `sn-build-install` uses it instead of a PowerShell `ConvertFrom-Json` block. On Linux/macOS an unavailable OS credential store (`Platform secure storage failure`) is reported as a host finding, not an auth error; Windows errors are unchanged.
- **`sn-doc-lookup`:** `paths` also reports `docsExists`, `indexExists` and `manifestExists` (still read-only). The non-Windows default is `$XDG_DATA_HOME|~/.local/share/SNDocs/{repo,index}`; Windows still fails closed without `%LOCALAPPDATA%`.
- **`sn-doc-export`:** all 8 archetypes render in Node (`frames.cjs`, `docx-frame.cjs`): cover, linked Contents, running header/footer and `Page N of M` for PDF, DOCX and HTML. `--check --archetype` reports the browser version (Chromium 131+ for a clean cover page; older browsers fall back to templates with a warning). `doc-render` and `doc-capture` take `--browser <exe>` (wins over `SN_DOC_BROWSER`, no fallback) and `--node-path <node_modules>` (searched first). On Linux/macOS Chrome, Chromium or Edge is found on PATH and in vendor folders; Linux adds `--disable-dev-shm-usage`.
- **New `sn-skill zip`** (`payload/.agents/tools/sn-zip.cjs`, dependency-free): `list` and `extract [--out <new-or-empty dir>]` for stored/deflate archives, the same on PowerShell 5.1 and bash (no `Expand-Archive`, `unzip` or Python). Refused with exit 2 before anything is written: traversal/absolute/drive-letter/backslash names, names Windows would rewrite or treat as devices, symlinks, zip64, encryption, duplicates, more than 100,000 entries, over 1 GiB per entry or in total, and compression-bomb ratios. Corrupt data exits 1 and removes partial output.
- **`sn-update-advisor`:** paths are written OS-neutrally (`<user-profile>/.agents/...`); checks run as `sn-skill update ...` and `sn-skill project-sdk ...`.
- **Installer:** when PowerShell refuses the unsigned Git setup script and the script itself carries the download mark (its `Zone.Identifier` stream), install stops with the `Unblock-File` fix (re-extract, or clone) and no stack trace. Other execution-policy or application-control refusals (`Restricted`, `AllSigned`, AppLocker/WDAC) stop with the ask-your-organization message instead; README documents both.
- **Source control:** the agent commits only when the user explicitly asks, never on its own initiative, and cannot push without a configured GitHub connection (it says so instead of working around it).
- Docs: `docs/linux-vscode-server.md`, README Linux section, PDI troubleshooting row, uninstall (shims, `~/.bashrc` block, Linux settings) and technical-guide notes. `setup.md` (agent-assisted setup) stays Windows-only; its step 7 also verifies the `sn-skill` function.

### Tests

- New: `sn-skill.test.cjs` (dispatcher, pass-through, exit evidence, shim text and install/uninstall, Git Bash detection), `posix-terminal.test.cjs` (bash function precedence, settings target, POSIX install/uninstall/configure-terminal), `sn-zip.test.cjs` (list/extract, refusals, caps, corrupt input), `doc-export/frames.test.cjs`, `docx-frame.test.cjs` and `render-e2e.test.cjs` (archetype frames, DOCX parts, required metadata exit 2, browser fallback, `--check`).
- `skill-payload` guards one OS-neutral `sn-skill` line per helper call, one fallback wording and the quoting rule; `sn-rest/cli-guidance` covers `--expect-*`; `docs-paths` covers existence fields and `XDG_DATA_HOME`; `vscode-terminal` covers adding `sn-skill` to 0.3.x profiles; `windows-git-environment` covers the download-mark message.
- Removed with the Python backend: `doc-export/python-home.test.cjs` and `test_python_home.py` (and the CI Python step).
- Release metadata, setup protocol markers, SDK worker version and its reviewed checksum aligned to 0.4.0 (worker logic unchanged).

## 0.3.15 — Local Git is the recommended source-control model

### Behavior changes

- The source-control reference (`payload/.agents/reference/servicenow-source-control.md`) now follows ServiceNow's SDK SDLC guide: the project folder is a Git repository and Git is the source of truth. The developer commits, pushes and opens pull requests with their own Git tooling (the agent never does); `keys.ts` and `@types/servicenow` are committed; other developers clone from Git; instance-side edits come back through `sn-transform`; `now-sdk install` targets dev, and test/production install from the Application Repository via `sn-cicd`.
- Studio Source Control (instance-bound `sys_repo_config` binding with "Commit Changes" in Studio) is kept as the legacy model, with its detection calls unchanged. When a project is both a local Git repository and SC-bound, the agent reports both and asks which path is authoritative.
- `sn-build-install` §4 checks the project's model after an install: for a local Git repository it reminds the user to review the diff and commit; the Studio commit reminder applies only to SC-bound apps.
- New policy test guards the recommended model.

## 0.3.14 — Agent-host terminal tool setting

### Behavior changes

- `install` adds `"chat.agentHost.customTerminalTool.enabled": true` to VS Code user settings (with the usual settings backup), to avoid Copilot agent terminal errors. It is also listed in the manual settings block, `manifest.json` and the README. `--no-vscode-settings` skips it like the other settings; uninstall leaves it in place as a shared setting.

## 0.3.13 — Setup proceeds past a blocked existing Git

A machine with an existing Git that cannot run (for example a non-whitelisted Git under Program Files that application control blocks, and that the user cannot uninstall) previously stopped setup with no supported route. Setup now selects a usable Git, or installs the pinned MinGit beside the unusable one, and makes VS Code use it.

### Behavior changes

- Git discovery (setup step 1, the MinGit worker and the Node installer) tries every candidate in one order: the per-user `%LOCALAPPDATA%\Programs\Git` copy first, then every PATH hit, Program Files and registered locations. A copy that fails to start, exits nonzero or is older than 2.54.0 is reported (`GIT_UNUSABLE=`) and skipped, never treated as absence and never changed. The first usable copy is selected by absolute path. Discovery now prints `GIT_EXE=none` instead of `GIT_EXE=absent`.
- `-InstallIfMissing` installs when **no usable** Git exists, not only when no Git exists. It installs side by side into the absent per-user target (`SIDE-BY-SIDE SETUP:`), leaves blocked/broken/older copies untouched, logs `SELECTED_GIT=` on `SKIP:`, and still refuses an occupied per-user target or a per-user registration remnant. It accepts the same three indexed agent-host Git settings as `-InstallForVSCode` (Copilot terminals set them; the old mode refused to install there).
- Windows puts machine PATH before user PATH, so user PATH registration can never beat a system Git. The worker logs `SHADOWED:` when that happens, and `install` / `configure-git` then select the chosen Git for VS Code, the same three ways as the VS Code Git repair guide: a `git` function beside `now-sdk` in the **PowerShell with now-sdk** profile (functions run before applications, so PowerShell always reaches the selected copy), its directory prepended in `terminal.integrated.env.windows` (Node child processes), and `git.path` if unset (an existing different `git.path` is kept with a warning). The function uses the repair guide's exact block, so either side recognizes the other's; it is updated for a new selection, removed when nothing shadows Git any more, and a modified block is kept with a warning. Machine PATH is never edited.
- The SDK profile's `now-sdk` function is always ensured: an existing **PowerShell with now-sdk** profile whose `-Command` lacks it gets it prepended (an existing custom `now-sdk` function is kept). A profile without a `-Command` string is reported, not rewritten.
- Setup step 7 accepts `git` as the profile Function when shadowed and also checks `git` from a Node child process.
- The 2.54.0 minimum is unchanged: an older working Git is not selected; the pinned build goes beside it.

### Documentation

- `setup.md` step 1 is a result table; step 3 explains selection vs. PATH order. `git-setup.md` and the `win-git-bootstrap` skill share one decision rule and state that selecting a different verified copy is not a policy bypass (it runs under the same policy, and a block on it stops setup). `git-setup.md`'s test narrative moved to the validation record.
- `docs/fix-vscode-git.md` no longer adds a `git` function; it writes the same two settings the installer writes, and a later full setup keeps them.

### Verification

- Linux: `npm run test:setup` passes. The mocked MinGit worker scenarios and the setup discovery block, normally Windows-only, also pass under PowerShell 7 in a Linux container (FullLanguage). Windows PowerShell 5.1 ConstrainedLanguage and a real blocked-Git machine have not been tested yet.

## 0.3.12 — Update notices despite untracked files

### Fixed

- Agent update check: untracked files outside `payload/` (drafts, `__pycache__`) no longer silently suppress the update notice. Tracked changes, or untracked files under `payload/`, still withhold the update, but the check now names it on stderr (`Update not offered for <component>: … but the checkout has local changes (N): …`) and still exits 0. Docs updates keep the strict rule.
- `sn-update-advisor` skill: report a withheld update verbatim and ask the user; never commit, stash, discard or delete the changes itself. Applying an update accepts only untracked files outside `payload/`.
- `.gitignore`: ignore `__pycache__/` and `*.pyc` anywhere in the checkout.
- Verified on Windows: with its untracked drafts removed, an older checkout (`5901208`) was offered the update to this fix (`fdf0ed3`) in a new VS Code chat.

## 0.3.11 — Skill review against now-sdk 4.13.6

Every skill was reviewed against now-sdk 4.13.6 (4.11.2 for comparison), each finding adversarially verified, and corrected. No PowerShell, instance install, authentication or deployment was executed during the review. A later test in VS Code on Windows (now-sdk 4.13.6, Node 25) passed every check of the final build except a real install to an instance, which was not approved and so not run.

### Security

- `sn-rest.js`: parse options strictly (unknown, repeated or `--flag=value` options exit 2 instead of being ignored, which could send a request, including a write, to the default alias). The path must be instance-relative and `--instance` must match the instance stored with the alias; redirects are not followed and plain http is limited to loopback, so the bearer and refresh token cannot reach another host. Non-GET requests need an explicit `--alias`; POST/PATCH/PUT need a valid JSON body. `--dump` is removed.
- `sn-doc-export/capture.cjs`: attach the OAuth bearer only to https requests on the instance origin; refuse a `--url` on another host and drop the header on third-party subresources and cross-origin redirects.
- `reference/platform-banners.md` no longer tells the agent to read the keychain token directly. Personal aliases, vendor prefixes and project names are removed from the payload and blocked by a test.

### Behavior changes

- `sn-doc-md`: keep underscores in `canonical_url`, titles and headings (about one in nine citation links was broken). Indexes built by `sn-doc-md@0.1.0` are reported as outdated and need an approved `--force` rebuild; a `read` that matches nothing exits 1.
- Update advisor: the installed launcher's `check` exits non-zero on failure (bad arguments, missing receipt, failed child) and refuses to overwrite malformed decision state; `update-decision` exits non-zero when a key matched no recorded notice.
- `bin/sn-fluent-agent.cjs` accepts only each command's own options. An unknown, repeated or value-less option, or an extra argument, exits 1 before any work (previously `check --bogus` ran a check and exited 0). Options go after the command (`--dry-run install` is refused with that hint). `--help` prints usage instead of running `install`, and `update-decision` reads the decision even when `--component` comes first. `session-start` and `state` in the launcher refuse arguments.
- Install and uninstall remove directories that a managed-file removal leaves empty under `.agents` and `.copilot`, and install also removes skill folders that hold only empty directories (left by earlier installs, such as `win-git-bootstrap`). Directories that still hold a file are kept.
- `win-git-bootstrap` is setup-only and moves from `payload/.agents/skills/` to `tools/win-git-bootstrap/`. Worker bytes and checksums are unchanged; the next install removes the profile copy that earlier versions installed. The VS Code-only repair guide downloads the worker from the new path.

### Skill corrections

- `sn-transform`: `--table` without `--id`/`--from` is a local filter that copies build XML into `metadata/` and corrupts later builds; bare `transform --auth` is a whole-app sync that overwrites local source, not an interactive picker.
- `sn-build-install` and `fluent.instructions.md`: choice handling defaults to the destructive v3 mode; `--skip-flow-activation` does not preserve a published flow; asynchronous install output and post-install checks per record type.
- `sn-download`, `sn-new-app`: `init --from` cannot be combined with `--appName/--scopeName`; `init` needs `--template` to be non-interactive; dependencies must be installed before transform.
- `sn-new-app`: `init` checks template availability on the npm registry with no timeout, also with `--noUpdate`. Where Node cannot reach the registry it stays silent with an empty folder for about 5 minutes and then scaffolds; the skill now says to wait up to 6 minutes instead of stopping it.
- `sn-cicd` description names reading ATF results and logs, which routed to `sn-rest`.
- `sn-transform`: an unversioned project needs an approved Git baseline or a folder backup before a transform. `sn-rest.js`: every refusal ends with "Nothing was sent."
- `sn-auth`: OAuth `auth --add` exits 0 on failure; never run `auth --print`. `sn-cicd`: `SN_SDK_*` variables override `--auth`; no retry after a timeout.
- `sn-explain` owns the missing-topic / older-SDK stop branch; `sn-fix-build` diagnostics were rebuilt from errors reproduced on 4.13.6.
- `sn-add-playbook` (variants and public access, gated), `sn-add-graphql-api` (`Now.include` copies a resolver verbatim), `sn-add-record`, `sn-add-test-suite`, `sn-ui-page-vite`, `sn-react-ui-design`, `sn-lux`, `sn-lux-build` (AIUX builds need the project-local SDK) and `win-git-bootstrap` corrected.
- Tests check every payload Markdown link and heading anchor, bind the Git procedure to its worker, and pin the corrected guidance.

### Technical guide

- Add a source-linked technical guide covering architecture, managed-file lifecycle, Windows execution, configuration/state, update workers, authentication/REST boundaries, documentation tooling, testing and publication. Distinguish implemented checks from instruction-level safeguards and document verification limitations; no runtime behavior changes.

### Manual uninstall guide

- Document separate manual removal of agent files, selected SDK credentials, the global SDK, VS Code settings, offline docs, setup-owned Git and optional local state/backups. Preserve shared tools, edited files and project work; no uninstaller behavior changes.

### PDI connection guide

- Add a beginner-friendly PDI connection guide with redacted Developer Portal screenshots: log in to the PDI first, choose **Terminal -> New Terminal** in VS Code, then manually run `now-sdk auth --add dev123456` with your own instance name and follow the OAuth prompts.
- Show these manual steps and the guide's GitHub link after a non-dry-run install without payload conflicts; include the same next step in the completed agent-assisted setup response. The agent does not run authentication for the user.

## 0.3.10 — Simpler advisor execution

- Provide copy-ready direct Node commands with immediate native exit-code reporting in the update-advisor skill; delegate resolved commands unchanged rather than inventing PowerShell capture wrappers.
- Keep existing check timers, approval gates and update workflow unchanged. Align release metadata and setup worker/guide versions and checksum.

## 0.3.9 — Upgrade improvements

- Publish the accumulated improvements below as 0.3.9. This release bump adds no new runtime behavior beyond the preceding published commit; known live completion-capture issues remain separate work.
- Align package/manifest versions, setup protocol markers, SDK worker release stamp and its reviewed checksum. Read the expected release from VERSION in two setup tests instead of hard-coding 0.3.8.

### Shared session-start update stamp

- Make the custom agent's first workflow action a local `session-start` check. Missing or older-than-48-hour user-level stamp is created/touched before invoking the advisor; fresh stamps are not refreshed. The stamp records an attempt and is separate from reminder/skip state.
- Route due startup checks to the agent repository, identified project SDK and configured existing docs checkout. Preserve scoped targets, component intervals, reminder/skip choices and approval before applying updates; remove contradictory task-type exclusions for this gate.
- Add isolated tests for stamp creation, freshness boundaries, stale touch, shared-session behavior, state preservation, unexpected file types and errors. No extension or background trigger; live new-session adherence requires separate Copilot verification.

### Isolated agent-update integration test

- Exercise production advisor detection against a real local Git remote and an older fixture checkout at the same package version. Require recorded approval in the test driver before a fast-forward, then run the production payload installer/verifier against a temporary home with host configuration blocked.
- Verify backups, receipt hashes, current-state silence, 48-hour checks, seven-day reminders, skipped revisions, dirty checkout suppression, failed-check evidence and preservation of customized installed files. Document that a current checkout or installer exit 0 alone does not prove payload verification.
- Add the offline integration test to advisor/full/CI suites. No runtime updater changes; live Copilot prompting and Windows/profile integration remain separate acceptance work.

### Concise setup action cards

- Restructure setup into Pre / Run / Expect / If–then cards, with linked executable, recovery and rationale appendices in the same checksum-protected complete guide. Preserve all 20 PowerShell blocks and both workers unchanged.
- Reduce repeated prose across the whole guide, not just the main path. Add a read-only metrics command and regression budgets for total prose, the main path and SDK step; bind fixture extraction to stable block IDs rather than narrative position.
- Lead with Complete / Action needed / Could not complete and a concrete next action; retain truthful UNKNOWN evidence and same-operation recovery, approval, provenance and fresh-terminal gates. Offline tests do not certify live Copilot completion behavior.

### Setup preflight and checkout safeguards

- Declare the supported Windows/Copilot target and Node >=20.18.0 minimum; add executable complete-guide hash/marker verification, Git discovery/version decisions, literal-path recovery, checkout identity checks and a resumable final report.
- Clone docs into a recorded incoming sibling and preserve interrupted work; pin fast-forward pulls to verified origin/branch, bind the agent destination/cwd, and inspect index manifest provenance before choosing reuse or an approved rebuild. Keep Australia and existing rebuild/terminal-acceptance gates rather than silently migrate them.
- Keep SDK `latest` intentional, verify/pin the expected npm global prefix before installation, and reject EBADENGINE for compatibility review even after native npm exit 0. Preserve logs, true exit status and read-only recovery; update the reviewed worker digest.
- Publish a complete Git setup text and guide/worker hashes in both current and versioned manifests; clarify that only the current versioned reference is retained. Add Windows fixture tests with fake downloads/Git/npm rather than live setup operations.

### Setup completion recovery

- Distinguish early/blank terminal returns, pending operations, native failure and verified package completion. Measure actual elapsed waits, refresh evidence before unresolved handoff, and preserve a resumable original-run checkpoint instead of restarting installation.
- Respect notification-only/no-polling hosts and require a confirmed independent context for recovery. Validate original durable success directly, retain conflict/identity gates and continue at step 3 without an unnecessary recovery launch. Add offline instruction regressions; live terminal completion/notification behavior is not certified by these tests.

### Focused agent and compact co-loaded baseline

- Restructure the runtime agent around supported host, explicit precedence, one routing table, individual invariants with reasons, and approval gates. Move incident details and maintenance instructions to their owners.
- Replace whole-section baseline copying with a 100–150-word hard-stop summary and pointers. Document simultaneous agent/file-instruction loading and intentional limited safety overlap.
- Give automation ownership a skill-local home, preserve record-move/transform-force warnings, and remove assumed memory-tool paths. Add word-budget, duplication, ownership, link and approval regression checks.

### VS Code-native skill guidance

- Remove other-harness launcher/tool/reload guidance from all shipped instructions, skills and references. Keep SDK execution in VS Code PowerShell, regenerate the baseline and retain approval, project-directory and UNKNOWN-completion rules.
- Make `sn-rest` explicitly a skill using its bundled Node CLI, not a registered tool. Add schema/inheritance, bounded table/pagination and Stats recipes; document actual CLI limits and explicit write approval instead of claiming nonexistent wrapper protections.
- Add regression checks across hidden payload directories and offline CLI examples/envelopes. No authentication, SDK package or instance changes are required.

### Stable setup entry point

- Clarify that the install prompt is for a new agent session.
- Make the unversioned `/setup/` URL canonical in the setup prompt and README. Publish complete `/setup.txt` and `/setup-manifest.json` alongside the existing `/downloads/Invoke-SdkSetup.ps1`.
- Keep guide completeness, protocol-version and SHA-256 checks; stale/mixed content must stop. Versioned copies remain reference artifacts, not the default setup route. Worker behavior and package versions are unchanged.

### Skill and packaging cleanup

- Normalize version-neutral skill triggers and metadata; retain honest historical SDK verification in bodies. Remove personal backend paths/examples and configure optional document export explicitly.
- Consolidate table/business-rule wrappers into `sn-add-record` with type references; retain specialized GraphQL/Playbook/ATF workflows. Rename `sn-doc` to `sn-doc-export` and narrow Git bootstrap to setup.
- Move development tests out of the runtime payload and enforce exclusions in install/verify/refresh, preserving the docs setup acceptance harness. Retired managed files use the existing backup/conflict-preserving migration.
- Generate a trimmed fallback baseline from the canonical agent and reject drift. Explain user-global discovery in README. Align distribution manifest version and include it in publication checks.

### Upgrade execution safeguards

- Outside the shared session-start gate, skip update checks for documentation-only/read-only tasks. Scope checks with `--only agent|sdk|docs`; identify the project path and declared-version source in SDK notices. Do not treat a range floor as an installed SDK version; compare prereleases correctly.
- Replace cwd-dependent project npm instructions with a small guarded npm-only worker: explicit cwd/prefix, strict engine/config checks, manifest/lock backups, exclusive ownership, durable streams/native result, independent version/manifest verification and read-only recovery. Unsupported layouts stop; no SDK/instance/global install is performed by this worker.
- Treat missing native completion, mixed output and terminal errors as UNKNOWN across mirrored agent/baseline/lookup instructions. No blind retries, follow-on build claims or corpus diagnoses from blank transcripts.
- Add isolated regression coverage for wrong-root updates, interrupted/delayed output, duplicate runs, engine/manager/layout refusals, scoped checks and truthful recovery; wire it into existing test gates. Windows Copilot terminal end-to-end acceptance and a real approved package upgrade remain separate, untested acceptance steps.

## 0.3.8

- Route documentation questions through the current lookup resolver/defaults, not historical cache/MCP memories or guessed index paths. Diagnose ENOENT before declaring an index missing; never silently switch corpora or rebuild for a lookup.
- Require source text and exact role/API identifiers; Markdown-escaped underscores and grep misses do not establish absence. Preserve excerpts, citations, exit/error evidence and saved-output paths through execution subagents.
- Clarify the required `--docs` value in mirrored advisor guidance. Capture/bound routine-check output and emit only successful actionable update JSON, keeping diagnostics quiet; preserve decision-mode errors and failure status.
- Add UI Builder role/identifier benchmark coverage and isolated launcher/default-path/evidence regressions. The existing index remains usable without a rebuild; no SDK/Git behavior changes beyond the worker release stamp.

## 0.3.7

- Make fresh-terminal verification the installing agent's final step: save completed results, retire only its own idle setup shell in a separate call, then let the next synchronous terminal call create a new shell.
- Require different old/new PIDs, the configured SDK profile, correct Git path/version, working SDK function/version and payload verification. No extension, added task, injected PATH/function or forced application restart.
- Retain the prohibition on appending exit to installation commands; explicitly separate installation success from pending/failed terminal integration. The lifecycle is source-confirmed; live Copilot acceptance remains to be tested.
- Keep the launch prompt short and add offline regressions for the final-step order, safe handoff and honest acceptance reporting. SDK worker behavior is unchanged apart from its release stamp.

## 0.3.6

- Publish release-specific full-text setup instructions, SDK worker and a checksum manifest; gate execution on guide version/completeness instead of trusting stale web-extraction results.
- Validate package/VERSION, guide markers/URLs and SDK worker version together before Pages writes any output.
- Add bounded read-only SDK completion waiting and atomic exit/result publication. Warn against queued diagnostics in a busy terminal and premature failure reports based on an early missing-marker sample.
- Confirmed the latest failed session had received the old inline 0.3.4 procedure; npm actually succeeded after its last file-status sample. No SDK reinstall is needed.

## 0.3.5

- Replace inline SDK installation with a hash-verified saved worker run in a child PowerShell process, avoiding runner-added `exit` closing the interactive host.
- Persist package verification and provide read-only recovery for the exact run, including 0.3.4 logs; missing/nonzero evidence never triggers a reinstall or a false success.
- Refuse duplicate installation into the same run directory and prohibit execution-subagent rewriting of setup/recovery commands.
- Test parent-shell survival, durable results, recovery without writes/npm, missing SDK files and SDK-download checksum enforcement.

## 0.3.4

- Separate SDK package installation/metadata checks from live `now-sdk` function acceptance in a genuinely new configured VS Code terminal; never probe batch shims.
- Capture npm stdout/stderr separately with an explicit exit-code log so PowerShell 5.1 warnings cannot masquerade as installation failures.
- Clarify ConstrainedLanguage-safe diagnostics, bounded file review, optional-dependency reporting and no retry merely because a transcript is truncated or a command times out.
- Resolve setup scope wording and add isolated PowerShell capture regressions; no live reinstall or security-policy changes.

## 0.3.3

- Standardize Windows docs and index defaults on `%LOCALAPPDATA%\SNDocs\repo` and `%LOCALAPPDATA%\SNDocs\index`, retaining explicit-path and environment overrides.
- Share path resolution across build/search/read/benchmark commands; add a read-only `paths` command, with no legacy fallback or automatic migration.
- Update full setup to clone into the exact docs destination and build/verify the index separately; guard index rebuilds against source or unrecognized directories.
- Test with isolated tiny fixtures only; do not populate the new real-machine docs location during this change.

## 0.3.2

- Replace shell-specific Git PATH workarounds with Windows user PATH registration and native environment propagation, preserving raw values/types and never passing PATH through setx.
- Add explicit environment-only `configure-git` / `-RefreshEnvironment` modes; no Git/payload reinstall, elevation, machine PATH or policy changes.
- Back up settings and remove known legacy Git profile overrides/startup blocks without replacing unrelated customization.
- Test long PATHs, expandable references, duplicates, concurrency and notification failures; distinguish native-update success from real terminal acceptance.

## 0.3.1

- Automatically configure the Windows VS Code terminal profile with the verified Git directory ahead of inherited PATH, including when the parent process has a stale environment.
- Preserve JSONC comments, unrelated profiles, custom arguments and environment settings; back up edits and stop on ambiguous/disabled PATH customizations.
- Add `configure-terminal` for settings-only repair and `--git-exe` to retain the prerequisite's verified executable.
- Require bare Git resolution in a real new configured terminal before reporting setup complete; add stale-PATH regression tests.

## 0.3.0

- Add a quiet, state-backed update advisor for the agent, active project's now-sdk dependency, and contextually requested ServiceNowDocs checkout.
- Add seven-day reminders and release-specific skips, with no update output until a real action is available.
- Add a VS Code task and documented three-choice update workflow.

## 0.2.0

- Refresh the packaged ServiceNow Fluent agent, instructions, references, tools, and skills from the current maintained setup.
- Add GraphQL API, playbook, ATF, CI/CD, documentation lookup, Lux/AIUX, React UI, and Vite UI Page workflows.
- Add SDK command policy guidance and expanded REST helper validation tooling.

## 0.1.1

- Add VS Code process tasks for install/update, verify, and dry-run install.
- Document VS Code Git clone and pull workflow.

## 0.1.0

- Initial ServiceNow Fluent agent distribution package.
- Includes VS Code custom agent, instruction files, ServiceNow skills, reference files, and helper tools.
- Adds a dependency-free Node installer for locked-down Windows machines.
