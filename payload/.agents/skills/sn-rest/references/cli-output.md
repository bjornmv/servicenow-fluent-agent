# `sn-skill rest` output and exit codes

## Exit codes

- **0** — HTTP 2xx response.
- **1** with an `ok:false` envelope on stdout — HTTP error.
- **1** with only a stderr line — token-refresh, network, keyring-load or credential-store failure (`Cannot read the OS credential store`, e.g. Linux without a Secret Service: a host finding, not auth). For a write the outcome is UNKNOWN.
- **2** — the helper refused before sending anything: an unknown or repeated option, a missing value, an extra argument, a non-relative path, an unknown alias, an `--instance` that differs from the alias's stored host, or a missing or invalid write body. POST/PATCH/PUT without a readable, non-empty, valid JSON `--body-file` is refused this way. Correct the command from confirmed facts; do not drop the flag or switch alias to get past a refusal.

## `--agent` envelope

`--agent` envelopes JSON responses by body shape, not by API.

- An array `result` (Table lists, grouped Stats) becomes `ok`, `count`, `hasMore`, `nextOffset` and `records`. For grouped Stats `count` is the number of groups and `hasMore` is not a completeness signal.
- Any other JSON (a single record by sys_id, ungrouped Stats) becomes `{ok:true,result:<body>}`, so the data sits at `result.result`.
- An HTTP error becomes `{ok:false,error:{status,statusText,body}}`.
- With `--expect-field` and `--expect-contains`, a JSON envelope also carries `expect:{field,rows,present,contains}` (`rows:0`, `present:false`, `contains:false` on an HTTP error). `present:false` (field missing from the row, hidden by an ACL, misspelt, or an object value) or a missing `present` is UNKNOWN; only `rows:1 present:true contains:false` is a real mismatch. One flag without the other, a blank `--expect-contains`, a non-GET method or a missing `--agent` exits 2.
- Successful non-JSON or empty bodies are printed unchanged. HTML from an `/api/` path (sign-in, hibernation or proxy page) is a failed request, not data.
- Blank output alone proves neither failure nor success.

Check the actual envelope, HTTP errors and the native exit (the final `sn-skill: rest exit=<N>` stderr line) before interpreting records. Preserve response excerpts, pagination and completion evidence if delegation is genuinely needed.
