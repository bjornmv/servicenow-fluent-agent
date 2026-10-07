---
permalink: /setup/
---

# Agent-Assisted Installation

```text
SETUP_PROTOCOL_VERSION=0.3.10
```

Give a new agent session this prompt to install this agent:

```text
Read https://bjornmv.github.io/servicenow-fluent-agent/setup/ and follow its instructions to perform the full ServiceNow Fluent agent setup.
```

## Scope and execution rules

**Target: Windows x64, VS Code, GitHub Copilot agent mode.** Another harness may perform supported steps 1–6; step 7 requires real VS Code terminal evidence.

Node.js must already be installed. Full setup authorizes missing-Git bootstrap, global SDK package install/update, the two checkouts, agent configuration and missing-index creation. Existing-index replacement and corpus changes require separate approval. Authentication, deployment, other prerequisites and elevation are outside scope.

Use these rules throughout:

- Keep mutations in the parent agent, with one owner per operation. Record absolute targets, start time, operation ID and native stdout/stderr/exit evidence. Preserve existing work and recover recorded operations before starting replacements.
- Use native executables/Node entries and reviewed saved workers. No CMD, `.cmd`/`.bat`, alternate-launcher policy bypass, or relaxed security settings. Windows PowerShell 5.1 ConstrainedLanguage is the baseline.
- Follow the host's actual sync/status/notification contract. No forced async, sleeps or polling where forbidden. A tool's `ok`, `mode: sync` or blank output is not native completion; missing exit evidence is **UNKNOWN**, not failure or permission to retry.
- Keep potentially busy terminals untouched. Recovery needs independent file access or a confirmed separate idle execution context. Retire a terminal only through step 7.

