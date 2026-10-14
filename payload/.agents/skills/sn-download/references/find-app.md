# Finding the app without a filter

Read when the user gave no name or scope, or the app is not found in `sys_app`.

- No filter: page the [step-1 sn-rest read](../SKILL.md#1-resolve-the-apps-sys_id) with `sysparm_query=ORDERBYname%5EORDERBYsys_id&sysparm_limit=20`, continuing with `sysparm_offset=<nextOffset>` while `hasMore` is true. Show a numbered `name — scope — version` list; capture the chosen `sys_id` and `scope`.
- `sys_app` holds custom apps built on, or installed with the SDK onto, this instance. If the app is not there, look it up in `sys_scope` by scope and tell the user that adopting a Store-installed app with `init --from` is unverified.

Return to [sn-download](../SKILL.md).
