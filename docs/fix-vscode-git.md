# Repair Git selection in VS Code

For an agent working on the affected **local Windows x64 computer**. Test the currently resolved Git once. If it responds successfully, leave everything unchanged and finish. Otherwise continue with the approved **MinGit 2.54.0.windows.1** repair below, installing it if missing. Complete all repair checks in the current session; a final user restart is only a precaution to refresh changed components—not another agent task.

## Agent prompt

```text
Fix Git in VS Code by following this complete guide:
https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/fix-vscode-git.md
```

If the page is truncated, read the [complete raw file](https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/docs/fix-vscode-git.md).

## Boundaries

For the repair branch, use the approved executable at `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`. Preserve system Git, Windows User/Machine PATH, the user's PowerShell `$PROFILE`, the working `now-sdk` function, credentials, repositories and unrelated settings. No elevation, security-policy changes, execution-policy overrides, binary renaming, certificate-verification disabling or tool upgrades. Do not invoke `code.cmd`, CMD/batch shims or unrelated VS Code version probes.

Do not reopen the whitelisting investigation for an unselected system Git. If the **approved executable itself** is denied, stop and report the denial; do not route around it. Never expose tokens or dump whole environment/configuration files into chat.

This repair covers the chosen PowerShell profile, native/Node children of its VS Code terminals, and built-in Source Control. It does not configure remote/WSL/container sessions, other terminal applications or every extension's independent Git process.

## 0. One non-fatal check: keep working Git

Run this once in the intended agent terminal. Resolve only the first native `git.exe`; do not inventory or execute every installed copy. Node captures the Git result without promoting an expected launch error or nonzero exit into an uncaught PowerShell error. No settings, files or installations are changed by this check.

```powershell
$gitCandidate = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $gitCandidate) { $gitCandidate = '-' }
$gitProbe = @'
const {spawnSync} = require('node:child_process');
const executable = process.argv[1];
const report = {probe:'git_version', executable:executable === '-' ? null : executable, result:'unavailable', next:'continue_repair', reason:'no_application_resolved'};
if (executable && executable !== '-') {
  try {
    const r = spawnSync(executable, ['--version'], {encoding:'utf8', shell:false, timeout:10000, maxBuffer:8192, windowsHide:true});
    const version = String(r.stdout || '').trim();
    const validVersion = /^git version [0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[.a-zA-Z0-9+-]*)$/.test(version);
    const working = !r.error && !r.signal && r.status === 0 && validVersion;
    report.result = working ? 'working' : 'failed';
    report.next = working ? 'finish_no_changes' : 'continue_repair';
    report.exitCode = Number.isInteger(r.status) ? r.status : null;
    report.signal = r.signal || null;
    report.reason = working ? 'version_ok' : r.error ? 'launch_or_capture_error' : r.signal ? 'terminated' : r.status !== 0 ? 'nonzero_or_missing_exit' : 'unexpected_output';
    if (r.error) report.errorCode = /^[A-Z0-9_]+$/.test(r.error.code || '') ? r.error.code : 'UNKNOWN';
    if (working) report.version = version;
  } catch (error) {
    report.result = 'failed';
    report.reason = 'probe_exception';
    report.errorCode = /^[A-Z0-9_]+$/.test(error && error.code || '') ? error.code : 'UNKNOWN';
  }
}
console.log('GIT_PREFLIGHT=' + JSON.stringify(report));
'@
node.exe -e $gitProbe $gitCandidate
```

Read the `GIT_PREFLIGHT` record, not just the outer tool status:

- **`finish_no_changes`:** report the responding executable/version and finish immediately. Do not install, back up/edit settings, enforce the pinned version, run the remaining repair checks or request a restart. This proves native Git launches and reports its version, not private authentication or every extension's Git behavior. An older working version is not permission to upgrade it.
- **`continue_repair`:** record the missing/failed probe and its error/exit code, then proceed to section 1 automatically within the authorized scope. A missing executable, denied launch, nonzero exit or bounded timeout is a handled diagnostic result—not a reason for the agent to abandon this task. Do not retry the failed executable through another launcher or probe other system copies. After a timeout or missing completion status, establish that the probe process ended before deployment; the worker's busy-process safeguards still apply.
- **No valid record:** the probe itself did not complete reliably (for example Node could not launch). Recover its evidence; do not infer Git absence, install Node or blindly repeat the Git call. A later `$host.SetShouldExit` warning does not invalidate an already captured record; report that separate host problem.

