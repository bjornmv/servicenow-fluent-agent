# Repair Git selection in VS Code on a corporate Windows machine

**Give this guide to the agent working on the affected computer.** It is a targeted repair procedure, not a request to reinstall the entire ServiceNow Fluent Agent setup.

## Goal and boundaries

The organization's approved **MinGit 2.54.0.windows.1** works, but an existing system Git is selected or prevents setup from continuing. Make the agent use the approved per-user Git **inside VS Code**:

- A `git` PowerShell function selects the approved executable directly, alongside the existing working `now-sdk` function.
- A VS Code terminal PATH override makes native Git calls and Node processes launched from those terminals select the same installation.
- `git.path` selects it for VS Code's built-in Source Control.

The expected executable is:

```text
%LOCALAPPDATA%\Programs\Git\cmd\git.exe
```

Treat the organization's approval of this distribution as a supplied task fact. Do not restart a generic whitelisting investigation merely because a different system Git is blocked. **If the approved executable itself is denied, stop and report the actual denial.** A function or PATH change is not permission to evade application control.

Do not uninstall or alter system Git, edit Windows User/Machine PATH, edit the user's PowerShell `$PROFILE`, change security policy, elevate, change credentials, or upgrade tools. Preserve the existing `now-sdk` resolver, other agents/extensions, repositories, `.gitconfig` and `.ssh`. Do not use `-ReplaceFullGit`, execution-policy overrides, binary renaming, security exclusions or an alternate interpreter to get around a refusal.

**Scope:** local Windows x64 VS Code. Other terminal applications, remote/WSL/container environments, and arbitrary extensions that launch Git independently are not covered by a successful terminal test.

**Implementation status:** this document adds instructions, not a new installer switch. The current absent-only bootstrap cannot install alongside an existing system Git. Section 2 distinguishes an existing approved copy from the additional reviewed worker change required when that copy is missing.

## Prompt to give the agent

```text
Read and follow this complete guide:
https://github.com/bjornmv/servicenow-fluent-agent/blob/main/docs/fix-vscode-git.md

Our MinGit 2.54.0.windows.1 is approved and works; the system Git must remain
untouched. Fix Git selection inside VS Code, preserving the working now-sdk
function. Inspect first, explain the proposed changes, and ask before writing
settings or installing anything. Verify a fresh agent PowerShell terminal,
a Node child process and VS Code Source Control. Report any unverified steps.
```

If the GitHub page is truncated, read the complete raw file:

<https://raw.githubusercontent.com/bjornmv/servicenow-fluent-agent/main/docs/fix-vscode-git.md>

## 1. Inspect and propose the repair

Work as the intended user, not Administrator or SYSTEM. Confirm local Windows x64 and the actual VS Code configuration profile in use.

1. Resolve the approved executable to an absolute path using this user's `LOCALAPPDATA`. Do not select the first Git on PATH or infer that a registry entry proves usability.
2. Read command resolution without launching system Git:

   ```powershell
   Get-Command git, git.exe -All -ErrorAction SilentlyContinue |
       Select-Object CommandType, Name, Source
   ```

3. Inspect the approved directory and available setup provenance/ownership marker. An ownership marker is useful evidence, not a replacement for archive integrity or executable verification. Do not overwrite an existing unexpected, modified or unowned installation.
4. If the approved executable exists, invoke **that exact path**, not bare `git`, to check its version. Require attributable native completion and the approved `git version 2.54.0.windows.1` result. An unexpected version needs review, not an automatic upgrade/downgrade.
5. In VS Code, use **Preferences: Open User Settings (JSON)** to identify the settings file for the active configuration profile. Do not assume every user uses the default `%APPDATA%\Code\User\settings.json`; named VS Code profiles can have another user-settings file.
6. Inspect effective `terminal.integrated.profiles.windows`, default/automation profile settings, `terminal.integrated.env.windows`, and `git.path`, including workspace/profile overrides and extension environment contributions. Identify the profile providing the working `now-sdk` function, normally **PowerShell with now-sdk**. Resolve conflicts explicitly without editing repository settings. Check Settings Sync scope so this machine-specific repair is not unintentionally propagated; do not silently change Sync preferences.
7. Check for an existing `git` alias/function, profile-specific PATH overrides, or `GIT_EXEC_PATH`/Git configuration overrides that would defeat the selection. Do not dump credentials or whole environment/configuration files into chat. Preserve unexplained customization and ask about conflicts rather than removing it.

