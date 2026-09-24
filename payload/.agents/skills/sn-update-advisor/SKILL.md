---
name: sn-update-advisor
description: Quietly detect and apply approved ServiceNow Fluent Agent, project now-sdk, and contextual ServiceNowDocs updates with a 48-hour check gate and non-spamming reminder state.
---

# Quiet Update Advisor

Use this skill when the installed advisor reports an update, when the user asks to check updates, or after the user selects **Update**, **Remind me in 7 days**, or **Skip this release**. Do not use it to probe for updates during unrelated work.

## Check Contract

The installed launcher is:

```powershell
$Advisor = Join-Path $env:USERPROFILE '.agents\tools\sn-update-advisor.cjs'
node "$Advisor" check --project "<project-root>"
```

- It is silent unless a non-snoozed, non-skipped update is actionable.
- It checks each component no more often than every 48 hours unless `--force` is supplied for an explicit manual check.
- Add `--docs "<docs-checkout>"` only for ServiceNowDocs work. Use `--docs-branch "<release-branch>"` only when the checkout branch must be explicit.
- It performs only local timestamp reads until due; due checks use read-only remote Git references or an npm registry metadata request.
- Never report an empty result or a check error to the user. The state file contains no credentials, aliases, or instance details.

If JSON reports updates, present exactly these choices: **Update**, **Remind me in 7 days**, **Skip this release**. Include the displayed component labels and exact current/available revisions or versions in the question.

Record every choice using every returned component key:

```powershell
node "$Advisor" decision remind --component "<component-key>"
node "$Advisor" decision skip --component "<component-key>"
node "$Advisor" decision update --component "<component-key>"
```

Do not offer a fourth option or re-prompt in the same session.

## Update Workflow

An **Update** response authorizes only the versions and revisions shown by the advisor. Stop on a dirty checkout, non-fast-forward pull, package-manager failure, lifecycle-script concern, install conflict, or failed verification. Do not use `--force`, `--reinstall`, destructive Git commands, broad dependency upgrades, or instance deployment.

### Agent Package

1. Read `%USERPROFILE%\.agents\.servicenow-fluent-agent-install.json` and use its `repoRoot`.
2. Confirm that repository is clean with `git status --short`.
3. Run `git pull --ff-only`.
4. Run `node bin/sn-fluent-agent.cjs install` without `--force`.
5. Run `node bin/sn-fluent-agent.cjs verify` and ask the user to reload VS Code.

### now-sdk

1. Confirm the active project still declares the displayed `@servicenow/sdk` version and inspect its lockfile and package-manager configuration.
2. Update only `@servicenow/sdk` to the exact offered version using the established project package manager; retain its lockfile and do not update other dependencies.
3. Review lifecycle scripts before allowing them to run. Follow the locked-Windows SDK command policy.
4. Run the narrow project build or typecheck. Do not run `now-sdk install` against an instance.

### ServiceNowDocs

1. Confirm the displayed checkout and release branch are clean.
2. Run `git pull --ff-only` for that checkout.
3. Rebuild the markdown index into a temporary sibling directory, run its lookup benchmark, then replace the active index only after a successful validation.
4. Record the source commit and indexed commit in the advisor state. Do not add the corpus or generated index to the agent distribution repository.

## State Rules

- **Remind me in 7 days** suppresses notices and remote checks for seven days, even if the remote advances in that window.
- **Skip this release** suppresses only the displayed version or revision. A later release is eligible after the normal check gate.
- The state file is `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json`.
- Do not delete, edit, or reset the state file unless the user specifically asks.