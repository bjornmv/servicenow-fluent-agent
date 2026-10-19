# Acceptance test: setup past a blocked existing Git (0.3.13, branch `fix/blocked-git`)

For an agent on the affected **local Windows x64 computer** (VS Code + Copilot agent mode, non-elevated user). The machine has, or may have, an existing Git that cannot run (for example a non-whitelisted Git blocked by application control) and that cannot be uninstalled.

## Agent prompt

```text
Run the acceptance test in this guide and write the report it asks for:
https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/fix/blocked-git/docs/testing/blocked-git-acceptance.md
```

## Authorization and boundaries

This test is authorized to: download the branch ZIP, run the repository tests, install the pinned per-user MinGit **2.54.0.windows.1** if no usable Git exists, register it in Windows user PATH, and change VS Code user settings through the repository's own `configure-git` command (with its automatic backup).

Not authorized: changing, repairing, uninstalling or re-running the blocked Git; elevation; execution-policy changes, `Unblock-File` or `-ExecutionPolicy`; CMD/`.cmd`/`.bat` launchers (including `npm.cmd`); editing repository files; any ServiceNow authentication or deployment. If a step is blocked by policy, record the exact error and continue with the next step that does not depend on it. Never dump whole settings files or environment values into chat. Exception: when this repository itself was installed from a downloaded ZIP, the user (not the agent) may run `Unblock-File` on that ZIP and extract it again, as the installer error says. Never unblock individual scripts, and never do it for a policy or application-control block.

Record every command's actual output and native exit code. A step not run is **NOT RUN** with the reason, never assumed passed.

## 1. Get the build (no Git needed)

```powershell
$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:USERPROFILE 'source\sn-fluent-agent-0.3.13-test'
if (Test-Path -LiteralPath $Root) { throw "Test folder already exists: $Root. Ask the user before reusing or removing it." }
New-Item -ItemType Directory -Path $Root | Out-Null
$Zip = Join-Path $Root 'branch.zip'
Invoke-WebRequest -Uri 'https://github.com/bjornmv/servicenow-fluent-agent/archive/refs/heads/fix/blocked-git.zip' -OutFile $Zip -UseBasicParsing -TimeoutSec 120
Expand-Archive -LiteralPath $Zip -DestinationPath $Root
$Repo = Join-Path $Root 'servicenow-fluent-agent-fix-blocked-git'
Set-Location -LiteralPath $Repo
Get-Content -LiteralPath VERSION
(Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
```

Expect `0.3.13`. Record the ZIP hash. Use this `$Repo` for every later step.

## 2. Repository tests

`npm run` uses a CMD shim, so start Node's test runner directly with the same file list:

```powershell
$Files = (node.exe -p "require('./package.json').scripts['test:setup'].replace(/^node --test /, '')") -split ' '
node.exe --test @Files 2>&1 | Select-String -Pattern '^# (tests|pass|fail|skipped)|^not ok'
```

Expect `# fail 0`. Report the four count lines and every `not ok` name verbatim. A failure here does not stop the remaining steps.

## 3. Discovery

Read `setup.md` in `$Repo`, find the block under `<!-- setup-block:git-check -->` and run exactly that block. Report every output line.

Expect `GIT_UNUSABLE=<path> | <reason>` for each blocked/broken/older copy, then `GIT_EXE=<path>` or `GIT_EXE=none`, with no thrown error.

## 4. Pinned MinGit, only if step 3 printed `GIT_EXE=none`

Verify the worker in the ZIP against the digest in the same ZIP's `git-setup.md`, read it with bounded file reads, then run it:

```powershell
$Worker = Join-Path $Repo 'tools\win-git-bootstrap\scripts\Ensure-MinGit254.ps1'
$Expected = ([regex]::Match((Get-Content -LiteralPath (Join-Path $Repo 'git-setup.md') -Raw), "ExpectedBootstrapSha256 = '([0-9A-F]{64})'")).Groups[1].Value
if (-not $Expected -or (Get-FileHash -LiteralPath $Worker -Algorithm SHA256).Hash -ne $Expected) { throw 'Worker hash mismatch; do not execute.' }
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $PowerShellExe -NoLogo -NoProfile -NonInteractive -File $Worker -InstallIfMissing
Write-Output "WORKER_EXIT=$LASTEXITCODE"
```

