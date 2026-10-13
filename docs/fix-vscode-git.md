# Repair Git selection in VS Code

For an agent working on the affected **local Windows x64 computer**. Install the approved **MinGit 2.54.0.windows.1** if missing, select it instead of system Git, and finish configuration and checks in the current session. The user's final VS Code restart is only a precaution to refresh running components—not another agent task.

## Agent prompt

```text
Fix Git in VS Code by following this complete guide:
https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/fix-vscode-git.md
```

If the page is truncated, read the [complete raw file](https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/docs/fix-vscode-git.md).

## Boundaries

Use the approved executable at `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`. Preserve system Git, Windows User/Machine PATH, the user's PowerShell `$PROFILE`, the working `now-sdk` function, credentials, repositories and unrelated settings. No elevation, security-policy changes, execution-policy overrides, binary renaming, certificate-verification disabling or tool upgrades.

Do not reopen the whitelisting investigation for an unselected system Git. If the **approved executable itself** is denied, stop and report the denial; do not route around it. Never expose tokens or dump whole environment/configuration files into chat.

This repair covers the chosen PowerShell profile, native/Node children of its VS Code terminals, and built-in Source Control. It does not configure remote/WSL/container sessions, other terminal applications or every extension's independent Git process.

## 1. Inspect, then obtain approval

Work as the intended user, not Administrator or SYSTEM.

1. Resolve the approved path using this user's `LOCALAPPDATA`. If it exists, inspect its directory/provenance and invoke **that exact executable** for `--version`, requiring native exit 0 and `git version 2.54.0.windows.1`. Do not replace a different, broken or modified installation. If the target directory is absent, include installation in the plan.
2. Inspect command resolution without launching system Git:

   ```powershell
   Get-Command git, git.exe -All -ErrorAction SilentlyContinue |
       Select-Object CommandType, Name, Source
   ```

3. Use **Preferences: Open User Settings (JSON)** to find the active VS Code configuration profile's settings file. Do not assume the default `%APPDATA%\Code\User\settings.json` applies to named profiles.
4. Inspect effective terminal profiles, default/automation profiles, terminal environment and `git.path`, including workspace overrides. Identify the working **PowerShell with now-sdk** profile (or its actual name). Review conflicting `git` aliases/functions, profile-specific PATH, `GIT_EXEC_PATH`, extension environment contributions and Settings Sync scope. Preserve unexplained customizations; ask before resolving conflicts or changing Sync preferences. Do not edit repository settings.

Report whether Git needs installing, the selected path, actual settings file, terminal profile and proposed changes. **Ask for approval before mutations**, covering installation when needed and the settings repair together. Do not silently change installed agent policies to override conflicting instructions.

### Install the approved copy when missing

Use the worker's explicit **`-InstallForVSCode`** mode. Unlike ordinary absent-only setup, it leaves unrelated system Git unprobed and untouched, installs only into the absent per-user target, and makes **no Windows PATH changes**. It retains the pinned ZIP/hash, pre-extraction exclusions, staging tests, Windows OpenSSH/Schannel, deployment lock and security checks. An occupied target or a denied selected executable still stops safely.

After approval, download and verify the reviewed worker, then run it synchronously:

```powershell
$work = Join-Path $env:TEMP ('sn-vscode-git-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $PID)
New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
$worker = Join-Path $work 'Ensure-MinGit254.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1' -OutFile $worker -UseBasicParsing -TimeoutSec 120
$expected = '03ba1af2e4cae5555af7aeec6a7dfcf7a3f81271018f7cdeb2446fd51fc620b8'
if ((Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash -ne $expected) { throw 'Worker hash mismatch; do not execute.' }
$global:LASTEXITCODE = $null
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -File $worker -InstallForVSCode
if ($global:LASTEXITCODE -ne 0) { throw 'Git installation failed or did not complete; inspect its logs.' }
```

Wait for native exit 0 and the worker's actual `SUCCESS` or verified-existing `SKIP` result. Logs are under `%LOCALAPPDATA%\Git254Bootstrap\logs`. Verify the final executable/version before configuring VS Code. A missing installation is part of this job, not a reason to defer work until after restart. On a genuine failure, retain evidence and report it; do not claim completion, reinstall blindly, use `-ReplaceFullGit` or bypass safeguards.

## 2. Back up and change three settings

Create a new timestamped backup of the actual settings file. Preserve JSONC comments, unrelated keys and existing environment mappings; do not round-trip the whole file through a JSON-only serializer. Check for concurrent edits before writing.

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

1. **Function:** `Get-Command git` must report `Function` with the reviewed definition. `git --version` must return the approved version and immediate `$LASTEXITCODE` 0. Check paths with spaces and nonzero native exit propagation.
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
6. **SDK:** `Get-Command now-sdk` must still identify the intended function; run its existing version command from the intended project. No dependency installation, authentication, build or deployment is needed.

Record the environment actually tested; a child-process test is not proof about every running extension. Network/private-repository authentication, SSH, signing and LFS are outside this repair.

## 4. Finish, then leave the restart to the user

Conclude installation, saved-settings checks and command tests **before** the restart. Report the selected path/version, installation result if applicable, settings backup and checks passed. Disclose genuine failures or untested host behavior without converting the restart into a follow-up workflow. Do not promise that a hard-coded Git path in an unrelated extension is fixed by terminal PATH.

End with this one user action:

> Save your work, close old terminals once their jobs finish, and fully restart VS Code so its terminals and Git integration pick up the changes.

Closing old terminals avoids VS Code reconnecting to stale persistent sessions. The agent does not restart VS Code, wait for the user to return, or request another chat. There is no post-restart agent task.

**Do not automatically rerun normal installation or `configure-git`.** In the current implementation, both configure Windows User PATH/environment. Normal installation does so even with `--no-vscode-settings`; `--git-exe` selects Git but does not disable that work. The current terminal settings code also removes recognized legacy Git overrides; this guide uses a different marker, not a guarantee of compatibility with future versions.

If setup previously stopped, identify the last completed stage and review the exact installer version before proposing a separately approved resumption. It must preserve the repair, retain approved Git selection and avoid actions outside the agreed scope. Do not replay completed stages, invent skip flags or silently alter managed installer files. Restarting VS Code does not make an incompatible installer safe to rerun.

For rollback, restore only the owned settings changes, using the backup if there have been no intervening edits. Preserve later user changes. Do not uninstall system Git or delete the shared per-user copy; removal is a separate approved task.

## References

- [VS Code terminal profiles and environment](https://code.visualstudio.com/docs/terminal/profiles)
- [VS Code Git selection and Git Output](https://code.visualstudio.com/docs/sourcecontrol/troubleshooting)
- [PowerShell command precedence](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_command_precedence)
- [Current terminal settings implementation](../lib/vscode-terminal.cjs)
- [Current Windows Git environment implementation](../lib/windows-git-environment.cjs)
- [Technical guide](technical-guide.md)