Report the selected Git path/version, actual settings file, terminal profile, whether installation is needed, and the proposed settings changes. **Ask for approval before mutations.** This guide does not authorize changing unrelated setup components or silently editing installed agent policies.

## 2. Ensure the approved per-user copy exists

### A. It already exists and runs

Use it. Do not reinstall, run the absent-only installer, or execute every other discovered Git to decide whether this one may be selected. A known blocked, unselected system copy must not veto the approved choice.

### B. It is missing

Obtain approval for a **side-by-side per-user installation**, leaving system Git and Windows PATH untouched.

The existing worker is [Ensure-MinGit254.ps1](../payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1). Its inventory probes all discovered executables: a suitable existing Git can cause a successful skip, a blocked candidate aborts, and older/conflicting installations prevent absent-only installation. **Do not rerun it expecting a different result, invent a supported flag, delete its stop checks, or use `-ReplaceFullGit`.** `-StageOnly` only downloads/verifies the archive; it is not a completed installation.

If an organization-provided deployment of the approved package is available, use that approved route. Otherwise, a coding agent may **propose a narrowly scoped opt-in coexistence adaptation of a separate working copy of the worker**. Obtain approval before writing that adaptation, then show its diff/test evidence and obtain separate execution approval. This guide cannot override conflicting higher-priority agent or execution policies; surface such a conflict for an authorized decision rather than silently changing them. Keep the original published/installed worker unchanged; do not modify its distribution checksum or claim the adapted copy has the original checksum.

That adaptation must:

- Require an explicit side-by-side selection; retain absent-only behavior by default. Record unselected system installations without executing known-blocked binaries. Do not uninstall, repair or reconfigure them.
- Deploy only to the reviewed per-user target. If the target already exists unexpectedly, stop rather than overwriting it or trying another location to escape policy.
- Retain the pinned official archive and checksum, selective extraction, ownership safeguards, single-worker lock, non-elevated context, busy-process checks, native completion evidence, and Defender/AppLocker/Code Integrity checks. Unreadable security evidence is not permission to skip those checks.
- Preserve staged and final-path verification, Windows OpenSSH and Schannel with certificate verification enabled. Configure only the new distribution's own Git settings, never the user's shared Git configuration.
- Omit Windows PATH registration/environment publishing **only in the new explicit VS Code-only mode**. Selection is configured in section 3, not through registry PATH edits.
- Have review/test evidence for the new branch, including coexistence with a blocked unselected system Git, an occupied target, and a denied selected executable. Do not present mocked checks as corporate-machine acceptance.

Use only this package; no full Git installer, package-manager "latest" fallback or unfiltered extraction:

```text
Version: 2.54.0.windows.1
Archive: MinGit-2.54.0-64-bit.zip
URL: https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/MinGit-2.54.0-64-bit.zip
SHA-256: 04F937E1F0918B17B9BE6F2294CB2BB66E96E1D9832D1C298E2DE088A1D0E668
Extraction: Windows System32\tar.exe
Exclude BEFORE extraction: usr/bin/find.exe and usr/bin/sort.exe
```

**This is an additional engineering/approval step, not a ready-made command in this guide.** If the agent cannot safely review and validate the adaptation, report **Action needed: approved side-by-side deployment support**, and stop. Do not improvise a second installer or hand-extract the archive around the worker's safeguards.

After deployment, independently verify the final executable/version and relevant security results before continuing. A ZIP in a cache or a successful staging result is not an installed Git.

## 3. Make the scoped VS Code settings changes

Back up the actual user-settings file to a new timestamped file. Save the original values of the affected keys for rollback. Preserve JSONC comments, unrelated settings and existing environment mappings; do not round-trip the whole file through a JSON-only serializer. Refuse to overwrite concurrent user edits.

### A. Add the Git function beside the existing SDK function