This is a routing check, not an installer: a failure does **not** mean an existing installation is absent. Continue to inspect the approved target; do not overwrite an occupied/broken target or weaken its security checks. Only the absent approved target may be installed.

## 1. Inspect and confirm scope

Work as the intended user, not Administrator or SYSTEM.

1. Resolve the approved path using this user's `LOCALAPPDATA`. If it exists, inspect its directory/provenance and invoke **that exact executable** for `--version`, requiring native exit 0 and `git version 2.54.0.windows.1`. Do not replace a different, broken or modified installation. If the target directory is absent, include installation in the plan.
2. Inspect command resolution without launching system Git:

   ```powershell
   Get-Command git, git.exe -CommandType Function,Application -All -ErrorAction SilentlyContinue |
       Select-Object CommandType, Name, Source
   ```

3. Use **Preferences: Open User Settings (JSON)** to find the active VS Code configuration profile's settings file. Do not assume the default `%APPDATA%\Code\User\settings.json` applies to named profiles.
4. Inspect effective terminal profiles, default/automation profiles, terminal environment and `git.path`, including workspace overrides. Identify the working **PowerShell with now-sdk** profile (or its actual name). Review conflicting `git` aliases/functions, profile-specific PATH, `GIT_EXEC_PATH`, extension environment contributions and Settings Sync scope. Inspect environment variable **names first**, not a dump of `GIT_*` values; configuration values may contain credentials. Preserve unexplained customizations; ask before resolving conflicts or changing Sync preferences. Do not edit repository settings.

Report whether Git needs installing, the selected path, actual settings file, terminal profile and proposed changes. **In Allow All/Autopilot mode, proceed with this requested installation and settings repair without an extra approval pause.** Otherwise obtain one approval covering both. Allow All does not authorize unrelated changes, overwriting an unexpected installation or bypassing security policy. Do not silently change installed agent policies.

### Install the approved copy when missing

Use the worker's explicit **`-InstallForVSCode`** mode. Unlike ordinary absent-only setup, it leaves unrelated system Git unprobed and untouched, installs only into the absent per-user target, and makes **no Windows PATH changes**. It retains the pinned ZIP/hash, pre-extraction exclusions, staging tests, Windows OpenSSH/Schannel, deployment lock and security checks. An occupied target or a denied selected executable still stops safely.

The worker preserves the agent host's restrictive settings `safe.bareRepository=explicit`, `credential.interactive=never` and `core.fsmonitor=false`, including their valid `GIT_CONFIG_COUNT`/indexed pairs. These must not prevent installation. Unknown, malformed or unsafe overrides still stop safely; do not clear arbitrary Git environment settings.

Download and verify the reviewed worker, then run it synchronously within the authorized scope:

```powershell
$work = Join-Path $env:TEMP ('sn-vscode-git-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $PID)
New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
$worker = Join-Path $work 'Ensure-MinGit254.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/tools/win-git-bootstrap/scripts/Ensure-MinGit254.ps1' -OutFile $worker -UseBasicParsing -TimeoutSec 120
$expected = 'aba785d774837c83d2168780148cea0c30aaa28ee614370400019ca378414f56'
if ((Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash -ne $expected) { throw 'Worker hash mismatch; do not execute.' }
$global:LASTEXITCODE = $null
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -File $worker -InstallForVSCode
$workerExit = $global:LASTEXITCODE
if ($null -eq $workerExit -or $workerExit -ne 0) { throw 'Git installation failed or did not complete; inspect its logs.' }
Write-Output ('GIT_WORKER_EXIT=' + $workerExit)
```

Wait for native exit 0 and the worker's actual `SUCCESS` or verified-existing `SKIP` result. Logs are under `%LOCALAPPDATA%\Git254Bootstrap\logs`. Verify the final executable/version before configuring VS Code. A missing installation is part of this job, not a reason to defer work until after restart. On a genuine failure, retain evidence and report it; do not claim completion, reinstall blindly, use `-ReplaceFullGit` or bypass safeguards.

## 2. Back up and change three settings

