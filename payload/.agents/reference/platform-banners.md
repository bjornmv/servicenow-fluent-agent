# ServiceNow platform banners

- Top yellow/red strip banners ("Action Required: …", MFA notices, 3DES warnings, etc.) live in `sys_ux_banner_announcement` (Next Experience). NOT `sys_announcement` — that table doesn't exist on modern instances.
- No `active` field. Visibility is gated by `start` / `end` datetime window. To hide: PATCH `end` to a past datetime. To restore: clear `end` (or set to future).
- Platform-generated banners are created by system users like `@@snc_restrict_basic_auth@@`. They may be re-created on a future platform scan — `end`-in-past is the safe per-instance dismiss; deleting the row works too but comes back.
- Real "off switch" for the underlying *feature* (separate from the banner) is usually a property. For Basic Auth Restriction: `glide.authenticate.basic_auth.restriction.active`.
- Direct list URL: `/sys_ux_banner_announcement_list.do`.

## REST hide pattern (sn-rest)
PowerShell mangles JSON bodies with embedded spaces/quotes when passing as `--body` to node. Use a tiny one-shot Node script that reads the keychain token directly (see `tmp/hide-banner.js` pattern from AssetApp 2026-06-05) — pass the body via `JSON.stringify(...)` in-script, not via the shell.
