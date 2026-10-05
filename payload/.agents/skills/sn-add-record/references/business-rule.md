# Business-rule traps

Preserved from the former standalone `sn-add-business-rule` workflow. These are authoring reminders, not newly verified API shapes; the project's actual SDK documentation is authoritative.

- Read `businessrule-api`; read `business-rule-guide` for the first project rule or an unfamiliar trigger pattern.
- Hand-authored convention: `src/fluent/server-development/business-rule/<name>.now.ts`; keep round-tripped transform output under its generated layout.
- A stable `$id: Now.ID['<stable_key>']` is required for BusinessRule (`WithID`). Missing identity can produce TS2345 / "Failed to determine ID". A key such as `br_<name>` becomes the record's identity in `keys.ts`; do not churn existing keys.
- Require `table` and every field marked required by the actual API. Use documented `when`, primitive numeric `order` and boolean `active`, never `'100'` or `'true'` strings.
- Externalize executable logic to `src/scripts/<name>.js`. From the convention above, `script: Now.include('../../../scripts/<name>.js')` traverses three levels; recalculate from the actual `.now.ts` location rather than copying the path blindly. Do not inline an ordinary business-rule function body.
- The external script uses the documented standard signature `(function executeRule(current, previous) { ... })(current, previous);`. Full runtime JS/TS belongs there, not in declarative record properties or scalar const initializers.
- Ordinary-record restrictions still apply: no `||`, `&&`, `?:`, string `+` composition, runtime control flow or unused consts in the `.now.ts` declaration. Confirm the trigger and previous-record behavior against the guide rather than inventing semantics.

Return to [sn-add-record](../SKILL.md) for build and deployment routing.