Keep the current terminal executable and `now-sdk` startup definition unchanged. In the setup-created profile, append the following PowerShell source to the **existing `-Command` string**, with a separating newline:

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

This is **PowerShell source for the profile's command string**, not a replacement for the complete `args` array or `settings.json`. Serialize/escape it correctly as a JSON string. Keep native stdout/stderr and nonzero `$LASTEXITCODE`; do not add inline `exit`, a shell trampoline or a system-Git fallback. **Capture and check `$LASTEXITCODE` immediately after each call.** A function is not a transparent substitute for native `$?` or PowerShell 7 `&&`/`||` success semantics. For scripts requiring those semantics, invoke the verified executable directly. Windows PowerShell 5.1's native argument-marshalling limitations remain: test actual invocations containing empty arguments or embedded quotes rather than assuming `@args` fixes them.

Make the insertion idempotent: update one known, unchanged owned block rather than appending duplicates. A modified existing block needs review. Do not reuse the historical `sn-fluent-agent:git-path` markers, which older setup versions treat as legacy cleanup targets.

If the existing profile uses a custom startup file/command layout that cannot safely accept this addition, explain the conflict and ask before adapting it. Do not replace the working SDK initialization with a guessed template. An existing PowerShell alias named `git` takes precedence over a function; resolve that conflict explicitly, not by silently deleting user customizations.

Select this profile as the default for the intended agent terminals with approval. Do not claim that this installs the function into every other custom/extension-created PowerShell profile.

### B. Select the same Git for native terminal and Node calls

A function alone does not affect Node's `execFile('git', ...)`. Configure **VS Code's** `terminal.integrated.env.windows` to put the approved `cmd` directory first in the effective terminal PATH. This remains inside VS Code; it does not write Windows User/Machine PATH.

For an otherwise uncustomized terminal environment, the relevant setting is:

```jsonc
"terminal.integrated.env.windows": {
    "Path": "${env:LOCALAPPDATA}\\Programs\\Git\\cmd;${env:Path}"
}
```

Merge this into the actual file; do not replace the whole settings object. If there is already a PATH expression, preserve its existing tail/customizations and prepend the approved directory once. Preserve one case-insensitive PATH key rather than creating both `PATH` and `Path`. Review profile-specific overrides that could replace this value. Do not remove unrelated directories or Git's required helpers.

### C. Select it for VS Code Source Control

Set user-level `git.path` to the **resolved absolute executable**, for example:

```jsonc
"git.path": "C:\\Users\\<actual-user>\\AppData\\Local\\Programs\\Git\\cmd\\git.exe"
```

Replace the illustration with the verified real path. Do not assume `${env:...}` expands in `git.path`, and do not put this machine-specific choice in the application's repository settings.

Do not run the distribution's `configure-git` command as a shortcut for this repair: its current purpose includes Windows User PATH/environment registration, which is outside this VS Code-only change.

## 4. Verify from the actual fresh agent terminal

Save settings. Ask the user to preserve their work and open **Terminal -> New Terminal**, selecting the repaired profile. Existing terminals do not retroactively acquire the new function or environment. Restart VS Code when its Git extension/environment needs a refresh. Never kill a busy terminal; use supported host controls for a known-idle agent terminal or ask the user to replace it.

Verify these independently:

1. **PowerShell function:** `Get-Command git` reports `Function`, with the reviewed resolver. Run `git --version`; require the approved version and native exit 0. Check argument forwarding and nonzero native exit propagation rather than swallowing failures.
2. **Native terminal selection:** `Get-Command git.exe -CommandType Application` resolves to the approved absolute executable, not system Git.
3. **Node child selection:** from the same fresh terminal, verify bare Git's executable-helper path as well as its version. Version alone cannot distinguish two installations of the same release. `--exec-path` identifies the helper directory, not conclusively the launched executable; native lookup can consider locations before PATH. Controlled setup/update helpers should use the verified absolute executable where supported. After resolving any `GIT_EXEC_PATH` override, this check supplies additional evidence about native calls from the terminal:

   ```powershell
   node.exe -e "const cp=require('node:child_process'); const p=require('node:path'); const expected=p.win32.join(process.env.LOCALAPPDATA,'Programs','Git','mingw64','libexec','git-core'); const actual=cp.execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(); if(p.win32.normalize(actual).toLowerCase()!==p.win32.normalize(expected).toLowerCase()) throw new Error('Node selected an unexpected Git helper path'); console.log(cp.execFileSync('git',['--version'],{encoding:'utf8'}).trim()); console.log('Node Git helper path: '+actual);"
   if ($LASTEXITCODE -ne 0) { throw 'Node Git selection check failed; stop.' }
   ```

