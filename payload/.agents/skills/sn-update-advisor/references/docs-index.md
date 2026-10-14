# ServiceNowDocs index: rebuild triggers and explicit paths

- A lookup `warnings` entry naming `sn-doc-md@0.1.0` is a reason to offer the rebuild, benchmark and report steps of the ServiceNowDocs update even when the corpus commit is unchanged.
- The `build` and `test` commands resolve the docs and index locations as `paths` reports them. Confirm that its `docs` is the checkout just pulled.
- Add explicit `--docs` / `--out` (build) or `--index` (test) only when lookup itself runs with explicit paths.
- The index commands belong to [sn-doc-lookup](../../sn-doc-lookup/SKILL.md).
