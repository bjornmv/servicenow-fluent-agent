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

## Still not certified

The selective copy was staged, not promoted over the existing full Git. End-to-end missing-install final promotion/PATH registration and full-Git migration were not tested by uninstalling Git again. Older-version upgrade, interrupted deployment, private HTTPS/SSH authentication, Credential Manager, signing, custom hooks and all advanced Git commands are not certified.

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
