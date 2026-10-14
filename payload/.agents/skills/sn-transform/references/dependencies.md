# `now-sdk dependencies` — types for other scopes

Read when this app must reference records it does not own (an OOB Action, Trigger, ACL, role or table) instead of adopting them with `transform`, or must refresh its other-scope or platform type definitions.

`dependencies` pulls **types and metadata for OTHER scopes** so this app can reference them at build time; it does NOT copy the foreign records into your source.

- `now-sdk dependencies --auth <alias>` — re-downloads everything listed under `dependencies` in `now.config.json` plus the platform `glide.*.d.ts` typings.
- `now-sdk dependencies --auth <alias> --type-defs-only` — just the platform `.d.ts` files; useful after an SDK upgrade.
- `now-sdk dependencies --auth <alias> --fluent-only` — just the Fluent types for already-declared dependencies, no script `.d.ts`.
- `now-sdk dependencies --auth <alias> --add <table-or-alias> --scope <scope> <sys_id...>` — registers a new dependency (e.g. `--add automation.actions --scope global <sys_id>`) and updates `now.config.json`. The only aliases are `tables`, `roles`, `automation.actions`, `automation.triggers` and `automation.subflows`; anything else is taken as a literal table name, including the `actions, triggers` wording in `dependencies --help`.

Return to [sn-transform](../SKILL.md).
