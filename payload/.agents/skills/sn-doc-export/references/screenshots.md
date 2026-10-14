# Screenshot helper details

- `--url` must be a path (for example `/sp?id=index`) or a URL on the confirmed instance origin; `--instance` must be `https`.
- The helper reads SDK OAuth through the installed **sn-rest** helper in a child process and never prints the token. It first performs one bounded instance read to refresh auth, then drives installed Chrome/Edge.
- It needs `md-to-pdf` resolvable (for its bundled puppeteer); `render.js --check` does not cover the capture path.
- Unknown flags are errors. `--selector <css>` requires that element and crops the PNG to it; `--full-page` captures the whole scroll height.
- HTTP errors, navigation that leaves the instance origin, and blank pages fail.
- Sign-in detection is a heuristic (final URL or title containing `login`, `signin` or `saml`), so a legitimate page matching it also fails; report that instead of working around it.
- SNagent's `sn_doc_screenshot` remains an option for existing explicitly configured Python workflows ([install.md](../install.md#5-optional--screenshots)).
