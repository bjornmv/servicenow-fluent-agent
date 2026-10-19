# Project SDK worker: behaviour, refusals and failure review

## What the worker does

[`scripts/update-project-sdk.cjs`](../scripts/update-project-sdk.cjs) (run as `sn-skill project-sdk`) is a small **npm-only** worker, not an SDK launcher. It:

- uses Node argument arrays with explicit cwd **and** npm `--prefix`;
- disables lifecycle scripts and enforces npm engines;
- backs up the manifest and lockfile;
- saves stdout/stderr plus an atomic result.

In `preflight`/`status` mode it never calls the SDK, a shell, auth, Git or the network. `apply` invokes npm, which may contact the configured registry. It never builds: `build` in its result is always `not-run`.

## Refusals

The worker deliberately refuses:

- linked paths and workspace projects;
- conflicting package managers;
- missing or mismatched local state;
- non-exact pins (a range declaration);
- any `.nvmrc` that is not an exact `x.y.z` equal to the running Node. Major-only or alias values such as `20` or `lts/*` are refused too; that is a worker limit, not proof of a wrong Node.

Other project layouts or managers need a separately reviewed equivalent that preserves these cwd, backup, ownership and evidence safeguards. Do not silently convert their lockfile or bypass the refusal.

It is not a package-manager sandbox. Its lock only coordinates this worker; do not run other package managers concurrently.

## Read-only recovery

Read-only recovery of the original run; prefer file tools if the original terminal remains busy:

```
sn-skill project-sdk status --run-dir "<original-evidence-directory>"
```

`status` never installs, unlocks or rewrites results. Missing, malformed or mismatched evidence is inconclusive, not permission to retry.

## Failure review

Failure recovery or lock removal requires review of the original operation and explicit authorization, not a new automatic retry. When the user asks for that review, it is read-only. Report:

- `result.json` `state`: `failed` = npm exited non-zero; `verification-failed` = npm exited 0 but the four values or the manifest do not match; `unknown` = no trustworthy completion. Read both logs.
- Whether the project's `package.json` and `package-lock.json` still equal the run directory's `package.json.before` / `package-lock.json.before`.
- Whether the installed `node_modules/@servicenow/sdk/package.json` version is still the approved current one.

Each of these is a separate mutation needing explicit approval of that exact step:

- deleting `.sn-sdk-update.lock` (only after confirming its `runDir` is this run);
- restoring the `.before` copies;
- reinstalling dependencies.

A new attempt then needs a fresh preflight and a new evidence directory.