4. **Local Git behavior:** use a new isolated temporary directory for `git init` and `git status`, handling paths with spaces. Review inherited Git overrides first; use an explicitly empty template directory and command-scoped hook/fsmonitor suppression so the test does not run user-configured helpers. Do not change global configuration. Never initialize over the user's actual project, change its remotes, commit, push or discard work as a test. Remove only the disposable test directory after verifying ownership and completion.
5. **VS Code Source Control:** use **Git: Show Git Output** and verify the selected executable/version. Do not enable automatic fetch or alter repository configuration to make this check pass.
6. **SDK regression:** `Get-Command now-sdk` still reports the intended function, and its existing version command works from the intended project/terminal. Do not install, authenticate, build or deploy an application to test this repair.
7. **Agent execution:** confirm the agent's own next terminal operation uses the verified fresh environment. A manually opened terminal passing does not prove an extension reused the same profile/environment. If the host cannot select a fresh agent terminal, report that acceptance as unverified and ask for the supported user action.

For an approved public network smoke test, this disables Git credential helpers and keeps certificate checking enabled. Existing URL rewrites, extra authorization headers and proxy configuration still apply; review relevant overrides without exposing secrets. Do not describe this as guaranteed unauthenticated merely because credential helpers are disabled:

```powershell
git -c credential.helper= -c http.sslBackend=schannel -c http.sslVerify=true ls-remote https://github.com/bjornmv/servicenow-fluent-agent.git HEAD
if ($LASTEXITCODE -ne 0) { throw 'Public HTTPS Git check failed; inspect the error, do not change policy or reinstall.' }
```

Network/proxy failures are separate from executable selection. Public HTTPS success does not establish private repository authentication, SSH, signing, LFS or arbitrary hooks. A blocked helper or DLL still requires diagnosis; do not route around it or modify security controls.

Capture actual output and native exit codes. A blank tool result, accepted settings file, existing package directory or successful `git --version` alone is **not** full acceptance. Recover the original operation before retrying an uncertain installation.

## 5. Finish, resume carefully and retain rollback

Report:

- **Complete:** approved executable/version, changed settings file/keys, backup path, and each passing verification above.
- **Action needed:** any missing approved installation, settings conflict, denied executable/helper, or host action required.
- **Could not verify:** fresh agent-terminal, Source Control or network behavior that was not actually exercised; preserve **UNKNOWN** for missing native completion.

State explicitly that system Git, Windows User/Machine PATH, existing `now-sdk`, credentials and repositories were preserved. If any of those assertions cannot be established, say so. Stop after this repair; do not automatically restart the full installer or publish local changes.

For later setup/update operations, retain the approved absolute Git selection or run from the verified terminal environment. Do not send the repaired machine back through the old probe-every-installation branch. Current distribution setup/configuration may also register Windows User PATH, and older terminal cleanup may remove a Git-specific override; inspect that behavior before rerunning it. Do not silently edit managed installer/agent files to make the repair survive an update.

For rollback, restore only the owned changes to the affected settings keys, using the backup if no intervening edits occurred. Do not overwrite later user changes, uninstall system Git, or delete a per-user Git now shared by other work. Removing a newly installed per-user copy is a separate approved action.

## References

- [VS Code terminal profiles and environment settings](https://code.visualstudio.com/docs/terminal/profiles)
- [VS Code Git selection and Git Output](https://code.visualstudio.com/docs/sourcecontrol/troubleshooting)
- [PowerShell command precedence](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_command_precedence)
- [Existing bootstrap skill and safety boundaries](../payload/.agents/skills/win-git-bootstrap/SKILL.md)
- [Current terminal settings implementation](../lib/vscode-terminal.cjs)
- [Technical guide](technical-guide.md)
