---
name: sn-add-test-suite
description: Author an ATF TestSuite in Fluent using now-sdk 4.11, with ordered membership, nesting, and safe separation between authoring and execution.
argument-hint: <suite name + tests/filter + optional parent>
---
Author a Fluent ATF suite with `TestSuite(...)`. This API creates `sys_atf_test_suite` and membership metadata; it does not run or schedule the suite.

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

## Explain first

```powershell
now-sdk explain testsuite-api --format raw
```

If creating or editing tests too, also read `test-api`. Use the installed now-sdk 4.11+ output as authoritative.

## Authoring rules

- Import `TestSuite` from `@servicenow/sdk/core` and call `TestSuite({...})`; never use `new TestSuite()`.
- Require a stable `$id: Now.ID['...']` and `name`.
- `tests` order defaults to array position. Use `{ test, abortOnFailure, order }` only when needed; cloud/parallel runners ignore `abortOnFailure`.
- A test may appear only once after sys_id resolution.
- A referenced parent suite must be declared first. Raw sys_id cycles beyond self-reference are not statically detected; avoid raw IDs when a typed suite reference is available.
- Prefer either explicit `tests` or `testFilter`. Combining them is allowed but risky: ATF can remove explicitly listed tests that do not match the filter when the suite is saved.
- A `Test({...}, (atf) => { ... })` callback is documented Fluent test DSL. Do not externalize it with `Now.include` merely because it is a callback.

Minimal shape:

```typescript
import { TestSuite } from '@servicenow/sdk/core'

export const smokeSuite = TestSuite({
    $id: Now.ID['smoke_suite'],
    name: 'Smoke Suite',
    description: 'Critical regression coverage',
    tests: [],
})
```

Run `now-sdk build`. Install with **sn-build-install** when requested. To execute the suite, switch to **sn-cicd** and confirm the target first—ATF execution can mutate test data. Report authoring/build separately from runtime results.
