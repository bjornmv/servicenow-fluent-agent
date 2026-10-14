# cicd options and ATF follow-up

Read when a command needs options beyond the SKILL.md examples, or after a timeout, `--wait=false` or a failed ATF run.

## ATF

- `testsuite run` also takes `--browser-name`, `--browser-version`, `--os-name`, `--os-version` and `--is-performance-run`; `test run` takes `--capture-node-logs`.
- Use `--poll-timeout <ms>` deliberately. After a timeout or `--wait=false`, re-attach with `testsuite watch` / `test watch` and `--progress-id`.
- `testsuite result` / `test result` take `--result-id` and only fetch the record: they exit 0 for a failed run too, so read the returned status.
- `test logs --result-id <sys_atf_test_result sys_id> [--pattern <regex>] [--limit <n>]` (present in 4.13.6, absent in older SDKs; confirm `now-sdk cicd test --help` lists `logs`) returns a single test result's log lines, 100 by default, pattern matched case-insensitively. There is no suite equivalent.
- After a failed run the envelope has no summary; take the result id from the `Details:` link or find the record with **sn-rest**.

## Promotion

- `--scope <scope>` can replace `--app-sys-id` (mutually exclusive).
- For app customizations `install` also takes `--base-app-version` and `--auto-upgrade-base-app`; read `now-sdk cicd install --help` before using them.
