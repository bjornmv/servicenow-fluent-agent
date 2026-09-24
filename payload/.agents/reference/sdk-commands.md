# SDK and package-manager command policy

Canonical launcher guidance for the ServiceNow agent, instructions and skills. Other files show short `now-sdk` examples and link here; do not duplicate resolver scripts. This policy changes command transport, not authorization or the workflow's build/install/verification gates.

## Choose the host once

- **VS Code PowerShell:** use the configured `now-sdk` function directly from the intended project directory. The `PowerShell with now-sdk` terminal profile defines it; it invokes Node with the project-local SDK first, then the installed global SDK. A function is not the blocked batch shim. Do not prepend a resolver to each command.
- **Pi:** use the `now_sdk` tool for every SDK command, with an argument array and the project `cwd`. For example, `now-sdk explain table-api --format raw` means `now_sdk({args:["explain","table-api","--format","raw"],cwd:"<project-root>"})`. Do not launch PowerShell or call the SDK with a generic process tool. Authentication/confirmation belongs in the interactive parent; a headless child cannot approve mutations.
- **Other terminals / function unavailable:** use the bounded fallback below only if permitted. Never interpret an explicit policy denial as permission to switch executables, shells or tools.

Print shell commands before execution. Use the actual project directory so local SDK precedence remains correct. Resolve placeholders before running examples. Do not switch projects, SDK versions, auth aliases or package managers merely to make a command succeed.

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

Choose `ci` when the project has a valid npm lockfile; use `install` when appropriate to the authorized task. Do not run both. In Pi, run package-manager JavaScript entries through `win_process` with `program: "node"` and an argument array; SDK commands still use `now_sdk`.

Dependency installation/upgrades, global tool changes, lifecycle scripts and network access retain their normal approval requirements. Follow stronger skill-specific restrictions such as initial `--ignore-scripts` for Lux. Never use `audit fix --force` or upgrade to `latest` as a generic launcher repair.

## Version awareness

Use the actual project SDK's docs and engine requirements. SDK 4.11's Node >=20.18.0 baseline is not sufficient for every later SDK or Lux dependency. Check versions when relevant to setup or a compatibility failure, not on every command. An upgrade requires explicit scope/version approval; a global SDK upgrade does not update a project pin. Ordinary SDK upgrades do not automatically require reauthentication; use the connection-evidence rules and `sn-auth` for a demonstrated auth issue.

## Offline guidance checks

Run `node --test <agents-root>/tools/test/sdk-command-guidance.test.cjs` to check launcher consistency, links and retained safety gates. These are documentation checks, not proof that a particular VS Code terminal or instance works.
