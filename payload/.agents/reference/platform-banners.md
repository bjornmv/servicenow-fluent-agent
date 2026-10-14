# ServiceNow platform banners

- Top yellow/red strip banners ("Action Required: …", MFA notices, 3DES warnings, etc.) live in `sys_ux_banner_announcement` (Next Experience). NOT `sys_announcement` — that table doesn't exist on modern instances.
- No `active` field. Visibility is gated by `start` / `end` datetime window. To hide: PATCH `end` to a past datetime. To restore: clear `end` (or set to future).
- Platform-generated banners are created by system users like `@@snc_restrict_basic_auth@@`. They may be re-created on a future platform scan — `end`-in-past is the safe per-instance dismiss; deleting the row works too but comes back.
- Real "off switch" for the underlying *feature* (separate from the banner) is usually a property. For Basic Auth Restriction: `glide.authenticate.basic_auth.restriction.active`.
- Direct list URL: `/sys_ux_banner_announcement_list.do`.

## REST hide pattern (sn-rest)
Hiding a banner is an instance write. Follow the **sn-rest** skill's write gate: get explicit approval of the exact `sys_id` and `end` value, put the JSON in a reviewed UTF-8 body file and send it with the helper's `--method PATCH --body-file` (PowerShell mangles inline JSON passed as `--body`). Do not read the credential store or write another OAuth client.
