# Suite membership references

Read when a suite references a transformed test, a raw sys_id, or a `Now.ID['key']` appears in `tests` or `parent`.

- A transformed test is a bare `Test(...)` statement with no binding: reference it by the sys_id in its `$id: Now.ID['<32-hex>']`.
- `Now.ID['key']` is not a reference in `tests` or `parent`: a registered key fails the build (TS2322), and an unregistered key builds green and writes the key text into the XML instead of a sys_id.
- Raw sys_id cycles beyond self-reference are not statically detected; avoid raw IDs when a typed suite reference is available.
