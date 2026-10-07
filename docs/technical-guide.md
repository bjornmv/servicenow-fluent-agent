# ServiceNow Fluent Agent: technical guide

**Audience:** maintainers, developers and administrators supporting the Windows / VS Code Copilot distribution.

This guide explains the implementation and its operational boundaries. For procedures, use [setup](../setup.md), [PDI connection](connect-pdi.md) and [component uninstallation](uninstall.md). The version is recorded in [VERSION](../VERSION); implementation details should be reviewed with the source revision being deployed. This document is not evidence that a particular computer or instance has passed acceptance.

## Contents

- [Architecture](#1-architecture)
- [Source layout and instruction ownership](#2-source-layout-and-instruction-ownership)
- [Installation and managed-file lifecycle](#3-installation-and-managed-file-lifecycle)
- [Windows command execution](#4-windows-command-execution)
- [Configuration and persisted state](#5-configuration-and-persisted-state)
- [Update discovery and approval](#6-update-discovery-and-approval)
- [Project SDK update worker](#7-project-sdk-update-worker)
- [Authentication and instance operations](#8-authentication-and-instance-operations)
- [Documentation lookup and export](#9-documentation-lookup-and-export)
- [CLI reference](#10-cli-reference)
- [Verification and troubleshooting](#11-verification-and-troubleshooting)
- [Testing and publication](#12-testing-and-publication)

## 1. Architecture

The distribution is a **custom-agent configuration plus local helpers**, not a ServiceNow application or a separate VS Code extension. VS Code Copilot supplies the model, execution tools and conversation lifecycle. Installing a skill does not register a similarly named tool.

```text
Repository checkout
  bin/ + lib/                  Installer and update-advisor implementation
  payload/                     Runtime files copied into the user profile
  tools/                       Source-maintenance, setup and test utilities
       |
       | node bin/sn-fluent-agent.cjs install
       v
User profile
  .copilot/agents/              Custom agent identity and workflow
  .agents/instructions/        Applicable file-level instructions
  .agents/skills/              Task procedures and bundled helpers
  .agents/reference/          Shared command and platform guidance
  .agents/tools/              Installed helper entry points
       |
       | VS Code discovers instructions; the agent selects a skill
       v
Host-approved execution
  now-sdk                     Project-local SDK first, global fallback
  Node helpers                REST, documentation, guarded npm updates
  Git / PowerShell workers    Repository and Windows setup operations
       |
       v
Authorized targets
  Confirmed local project, documentation checkout or ServiceNow instance
```

Installation is user-global: skill descriptions can be discovered across workspaces, including non-ServiceNow projects. Task routing and applicable file patterns govern which guidance to use; they do not replace explicit project scoping.

The installer is dependency-free Node code. Individual workflows have additional requirements: an appropriate SDK and Node version, Git, an authenticated instance, or optional document-rendering packages. Installing the agent does not install every workflow dependency.

The supported operational baseline is Windows x64 with VS Code Copilot, Node **>=20.18.0**, npm and working Git **>=2.54.0**. Project-specific Node/SDK constraints still take precedence for project operations. Tests running on another platform do not establish support for Windows terminal integration there.

## 2. Source layout and instruction ownership

| Source | Responsibility |
| --- | --- |
| [bin/sn-fluent-agent.cjs](../bin/sn-fluent-agent.cjs) | Install, verify, status, uninstall, configuration and advisor CLI dispatch. |
| [lib/payload-files.cjs](../lib/payload-files.cjs) | Deterministic payload enumeration and exclusions. |
| [lib/jsonc-settings.cjs](../lib/jsonc-settings.cjs) | Targeted JSON-with-comments settings edits. |
| [lib/vscode-terminal.cjs](../lib/vscode-terminal.cjs) | Git executable validation and SDK terminal-profile configuration. |
| [lib/windows-git-environment.cjs](../lib/windows-git-environment.cjs) | Invoke the Windows environment worker and validate its completion. |
| [lib/update-advisor.cjs](../lib/update-advisor.cjs) | Discovery, component timing, release identities and decisions. |
| [payload/.agents/tools/sn-update-advisor.cjs](../payload/.agents/tools/sn-update-advisor.cjs) | Installed session gate and receipt-directed forwarding to the checkout CLI. |
| [payload/.agents/tools/sn-table-viz.js](../payload/.agents/tools/sn-table-viz.js) | Optional Mermaid table diagrams using live metadata through the REST helper; requires a confirmed instance and alias. |
| [tools/Invoke-SdkSetup.ps1](../tools/Invoke-SdkSetup.ps1) | Global SDK setup and recovery from saved run evidence. |
| [tools/stage-setup-pages.cjs](../tools/stage-setup-pages.cjs) | Version/checksum validation and publication artifact generation. |
| [manifest.json](../manifest.json) | Distribution metadata and declared installation locations. Payload enumeration, not a static file list here, selects installed files. |

The [custom agent](../payload/.copilot/agents/ServiceNow%20Fluent.agent.md) owns identity, instruction precedence, task routing, invariants and approval gates. Skills own procedures. Shared references own cross-cutting command details. The README and this guide describe maintenance and architecture rather than adding runtime instructions.

The generated [safety baseline](../payload/.agents/instructions/now-sdk-baseline.instructions.md) applies to `now.config.json`, `aiux.json`, `*.now.ts` and `metadata/**/*.xml`. It can load alongside the custom agent; it is not restricted to chats using that agent.

[generate-baseline.cjs](../tools/generate-baseline.cjs) validates required agent headings/terms and emits a deliberately maintained summary. It does not automatically translate arbitrary policy prose. Review both sources when policy changes. Tests enforce the agent's 600–700-word budget, baseline's 100–150-word budget and combined maximum of 850 words.

Skills cover Fluent authoring, adoption/transformation, deployment/testing, Lux/AIUX, React UI Pages, REST, authentication, documentation and updates. Their `compatibility` and trigger metadata describe requirements; historical “Verified against” notes are not current SDK pins or fresh verification claims.

## 3. Installation and managed-file lifecycle

### Execution order

`install()` checks the payload and generated baseline, reads the receipt and enumerates runtime files. It then configures Windows Git, configures VS Code, copies payload files, processes obsolete files and writes the new receipt.

This is **not a transaction**: there is no installer-wide rollback or duplicate-run lock. Environment/settings changes occur before payload copying. A later failure can leave partial changes. Preserve original evidence and inspect what happened rather than automatically repeating installation.

`payloadFiles()` excludes `.git`, `node_modules`, Python caches, temporary/backup artifacts and development tests. The documentation lookup acceptance harness is intentionally included; repository tests otherwise stay under `tools/test/`.

### File decisions

Each installed path is relative to `payload/` and maps under the current user's home directory. SHA-256 comparisons drive copying:

| Destination state | Default behavior |
| --- | --- |
| Missing | Copy the payload file. |
| Already identical to source | Record as unchanged. |
| Matches previous receipt, but differs from new source | Back up and replace. |
| Differs from both previous receipt and new source | Preserve as a local conflict. |
| Exists but has no previous receipt hash | Back up and replace; receipt-based conflict detection cannot identify it as a local edit. |
| Previously managed, now absent from payload | Back up/remove if unchanged; retain locally modified files and their receipt entries. |

`--force` permits replacement/removal of modified managed files. It is not normal recovery. `--dry-run` suppresses installation writes while still performing discovery and validation.

**Receipt caveats:** the current loader treats malformed receipt JSON as an empty receipt. Stop for review if a receipt is damaged; do not rely on the installer to preserve conflict ownership in that condition. Receipt writes are not atomic. A new receipt can carry the new distribution version while conflicts leave some older files installed.

`verify()` compares installed bytes with the **checkout from which it runs**, checks the generated baseline and reports retained obsolete files. It fails on missing/mismatched/retained obsolete files. `status()` only reports receipt metadata and counts. Neither proves that the checkout is the latest remote revision.

Uninstall uses receipt hashes, backs up removals, skips local edits by default and leaves supporting components/settings in place. See the [uninstall guide](uninstall.md) rather than deleting shared profile folders.

## 4. Windows command execution

### Git integration

The Node installer verifies existing Git; it does not download Git. For genuine absence, the separate [Git setup procedure](../git-setup.md) uses the packaged [MinGit worker](../payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1): pinned MinGit, SHA-256 verification and extraction excluding blocked Unix `find.exe` and `sort.exe`.

The bootstrap preserves Windows OpenSSH and Schannel/certificate verification. A blocked, outdated or broken existing Git is not treated as absence and is not automatically replaced.

Normal installation invokes that worker in environment-refresh mode. It preserves the typed Windows **user PATH**, including variable references, and requests native environment propagation. `setx.exe` receives only an owned `SN_FLUENT_ENV_REFRESH` marker, never PATH. Machine PATH, elevation and execution-policy changes are outside this workflow.

Existing processes may retain old environments. A successful absolute-path Git invocation or environment update is not proof that a new terminal resolves bare `git` correctly.

### SDK terminal profile

The **PowerShell with now-sdk** profile supplies a PowerShell function that invokes Node against:

1. `.\node_modules\@servicenow\sdk\bin\index.js` relative to the terminal's current directory;
2. otherwise `%APPDATA%\npm\node_modules\@servicenow\sdk\bin\index.js`.

It does not search ancestor project directories. Bind execution to the confirmed project root to avoid accidentally using the global SDK. A project-local package can also continue working after the global SDK is removed.

Profile configuration affects new terminals, not already-running ones. Require `Get-Command now-sdk` to identify a **Function** and observe native completion of `now-sdk --version` separately. Follow the [command policy](../payload/.agents/reference/sdk-commands.md); a denied launcher is a stop, not permission to try a batch shim or bypass policy.

### Global SDK setup versus project updates

The global SDK setup worker invokes npm through Node, pins the reviewed `%APPDATA%\npm` prefix, captures stdout/stderr and native exit status, and writes `sdk.result.json`. It rejects reuse of an installation run directory and rejects acceptance when saved stderr contains `EBADENGINE`, even after npm exit 0.

Recovery without `-Install` reads the original run, optionally waiting within the documented bound; it does not reinstall. Package verification leaves CLI readiness separate. This global worker is distinct from the project dependency worker in section 7.

## 5. Configuration and persisted state

These are per-user defaults, not project-relative paths:

| Location | Contents / ownership |
| --- | --- |
| `%USERPROFILE%\.copilot\agents` | Custom agent file; may contain other agents. |
| `%USERPROFILE%\.agents` | Shared instructions, skills, references and helpers. Do not treat the whole folder as exclusively owned. |
| `%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json` | `packageName`, `version`, `installedAt`, `repoRoot`, `payloadRoot`, and `files` mapping relative paths to `sha256` and `target`. |
| `%USERPROFILE%\.agents\_backups\servicenow-fluent-agent` | Timestamped copies made before replacement/removal. |
| `%APPDATA%\Code\User\settings.json` | VS Code discovery locations, shared instruction toggles and terminal configuration. |
| `%USERPROFILE%\.agents\.servicenow-fluent-agent-update-check.stamp` | Shared session-check attempt time, represented by file modification time. |
| `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json` | Advisor state: `version` and `components`, with timing, availability and decisions. |
| `%LOCALAPPDATA%\SNSetup` | Global SDK setup run evidence. |
| `%LOCALAPPDATA%\Git254Bootstrap` | Git bootstrap/environment evidence and cache. |
| `%LOCALAPPDATA%\SNDocs\repo` and `index` | Documentation checkout and generated lookup index. |

Settings edits preserve unrelated JSONC content and create adjacent timestamped backups. The installed location maps are `chat.agentFilesLocations`, `chat.instructionsFilesLocations` and `chat.skillsFilesLocations`. The installer also enables `chat.promptFiles` and `github.copilot.chat.codeGeneration.useInstructionFiles`.

`--no-vscode-settings` skips the settings edit, **not** Windows Git environment configuration. An existing custom SDK profile is not blindly replaced; review incompatible customization.

The receipt's `repoRoot` matters operationally: the installed advisor forwards to that checkout's CLI. Moving/deleting the checkout can break checks even while the copied agent files remain discoverable. Publishing source is not the same as installing it. Installing from another checkout changes the receipt's source; do not do so unintentionally.

## 6. Update discovery and approval

### Two independent gates

1. **Session gate:** custom-agent instructions invoke `session-start`. Missing or **strictly older than 48 hours** means create/touch the shared stamp before following the advisor skill. Exactly 48 hours remains fresh. This branch does not access the receipt, network or component-state file.
2. **Component gate:** the advisor uses each component's `lastCheckedAt` (48 hours or more), snooze and notification state. A due session stamp does not override these gates.

This is instruction-driven, not a background scheduler or guaranteed VS Code lifecycle hook. The stamp records an **attempt**, not successful discovery. Checks can change local timestamps/state without applying any update.

### Targets and state

| Component | Identity / comparison |
| --- | --- |
| Agent | Key `agent`; clean checkout HEAD versus remote `origin/main`. |
| Project SDK | Key `sdk:<lowercased-absolute-path>`; exact `package.json` SDK declaration versus npm's latest version. Ranges are not treated as installed versions. |
| Documentation | Key `docs:<lowercased-absolute-path>`; clean checkout HEAD versus its selected release branch's remote head. |

Agent/docs discovery compares Git revisions, not package-version labels; two revisions with the same distribution version can still produce a notice. Git revision differences do not prove ancestry or fast-forward eligibility. SDK discovery does not verify the lockfile or installed package; the apply worker does that separately.

Component state can include `lastCheckedAt`, `lastCheckFailedAt`, `available`, `lastPromptedAt`, `lastDecision`, `lastDecisionAt`, `snoozedUntil` and `skippedRelease`. Discovery records the attempt before contacting the remote; failure clears availability and records a failure timestamp.

Choices are **Update**, **Remind me in 7 days** and **Skip this release**. Recording Update does not pull, install, rebuild or deploy. Remind suppresses checks/notices for seven days. Skip suppresses that release identity. The seven-day prompt interval can also delay a notice for a different release. `--force` bypasses discovery timing, not all notification suppression.

The installed launcher emits only validated, actionable update JSON; missing checkout/state, malformed responses or child failures may be quiet. **Silence is not proof of a successful check or of being up to date.** The skill requires comparing selected state timestamps and failures before/after execution.

State writes use temporary-file rename, but there is no cross-process state lock. The library can fall back to empty state on invalid JSON; the workflow requires detecting malformed state and stopping without resetting decisions. These are separate implementation and instruction-level responsibilities.

After explicit approval, agent updates require a clean, confirmed receipt-owned checkout, fast-forward-only pull, installation without force, separate verification and a new chat/reload. Documentation updates separately require approved pull, staged index build and benchmark before replacing the active index. See [sn-update-advisor](../payload/.agents/skills/sn-update-advisor/SKILL.md) for executable procedures.

## 7. Project SDK update worker

[update-project-sdk.cjs](../payload/.agents/skills/sn-update-advisor/scripts/update-project-sdk.cjs) is an **npm-only dependency worker**, not an SDK launcher.

- `preflight` validates absolute project/npm/evidence paths, supported standalone npm layout, exact SDK state and applicable Node/package-manager constraints. It refuses conflicting lockfiles, workspaces, linked paths and an existing worker lock.
- `apply --approved` asserts that human approval was already obtained. The flag does not obtain or independently authenticate consent.
- Apply uses Node argument arrays, explicit project cwd and npm `--prefix`, strict engines, disabled lifecycle scripts and exact dependency pinning. It preserves development/production dependency placement.
- It creates an exclusive `.sn-sdk-update.lock`, backs up manifest/lockfile and saves `request.json`, stdout/stderr and an atomic `result.json` in an external evidence directory.
- Success requires agreement among the manifest declaration, root lock declaration, resolved lock entry and installed SDK version, with no other parsed manifest change. Transitive lock changes and warnings still require review.

Results distinguish `unknown`, `failed`, `verification-failed` and `package-verified`. Only verified success removes the owned lock. `status` reads/revalidates original evidence without installing, unlocking or rewriting results.

There is no automatic rollback. The lock coordinates this worker, not other package-manager processes; npm is not sandboxed. Failure or missing completion evidence is not permission to delete the lock or choose a new run directory to retry.

The worker never runs the SDK, authentication, Git or a build. Its result leaves **`build: not-run`**. Build/typecheck, deployment approval and instance-content verification remain separate operations.

## 8. Authentication and instance operations

The distribution contains no user credentials. Interactive SDK OAuth remains a user/parent-terminal workflow; passwords, codes, tokens and authorization URLs must not enter chat, source, logs or examples. SDK credentials use the operating-system credential store, not the install receipt or advisor state.

For onboarding, use the [PDI guide](connect-pdi.md): log in through Developer Portal, open the PDI, then manually start authentication from a new VS Code terminal. Authentication does not authorize instance changes. An alias listing proves inventory only, not token validity or instance access.

The [REST skill](../payload/.agents/skills/sn-rest/SKILL.md) invokes its bundled Node HTTP CLI with existing SDK OAuth. It prescribes schema discovery, explicit fields, small previews, deliberate pagination and aggregate queries. The CLI **does not automatically enforce schema validation, output budgets or interactive write approval**. Companion schema/output modules do not turn it into a registered VS Code tool.

The agent/interactive parent must enforce approved targets and mutations. ServiceNow ACLs remain the server-side access boundary. A denied table read does not authorize changing roles or switching identities.

Application workflows separately distinguish authoring, build, generated-metadata review, installation and content/runtime acceptance. A successful dependency update is not an application deployment; a successful deployment command is not proof of correct live content.

## 9. Documentation lookup and export

[sn-doc-lookup](../payload/.agents/skills/sn-doc-lookup/SKILL.md) performs local deterministic search over a generated index of the official ServiceNowDocs Markdown corpus. It requires neither PDF conversion, a vector database nor external npm dependencies. Search/read return source information for official citations; release-family selection matters.

Path precedence is **explicit CLI flags > `SN_DOCS_HOME` / `SN_DOC_MD_INDEX` > Windows defaults**. The `paths` command reports locations without creating, cloning or migrating them. Updating skill files does not download the corpus or refresh its index. Index provenance and benchmark evidence must be recorded separately; do not invent an indexed Git revision when unknown.

[sn-doc-export](../payload/.agents/skills/sn-doc-export/SKILL.md) is a different workflow: Markdown to PDF/DOCX. Node rendering uses optional renderer packages; PDF/HTML also need a browser. The framed Python backend requires an explicitly selected absolute `SN_AGENT_HOME` and its dependencies. Rendering is not required to maintain Markdown guides in this repository, and missing dependencies do not authorize installing them.

## 10. CLI reference

Run repository commands from the confirmed checkout root using Node directly. For usage text:

```powershell
node bin/sn-fluent-agent.cjs help
```

**Always specify a subcommand.** No arguments default to `install`; the current parser also routes flag-only invocations such as `--help` to that default. Use the explicit `help` subcommand above.

| Command | Effect |
| --- | --- |
| `status` | Read receipt metadata; not an integrity check. |
| `verify` | Check payload/baseline against this checkout; no installation. |
| `install` | Configure environment/settings and copy managed files. `update` is an install alias, not a Git pull. |
| `install --dry-run` | Validate and summarize without installation writes. |
| `configure-git` | Configure existing Git's user environment and conservatively remove known legacy profile workarounds. |
| `configure-terminal` | Configure the SDK profile; does not register Git PATH. |
| `check-updates` | Contact applicable due components and persist advisory state. Explicit `--only`, project/docs paths and scope matter. |
| `update-decision` | Record selected component decisions; does not apply updates. |
| `uninstall` | Remove unchanged receipt-owned files with backups; preserve local modifications by default. |

The installed advisor uses different entry names: `session-start`, `check` and `decision`. It forwards check/decision to the receipt-owned repository. These are CLI commands, not host-registered tools. For mutation flags and approved execution, follow the linked setup/update/uninstall procedures rather than treating this table as authorization.

## 11. Verification and troubleshooting

Keep these acceptance stages separate:

| Stage | Required evidence | Does not prove |
| --- | --- | --- |
| Package | Attributable native exit plus expected package metadata/files. | CLI readiness or build success. |
| Agent payload | `verify` against the intended source revision, including obsolete/conflict checks. | Remote freshness, prompt loading or terminal integration. |
| Fresh terminal | Actual Git resolution and SDK function/version from a new intended terminal. | Authentication. |
| Authentication | Authorized, narrow authenticated operation and attributable response. | Permission for every table or deployment. |
| Build | Correct project cwd, native completion and reviewed output. | Installation or correct live behavior. |
| Instance/runtime | Approved install plus independent record/content and applicable browser checks. | Unchecked workflows or environments. |

Blank, truncated, delayed or misattributed output leaves completion **UNKNOWN**, not success or failure. Record the command, exact target/cwd, original run identity and available output; recover that operation before retrying. Do not send probes into a busy/user terminal or rerun a completed package installation to repair a shell problem.

Common diagnoses:

- **Conflicts despite exit 0:** inspect install summaries and run payload verification; do not automatically add force.
- **Agent still uses old instructions:** reload where needed and start a new chat; verify the loaded source rather than assuming file replacement refreshed the conversation.
- **No update notice:** distinguish interval/skip suppression, failed discovery and missing receipt-owned checkout. Do not reset timers to manufacture a notice.
- **SDK package exists but command fails:** inspect the selected terminal/function and project cwd before considering dependency changes.
- **Documentation lookup failure:** check resolved paths, release family and index evidence; a failed lookup does not authorize a rebuild.
- **Windows policy denial:** stop and report it; no elevation, execution-policy relaxation or alternate-launcher bypass.

## 12. Testing and publication

### Local development

Edit runtime source under `payload/`. Do not use `tools/refresh-payload.cjs` for ordinary authoring: it imports installed user-profile files into source and can overwrite intended repository changes. Regenerate the baseline only for reviewed policy changes, then check it:

```powershell
node tools/generate-baseline.cjs --check
node --test tools/test/skill-payload.test.cjs tools/test/agent-policy.test.cjs
```

Before publication, run the full **`test:setup`** script defined in [package.json](../package.json), through the permitted npm JavaScript entry on restricted Windows, plus the optional-backend path tests used by CI:

```text
python -B -m unittest discover -s tools/test/doc-export -p test_python_home.py
```

Test coverage includes setup hashes/markers, JSONC preservation, Git/environment behavior, docs paths, SDK capture/recovery, payload/policy budgets, advisor timing, isolated Git upgrades and guarded project-package updates. The [workflow](../.github/workflows/deploy-setup-page.yml) records the CI commands. Windows-specific tests skip on non-Windows hosts; evaluate those gaps separately.

The agent-upgrade integration fixture uses a local bare Git remote, temporary home/state and blocked host integration. It can test changed payloads and conflicts without updating a real installation. It does not prove live Copilot adherence, terminal lifecycle, OAuth or instance deployment. Test totals and benchmark results should be attached to a specific run, not treated as permanent product guarantees.

### Release and distribution

For versioned changes, align `VERSION`, `package.json`, `manifest.json`, setup protocol/end markers, the SDK worker version and its expected SHA-256. Changes to the Git worker require updating its separate expected script hash; that is not the pinned MinGit archive hash.

`stageSetupPages()` validates the matching versions and worker hashes before writing generated `_pages` artifacts: setup pages/plain text, downloads and manifests, including versioned reference copies. Do not hand-edit generated artifacts.

The Pages workflow runs tests, stages content, builds with Jekyll and deploys Pages. Repository documentation under `docs/` is read directly on GitHub; it is not automatically part of the staged setup site. Workflow path filters mean a docs-only commit need not trigger Pages.

Publication, Pages deployment and local installation are three distinct outcomes. After an approved push, verify the intended remote commit and published content. When setup artifacts change, verify the matching live manifest/worker/guide bytes after the relevant Pages deployment. Nothing about publishing authorizes an install, timer reset, authentication or instance operation.

[Back to the README](../README.md) · [Setup](../setup.md) · [Connect a PDI](connect-pdi.md) · [Uninstall components](uninstall.md)
