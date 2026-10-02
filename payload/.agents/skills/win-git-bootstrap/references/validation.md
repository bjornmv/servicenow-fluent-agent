# Validation and security history

## Why this method

On the managed Windows test workstation, native Git 2.54.0.windows.1 and Windows OpenSSH ran, and Git HTTPS worked through Schannel. The full Git installer nevertheless returned 0 after AppLocker blocked its post-install batch script. Defender ASR also blocked an installer temporary payload whose final filename was not identified.

The official MinGit ZIP omits that batch workflow, standalone curl and Git LFS, but still contains Unix utilities. An unfiltered staging attempt produced Defender ASR rule `c0033c00-d16d-4114-a5a0-dc9b3a7d2ceb` events for `usr/bin/find.exe` and `usr/bin/sort.exe`. Its security check stopped before removing the existing full Git.

The user approved omitting those two optional files before extraction. Windows tar supports this without disabling security controls or executing/renaming the blocked utilities.

## Tested on 2026-10-02

Selective staging at 21:11:16-21:11:23 local time succeeded:

- The pinned ZIP SHA-256 matched.
- Windows tar honored both exclusions in its listing and extraction.
- Neither excluded executable existed in the new stage.
- Native Git reported exactly `2.54.0.windows.1`.
- Windows OpenSSH startup, staged Schannel configuration, init and status passed.
- Installed Git, registry and PATH remained unchanged.

Independent tests against the staged native Git passed:

- init, add, commit;
- branch/checkout and fast-forward merge;
- local bare remote, local push, clone and fetch;
- clean working-tree status;
- public GitHub HTTPS `ls-remote` with certificate verification enabled and credential helpers disabled.

Tests used isolated temporary repositories, empty user configuration, disabled hooks and signing, and no private credentials. Test repositories were removed afterward.

The checked event window through 21:13:06 had no new Defender ASR, executable AppLocker or Code Integrity blocks. PowerShell constrained-language script-policy records remained; no blanket promise of notification-free execution or IT approval follows from this test.

## Fresh-install attempt and SSH regression fix

After the user authorized uninstalling Git for a fresh setup test, the VS Code session at 22:37 on 2026-10-02 stopped before download/extraction. The script hash and absent-only checks passed. Its caller combined `$ErrorActionPreference = 'Stop'` with `2>&1` around child Windows PowerShell 5.1; the inherited, normal `ssh -V` stderr banner became a terminating `NativeCommandError`. A direct Windows OpenSSH version probe returned exit 0. The main bootstrap log ended after the absent-only message, without a worker failure record.

The worker now redirects both SSH streams to unique per-run probe logs, checks for an explicit zero exit code, and writes the version/success to the main log. Launch errors and missing/nonzero exit codes remain fatal; no security checks or policies were relaxed.

`node --test tools/test/mingit-ssh-probe.test.cjs` passed all eight tests on this managed Windows workstation: the legacy inherited-stream failure was reproduced, the canonical fixed probe succeeded through the same strict PS 5.1 wrapper, both output files were checked, and mocked launch/nonzero/missing-exit/missing-process plus missing-executable failures remained fatal. The tests extract only the probe function, never run the bootstrap entry point, and do not install Git or change registry/PATH. Runtime cases are Windows-only and skip on other platforms; static packaging checks still run there. This is probe regression evidence, not a new deployment or policy approval. AppLocker script-policy records may still occur.

## Successful fresh installation and terminal PATH follow-up

The subsequent user-run bootstrap at 23:03 on 2026-10-02 completed fresh-install promotion into `%LOCALAPPDATA%\Programs\Git` and user PATH registration. The retained ZIP was hash-verified; this was not a fresh-download test. The worker logged successful SSH/init/status/security-log checks and `SUCCESS`. Independent reads verified the installed version, Schannel, certificate verification, Windows SSH configuration and absence of both excluded utilities.

However, bare `git` and `git.exe` could not resolve in the user's fresh VS Code terminal. Adding the managed cmd directory to that terminal's process PATH immediately resolved Git at version 2.54.0.windows.1. Registry registration and an absolute-path probe therefore did not establish working terminal command resolution.

Agent installer 0.3.1 now sets the verified Git directory explicitly in the configured VS Code profile's environment, preserving the remainder of PATH and JSONC settings. A regression launches PowerShell with a deliberately stale PATH, confirms bare Git is initially missing, then applies the profile environment and verifies the selected executable and version. This is a simulated fresh-shell test, not an actual VS Code terminal acceptance test. The setup guide now requires that real new-terminal check before claiming completion. Existing terminals and unrelated external terminal applications are outside the profile fix.

## Still not certified

Fresh MinGit promotion and registry PATH registration succeeded as described above. Full-Git migration and actual VS Code new-terminal acceptance of the automatic profile fix remain unverified. Older-version upgrade, interrupted deployment, private HTTPS/SSH authentication, Credential Manager, signing, custom hooks and all advanced Git commands are not certified.

The Agent-setup integration adds `-InstallIfMissing` so routine setup cannot migrate/repair an existing installation. On 2026-10-02 the stable profile copy ran in this mode, detected existing 2.54.0.windows.1, and returned 0 without download/install/configuration changes. A fresh agent instruction check recognized the skill route and absent-only/policy-block rules. The three bundled skill files were hash-matched between source payload and the live profile, and repository diff whitespace checks passed. Do not label these integration/no-op checks as fresh-install tests.

## Safe failure handling

- Preserve a blocked/corrupt result and report it. Do not rerun through another interpreter or rename executables to change policy matching.
- A failed hash check must not be bypassed. An administrator/user may investigate and remove only the rejected cached ZIP before another verified download.
- If log access is denied, request appropriate administrative review rather than weakening the security gate.
- A hard interruption can leave a deployment lock and staging files. Confirm there is no active worker before clearing a stale lock. Never remove unrelated directories.
- Shell scripts relying on omitted find/sort require a separate supported design; Windows commands with those names are not drop-in replacements.

References:

- https://github.com/git-for-windows/git/releases/tag/v2.54.0.windows.1
- https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference
- https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/script-rules-in-applocker
