# Screenshot helper details

- `--url` must be a path (for example `/sp?id=index`) or a URL on the confirmed instance origin; `--instance` must be `https`.
- The helper reads SDK OAuth through the installed **sn-rest** helper in a child process and never prints the token. It first performs one bounded instance read to refresh auth, then drives installed Chrome/Edge.
- Linux/VS Code server: it runs headless on the server (`--headed` needs a display and is refused without one), and it inherits sn-rest's now-sdk OAuth, which needs a working Secret Service keyring; on a credential-storage error use **sn-auth** and report the host finding.
- It needs `md-to-pdf` resolvable (for its bundled puppeteer; add `--node-path "<global-module-root>"` as for the renderer); `sn-skill doc-render --check` does not cover the capture path.
- Browser: same search as the renderer. `--browser "<browser-path>"` selects Chrome/Edge for one run, wins over `SN_DOC_BROWSER`, and a path that is not an executable file fails with no fallback.
- Unknown flags are errors. `--selector <css>` requires that element and crops the PNG to it; `--full-page` captures the whole scroll height.
- HTTP errors, navigation that leaves the instance origin, and blank pages fail.
- Sign-in detection is a heuristic (final URL or title containing `login`, `signin` or `saml`), so a legitimate page matching it also fails; report that instead of working around it.
