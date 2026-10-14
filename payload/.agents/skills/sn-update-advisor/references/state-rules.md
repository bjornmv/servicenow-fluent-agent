# Advisor state rules: when notices appear

State file: `%USERPROFILE%\.agents\.servicenow-fluent-agent-update.json`.

- **Remind me in 7 days** suppresses notices and unforced remote checks for seven days, even if the remote advances. A `--force` check still contacts the remote; its notice stays withheld.
- **Skip this release** suppresses only the displayed version/revision. A later release becomes eligible once the 48-hour check gate has elapsed **and** seven days have passed since the last notice shown for that component.
- Every shown notice, whatever the answer (including **Update** and no answer), withholds further notices for that component for seven days, also under `--force`.
- Each check that contacts the remote rewrites `lastCheckedAt`, so repeated `--force` checks postpone the next natural one.
- A failed check clears the recorded `available` release and is not retried unforced for 48 hours.
- A component checked less than 48 hours ago, or snoozed, is not contacted by an unforced check.
