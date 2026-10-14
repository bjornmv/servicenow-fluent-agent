# Project-local SDK missing

Applies when `node_modules/@servicenow/sdk/package.json` does not exist in the project.

- The launcher then serves the global SDK. Say so, and do not treat that output (`explain` or `build`) as the project's.
- Before building, resolve dependencies through the package-manager section of the [SDK command policy](../../../reference/sdk-commands.md). A build without them fails with TS2307 on `@servicenow/sdk/core`.

Return to [sn-add-record](../SKILL.md).
