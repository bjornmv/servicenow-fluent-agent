# Local render limits and troubleshooting

Read when deciding what a local `now-sdk run dev` page proves, or when it misbehaves.

## What local evidence covers

- The dev server proxies instance requests with the alias's credential: the page acts as that user, with that user's roles and no browser login. Mutating controls are live writes.
- Local evidence covers the alias user at the dev-server root only. Other roles and denied paths, the scoped `.do` endpoint and the embedded shell stay **not tested** locally.
- Error, timeout and stale states need a mock layer the project already has; this skill adds none.

## Troubleshooting

- **Page stops loading its bundle after a build:** do not run `now-sdk build` while a dev script that builds into the static output directory is running (the SDK React templates' watch build does). Build rewrites that directory. Stop the server first, or restart it afterwards.
- **Empty data or 401s after a long session:** the proxy reads the credential once at start. Restart the dev server (`sn-auth` for a demonstrated auth issue) before treating it as a UI defect.
