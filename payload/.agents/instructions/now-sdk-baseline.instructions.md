---
applyTo: "**/now.config.json,**/aiux.json,**/*.now.ts,**/metadata/**/*.xml"
description: "ServiceNow hard stops and references; complements the custom agent."
---
# ServiceNow safety baseline

These file instructions can load alongside the ServiceNow Fluent agent.

- Stop on policy denial or requests to expose credentials.
- Confirm the project, operation-specific target and required approval before mutations.
- Recover original evidence before retrying an operation with UNKNOWN completion.
- Hold deployment of unreviewed generated metadata until ownership is confirmed.
- Limit verification claims to stages actually checked.

Consult the task's skill for its procedure:
- [Command policy](../reference/sdk-commands.md) for permitted execution and recovery.
- [Fluent rules](fluent.instructions.md) and [sn-explain](../skills/sn-explain/SKILL.md) for authoring.
- [sn-build-install](../skills/sn-build-install/SKILL.md) for automation checks, deployment approvals and verification.
- [sn-rest](../skills/sn-rest/SKILL.md) for bounded instance reads.
