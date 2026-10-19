# Missing docs checkout or index

Only after search/read fails with ENOENT and `paths` confirms the failed path is the resolved one. Check what exists:

```
sn-skill docs paths
```

`docsExists` and `indexExists` are true only when the resolved `docs` and `index` paths are directories, and `manifestExists` only when `manifest.json` inside `index` is a file; a plain file at either path counts as missing.

- **Docs checkout missing:** report that documentation installation is pending. Do not silently use an older checkout or download/move docs outside an authorized installation.
- **Checkout present, index directory absent:** building is authorized only by a full setup run that includes it or by the user's explicit approval. Otherwise ask first and state the cost: the build prints nothing until it finishes, takes minutes for the full corpus, and writes several hundred MB under the index path. Then:

```
sn-skill docs build --family australia
```

On Linux the index lands in the `paths` index location (XDG data dir by default); keep it on persistent storage, not `/tmp`.

- **Index directory present without `manifest.json`:** an incomplete or foreign build. Search, read and build (with or without `--force`) all refuse it. Report the exact path and stop for review.

`--family` is only a label written into the index; it does not select or check a release branch. Replacing an existing index requires separate approval plus `--force`, which works only on a recognized index (`manifest.json` with `schema_version: 1` and `generator` starting `sn-doc-md@`). Never delete an unexpected directory to make indexing succeed. Search/read/test do not create or rebuild indexes.