If `[regex]` is refused under ConstrainedLanguage, read the `$ExpectedBootstrapSha256` line from `git-setup.md` with a file-reading tool and assign the value instead. Wait for completion (up to 15 minutes). Then report the newest `%LOCALAPPDATA%\Git254Bootstrap\logs\mingit-*.log` lines containing `Unusable`, `Older`, `SIDE-BY-SIDE`, `ABSENT-ONLY`, `SELECTED_GIT`, `SKIP:`, `SUCCESS:`, `SHADOWED:`, `WARNING:` or `FAILED:`.

Expect `SIDE-BY-SIDE SETUP:` (when a blocked copy exists), `SUCCESS:` and, with a blocked system Git, `SHADOWED:`. Then rerun step 3: it must now print `GIT_EXE=` the per-user path.

If step 3 already found a usable Git, run the worker anyway: expect `SELECTED_GIT=` and `SKIP:`, nothing installed.

## 5. Select Git for VS Code

`$GitExe` is the `GIT_EXE=` path from step 3 (rerun).

```powershell
node.exe bin/sn-fluent-agent.cjs configure-git --git-exe "$GitExe" --dry-run
node.exe bin/sn-fluent-agent.cjs configure-git --git-exe "$GitExe"
node.exe bin/sn-fluent-agent.cjs configure-terminal --git-exe "$GitExe" --dry-run
```

Report all output. With a blocked system Git expect `Shadowed in Windows PATH by: <blocked path>`, the settings `updated` (or `unchanged` if an earlier repair wrote the same settings), and `configure-terminal --dry-run` → `unchanged`.

Then read the user `settings.json` (use **Preferences: Open User Settings (JSON)** to find the active file) and report only:

- `terminal.integrated.env.windows` → its `Path` value: must start with the selected Git's `cmd` directory exactly once (expanded or `${env:LOCALAPPDATA}` form)
- `git.path`
- `terminal.integrated.defaultProfile.windows`
- the last `args` entry of the **PowerShell with now-sdk** profile: must contain the `now-sdk` function and exactly one `# sn-fluent-agent:approved-user-git:start` … `:end` block when shadowed
- any `WARNING:` lines from the commands

## 6. Fresh terminal check

Create a **new** terminal with the **PowerShell with now-sdk** profile (not a reused one) and run:

```powershell
$ExecutionContext.SessionState.LanguageMode
Get-Command git -CommandType Function,Application | Select-Object -First 1 CommandType, Source
(Get-Command git.exe -CommandType Application | Select-Object -First 1).Source
git --version; Write-Output "EXIT=$LASTEXITCODE"
node.exe -e "console.log(require('node:child_process').execFileSync('git', ['--version'], {encoding: 'utf8'}).trim())"
Get-Command now-sdk -CommandType Function | Select-Object CommandType, Name
```

Expect with a blocked system Git: `git` is a `Function`; the Application line shows the selected path (PATH prefix); `git version 2.54.0.windows.1` (or the selected version) with `EXIT=0`; the Node line prints the same version; `now-sdk` is a `Function`.

If the new terminal still shows old values, VS Code has not reloaded its environment: report that, and ask the user to fully restart VS Code and rerun this step. Do not reinstall anything.

## 7. Report

Write the report to `%USERPROFILE%\Desktop\sn-fluent-0.3.13-blocked-git-report.md` and tell the user its path. Structure:

```text
# 0.3.13 blocked-Git acceptance report
ZIP SHA-256: ...
Language mode: ...
| Step | Result (PASS / FAIL / NOT RUN) | Key evidence |
1 ... 6
## Outputs
(per step, exact output and exit codes)
## Security notifications
(any AppLocker/Defender notifications seen, with time)
## Not tested
(e.g. full setup from setup.md: needs the release on main; Windows Terminal outside VS Code still resolves the blocked Git by design)
```

Finish by telling the user: upload the report, and do not delete the test folder until the result has been reviewed.
