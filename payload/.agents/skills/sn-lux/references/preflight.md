# Lux capability and toolchain preflight details

Read with section 2 of the [entry workflow](../SKILL.md).

## Prerequisites and platform

- The [Lux prerequisites](https://www.servicenow.com/docs/r/application-development/configuring-servicenow-ai-experience-lab-for-vs-code.html) page is un-versioned (its content changes as new releases are documented) and JavaScript-rendered. Recorded baseline, not a compatibility certification: on 2026-10-08 it listed ServiceNow SDK 4.12.1+, Node.js 24+, pnpm 10+, VS Code 1.97+ and Australia Patch 5+ or Zurich Patch 12+; on 2026-09-20 it listed a lower SDK minimum (4.10+).
- Check AI Experience Framework (`sn_aixf`) and Framework Builder (`sn_aiux_builder`) installation/version separately; these checks do not establish entitlement or full compatibility.
- Check the actual build (for example `glide.war`), not just the release-family label. `sys_scope` can identify framework versions when Store application inventory is ACL-restricted. AIX tables are global `sys_aix_*`; experiences/pages use `title`. Use narrow fields/limits; do not dump plugin or user tables.
- A replacement PDI is not guaranteed to receive a newer patch.

## Node and package manager

- Beyond the observed >=24.14.1 minimum (the scaffold's `package.json` declares it too), Node 24 LTS >=24.15.0 is recommended for the AIUX stack. Do not claim an untested version is validated.
- A fresh scaffold has no lockfile or `packageManager`. The official prerequisites list pnpm and the scaffold's scripts and `AGENTS.md` assume it, while the SDK's own post-`init` message allows any package manager. Use an approved pnpm launcher when one is permitted; otherwise a resolved npm JavaScript CLI invoked with Node is a workable option. See [toolchain notes](../../sn-lux-build/references/validation-and-troubleshooting.md#dependency-installation-and-windows-commands).

## Scope and route collisions

Before deployment, verify availability with bounded `sn-rest` reads:

- the scope in `sys_scope` (`scope=<validated-scope>`);
- the `aiux.json` `basename` against `sys_aix_experience.url_suffix` (the field the build writes it to). Confirm the field in `sys_dictionary` first, because an unknown field in `sysparm_query` is ignored and returns unrelated rows.

A row not owned by this project is a collision; an empty ACL-filtered result is not proof of availability.
