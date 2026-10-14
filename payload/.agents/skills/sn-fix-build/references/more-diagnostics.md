# More type diagnostics

Read when a build diagnostic matches no row in the SKILL.md table. Match the quoted text; apply one fix, then rebuild as in SKILL.md.

| Diagnostic | Cause | Fix |
|---|---|---|
| `TS2820` `Type '"x"' is not assignable to type '"a" \| "b"'. Did you mean ...` | Value outside the allowed set | Use a value listed in the message. |
| `TS2741` `Property '<x>' is missing in type` / `TS2739` `is missing the following properties` | Nested object missing required properties (e.g. a `Table` `index` entry without `element` / `unique`) | Add every property named. An accompanying `Plugin ... failed to transform` line with an opaque reason is the same defect. |
| `Record "<table>.<sys_id>" is defined N times in the project` + a numbered `file:line` list | Two records with the same identity (same `$id` key, or defined twice) | Remove the duplicate, or give a genuinely separate record its own `$id` key. |
