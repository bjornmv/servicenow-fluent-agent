---
name: sn-add-test-suite
description: Authors Fluent ATF test suites. Use when creating or changing a suite; not running tests (sn-cicd).
argument-hint: <suite name + tests/filter + optional parent>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; ATF execution requires separate target authorization.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `explain testsuite-api` and local builds; nothing was installed or run on an instance.

`TestSuite(...)` creates `sys_atf_test_suite` and membership metadata; it does not run or schedule the suite. Run `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md).

## Explain first

```powershell
now-sdk explain testsuite-api --format raw
```

- Also read `test-api` and `atf-guide` when creating or editing tests.
- If explain reports `No matching topics for "testsuite-api"`, stop: report the installed SDK version and do not author `TestSuite(...)`. An SDK update needs explicit approval ([sn-update-advisor](../sn-update-advisor/SKILL.md)).
- Read `now.config.json` and existing suite/test source. Edit an existing suite in its own declaration (same `$id`); adopt an instance-only suite with [sn-transform](../sn-transform/SKILL.md) first. A second `TestSuite` with a new `$id` and the same `name` builds green as a duplicate suite record.

## Authoring rules

- Import `TestSuite` from `@servicenow/sdk/core` and call `TestSuite({...})`; never use `new TestSuite()`. Require a stable `$id: Now.ID['...']` and `name`.
- A `tests` entry is a `Test(...)` constant or a 32-hex sys_id string; order defaults to array position. Use `{ test, abortOnFailure, order }` only when needed; cloud/parallel runners ignore `abortOnFailure`.
- Never reference a test or parent by `Now.ID['key']`. Read [references/membership.md](references/membership.md) when referencing a transformed test or a raw sys_id.
- Each test appears once after sys_id resolution. Declare a referenced parent suite first.
- Prefer explicit `tests` or `testFilter`. Combining them builds but is risky: ATF can remove listed tests that do not match the filter when the suite is saved.
- A `Test({...}, (atf) => { ... })` callback is Fluent test DSL; do not move it to `Now.include` merely because it is a callback.

```typescript
import { TestSuite } from '@servicenow/sdk/core'

export const smokeSuite = TestSuite({
    $id: Now.ID['smoke_suite'],
    name: 'Smoke Suite',
    tests: [{ test: loginTest, abortOnFailure: true }, checkoutTest],
    parent: regressionSuite,
})
```

## Build and hand off

- When execution is authorized, run `now-sdk build`; compile errors go to [sn-fix-build](../sn-fix-build/SKILL.md).
- A green build does not validate membership: unknown raw sys_ids, an empty `tests` array, `tests` + `testFilter` and tied `order` all build without a hint. In `dist/app/update/` (default), confirm one `sys_atf_test_suite_test_*.xml` per intended test, each `<test>` a 32-hex sys_id.
- The built suite exists only locally; `cicd testsuite run` runs the version already on the instance, so install the current version first with [sn-build-install](../sn-build-install/SKILL.md) when requested.
- To run it, switch to [sn-cicd](../sn-cicd/SKILL.md) and confirm the target first: ATF execution can mutate test data.
- Report authoring/build separately from runtime results.