Create a new timestamped backup of the actual settings file. Preserve JSONC comments, unrelated keys and existing environment mappings; do not round-trip the whole file through a JSON-only serializer. Capture `(Get-FileHash -LiteralPath $settingsFile -Algorithm SHA256).Hash` directly into a variable and compare the full value before writing. Never reconstruct a hash from a truncated table display. Verify the backup hash too.

### A. Add a Git function beside `now-sdk`

Keep the current terminal executable and SDK initialization. Append this source to the profile's **existing `-Command` string**, separated by a newline:

```powershell
# sn-fluent-agent:approved-user-git:start
function global:git {
    $approvedGit = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
    if (-not (Test-Path -LiteralPath $approvedGit -PathType Leaf)) {
        $global:LASTEXITCODE = 1
        throw 'Approved per-user Git is missing. Do not fall back to system Git.'
    }
    $global:LASTEXITCODE = $null
    & $approvedGit @args
    if ($null -eq $global:LASTEXITCODE) {
        throw 'Approved Git did not return a native exit code. Stop and inspect the launch error.'
    }
}
# sn-fluent-agent:approved-user-git:end
```

This is PowerShell source to serialize/escape inside a JSON string, **not** a replacement `args` array or settings file. Insert the block once; leave an identical existing block unchanged and review a modified one. Do not use the historical `sn-fluent-agent:git-path` markers, which current setup treats as legacy cleanup targets.

An existing `git` alias takes precedence over the function. Ask about that conflict or a custom startup layout rather than deleting customization or replacing `now-sdk`. With approval, make the repaired profile the default for intended agent terminals; other custom/automation profiles do not automatically gain this function.

**Callers must capture `$LASTEXITCODE` immediately.** Preserve stdout/stderr and nonzero native exits; do not add `exit` or a fallback. The wrapper does not preserve native `$?` or PowerShell 7 `&&`/`||` semantics; use the verified executable directly when those matter. Windows PowerShell 5.1's empty-argument/embedded-quote limitations still apply; test such invocations separately.

### B. Prepend Git to VS Code's terminal PATH

The function does not affect Node's `execFile('git', ...)`. For an otherwise uncustomized terminal environment, merge this setting:

```jsonc
"terminal.integrated.env.windows": {
    "Path": "${env:LOCALAPPDATA}\\Programs\\Git\\cmd;${env:Path}"
}
```

If a PATH expression already exists, prepend the approved directory once and preserve its tail. Keep only one case-insensitive PATH key; do not create both `PATH` and `Path`. Resolve profile-specific overrides that would replace it. This setting affects VS Code terminals, not Windows User/Machine PATH or the entire extension host.

### C. Select Git for built-in Source Control

Set user-level `git.path` to the verified **absolute executable**, replacing this illustration:

```jsonc
"git.path": "C:\\Users\\<actual-user>\\AppData\\Local\\Programs\\Git\\cmd\\git.exe"
```

Do not assume `${env:...}` expands here. Keep this machine-specific choice out of repository settings.

## 3. Verify now, before handing back control

Save and read back the settings, then perform these checks **in the current session**. Prefer a fresh agent-controlled terminal using the repaired profile. If the tool cannot create one, launch a child PowerShell with the saved profile command and matching process-only PATH for the command checks; distinguish that evidence from an actual VS Code terminal test. Do not kill busy terminals, add extensions or make verification depend on restarting VS Code. Until the current terminal refreshes, use the verified absolute Git path rather than retrying blocked system Git.

Capture actual results and native exit codes. Accepted settings, blank tool output or a version string alone are not full acceptance. Missing completion evidence stays **UNKNOWN**; recover the original operation before retrying.

**Host-wrapper errors:** the agent host may call `$host.SetShouldExit(...)`, which fails under Constrained Language even after a command succeeds. Keep the worker/child exit code and verified output separate from that outer tool failure. Report the host warning; do not classify every exit 1 as harmless. If successful completion is independently established by the worker exit/log or saved-state readback, do not repeat installation or edits merely to obtain a green tool result. Otherwise recover evidence first. Do not patch the host, weaken policy or add inline `exit` tricks.

If writing a JavaScript validator, run `node --check` before executing it; avoid nesting PowerShell backticks inside JavaScript template literals. For the nonzero-exit test, use two disposable files with different content and `git --no-pager diff --no-index --no-ext-diff --no-textconv --quiet -- <file1> <file2>`: expect exit **1** without error-stream output. Do not use a deliberately fatal Git command whose redirected stderr can trigger PowerShell 5.1 `NativeCommandError`.

