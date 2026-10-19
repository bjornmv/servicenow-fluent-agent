# sn-doc-export — install guide

The renderer is Node only. Every install, download, PATH or settings change below needs explicit user approval first; a policy denial or missing install right is a stop, not something to work around. Run from the confirmed project directory (project `cwd`) and follow the [command policy](../../reference/sdk-commands.md).

| Output | Needs |
|---|---|
| DOCX | `@adobe/helix-md2docx` |
| PDF, HTML | `md-to-pdf` and an installed Chrome or Edge |

## 1. Check

```
sn-skill doc-render --check --format 'pdf,docx'
```

Read-only; it installs nothing. Ready output (paths and versions differ):

```
  [OK ] Node v22.x.x (need >= 18)
  [OK ] md-to-pdf 5.x.x  (PDF renderer)
  [OK ] @adobe/helix-md2docx 2.x.x  (DOCX renderer)
  [OK ] browser: C:\Program Files\Google\Chrome\Application\chrome.exe
  [OK ] browser version 1xx.x — page header/footer via CSS page margin boxes (Chromium 131+)
Selected: archetype=plain formats=pdf,docx required metadata: (none)
READY — the selected archetype and formats can render.
```

Exit 0 only with `READY`; otherwise `NOT READY` and exit 2. A browser older than Chromium 131 is `[WARN]`, not a stop: PDF header/footer then also prints on the cover.

## 2. Renderer packages

With approval, install both packages globally through npm's JavaScript CLI (resolve its path per the command policy; no batch shim):

```
node "<resolved-npm-cli.js>" install -g md-to-pdf '@adobe/helix-md2docx'
```

A project-local install (`install --no-save` with the same packages and approval) also works; the project is searched first, then `--node-path`, then the global npm folder, then `NODE_PATH`.

`md-to-pdf` may download its own Chromium during install; the renderer never uses it (locked-down machines often block it). PDF/HTML need an installed Chrome or Edge, otherwise the `browser:` line is `[BAD]` and only DOCX renders.

## 3. Browser selection

Search order: `--browser`, `SN_DOC_BROWSER`, `PUPPETEER_EXECUTABLE_PATH`, then standard Chrome/Edge locations. A `--browser` path that is not an executable file is `[BAD]` with no fallback. For one run:

```
sn-skill doc-render --check --format 'pdf,docx' --browser "<browser-path>"
```

Pass the same `--browser` on every render and capture, or (with approval) set `SN_DOC_BROWSER` to the path under `terminal.integrated.env.windows` in VS Code settings and open a new terminal.

## 4. Smoke test

Create `docs/hello.md` with file tools:

```markdown
---
title: hello
---
Test page.

:::{tip}
It works.
:::
```

```
sn-skill doc-render --in "docs/hello.md" --out "docs/dist/" --format 'pdf,docx'
```

Expect two `[OK ]` lines and `docs/dist/hello.pdf` and `docs/dist/hello.docx`, with a Tip callout. Remove the test files only if the user agrees.

## 5. Screenshots

`sn-skill doc-capture` needs no extra install: it uses the puppeteer inside `md-to-pdf`, an installed Chrome/Edge and sn-rest with an existing SDK OAuth alias. `--check` does not test it.

## Troubleshooting

- `node` not on PATH → ask the user for an approved Node.js install.
- `md-to-pdf — not installed` after a global install → the line lists the searched folders. Get the global root with `node "<resolved-npm-cli.js>" root -g` and pass it on every check, render and capture: `sn-skill doc-render --check --node-path "<global-module-root>"`.
- Install fails on the puppeteer download behind a proxy → use the approved proxy configuration; the downloaded Chromium is not needed.
- `no installed browser found`, or the browser fails to launch → install Chrome/Edge through the approved channel or pass a working one with `--browser`.
- `image not found` / `--image-map target not found` (exit 2, nothing written) → fix the path; do not delete the image reference.
- `Unsupported --format value` / `Unknown archetype` → a typo; valid values are printed.
- Long path errors on Windows → use a shorter approved output path; do not change registry or security policy.

Linux, VS Code server or containers: see `docs/linux-vscode-server.md` in the agent repository.
