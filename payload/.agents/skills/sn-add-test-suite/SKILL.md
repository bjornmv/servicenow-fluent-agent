---
name: sn-add-test-suite
description: Authors Fluent ATF test suites. Use when creating or changing a suite; not running tests (sn-cicd).
argument-hint: <suite name + tests/filter + optional parent>
compatibility: ServiceNow Fluent project; project-compatible now-sdk and Node; ATF execution requires separate target authorization.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 `explain testsuite-api`, `cicd` help and local builds (emitted suite/membership XML and the error cases below); nothing was installed or run on an instance.

Author a Fluent ATF suite with `TestSuite(...)`. This API creates `sys_atf_test_suite` and membership metadata; it does not run or schedule the suite.

Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md).

## Explain first

```powershell
now-sdk explain testsuite-api --format raw
```

If creating or editing tests too, also read `test-api` and `atf-guide`. Use the target project's installed SDK output as authoritative. If explain reports `No matching topics for "testsuite-api"`, the project's SDK has no `TestSuite` API: stop and report the installed SDK version; do not author `TestSuite(...)` from this summary. An SDK update needs explicit approval ([sn-update-advisor](../sn-update-advisor/SKILL.md)).

Read `now.config.json` and the existing suite/test source before writing. To change a suite that already exists, edit its own declaration (same `$id`); if it exists only on the instance, adopt it with [sn-transform](../sn-transform/SKILL.md) first. A second `TestSuite` with a new `$id` and the same `name` builds green as a duplicate suite record.

## Authoring rules

- Import `TestSuite` from `@servicenow/sdk/core` and call `TestSuite({...})`; never use `new TestSuite()`.
- Require a stable `$id: Now.ID['...']` and `name`.
- A `tests` entry is a `Test(...)` constant or a 32-hex sys_id string; order defaults to array position. Use `{ test, abortOnFailure, order }` only when needed; cloud/parallel runners ignore `abortOnFailure`.
- A transformed test is a bare `Test(...)` statement with no binding: reference it by the sys_id in its `$id: Now.ID['<32-hex>']`.
- `Now.ID['key']` is not a reference in `tests` or `parent`: a registered key fails the build (TS2322), and an unregistered key builds green and writes the key text into the XML instead of a sys_id.
- A test may appear only once after sys_id resolution.
- A referenced parent suite must be declared first. Raw sys_id cycles beyond self-reference are not statically detected; avoid raw IDs when a typed suite reference is available.
- Prefer either explicit `tests` or `testFilter`. Combining them is allowed but risky: ATF can remove explicitly listed tests that do not match the filter when the suite is saved.
- A `Test({...}, (atf) => { ... })` callback is documented Fluent test DSL. Do not externalize it with `Now.include` merely because it is a callback.

Shape (`loginTest`, `checkoutTest` and `regressionSuite` are constants declared earlier or imported):

```typescript
import { TestSuite } from '@servicenow/sdk/core'

export const smokeSuite = TestSuite({
    $id: Now.ID['smoke_suite'],
    name: 'Smoke Suite',
    description: 'Critical regression coverage',
    tests: [{ test: loginTest, abortOnFailure: true }, checkoutTest],
    parent: regressionSuite,
})
```

When execution is authorized, run `now-sdk build`; use [sn-fix-build](../sn-fix-build/SKILL.md) for compile errors. A green build does not validate membership: raw sys_ids are not checked against existing tests, an empty `tests` array builds, and the CLI prints no hint for `tests` + `testFilter` or tied `order`. In the build output (`dist/app/update/` by default), confirm one `sys_atf_test_suite_test_*.xml` per intended test, each `<test>` a 32-hex sys_id.

A built suite exists only locally. Install with [sn-build-install](../sn-build-install/SKILL.md) when requested; `cicd testsuite run` selects a suite already on the instance by name or sys_id, so the current version must be installed there first. To execute, switch to [sn-cicd](../sn-cicd/SKILL.md) and confirm the target first—ATF execution can mutate test data. On SDK 4.13.6, `now-sdk cicd test logs --result-id <sys_atf_test_result sys_id>` reads one test result's log lines; confirm it with `now-sdk cicd test --help`. Report authoring/build separately from runtime results.