1. **Function:** `Get-Command git -CommandType Function,Application` must report `Function` with the reviewed definition. `git --version` must return the approved version and immediate `$LASTEXITCODE` 0. Check paths with spaces and nonzero native exit propagation.
2. **Native lookup:** `Get-Command git.exe -CommandType Application` must resolve to the approved absolute path.
3. **Node child:** after resolving any `GIT_EXEC_PATH` override, run this in the same terminal. It asserts both the version and helper directory, bounds child execution and rejects missing/nonzero Node completion:

   ```powershell
   $global:LASTEXITCODE = $null
   node.exe -e "const cp=require('node:child_process'); const p=require('node:path'); const run=a=>cp.execFileSync('git',[a],{encoding:'utf8',timeout:10000}).trim(); const version=run('--version'); if(version!=='git version 2.54.0.windows.1') throw new Error('Unexpected Git version: '+version); const expected=p.win32.join(process.env.LOCALAPPDATA,'Programs','Git','mingw64','libexec','git-core'); const actual=run('--exec-path'); if(p.win32.normalize(actual).toLowerCase()!==p.win32.normalize(expected).toLowerCase()) throw new Error('Unexpected Git helper path'); console.log(version); console.log('Node Git helper path: '+actual);"
   if ($global:LASTEXITCODE -ne 0) { throw 'Node Git check failed or did not complete; stop.' }
   ```

   `--exec-path` identifies helpers, not conclusively the launched executable; native lookup can search locations before PATH. Use the verified absolute executable in controlled setup/update helpers where supported.
4. **Local behavior:** use a new disposable directory for `git init`/`git status`. Review inherited Git overrides first; use an explicitly empty template directory and command-scoped hook/fsmonitor suppression. Do not initialize, commit or change remotes in the user's project. Remove only the verified disposable directory you created.
5. **Source Control:** read back `git.path` and confirm it points to the verified executable. Check **Git: Show Git Output** if the extension has already adopted it; otherwise state that the saved selection takes effect on the user's final restart. Do not require a restart to finish this job or enable automatic fetch to force a check.
6. **SDK:** `Get-Command now-sdk -CommandType Function` must still identify the intended function; run its existing version command from the intended project. No dependency installation, authentication, build or deployment is needed.

Record the environment actually tested; a child-process test is not proof about every running extension. Network/private-repository authentication, SSH, signing and LFS are outside this repair.

## 4. Finish, then leave the restart to the user

Conclude installation, saved-settings checks and command tests **before** the restart. Report the selected path/version, installation result if applicable, settings backup and checks passed. Disclose genuine failures or untested host behavior without converting the restart into a follow-up workflow. Do not promise that a hard-coded Git path in an unrelated extension is fixed by terminal PATH.

End with this one user action:

> Save your work, close old terminals once their jobs finish, and fully restart VS Code so its terminals and Git integration pick up the changes.

Closing old terminals avoids VS Code reconnecting to stale persistent sessions. The agent does not restart VS Code, wait for the user to return, or request another chat. There is no post-restart agent task.

**Later full setup is compatible.** When the agent installer's `install` / `configure-git` find a non-working Git ahead of the approved one in Windows PATH, they write the same three things: the identical `approved-user-git` block beside `now-sdk` in the **PowerShell with now-sdk** profile, this PATH prefix (either form) and `git.path`. Existing copies are recognized and kept; nothing is duplicated. A modified block is left alone with a warning. Do not run them as part of this repair; that is a separately approved task.

For rollback, restore only the owned settings changes, using the backup if there have been no intervening edits. Preserve later user changes. Do not uninstall system Git or delete the shared per-user copy; removal is a separate approved task.

## References

- [VS Code terminal profiles and environment](https://code.visualstudio.com/docs/terminal/profiles)
- [VS Code Git selection and Git Output](https://code.visualstudio.com/docs/sourcecontrol/troubleshooting)
- [PowerShell command precedence](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_command_precedence)
- [Current terminal settings implementation](../lib/vscode-terminal.cjs)
- [Current Windows Git environment implementation](../lib/windows-git-environment.cjs)
- [Technical guide](technical-guide.md)
