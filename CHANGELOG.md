# Changelog

## 0.3.1

- Automatically configure the Windows VS Code terminal profile with the verified Git directory ahead of inherited PATH, including when the parent process has a stale environment.
- Preserve JSONC comments, unrelated profiles, custom arguments and environment settings; back up edits and stop on ambiguous/disabled PATH customizations.
- Add `configure-terminal` for settings-only repair and `--git-exe` to retain the prerequisite's verified executable.
- Require bare Git resolution in a real new configured terminal before reporting setup complete; add stale-PATH regression tests.

## 0.3.0

- Add a quiet, state-backed update advisor for the agent, active project's now-sdk dependency, and contextually requested ServiceNowDocs checkout.
- Add seven-day reminders and release-specific skips, with no update output until a real action is available.
- Add a VS Code task and documented three-choice update workflow.

## 0.2.0

- Refresh the packaged ServiceNow Fluent agent, instructions, references, tools, and skills from the current maintained setup.
- Add GraphQL API, playbook, ATF, CI/CD, documentation lookup, Lux/AIUX, React UI, and Vite UI Page workflows.
- Add SDK command policy guidance and expanded REST helper validation tooling.

## 0.1.1

- Add VS Code process tasks for install/update, verify, and dry-run install.
- Document VS Code Git clone and pull workflow.

## 0.1.0

- Initial ServiceNow Fluent agent distribution package.
- Includes VS Code custom agent, instruction files, ServiceNow skills, reference files, and helper tools.
- Adds a dependency-free Node installer for locked-down Windows machines.
