# SDK and package-manager command policy

Canonical launcher guidance for the ServiceNow agent, instructions and skills. Other files show short `now-sdk` examples and link here; do not duplicate resolver scripts. This policy changes command transport, not authorization or the workflow's build/install/verification gates.

## VS Code launcher

- **VS Code PowerShell:** use the configured `now-sdk` function directly from the intended project directory. The `PowerShell with now-sdk` terminal profile defines it; it invokes Node with the project-local SDK first, then the installed global SDK. A function is not the blocked batch shim. Do not prepend a resolver to each command.
- **Other terminals / function unavailable:** use the bounded fallback below only if permitted. Never interpret an explicit policy denial as permission to switch executables, shells or tools.

Authentication/confirmation belongs in the interactive parent; a headless child cannot approve mutations. Never expose OAuth tokens or inspect credential storage.

Print shell commands before execution. Use the confirmed project directory (project `cwd`) so local SDK precedence remains correct. Resolve placeholders before running examples. Do not switch projects, SDK versions, auth aliases or package managers merely to make a command succeed.

## Normal VS Code commands

```powershell
now-sdk explain table-api --format raw
now-sdk build
```

Run only the command needed for the task, not this block as a startup checklist. If the user asks to run `now-sdk` itself, run exactly `now-sdk`; help output with a missing-subcommand exit does not mean the executable is unavailable. A single bounded command check needs no subagent, authentication probe, recursive file search or package installation.

For a running terminal, wait or retrieve its output; do not send probe commands to a busy terminal. A shell/terminal-integration error makes the SDK result inconclusive. Keep command execution, SDK success, authentication and deployment verification separate. For mutations, capture output and exit status and retain all existing confirmation gates. Do not retry a possibly applied install merely because its status check failed.

## Fallback: missing function, not policy bypass

1. Prefer opening the configured **PowerShell with now-sdk** terminal if the current terminal lacks the function. Do not modify profiles/settings automatically.
2. If that profile is unavailable on this machine, inspect only the expected project-local `node_modules/@servicenow/sdk/bin/index.js`, then the installed global SDK location (commonly `%APPDATA%/npm/node_modules/@servicenow/sdk/bin/index.js`). Confirm the chosen file and SDK package metadata. Do not search the whole profile or reinstall the SDK just to resolve its launcher.
3. Only when direct Node execution is permitted, print and run `node "<resolved-sdk-cli>" <command>`. Keep the confirmed path with that command; do not depend on a variable assigned in a previous terminal call. An existing but broken/incompatible project SDK is a diagnostic finding, not permission to silently substitute the global version.
4. If no allowed entry point exists, stop and ask for an approved toolchain. Never use CMD, batch shims, execution-policy overrides, credential extraction, or an alternate tool to bypass a refusal.

Distribution installers should verify/provision the terminal profile with user approval or report it missing. They must not claim the function is available merely because the instruction files were copied. This document does not install a profile.

## Package managers

- Respect `packageManager` and the existing lockfile. Use a working, permitted launcher for that manager; do not change managers or regenerate a different lockfile to evade a blocked launcher.
- For npm/npx on locked Windows, invoke their JavaScript CLI with Node, not `npm.cmd` / `npx.cmd`. Confirm the real path once; a common layout is `<node-directory>/node_modules/npm/bin/npm-cli.js` (or `npx-cli.js`). Do not assume every machine uses the same Node installation path. A permitted existing pnpm launcher is appropriate for a pnpm project.
- The npm examples below contain a **resolved-path placeholder**, not a command to copy literally:

```powershell
node "<resolved-npm-cli.js>" ci
node "<resolved-npm-cli.js>" install
```

Choose `ci` when the project has a valid npm lockfile; use `install` when appropriate to the authorized task. Do not run both. Invoke the resolved package-manager JavaScript entry with direct Node execution from the confirmed project directory; SDK commands use the configured `now-sdk` function.

Dependency installation/upgrades, global tool changes, lifecycle scripts and network access retain their normal approval requirements. Follow stronger skill-specific restrictions such as initial `--ignore-scripts` for Lux. Never use `audit fix --force` or upgrade to `latest` as a generic launcher repair.

## Execution evidence and recovery

- Require the actual command, project directory, attributable stdout/stderr and native exit status before claiming completion.
- Treat generic tool status `ok`, a synchronous tool return and “Command produced no output” as insufficient evidence of native success.
- Treat missing exit evidence, unrelated/delayed output, launcher errors and failed directory selection as UNKNOWN rather than success or an empty result.
- Stop sending commands into a suspect terminal, because another command can obscure the original operation's result.
- Recover the ORIGINAL run's logs/result through read-only file or execution-handle tools before deciding whether another operation is safe.
- Keep UNKNOWN and report the gap when attributable evidence is unavailable rather than queueing a build or retrying a mutation.
- Preserve the actual excerpts, stdout/stderr, exit/error evidence and saved-output paths when delegating an investigation.
- Bind a mutation's working directory in the approved execution mechanism rather than delegation prose or a fallible `Set-Location ...; command` chain.
- Preserve busy or user-owned terminals during recovery because closing them may lose work or interrupt an operation.

## SDK query output

- Confirm the installed SDK's query help before using version-specific flags.
- Specify fields, an encoded query and a bounded limit when reading table data, normally with `--no-count` to avoid unnecessary total-count work.
- `--select` selects the output envelope, not the table fields, so it does not replace a narrow field projection.
- Use the `sn-rest` skill for the bundled REST helper's distinct CLI syntax rather than transferring SDK flags to it.

## Record reassignment

- `now-sdk move --ids` changes instance record membership between applications; it is not a local filesystem move.
- Confirm the record IDs, source application, destination application and target instance before requesting approval.
- Obtain explicit approval for that reassignment before execution, because it changes ownership beyond ordinary source authoring.
- Consult the installed SDK's command help for the exact arguments before running the approved move.
- Verify resulting membership with the `sn-rest` skill rather than inferring it from a successful launcher return.

## Version awareness

Use the actual project SDK's docs and engine requirements. An older SDK's minimum Node version is not necessarily sufficient for the current SDK or Lux dependencies. Check versions when relevant to setup or a compatibility failure, not on every command. An upgrade requires explicit scope/version approval; a global SDK upgrade does not update a project pin. Ordinary SDK upgrades do not automatically require reauthentication; use the connection-evidence rules and `sn-auth` for a demonstrated auth issue.

## Offline guidance checks

From the distribution repository root, run `node --test tools/test/sdk-guidance/sdk-command-guidance.test.cjs` to check launcher consistency, links and retained safety gates. These are documentation checks, not proof that a particular VS Code terminal or instance works.