Work through the cards in order. Read the complete verified guide, including appendices; run appendix blocks only when a card selects them. On a blocker, use the [outcome contract](#outcome), not a bare “pending” message.

### 0. Confirm the guide before execution

**Pre:** Use the canonical URL above. Incomplete web excerpts are insufficient; Git is not needed to fetch the guide.

**Run:** Download and verify the complete [setup.txt](https://bjornmv.github.io/servicenow-fluent-agent/setup.txt) and current manifest using [A1](#guide-download). Read the saved text through `SETUP_GUIDE_END`, including steps 1–7. For a local source, also compare `VERSION`.

**Expect:** Text hash matches `manifest.setup.sha256`; both protocol markers match `manifest.version`. Worker hashes are checked separately before execution.

**If–then:** Mismatch, missing content or policy denial → stop and resolve that cause; mixed revisions cannot be executed.

### 1. Check prerequisites and ensure Git

**Pre:** Node.js **>=20.18.0**; Git discovery includes PATH, standard locations and registration.

**Run:** [B: prerequisite checks](#prerequisites).

**Expect:** A verified absolute `$GitExe` and stable Git **>=2.54.0**, preserved unchanged.

**If–then:** Missing/failing/old Node → report the prerequisite failure. Genuinely absent Git → [A2: verified Git bootstrap](#git-download). Older, blocked, broken, prerelease or ambiguous Git → ask for review, not automatic replacement. Continue only after verification.

### 2. Install now-sdk

**Pre:** Recover any recorded SDK run first using [C](#sdk-recovery). Otherwise prepare/read the hash-verified worker with [A3](#sdk-download); record `$SdkWorker`, `$SdkLogDir`, launch time and supported completion route. The worker creates the run directory. Use absolute recorded paths if the shell changed.

**Run:** Launch once:

<!-- setup-block:sdk-install -->
```powershell
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $SdkWorker -RunDirectory $SdkLogDir -Install
if ($LASTEXITCODE -ne 0) { throw 'SDK worker stopped; inspect this run, do not reinstall.' }
```

**Expect:** Package evidence passes [C1](#sdk-evidence). The worker uses npm's `latest` dist-tag, checks/pins `%APPDATA%\npm`, and saves prefix/install logs plus exit/result files. Package verification is separate from the profile Function/CLI check in step 7.

**If–then:**

| Result | Next action |
| --- | --- |
| Verified original package result | Continue at step 3 without reinstall or unnecessary recovery. |
| Early/blank return or incomplete evidence | Recover the same operation through [C](#sdk-recovery); no duplicate install. |
| `EBADENGINE` / `SDK_ENGINE_WARNING=true` | Ask for compatibility review, even with npm exit 0. |
| Confirmed native or launch/policy failure | Report the actual failure and logs. |
| No supported completion route | Ask the concrete question in [Outcome](#outcome); preserve the run. |

### 3. Keep Git shell-independent

**Pre:** Git is verified, but this process may still have stale PATH.

**Run:** Continue using `$GitExe`; step 5 registers its directory in **Windows user PATH**, independently of shell type.

**Expect:** Existing PATH values/type and unrelated settings preserved with backups.

**If–then:** Stale terminal host → refresh it safely during step 7, not by reinstalling Git or injecting shell-specific PATH. [Why](#rationale).

### 4. Clone ServiceNowDocs

**Pre:** Resolve `$Docs` / `$Index` once; defaults are `%LOCALAPPDATA%\SNDocs\repo` and `%LOCALAPPDATA%\SNDocs\index`, with absolute `SN_DOCS_HOME` / `SN_DOC_MD_INDEX` overrides. Family remains **australia**.

**Run:** [D1](#docs-checkout): missing checkout → staged clone; existing checkout → verify identity/cleanliness before the named fast-forward pull. Record the resulting commit.

**Expect:** Exact root, public origin, Australia branch, clean status and native success.

**If–then:** Incoming leftovers, uncertain completion or collision → preserve and inspect the original operation. Wrong identity/dirty checkout → ask for review. Family migration, fallback corpus and index rebuild are separate decisions.

### 5. Clone and install this agent

**Pre:** Use the recorded agent checkout or `$HOME\source\servicenow-fluent-agent`, separate from apps/docs/index. Inspect a prior destination before creating another copy.

**Run:** [D2](#agent-checkout) verifies root/origin/main/clean status and sets the explicit cwd. Then:

<!-- setup-block:agent-install -->
```powershell
node bin/sn-fluent-agent.cjs install --git-exe "$GitExe"
if ($LASTEXITCODE -ne 0) { throw 'Agent installation failed; stop setup.' }
```

**Expect:** Payload installed, Git user environment registered, **PowerShell with now-sdk** profile configured. The Function uses Node with project-local SDK when present, otherwise global SDK; Git is profile-independent.

**If–then:** Incomplete command → recover it; confirmed failure → report it. Preserve custom settings. Opening this folder in VS Code is optional. Maintenance-only commands are in [F](#rationale).

### 6. Build and verify the documentation index

**Pre:** Inspect the resolved index before building:

<!-- setup-block:index-inspect -->
```powershell
$Skill = Join-Path $env:USERPROFILE '.agents\skills\sn-doc-lookup'
$IndexManifestPath = Join-Path $Index 'manifest.json'
if (Test-Path -LiteralPath $Index) {
    Get-Content -LiteralPath $IndexManifestPath -Raw -ErrorAction Stop
}
```

**Run:** Choose one row, then benchmark:

| Index state | Action |
| --- | --- |
| Missing | Run the build below; leave directory creation to the builder. |
| Recognized and current | Reuse; skip build. |
| Recognized but outdated/unknown revision | Ask: reuse with that limitation (recommended when appropriate), or approve rebuild? |
| Unexpected identity or unreadable manifest | Stop for review; preserve it. |

Identity requires `schema_version: 1`, `generator` starting `sn-doc-md@`, matching `family` and resolved `docs_root`. Compare `git_head` with `$DocsHead`; empty means unknown, not current. An approved recognized-index rebuild adds `--force` to the build command; never delete a directory to make it succeed.

<!-- setup-block:index-build -->
```powershell
node "$Skill\bin\sn-doc-md.js" build --docs "$Docs" --out "$Index" --family "$Family"
if ($LASTEXITCODE -ne 0) { throw 'Documentation indexing failed; stop setup.' }
```

<!-- setup-block:index-benchmark -->
```powershell
node "$Skill\test\run-tests.js" --index "$Index"
if ($LASTEXITCODE -ne 0) { throw 'Documentation lookup verification failed; stop setup.' }
```

**Expect:** Native exit 0 and all benchmark cases pass; report the actual revision/provenance limitation.

**If–then:** Failure → report it; no automatic rebuild or alternate corpus. Read-only `node "$Skill\bin\sn-doc-md.js" paths` diagnoses path selection without changing the index.

### 7. Open a fresh agent terminal and verify (final step)

**Pre:** All operations complete and results saved. Confirm the agent owns an idle, disposable terminal and the effective profile is **PowerShell with now-sdk**, including workspace/Copilot overrides.

**Run:** The agent performs [E: terminal handoff and checks](#terminal-check) with supported terminal tools.

**Expect:** Different old/new PIDs; Git resolves to the recorded Application path/version, `now-sdk` to the profile Function with the verified global version; payload verification passes.

**If–then:** Missing function, mismatched version or native error → report that specific failure. Unsafe/unavailable handoff → ask the user to create a new terminal with the named profile and provide the same checks. Installation evidence alone is not fresh-terminal acceptance.

<a id="outcome"></a>
## Outcome: say what happens next

Use one heading, a short component summary (verified / missing / not checked), and one next action:

| Heading | Use when / action |
| --- | --- |
| **Complete** | Installation and required live checks passed. List versions and docs benchmark/provenance; distinguish untested hosts. |
| **Action needed** | A user decision or terminal action is required. Ask a concrete question with a recommended choice; do not end with “resume later.” |
| **Could not complete** | A confirmed failure or host limitation prevents progress. Name the blocker, what succeeded, and the specific remedy/decision. UNKNOWN completion is not an npm failure. |

Example: “SDK installed; the final VS Code check needs a new terminal. Please open **PowerShell with now-sdk** and return the [E](#terminal-check) check output.” Use supported automatic recovery first. Keep paths/technical evidence in a checkpoint rather than leading with a diagnostic-field dump. Authentication and instance connectivity are not tested here.

After **Complete**, include this next step in the final message: “To connect your PDI, start a new ServiceNow Fluent chat and ask for OAuth connection help. Follow the [PDI connection guide with screenshots](https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/connect-pdi.md). Keep passwords and OAuth codes out of chat.” Do not start authentication automatically.

<a id="appendices"></a>
## Appendices: executable detail and rationale

<a id="guide-download"></a>
### A1. Verify the complete guide

Run before setup mutations; record the printed paths. The stable publication supplies the full text, manifest and workers together. Only the current versioned reference copy is published; historical release paths are not guaranteed.

<!-- setup-block:guide-download -->
```powershell
$ErrorActionPreference = 'Stop'
$Base = 'https://bjornmv.github.io/servicenow-fluent-agent'
$GuideDir = Join-Path $env:LOCALAPPDATA ("SNSetup\guide\{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID)
New-Item -ItemType Directory -Path $GuideDir -ErrorAction Stop | Out-Null
$Guide = Join-Path $GuideDir 'setup.txt'
$ManifestPath = Join-Path $GuideDir 'setup-manifest.json'
Invoke-WebRequest -Uri "$Base/setup.txt" -OutFile $Guide -UseBasicParsing -TimeoutSec 120
Invoke-WebRequest -Uri "$Base/setup-manifest.json" -OutFile $ManifestPath -UseBasicParsing -TimeoutSec 120
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.version -notmatch '^\d+\.\d+\.\d+$' -or $Manifest.setup.file -ne 'setup.txt' -or $Manifest.setup.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid setup manifest; stop.' }
if ((Get-FileHash -LiteralPath $Guide -Algorithm SHA256).Hash -ne $Manifest.setup.sha256) { throw 'Guide hash mismatch; stop.' }
$Start = @(Select-String -LiteralPath $Guide -Pattern '^SETUP_PROTOCOL_VERSION=(.+)$')
$End = @(Select-String -LiteralPath $Guide -Pattern '^SETUP_GUIDE_END=(.+)$')
if ($Start.Count -ne 1 -or $End.Count -ne 1) { throw 'Missing or duplicate guide markers; stop.' }
if ($Start[0].Matches[0].Groups[1].Value -ne $Manifest.version -or $End[0].Matches[0].Groups[1].Value -ne $Manifest.version) { throw 'Guide protocol mismatch; stop.' }
Write-Output "GUIDE_VERSION=$($Manifest.version)"
Write-Output "GUIDE_DIR=$GuideDir"
Write-Output "MANIFEST_PATH=$ManifestPath"
```

<a id="git-download"></a>
### A2. Genuinely absent Git only

Restore `$GuideDir` / `$ManifestPath` from A1 if needed. Fetch the separate [Windows Git setup procedure](https://bjornmv.github.io/servicenow-fluent-agent/git-setup/) without cloning:

<!-- setup-block:git-download -->
```powershell
$ErrorActionPreference = 'Stop'
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.gitSetup.file -ne 'git-setup.txt' -or $Manifest.gitWorker.file -ne 'downloads/Ensure-MinGit254.ps1') { throw 'Missing or unexpected Git manifest entries; stop.' }
$GitGuide = Join-Path $GuideDir 'git-setup.txt'
Invoke-WebRequest -Uri 'https://bjornmv.github.io/servicenow-fluent-agent/git-setup.txt' -OutFile $GitGuide -UseBasicParsing -TimeoutSec 120
if ((Get-FileHash -LiteralPath $GitGuide -Algorithm SHA256).Hash -ne $Manifest.gitSetup.sha256) { throw 'Git guide hash mismatch; stop.' }
Write-Output "GIT_GUIDE=$GitGuide"
Write-Output "GIT_WORKER_SHA256=$($Manifest.gitWorker.sha256)"
```

Read the saved guide completely. Its expected digest and saved worker must also match `manifest.gitWorker.sha256`. Follow only `-InstallIfMissing`: pinned MinGit **2.54.0.windows.1**, Unix find/sort excluded **before extraction**. Migration/replacement modes are outside setup. Verify completion and record the absolute `$GitExe` before step 2.

<a id="sdk-download"></a>
### A3. Prepare the SDK worker

Download without executing; read the saved script with bounded file tools. A reviewed local copy must pass the same hash gate. Hash/signing/policy failure stops this path; no zone-marker removal or alternate interpreter.

<!-- setup-block:sdk-download -->
```powershell
$ErrorActionPreference = 'Stop'
$ExpectedSdkSetupSha256 = 'F43D779BA257EBB1A10C6E4A4814D33B840A279A5409E308E9C5AE7C9C2790CD'
# Restore the recorded absolute manifest path if the shell context changed.
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.sdkWorker.file -ne 'downloads/Invoke-SdkSetup.ps1' -or $Manifest.sdkWorker.sha256 -ne $ExpectedSdkSetupSha256) { throw 'SDK worker manifest/guide mismatch; stop.' }
$SdkRunId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$SdkWorkerDir = Join-Path $env:LOCALAPPDATA "SNSetup\workers\$SdkRunId"
New-Item -ItemType Directory -Path $SdkWorkerDir -ErrorAction Stop | Out-Null
$SdkWorker = Join-Path $SdkWorkerDir 'Invoke-SdkSetup.ps1'
Invoke-WebRequest -Uri 'https://bjornmv.github.io/servicenow-fluent-agent/downloads/Invoke-SdkSetup.ps1' -OutFile $SdkWorker -UseBasicParsing -TimeoutSec 120
if ((Get-FileHash -LiteralPath $SdkWorker -Algorithm SHA256).Hash -ne $ExpectedSdkSetupSha256) { throw 'SDK worker hash mismatch; do not execute.' }
$SdkLogDir = Join-Path $env:LOCALAPPDATA "SNSetup\$SdkRunId"
Write-Output "SDK_LOG_DIR=$SdkLogDir"
```

Use the exact saved worker in step 2, not an inline rewrite. It runs Node's `npm-cli.js`, rejects a custom global prefix, and retains `npm-prefix.stdout.log` / `npm-prefix.stderr.log`. Failed/missing prefix verification prevents installation. No `--force`, suppressed lifecycle scripts or elevation to hide errors.

<a id="prerequisites"></a>
### B. Read-only prerequisite checks

Run Node first; a missing/failing gate ends setup before further changes. The minimum runtime is not a guarantee of future dependency compatibility (see C1).

<!-- setup-block:node-check -->
```powershell
$ErrorActionPreference = 'Stop'
Get-Command node.exe -CommandType Application -ErrorAction Stop
node.exe --version
if ($LASTEXITCODE -ne 0) { throw 'Node.js version check failed; stop.' }
node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=18)?0:1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js >=20.18.0 required; stop.' }
```

Then discover Git; an executable that fails or remaining registry/directory evidence is not absence:

<!-- setup-block:git-check -->
```powershell
$ErrorActionPreference = 'Stop'
$GitExe = $null
$Found = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Found) { $GitExe = $Found.Source }
$GitRoots = @((Join-Path $env:LOCALAPPDATA 'Programs\Git'), (Join-Path $env:ProgramFiles 'Git'))
if (${env:ProgramFiles(x86)}) { $GitRoots += Join-Path ${env:ProgramFiles(x86)} 'Git' }
$GitKeys = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1')
$Registered = @()
if (-not $GitExe) {
    foreach ($Root in $GitRoots) {
        $Candidate = Join-Path $Root 'cmd\git.exe'
        if (Test-Path -LiteralPath $Candidate -PathType Leaf -ErrorAction Stop) { $GitExe = $Candidate; break }
    }
}
if (-not $GitExe) {
    $Registered = @($GitKeys | Where-Object { Test-Path -LiteralPath $_ -ErrorAction Stop })
    foreach ($Key in $Registered) {
        $Location = (Get-ItemProperty -LiteralPath $Key -ErrorAction Stop).InstallLocation
        if ($Location) {
            $GitRoots += $Location
            $Candidate = Join-Path $Location 'cmd\git.exe'
            if (Test-Path -LiteralPath $Candidate -PathType Leaf -ErrorAction Stop) { $GitExe = $Candidate; break }
        }
    }
}
if ($GitExe) {
    $GitExe = (Resolve-Path -LiteralPath $GitExe).Path
    $GitVersion = & $GitExe --version
    if ($LASTEXITCODE -ne 0) { throw 'Existing Git failed to run; stop for review.' }
    if (@($GitVersion).Count -ne 1) { throw 'Ambiguous Git version output; stop for review.' }
    if ($GitVersion -notmatch '^git version (\d+)\.(\d+)\.(\d+)(?:\.windows\.\d+)?$') { throw 'Unrecognized or prerelease Git; stop for review.' }
    if ([int]$Matches[1] -lt 2 -or ([int]$Matches[1] -eq 2 -and [int]$Matches[2] -lt 54)) { throw 'Existing Git is older than 2.54.0; stop for review.' }
    Write-Output "GIT_EXE=$GitExe"
    Write-Output "GIT_VERSION=$GitVersion"
} else {
    $ExistingRoots = @($GitRoots | Where-Object { Test-Path -LiteralPath $_ -ErrorAction Stop })
    if ($Registered.Count -gt 0 -or $ExistingRoots.Count -gt 0) { throw 'Git registration/directory exists without a verified executable; stop for review.' }
    Write-Output 'GIT_EXE=absent'
}
```

<a id="sdk-recovery"></a>
### C. Recover the original SDK operation

Keep the original operation in progress. Restore its recorded absolute paths and operation ID, not the newest directory or inherited shell variables. A different tool-call ID does not establish an independent idle terminal.

| Host evidence/capability | Permitted route |
| --- | --- |
| Explicit background, timeout or input-needed result | Use the returned ID with the documented status/input tool. |
| Notification-driven host | Yield for completion notification; no polling. |
| Early sync return | Read the exact run's durable files independently; missing files are UNKNOWN. |
| Separate idle terminal or approved direct-process tool, with waiting permitted | Use the read-only recovery block below. |
| No supported route | Take a final permitted evidence snapshot, then ask for the specific access/terminal action needed. |

Never queue recovery, process probes or diagnostics into a potentially busy terminal. `get_terminal_output` after ordinary sync output is allowed only if the host contract permits it. Repeated timed file checks and positive `-WaitSeconds` (internally `Start-Sleep`) are polling too, not loopholes around a host restriction.

Allow up to **5 minutes**, measured from original launch, for permitted observation. Record actual elapsed time; requested waits are not elapsed waits. Limit recovery to the remaining budget. Before an unresolved handoff, make one final independent reread if permitted, classify current evidence below, and report unavailable access honestly. A still-unknown result preserves the original checkpoint; it does not authorize reinstall.

Use the same worker/run **without `-Install`**. Fill the placeholders; `180` is a maximum example within the remaining budget. When completion files already exist, `-WaitSeconds 0` is a one-shot check, not a polling loop.

<!-- setup-block:sdk-recovery -->
```powershell
$ErrorActionPreference = 'Stop'
$PowerShellExe = '<recorded absolute powershell.exe path>'
$SdkWorker = '<recorded absolute saved Invoke-SdkSetup.ps1 path>'
$SdkLogDir = '<recorded absolute SDK run directory>'
if ($PowerShellExe -like '<*' -or $SdkWorker -like '<*' -or $SdkLogDir -like '<*') { throw 'Fill the original recorded paths before recovery.' }
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $SdkWorker -RunDirectory $SdkLogDir -WaitSeconds 180
if ($LASTEXITCODE -ne 0) { throw 'Read-only recovery did not verify completion; classify the original run using its saved evidence. Do not reinstall.' }
```

A nonzero recovery exit can mean missing evidence or budget expiry, not npm failure. Save the true outputs/errors; never hide them in an empty catch or `SilentlyContinue`.

<a id="sdk-evidence"></a>
### C1. Package acceptance checklist

For either evidence path, reject malformed/conflicting records. The expected global metadata path is `%APPDATA%\npm\node_modules\@servicenow\sdk\package.json`.

| Path | Required evidence |
| --- | --- |
| Original durable result | `npm.exit-code.txt` exactly `0`; both install logs; valid `sdk.result.json`: `schemaVersion: 1`, `state: package-verified`, `npmExitCode: 0`, expected worker version, exact recorded `runDirectory`, expected `packagePath`. Current metadata name `@servicenow/sdk`, version equal to `packageVersion`, and `bin/index.js` exists. |
| Completed read-only recovery | Attributable native exit 0 plus `SDK_PACKAGE_VERIFIED=true` from the expected worker (`SDK_WORKER_VERSION=0.3.10`) and exact run. Independently validate any existing `sdk.result.json` using the same identity/version/metadata checks above: the worker does not validate that file. Legacy result-less exit/log evidence is supported, including 0.3.4 logs; conflicting existing JSON is not ignored. |

For both: scan **complete stderr** for `EBADENGINE`, not only the tail; engine warnings require compatibility review even with npm exit 0. Report deprecations/optional-add-on failures separately; they do not themselves prove npm failed or affected features work. Further diagnosis may use saved npm debug logs, not automatic build-tool installation or Node changes.

Consistent success → step 3; skip redundant recovery. Proven nonzero npm exit or launch/policy failure → report failure. Missing evidence → UNKNOWN; conflict → review. Package presence alone is insufficient. Package success does not establish terminal idleness: account for queued commands or use a confirmed independent context before continuing. CLI acceptance remains step 7.

<a id="docs-checkout"></a>
### D1. Documentation paths, clone and identity

<!-- setup-block:docs-paths -->
```powershell
$Docs  = if ($env:SN_DOCS_HOME) { $env:SN_DOCS_HOME } else { Join-Path $env:LOCALAPPDATA 'SNDocs\repo' }
$Index = if ($env:SN_DOC_MD_INDEX) { $env:SN_DOC_MD_INDEX } else { Join-Path $env:LOCALAPPDATA 'SNDocs\index' }
$DocsUrl = 'https://github.com/ServiceNow/ServiceNowDocs.git'
$Family = 'australia'
Write-Output "DOCS_FAMILY=$Family"
Write-Output 'DOCS_FAMILY_SOURCE=validated setup default'
```

For a missing destination, record the incoming path before launch. Preserve leftovers or uncertain original operations; size estimates are not completion evidence.

<!-- setup-block:docs-clone -->
```powershell
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Docs) { throw 'Docs destination exists; use the existing-checkout checks instead.' }
$DocsParent = Split-Path -Parent $Docs
$DocsLeaf = Split-Path -Leaf $Docs
if (Test-Path -LiteralPath $DocsParent) {
    $Leftovers = @(Get-ChildItem -LiteralPath $DocsParent -Directory -Filter "$DocsLeaf.incoming-*" -ErrorAction Stop)
    if ($Leftovers.Count -gt 0) {
        $Leftovers | Select-Object -First 10 -ExpandProperty FullName
        throw 'An incoming docs directory exists; inspect the recorded clone, do not delete or restart it.'
    }
}
New-Item -ItemType Directory -Path $DocsParent -Force | Out-Null
$DocsRunId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$DocsIncoming = "$Docs.incoming-$DocsRunId"
Write-Output "DOCS_INCOMING=$DocsIncoming"
& $GitExe clone -c core.longpaths=true --depth 1 --single-branch --branch $Family $DocsUrl "$DocsIncoming"
if ($LASTEXITCODE -ne 0) { throw 'Documentation clone failed; preserve its incoming directory and stop setup.' }
if (Test-Path -LiteralPath $Docs) { throw 'Docs destination appeared during clone; preserve both directories for review.' }
Move-Item -LiteralPath $DocsIncoming -Destination $Docs -ErrorAction Stop
```

For new or existing checkout, verify:

<!-- setup-block:docs-verify -->
```powershell
$ErrorActionPreference = 'Stop'
$DocsTop = & $GitExe -C "$Docs" rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or ($DocsTop -replace '\\','/') -ne ((Resolve-Path -LiteralPath $Docs).Path -replace '\\','/')) { throw 'Docs path is not the expected repository root.' }
$DocsOrigin = & $GitExe -C "$Docs" remote get-url origin
if ($LASTEXITCODE -ne 0 -or $DocsOrigin -ne $DocsUrl) { throw 'Unexpected documentation origin; stop.' }
$DocsBranch = & $GitExe -C "$Docs" branch --show-current
if ($LASTEXITCODE -ne 0 -or $DocsBranch -ne $Family) { throw 'Unexpected documentation branch; stop without switching.' }
$DocsStatus = & $GitExe -C "$Docs" status --porcelain
if ($LASTEXITCODE -ne 0 -or $DocsStatus) { throw 'Documentation checkout is dirty or status failed; stop.' }
$DocsHead = & $GitExe -C "$Docs" rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or -not $DocsHead) { throw 'Documentation revision is unknown; stop.' }
Write-Output "DOCS_GIT_HEAD=$DocsHead"
Write-Output 'DOCS_CHECKOUT_VERIFIED=true'
```

Only for a verified existing checkout, pull the named origin/family and repeat the checks to record its new commit:

<!-- setup-block:docs-pull -->
```powershell
& $GitExe -C "$Docs" pull --ff-only origin "$Family"
if ($LASTEXITCODE -ne 0) { throw 'Documentation update failed; stop setup.' }
```

Confirmed clone success with unfinished promotion → verify the recorded incoming path using the same root/origin/branch/status checks, then promote only to an absent destination with no pending original operation. Unexpected directories remain untouched; no reset, force checkout, family switching or legacy-path migration.

<a id="agent-checkout"></a>
### D2. Agent checkout and explicit cwd

If a prior destination is recorded, inspect it before selecting this default. Capture native completion; early return means recover the original clone/update rather than rerun the block.

<!-- setup-block:agent-checkout -->
```powershell
$ErrorActionPreference = 'Stop'
$AgentRepo = Join-Path $HOME 'source\servicenow-fluent-agent'
$AgentUrl = 'https://github.com/bjornmv/servicenow-fluent-agent.git'
if (-not (Test-Path -LiteralPath $AgentRepo)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $AgentRepo) -Force | Out-Null
    & $GitExe clone $AgentUrl "$AgentRepo"
    if ($LASTEXITCODE -ne 0) { throw 'Agent clone failed; preserve the destination and stop.' }
}
$AgentTop = & $GitExe -C "$AgentRepo" rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or ($AgentTop -replace '\\','/') -ne ((Resolve-Path -LiteralPath $AgentRepo).Path -replace '\\','/')) { throw 'Agent path is not the expected repository root.' }
$AgentOrigin = & $GitExe -C "$AgentRepo" remote get-url origin
if ($LASTEXITCODE -ne 0 -or $AgentOrigin -ne $AgentUrl) { throw 'Unexpected agent repository origin; stop.' }
$AgentBranch = & $GitExe -C "$AgentRepo" branch --show-current
if ($LASTEXITCODE -ne 0 -or $AgentBranch -ne 'main') { throw 'Agent checkout is not on main; stop for review.' }
$AgentStatus = & $GitExe -C "$AgentRepo" status --porcelain
if ($LASTEXITCODE -ne 0 -or $AgentStatus) { throw 'Agent checkout has local changes or status failed; stop without overwriting work.' }
& $GitExe -C "$AgentRepo" pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'Agent update failed; stop.' }
Set-Location -LiteralPath $AgentRepo -ErrorAction Stop
Write-Output "AGENT_REPO=$AgentRepo"
```

<a id="terminal-check"></a>
### E. Fresh-terminal lifecycle and checks

Use supported integrated-terminal tools, not an extension, added task or simulated child shell. Require saved completion of every install/clone/index operation and no queued commands/jobs in the terminal being retired. Save Git path/version, SDK version and agent-repo path outside shell variables.

Check effective default/profile overrides, including `chat.tools.terminal.terminalProfile.windows`; an incompatible override requires review rather than replacement. Settings are preconditions, not runtime proof. If ownership, idleness or profile selection is uncertain, ask instead of closing a user/shared terminal.

For a confirmed idle, disposable agent-owned terminal, use separate normal synchronous calls in this order:

<!-- setup-block:terminal-old -->
```powershell
Write-Output "SETUP_TERMINAL_PID=$PID"
```

<!-- setup-block:terminal-exit -->
```powershell
exit
```

<!-- setup-block:terminal-new -->
```powershell
Write-Output "VERIFICATION_TERMINAL_PID=$PID"
Get-Location
```

Only this standalone `exit` retires a terminal; never append it to another command. A closed-terminal result leaves saved installation results valid. Unconfirmed closure → report the gap, not repeated exit. Require a different PID; absent/unchanged PID fails the freshness check.

Set cwd with `Set-Location -LiteralPath` and the recorded agent-repo absolute path, avoiding another project's SDK. Restore no old variables. Run the following with the profile-provided Function, without defining it, injecting PATH or copying startup commands:

<!-- setup-block:terminal-verify -->
```powershell
$ErrorActionPreference = 'Stop'
$GitCommand = Get-Command git -ErrorAction Stop
$GitCommand | Select-Object CommandType, Source
if ($GitCommand.CommandType -ne 'Application') { throw 'Expected Git to resolve to an application.' }
git --version
if ($LASTEXITCODE -ne 0) { throw 'Git terminal verification failed.' }
$SdkCommand = Get-Command now-sdk -ErrorAction Stop
$SdkCommand | Select-Object CommandType, Name
if ($SdkCommand.CommandType -ne 'Function') { throw 'Expected the SDK profile function. Check the selected profile/new terminal; do not run a shim or reinstall the package.' }
now-sdk --version
if ($LASTEXITCODE -ne 0) { throw 'SDK function verification failed; report the actual error and stop.' }
node bin/sn-fluent-agent.cjs verify
if ($LASTEXITCODE -ne 0) { throw 'Agent payload verification failed.' }
```

Compare Git Application path/version with step 1 and SDK version with the verified global package. Keep output and native exits; mismatches/nonzero payload results fail acceptance. Missing Function → inspect selected profile/custom startup arguments, not shims or npm reinstallation.

If safe agent-owned handoff is unavailable, ask the user for **Terminal: Create New Terminal (With Profile)** → **PowerShell with now-sdk**, then the same checks from the agent repo. Use a genuinely new terminal, not a restored/reconnected one.

For Git, also check plain `git --version` in the actual permitted hosts/shells the user uses, including outside the SDK profile; report untested hosts separately. If stale, ask to save work/restart the affected host from a refreshed launcher. Reload Window alone is not a guaranteed environment refresh. Identify stale launcher/PATH overrides; signing out/in is a fallback, not a replacement for verification.

<a id="rationale"></a>
### F. Rationale and maintenance reference

- **One operation, durable evidence:** terminal tools can return early while npm still runs. Missing output does not determine native success/failure. Instructions cannot repair a lost host completion signal.
- **Saved worker:** separates stdout/stderr, records native exits and avoids closing the interactive shell. Avoid whole-script terminal dumps, `[pscustomobject]`/non-core static diagnostics, merged strict-error streams and discarded native output.
- **Shell-independent Git:** registration preserves raw Windows user PATH/type and backups. Only the owned `SN_FLUENT_ENV_REFRESH` marker goes through `setx.exe`; PATH itself is never passed through `setx`. Existing hosts may retain old environments. Machine PATH, Git installation/config and policy are unchanged.
- **Profile lifecycle:** inspected Copilot code recreates exited cached terminals using the selected profile; this is source evidence, not an end-to-end acceptance result. Test actual PID/commands. Existing SDK terminals do not gain new startup Functions retroactively.
- **Maintenance only:** `node bin/sn-fluent-agent.cjs configure-git --git-exe "$GitExe"` repairs user Git registration and known legacy overrides with backups, not packages. `configure-terminal` is SDK-profile-only. `install` / `configure-git` support `--dry-run`; `--no-vscode-settings` skips profile/settings, not Git registration. The Install/Update task can discover Git without `--git-exe`. Unrelated custom settings remain preserved.

### G. Resumption checkpoint (agent notes, not the opening summary)

Record values or explicit unknown/not-checked states, with original operation IDs/start times, worker/run paths, logs and actual elapsed observation. Keep installation, environment registration and terminal acceptance separate.

<!-- setup-block:checkpoint -->
```text
NODE_VERSION=
GIT_EXE=
GIT_VERSION=
SDK_PACKAGE_VERSION=
SDK_LOG_DIR=
SDK_STATUS=verified | pending | failed | compatibility-review
DOCS_FAMILY=
DOCS_FAMILY_SOURCE=
DOCS_GIT_HEAD=
DOCS_CLONE_STATUS=
DOCS_INCOMING=
INDEX_PATH=
INDEX_PROVENANCE=
BENCHMARK=
AGENT_REPO=
PAYLOAD_VERIFY=
TERMINAL_CHECK=passed | pending | failed
NEXT_STEP=
```

```text
SETUP_GUIDE_END=0.3.10
```
