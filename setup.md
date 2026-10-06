---
permalink: /setup/
---

# Agent-Assisted Installation

```text
SETUP_PROTOCOL_VERSION=0.3.8
```

Give a new agent session this prompt to install this agent:

```text
Read https://bjornmv.github.io/servicenow-fluent-agent/setup/ and follow its instructions to perform the full ServiceNow Fluent agent setup.
```

If web extraction is incomplete, download the complete [unversioned plain-text guide](https://bjornmv.github.io/servicenow-fluent-agent/setup.txt) over HTTPS and read the saved file in bounded ranges, or read this file from a reviewed local repository. Do not require a Git clone to install missing Git. A policy denial is a stop condition, not a reason to change transport. A version mismatch or missing content must be resolved before executing anything.

## Instructions for the Agent

**Target: Windows x64, VS Code, GitHub Copilot agent mode.** In another harness, perform steps 1–6 only where its permitted tools support them and report step 7 as pending; do not simulate VS Code acceptance.

Set up the ServiceNow Fluent agent on this Windows machine. Work through the steps in order, report each result, and stop at the first blocking failure. Node.js must already be installed. This procedure authorizes only the prescribed missing-Git bootstrap, the global SDK package install/update, the two repository checkouts, agent configuration and documentation indexing. Do not install other prerequisites, use elevation, handle credentials, authenticate to ServiceNow, or deploy an application.

### 0. Confirm the guide before execution

Report the guide source and protocol version, and read through its final end marker. Require matching `SETUP_PROTOCOL_VERSION` and `SETUP_GUIDE_END`, all steps 1–7, the saved `Invoke-SdkSetup.ps1` launch and the `-WaitSeconds` recovery option. A web tool's “relevant context” response containing omitted sections or ellipses is NOT the complete guide. In a local checkout, compare `VERSION` with the guide before proceeding. Never reconstruct missing commands from memory or blend guide revisions.

The canonical entry point is the unversioned `/setup/` page. The same publication provides `/setup.txt`, the [current checksum manifest](https://bjornmv.github.io/servicenow-fluent-agent/setup-manifest.json) and `/downloads/Invoke-SdkSetup.ps1`. Before execution, download the complete text and manifest from those stable URLs; compare the text file's SHA-256 with `manifest.setup.sha256`, its protocol markers with `manifest.version`, and the saved worker's SHA-256 with `manifest.sdkWorker.sha256` and the expected digest in step 2. A successful fetch alone does not establish freshness or completeness. If cached or concurrently updated files disagree, stop and obtain a matching current set; do not execute mixed content. Protocol versions identify compatible guide/worker content, not a pinned SDK package version. Only the current versioned reference copy is published; older `/releases/<version>/` paths are not guaranteed to remain available. Use the stable URLs above.

Run this download/verification block before setup mutations. It verifies the complete guide against the manifest and both protocol markers; the worker is downloaded and checked separately in step 2. Then read the saved guide through its end marker, not just this block's output.

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

### Execution discipline

- Use the permitted native executables/Node JavaScript entry points from the outset. Do not invoke CMD, `.cmd`/`.bat` launchers, or probe `now-sdk.cmd`. A policy block must be reported and reviewed, not worked around with another launcher or weaker policy.
- Assume Windows PowerShell 5.1 **ConstrainedLanguage**. Keep diagnostics to cmdlets, hashtables and plain strings; avoid `[pscustomobject]` construction and non-core static calls such as `[IO.Path]::GetFullPath` or `[Diagnostics.FileVersionInfo]::GetVersionInfo`. Use `(Resolve-Path -LiteralPath $ExistingPath).Path` for existing paths and `$PSVersionTable.PSVersion` for the current host version.
- Use file-reading tools with bounded ranges for source/log review. Do not dump whole scripts into the interactive terminal, or run `Select-String -InputObject $WholeScript` repeatedly: each match can print the entire script. Prefer `Select-String -LiteralPath $File -Pattern ...` when needed.
- Keep setup execution in the parent agent; do not delegate installation or recovery to an execution subagent that rewrites commands or loses completion state. Use the reviewed saved workers and the short launch commands exactly. Never append `exit` to a command in a shared interactive terminal: it closes the host and can destroy the runner's completion result. The only planned terminal retirement is the separate, guarded final-step action in step 7, after all installation results are saved. Use `throw` for a blocking failure. Do not bypass script policy.
- A timeout, spinner or truncated transcript means **completion unknown**, not failure or permission to repeat an install/clone/build. Preserve the original operation and observe it using the host-supported completion mechanism. Do not start a second copy or kill applications automatically.
- Follow the actual terminal tool contract. Use synchronous mode for one-shot setup commands when required; do not force async, issue sleep commands, or poll when the host forbids them. A tool's `ok`, `mode: sync`, or “Command produced no output” is not a native exit status.
- Keep stdout, stderr and exit status. Never discard native output with `*> $null`, hide exceptions in empty catch blocks, or merge native stderr into a strict PowerShell error pipeline. Warnings alone are not nonzero exit codes. Genuine launch failures and policy blocks stop execution; a missing exit status remains UNKNOWN, not a proven installation failure.

### 1. Check prerequisites and ensure Git

Before changing anything, verify Node.js:

```powershell
$ErrorActionPreference = 'Stop'
Get-Command node.exe -CommandType Application -ErrorAction Stop
node.exe --version
if ($LASTEXITCODE -ne 0) { throw 'Node.js version check failed; stop.' }
node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=18)?0:1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js >=20.18.0 required; stop.' }
```

If Node.js is missing or fails, report it and stop without installing anything or making partial configuration changes. Node.js **>=20.18.0** is the minimum, not a guarantee that every future SDK dependency supports that runtime; step 2 also gates engine warnings.

Then check Git availability and its version. Keep a working stable Git **>=2.54.0** unchanged. If it is not on PATH, check known installation locations/registration before declaring it absent. An older Git, an executable that cannot run, or a broken registration requires review; it is **not** permission to reinstall, upgrade or bypass policy.

Use this read-only discovery block; a found executable that fails is not absence. Registry evidence or an incomplete standard directory also prevents an absent classification.

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

| Result | Action |
| --- | --- |
| Working stable version >=2.54.0 | Preserve it and continue with the recorded `$GitExe`. |
| Older, blocked, broken, prerelease or ambiguous evidence | Stop for review; no automatic replacement. |
| Absent after discovery | Follow the separate Git procedure; its worker repeats the absence checks. |

If Git is genuinely absent, follow the separate **[Windows Git setup procedure](https://bjornmv.github.io/servicenow-fluent-agent/git-setup/)** (local file: `git-setup.md`). It reuses the `win-git-bootstrap` skill and hash-verified script, downloads only MinGit **2.54.0.windows.1**, excludes the two blocked Unix utilities **before extraction**, and runs only `-InstallIfMissing`. The document and script are available over HTTPS without cloning this repository.

For this absent-Git handoff, download the complete Git guide and check it against the same recorded manifest before following it. Restore `$GuideDir` and `$ManifestPath` from step 0 if the shell changed.

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

Read that saved Git guide completely. Require its expected worker digest and the saved worker bytes to match `manifest.gitWorker.sha256` too; stop on mixed content. Wait for completion and verify the result before continuing to step 2. Record the verified **absolute** Git executable path in `$GitExe` and use it for all remaining Git commands; a newly installed user PATH may not be visible to this session. For a fresh managed install this is `$env:LOCALAPPDATA\Programs\Git\cmd\git.exe`. Stop on any bootstrap or security-policy failure. Never invoke migration/replacement modes as part of setup.

### 2. Install now-sdk

This step installs the **package**, not the VS Code shell function. It deliberately uses npm's **`latest` dist-tag**, not `next`; the resolved version is recorded in `sdk.result.json`, not pinned by the guide. Do not run bare `now-sdk` yet: the installer creates the **PowerShell with now-sdk** profile in step 5, and its function is available only in newly created terminals using that profile. CLI acceptance belongs to step 7, not this step.

Use the canonical [saved SDK worker](https://bjornmv.github.io/servicenow-fluent-agent/downloads/Invoke-SdkSetup.ps1) (`tools/Invoke-SdkSetup.ps1` in this repository), not an improvised multiline terminal command. It checks npm's effective global prefix before installation, rejects a destination other than `%APPDATA%\npm`, and pins that verified prefix for the install. Prefix-check output is retained in `npm-prefix.stdout.log` and `npm-prefix.stderr.log`; a failed or missing prefix check does not authorize installation. It runs Node's `npm-cli.js` with separate install stdout/stderr files and records `npm.exit-code.txt` plus `sdk.result.json` after package verification. A child script ends without closing the calling terminal.

Download and hash-check **without executing**, then read the saved file using a file-reading tool:

```powershell
$ErrorActionPreference = 'Stop'
$ExpectedSdkSetupSha256 = '85578FC82B71D89F570789C78F9CE67E246E4AA31DB3385101226F800CA54B8A'
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

A reviewed local repository copy can be used instead, with the same hash check. Stop on download/hash/signing or policy failure; no alternate interpreter, zone-marker removal or policy override. Record the exact `$SdkLogDir` **before** starting. Do not create it yourself; the worker refuses an existing run directory to prevent a duplicate install.

Before launch, identify the host's documented completion mechanism and permitted recovery routes; do not assume status tools or an independent terminal exist. Record the absolute worker path, exact run directory, launch time and any returned operation ID in the parent agent's notes. Keep the setup task in progress until completion is established; do not reset it to not-started on an early tool return. Launch exactly once in a child process and retain ownership of the original terminal/tool operation until completion:

```powershell
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $SdkWorker -RunDirectory $SdkLogDir -Install
if ($LASTEXITCODE -ne 0) { throw 'SDK worker stopped; inspect this run, do not reinstall.' }
```

Do not append `exit`, merge child stderr into a strict error pipeline, or translate the worker back into inline commands. In a direct-process tool, use the same executable and argument array with resolved absolute paths.

#### Recover the original operation, not a second installation

An empty transcript or `SDK_LOG_DIR` alone is not completion. Treat the original terminal as potentially busy until idleness is established. **Do not send recovery, `Get-Process`, echo/probe or other diagnostic commands into that same still-busy terminal.** Another normal synchronous call can reuse it; a new tool-call ID does not prove a new idle terminal.

Choose only a recovery route the host actually supports:

- If the tool explicitly reports background execution, timeout or input-needed, use its returned operation ID with the permitted status/input tool. In notification-driven hosts, yield and wait for the completion notification; do not poll. Do not invent an ID or call `get_terminal_output` after an ordinary sync result when the tool forbids it.
- If the runner silently returns early, inspect the exact run's durable files with file-reading tools independently of the terminal. A missing file in one early sample means **pending / completion unknown**, not a blocking installation failure. Repeated timed file checks are polling too: use them only if the host permits polling. Otherwise use notifications or an independently supported recovery route below.
- Use the recovery command below only after establishing a **separate idle terminal or approved direct-process tool** and permission for its bounded wait. Do not assume a fresh command creates a fresh terminal, disguise a forbidden wait inside a script, or launch an alternative interpreter to bypass a refusal.

Allow up to **5 minutes** for supported observation of the original run, measured from the recorded install launch time. A requested timeout or `-WaitSeconds 180` is not evidence that time elapsed: a 13-second early return is not a completed 180-second recovery wait. Record actual elapsed time and completion evidence. Re-read at the end of the wait budget using permitted file tools before reporting unresolved status; do not reuse an old missing-file snapshot. Do not run a recovery wait beyond the remaining budget; reduce `-WaitSeconds` accordingly.

Immediately before any unresolved handoff, make one final independent reread of the exact run's evidence if file access is permitted; apply the success/failure decisions below to that current snapshot. This is not permission for repeated polling. If evidence cannot be read, report that limitation rather than claim a fresh check.

If the host provides no permitted observation/wait route, report **Setup pending — terminal completion unavailable**, preserving the run directory and next step. Do not call this an installer failure or an expired wait. Do not ask the user to run recovery while a supported automatic route remains available. Explain the specific host limitation if a user handoff is unavoidable; instructions alone cannot repair a terminal that loses completion and provides no supported notification/status path.

For the bounded read-only recovery command, use the SAME saved worker and exact recorded run directory, **without `-Install`**. Resolve `$PowerShellExe`, `$SdkWorker` and `$SdkLogDir` from their recorded absolute paths in the separate execution context; old shell variables do not carry over. `-WaitSeconds 180` waits read-only for the original run's exit marker; it does not install anything. Positive `-WaitSeconds` internally polls with `Start-Sleep`; a separate process is not permission to use it when the host forbids waiting/polling. When exit evidence already exists, `-WaitSeconds 0` is a one-shot read-only check in an approved independent context, not a repeated-polling workaround. The worker also understands 0.3.4 logs. Do not guess the newest directory, use package presence alone, or start a new install:

Fill these placeholders from the original operation's notes before executing; they deliberately do not guess a new run.

```powershell
$ErrorActionPreference = 'Stop'
$PowerShellExe = '<recorded absolute powershell.exe path>'
$SdkWorker = '<recorded absolute saved Invoke-SdkSetup.ps1 path>'
$SdkLogDir = '<recorded absolute SDK run directory>'
if ($PowerShellExe -like '<*' -or $SdkWorker -like '<*' -or $SdkLogDir -like '<*') { throw 'Fill the original recorded paths before recovery.' }
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $SdkWorker -RunDirectory $SdkLogDir -WaitSeconds 180
if ($LASTEXITCODE -ne 0) { throw 'Read-only recovery did not verify completion; classify the original run using its saved evidence. Do not reinstall.' }
```

The worker prints `SDK_WORKER_VERSION=0.3.8`; an unexpected version is a stop/review condition. A nonzero recovery exit can mean missing evidence or wait-budget expiry; it is **not** by itself a nonzero npm exit. Do not wrap recovery in `SilentlyContinue` or replace it with `[pscustomobject]` diagnostics.

#### Decide from current, attributable evidence

| Evidence for the exact original run | Action |
| --- | --- |
| Native npm exit is nonzero, or a launch/policy failure is confirmed | Stop and report the actual failure with saved logs. Do not retry installation. |
| Exit/result files are absent or incomplete, with no confirmed failure | Keep setup pending; observe through a permitted route. Missing evidence is not permission to continue or reinstall. |
| Recorded files disagree, are malformed, or identify another run/version | Pause for evidence review; do not claim success or overwrite them. |
| Complete, consistent success evidence below | Mark step 2 complete and resume at step 3 without another installation approval. |

Accept package completion through either of these evidence paths:

- **Original durable result:** read `npm.exit-code.txt` as exactly `0`, both saved logs (scan complete stderr for `EBADENGINE`, not just its tail), and valid `sdk.result.json` with `schemaVersion: 1`, `state: package-verified`, `npmExitCode: 0`, the expected worker version and the exact recorded `runDirectory`. Confirm `packagePath` is the expected global SDK metadata path, that its current name is `@servicenow/sdk`, its version equals `packageVersion`, and its `bin/index.js` exists. Any conflicting evidence requires review. Do not launch recovery merely to print another success marker once these checks pass.
- **Completed read-only recovery:** require attributable native recovery exit 0 and `SDK_PACKAGE_VERIFIED=true` for the exact worker/run. The worker checks the recorded npm exit, both logs, current package metadata and SDK entry file without running npm or the SDK. It does **not** validate an existing `sdk.result.json`: if that file exists, independently apply the same identity/version/metadata consistency checks as the durable-result path before accepting recovery success. Missing result JSON can be recovered from attributable exit/log evidence, including older runs; a malformed or conflicting existing result cannot be ignored. Blank output or tool `ok` alone does not meet this path.

Either validated path authorizes **continuing at step 3**, not repeating step 2. Completion of the package does not prove the original terminal is idle: account for any already-issued commands before reusing it, or use a confirmed independent execution context. If terminal availability remains unresolved, report **SDK package verified; remaining setup pending terminal availability**, not package failure. Fresh-terminal CLI acceptance remains step 7.

After an actual observation-budget expiry, report **Setup pending — SDK completion still unknown**, with elapsed time, the exact run directory and latest evidence. Save this checkpoint for resumption: recover that same run first and continue from step 3 on success, never restart step 2 just because the chat or terminal changed.

Require an explicit zero npm exit and valid package metadata before continuing. The default profile expects the standard per-user npm prefix under `%APPDATA%\npm`; a customized prefix requires review, not silent installation into a second location. Do not use `--force`, suppress lifecycle scripts to hide a failure, or elevate.

`EBADENGINE` blocks package acceptance even with npm exit 0. The worker emits `SDK_ENGINE_WARNING=true` and stops for compatibility review in both install and recovery modes; do not reinstall or change Node automatically. Apply this check to the durable-result path too, including results from older workers. This means npm succeeded but compatibility needs review, not that npm failed.

Report deprecation warnings and failed optional dependencies separately from package installation success. For example, an optional native add-on failure with npm exit 0 does not prove the SDK is unusable, but affected features remain unverified. Consult the saved stderr and npm debug log; do not automatically install build tools or retry the install. Package presence alone is not CLI/runtime acceptance.

### 3. Keep Git shell-independent

Continue using `$GitExe` while setup runs. An existing PowerShell, VS Code or Windows Terminal process may still have its old environment; do not repair that by adding Git to a particular terminal profile, shell startup script, function or alias.

The fresh Git bootstrap registers the directory in **Windows user PATH** and requests normal Windows environment propagation. Step 5 also performs this environment-only operation for an existing verified Git. The raw PATH and registry type are preserved and backed up; only a short owned `SN_FLUENT_ENV_REFRESH` marker is passed through Windows `setx.exe` to request its native environment update. PATH itself is never passed through `setx`, which can truncate long values. No machine PATH, security policy or Git installation/configuration is changed by the environment-only operation.

This applies independently of shell type. It cannot rewrite every already-running application's environment. Restart affected terminal **hosts** from a refreshed launcher after setup, rather than repeatedly reinstalling Git or editing each new terminal's PATH. Do not kill applications or discard work automatically.

### 4. Clone ServiceNowDocs

Use the same short, per-user defaults on every Windows machine:

```text
Docs:  %LOCALAPPDATA%\SNDocs\repo
Index: %LOCALAPPDATA%\SNDocs\index
```

Resolve these once, retaining optional environment overrides (use absolute paths for full setup):

```powershell
$Docs  = if ($env:SN_DOCS_HOME) { $env:SN_DOCS_HOME } else { Join-Path $env:LOCALAPPDATA 'SNDocs\repo' }
$Index = if ($env:SN_DOC_MD_INDEX) { $env:SN_DOC_MD_INDEX } else { Join-Path $env:LOCALAPPDATA 'SNDocs\index' }
$DocsUrl = 'https://github.com/ServiceNow/ServiceNowDocs.git'
$Family = 'australia'
Write-Output "DOCS_FAMILY=$Family"
Write-Output 'DOCS_FAMILY_SOURCE=validated setup default'
```

Keep the validated Australia default; do not silently switch families, fall back to a different corpus after a benchmark failure, or rebuild an existing index. Those changes require separate approval.

For a missing `$Docs`, clone into a unique sibling and promote it only after native exit 0. Record `$DocsIncoming` and the original operation before launch. Allow several minutes; a timeout means completion unknown, not permission to start another clone. Repository size varies, so do not use a download-size estimate as a completion check.

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

For either a newly promoted or existing checkout, run these checks. Expect the exact resolved `$Docs` root, the public `$DocsUrl` origin, branch `$Family`, empty porcelain status, and a readable commit ID. Empty tool output is not evidence that the status command completed successfully.

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

Only for a verified existing checkout, update with fast-forward only from the verified origin and family, not an implicitly configured upstream; then repeat the checks above to record its new commit:

```powershell
& $GitExe -C "$Docs" pull --ff-only origin "$Family"
if ($LASTEXITCODE -ne 0) { throw 'Documentation update failed; stop setup.' }
```

| State | Action |
| --- | --- |
| Leftover incoming directory or uncertain original clone completion | Preserve and report its exact path; inspect the original operation, never delete it or launch another clone. |
| Proven clone exit 0 but promotion not completed | Verify the incoming checkout using the same root/origin/branch/status checks against its recorded path; promote only to an absent destination with no pending original operation. |
| Unexpected origin/root/branch, dirty checkout or destination collision | Stop for review; no reset, force checkout or automatic family change. |

Stop rather than modifying an unexpected existing directory. Do not discover, move, delete or silently reuse an old checkout/index elsewhere. Merely configuring these defaults must not create directories or populate them; cloning and indexing belong to an authorized full installation.

### 5. Clone and install this agent

Use the explicit agent destination below, separate from `$Docs`, `$Index` and application repositories; do not clone relative to the active workspace. If an earlier setup recorded another destination, inspect that record first rather than create a second copy.

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

Expect `AGENT_REPO` to identify that verified root and capture native completion before installing. On an early return, recover the original clone/update instead of repeating this block. Opening this folder in VS Code is optional for the human, not an installation prerequisite. From this confirmed repository root, pass the verified Git executable explicitly to the installer:

```powershell
node bin/sn-fluent-agent.cjs install --git-exe "$GitExe"
if ($LASTEXITCODE -ne 0) { throw 'Agent installation failed; stop setup.' }
```

This installs the payload, registers the verified Git directory in **Windows user PATH**, requests native environment propagation, and configures the SDK-only terminal profile. The **PowerShell with now-sdk** profile defines a `now-sdk` function that invokes Node with the project-local SDK entry when present, otherwise the global entry. It deliberately does not invoke a batch shim. This is the intended setup from the outset, not a fallback after a policy denial. Git availability does not depend on that profile. Known legacy Git profile overrides/startup blocks from earlier versions are removed conservatively; unrelated settings and startup commands are preserved with backups. No Git reinstall, machine PATH or security-policy change is performed. `--no-vscode-settings` skips VS Code/SDK-profile configuration, not Windows Git environment registration.

The **Install/Update ServiceNow Fluent Agent** VS Code task remains available; without `--git-exe`, the installer verifies Git from its current PATH or standard locations, and stops if the selected executable is missing, older or blocked.

For Windows Git environment repair only (no Git or payload installation/removal), use `node bin/sn-fluent-agent.cjs configure-git --git-exe "$GitExe"`. It also removes known legacy profile workarounds, with a settings backup. Both commands support `--dry-run`. `configure-terminal` configures the SDK profile only; it is not a Git PATH repair. Stop on any failed native update or policy block; do not substitute another interpreter or weaken policy.

### 6. Build and verify the documentation index

After payload installation, inspect an existing index **before** the build command. Read its specific manifest with a file tool, or:

```powershell
$Skill = Join-Path $env:USERPROFILE '.agents\skills\sn-doc-lookup'
$IndexManifestPath = Join-Path $Index 'manifest.json'
if (Test-Path -LiteralPath $Index) {
    Get-Content -LiteralPath $IndexManifestPath -Raw -ErrorAction Stop
}
```

Expect `schema_version` equal to `1`, `generator` beginning `sn-doc-md@`, `family` equal to `$Family`, and `docs_root` equal to the verified `$Docs` root. Compare `git_head` with the recorded `$DocsHead`; an empty value is unknown provenance, not a match. Do not fabricate it. If any identity is unexpected, stop for review. If the recognized index is current, skip building and run the benchmark; if outdated or provenance is unknown, ask whether to reuse it with that limitation or approve a rebuild. A full-setup request is not automatic permission to replace an existing index.

For a missing index, use the installed lookup skill to build at the resolved `$Index`. Do not create the index directory beforehand:

```powershell
node "$Skill\bin\sn-doc-md.js" build --docs "$Docs" --out "$Index" --family "$Family"
if ($LASTEXITCODE -ne 0) { throw 'Documentation indexing failed; stop setup.' }
```

Run the benchmark for either a newly built or explicitly reused recognized index:

```powershell
node "$Skill\test\run-tests.js" --index "$Index"
if ($LASTEXITCODE -ne 0) { throw 'Documentation lookup verification failed; stop setup.' }
```

For an existing recognized index, inspect its manifest (generator, family and docs root) first and use `--force` only for an approved rebuild. Never delete an unexpected directory or source checkout to make indexing succeed. Report benchmark failures rather than claiming success.

The CLI shares the same defaults and overrides for build/search/read/test. `node "$Skill\bin\sn-doc-md.js" paths` is a read-only way to inspect resolved paths; it does not download, move or index anything.

### 7. Open a fresh agent terminal and verify (final step)

The installing agent performs this check itself, after steps 1–6 finish. Use the existing terminal tools; do not install an extension, add a task or simulate a terminal with a child PowerShell process. The intended profile is **PowerShell with now-sdk**. Existing terminals do not retroactively gain its function; a different profile, standalone shell or restored terminal is not equivalent.

#### Prepare the terminal handoff

- Require confirmed completion of every installation/clone/index operation and save their results, including the exact SDK run directory and exit/result files. No pending/background operations, running jobs or unresolved completion may remain in the terminal being retired.
- Record the verified Git absolute path/version, SDK package version and agent repository absolute path in the agent's notes, not just shell variables. Those variables and the old working directory will not survive.
- Check the effective default terminal profile is **PowerShell with now-sdk**, including applicable user/workspace settings. Copilot's `chat.tools.terminal.terminalProfile.windows` can override that default: report an incompatible override for review, rather than silently replacing it. Settings inspection is only a precondition, not runtime acceptance.
- Establish that the current terminal is the agent's own idle, disposable setup terminal. Do not close a user/shared terminal, lose user work or interrupt any process. If ownership, idleness or profile selection is uncertain, stop this handoff and report the verification gap.
- In a completed `run_in_terminal` call with `mode: "sync"`, capture the old shell PID:

```powershell
Write-Output "SETUP_TERMINAL_PID=$PID"
```

#### Retire only that terminal, then let the tool create a new one

Send the following as its **own separate** `run_in_terminal` call (`mode: "sync"`), never appended to an installer, worker, diagnostic or verification command:

```powershell
exit
```

This intentionally ends only the confirmed idle agent-owned shell. A terminal-closed result is expected; it does not invalidate the already-saved installation results. Do not interpret it as npm failure, reinstall anything, or repeatedly send exit. If closure remains unresolved, report that instead of guessing.

Make the next `run_in_terminal` call in normal synchronous mode, not background mode:

```powershell
Write-Output "VERIFICATION_TERMINAL_PID=$PID"
Get-Location
```

In the inspected VS Code implementation, `run_in_terminal` detects an exited/disposed cached shell and creates a new real integrated terminal using the current profile. **Require a different PID** from the recorded setup PID before continuing; a missing/unchanged PID is not fresh-terminal evidence. This lifecycle is source-confirmed, not yet end-to-end tested in Copilot. Record the actual result of this run; never infer success from that implementation alone. A harness with different behavior must report the gap, not bypass its tool restrictions.

Use `Set-Location -LiteralPath` with the recorded agent repository absolute path. Do not assume `$GitExe`, other old variables or the previous working directory survived. Start from the agent repository so another project's local SDK does not mask the global package. Do not define `now-sdk`, inject PATH or copy startup commands into the new terminal to make the test pass; its configured startup must provide the function unaided.

#### Verify commands in the fresh terminal

Require normal command resolution to find the **Function** before invoking the SDK:

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

Require Git's reported **Application** path/version to match the recorded step-1 values and the SDK version to match the verified global package. Preserve the command output and explicit exit results. If any comparison fails, report the mismatch, not a pass. Locally modified payload files and nonzero verifier results must also be reported accurately.

If the function is missing, review the selected profile and preserved custom startup arguments without overwriting them. Report real policy blocks for review; do not try alternative launchers or rerun npm. An absolute-path probe, settings-file inspection, package version, simulated child shell or payload verifier alone is **not** successful new-terminal verification.

If this harness cannot safely perform the handoff, report **Installation complete; fresh-terminal integration check pending** only when installation completion is established. The manual fallback is **Terminal: Create New Terminal (With Profile)** → **PowerShell with now-sdk**, followed by the same checks. Do not label the installation failed or fully verified merely because this final check is unavailable.

#### Other hosts and final report

A new shell does not necessarily refresh a stale VS Code host environment. For Git propagation, save work and restart affected hosts from a refreshed launcher only if needed. **Developer: Reload Window** is not a guaranteed environment refresh. Do not close applications automatically or launch a restarted host from an old shell with stale PATH. Create genuinely new terminals (not a restored/reconnected terminal).

Verify plain `git --version` across the actual hosts/shells the user uses, including an ordinary terminal outside the SDK profile. Do not launch CMD/batch or another prohibited shell merely to test it. Report untested hosts separately; the agent-terminal check does not certify every terminal. If a host remains stale after restart, identify its launcher/explicit PATH override; signing out/in is the fallback, not a substitute for testing or a reason to reinstall.

Report the Node.js/Git/SDK versions, verified Git path and preservation/bootstrap result/logs, SDK run directory, docs path/branch, index path/benchmark, agent repository/install/payload result, old/new terminal PIDs and fresh-terminal command results. Separate installation completion, environment registration and live terminal acceptance. Do not claim authentication or instance connectivity; this procedure tests neither.

Use this final report template; fill unknown or pending fields explicitly rather than omitting them. Preserve run paths for resumption. `TERMINAL_CHECK` is separate from package/payload installation status.

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
SETUP_GUIDE_END=0.3.8
```