# sn-rest.js output and exit codes

## Exit codes

- **0** — HTTP 2xx response.
- **1** with an `ok:false` envelope on stdout — HTTP error.
- **1** with only a stderr line — token-refresh, network or keyring-load failure. For a write the outcome is UNKNOWN.
- **2** — the helper refused before sending anything: an unknown or repeated option, a missing value, an extra argument, a non-relative path, an unknown alias, an `--instance` that differs from the alias's stored host, or a missing or invalid write body. POST/PATCH/PUT without a readable, non-empty, valid JSON `--body-file` is refused this way. Correct the command from confirmed facts; do not drop the flag or switch alias to get past a refusal.

## `--agent` envelope

`--agent` envelopes JSON responses by body shape, not by API.

- An array `result` (Table lists, grouped Stats) becomes `ok`, `count`, `hasMore`, `nextOffset` and `records`. For grouped Stats `count` is the number of groups and `hasMore` is not a completeness signal.
- Any other JSON (a single record by sys_id, ungrouped Stats) becomes `{ok:true,result:<body>}`, so the data sits at `result.result`.
- An HTTP error becomes `{ok:false,error:{status,statusText,body}}`.
- Successful non-JSON or empty bodies are printed unchanged. HTML from an `/api/` path (sign-in, hibernation or proxy page) is a failed request, not data.
- Blank output alone proves neither failure nor success.

Check the actual envelope, HTTP errors and native exit before interpreting records. Preserve response excerpts, pagination and completion evidence if delegation is genuinely needed.
