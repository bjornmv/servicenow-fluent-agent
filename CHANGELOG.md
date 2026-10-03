# Changelog

## 0.3.3

- Standardize Windows docs and index defaults on `%LOCALAPPDATA%\SNDocs\repo` and `%LOCALAPPDATA%\SNDocs\index`, retaining explicit-path and environment overrides.
- Share path resolution across build/search/read/benchmark commands; add a read-only `paths` command, with no legacy fallback or automatic migration.
- Update full setup to clone into the exact docs destination and build/verify the index separately; guard index rebuilds against source or unrecognized directories.
- Test with isolated tiny fixtures only; do not populate the new real-machine docs location during this change.

## 0.3.2

- Replace shell-specific Git PATH workarounds with Windows user PATH registration and native environment propagation, preserving raw values/types and never passing PATH through setx.
- Add explicit environment-only `configure-git` / `-RefreshEnvironment` modes; no Git/payload reinstall, elevation, machine PATH or policy changes.
- Back up settings and remove known legacy Git profile overrides/startup blocks without replacing unrelated customization.
- Test long PATHs, expandable references, duplicates, concurrency and notification failures; distinguish native-update success from real terminal acceptance.

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
