# sn-doc-export — install guide

Two backends. Node is the default; Python is optional. Every install, download, PATH or settings change in this file needs explicit user approval first; a policy denial or missing install right is a stop, not something to work around. Run commands from the confirmed project directory (project `cwd`).

| Backend | When you need it | What to install |
|---|---|---|
| **node** (default) | PDF/DOCX/HTML from plain Markdown | `md-to-pdf`, `@adobe/helix-md2docx` (global or project-local), installed Chrome or Edge for PDF/HTML |
| **python** (optional) | Framed archetypes — runbook, compliance_report, release_notes, architecture, customer_deliverable, letter, knowledge_article | Python 3.11+, SNagent libs (not shipped with this distribution), WeasyPrint runtime (Windows = GTK) |

## 1. Command form

Run the renderer directly from the user profile path. Every command carries the full path; do not rely on a variable from an earlier terminal call:

```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --check
```

The check is read-only: it installs nothing and runs no package-manager launcher.

For the optional Python backend, explicitly select an existing SNagent checkout and set `SN_AGENT_HOME` to its absolute path. No personal, relative, current-directory or guessed default is used. Replace the placeholder below with the confirmed path; do not create or download a backend automatically. Optional VS Code user setting (only with approval):
```json
{
  "terminal.integrated.env.windows": {
    "SN_AGENT_HOME": "<absolute-backend-checkout>"
  }
}
```
Reload VS Code. New terminals see the Python backend home.

If running without a workspace open, set them in the shell:
```powershell
$env:SN_AGENT_HOME = "<absolute-backend-checkout>"
```

## 2. Node backend — default
With Node available, obtain explicit approval before installing the two renderer packages globally. Resolve npm's permitted JavaScript CLI using the [command policy](../../reference/sdk-commands.md); replace the path placeholder below. Do not use a batch shim or bypass a policy denial:
```powershell
node "<resolved-npm-cli.js>" install -g md-to-pdf "@adobe/helix-md2docx"
```
`md-to-pdf` depends on puppeteer, whose install step may download its own Chromium. The renderer never uses that copy: on locked-down systems (AppLocker / EDR / WDAC) it often cannot launch, so PDF/HTML require an installed **Chrome** or **Edge**. Without one, preflight reports the browser line as `[BAD]` and the Node backend is DOCX-only.

The renderer looks for the packages in the project directory, then the global npm folder (`%APPDATA%\npm\node_modules`, the `npm_config_prefix` folder or the folder next to `node.exe`), then `NODE_PATH`.

### Browser selection (PDF/HTML render)
Preflight reports which browser will be used. Override via env var if needed:
```powershell
$env:SN_DOC_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
```
Search order: `$env:SN_DOC_BROWSER` → `$env:PUPPETEER_EXECUTABLE_PATH` → standard Chrome/Edge install paths. There is no bundled-Chromium fallback.

Verify:
```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --check --format pdf,docx
```
Expected: `Backend: node (READY)` with `[OK ]` lines for both packages and `browser:`, and a final `READY — the selected backend and formats can render.` (exit 0).

### Smoke test
Create `hello.md` in the project directory with file-editing tools (not shell write commands):
```markdown
# Hello

This is a test.

:::{tip}
It works.
:::
```
```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --in hello.md --out . --format pdf,docx --meta "title=hello"
```
The render should print two `[OK ]` lines and produce `hello.pdf` + `hello.docx` next to `hello.md`, with a green "Tip" callout in the PDF. Remove the three smoke-test files afterwards only if the user agrees.

## 3. Python backend — optional (for framed archetypes)
Skip this section if you only need plain PDF/DOCX/HTML. These steps install software; each needs approval and may need rights a locked-down machine does not grant.

### 3a. Python 3.11+
```powershell
python --version
```
If Python is missing or older, ask the user to install an approved Python 3.11+ build (for example `winget install Python.Python.3.12` where winget and software installation are permitted), then open a new terminal so `python` is on PATH.

### 3b. Python packages
```powershell
python -m pip install -r "$env:USERPROFILE\.agents\skills\sn-doc-export\requirements.txt"
```
Pulls `docutils`, `myst-parser`, `python-docx`, `lxml`, `weasyprint`, `premailer`.

Prefer a venv? After confirming the explicit backend directory and obtaining approval, create one there (stop on a failed directory change):
```powershell
Set-Location -LiteralPath $env:SN_AGENT_HOME -ErrorAction Stop
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r "$env:USERPROFILE\.agents\skills\sn-doc-export\requirements.txt"
```
Activate it (`.\.venv\Scripts\Activate.ps1`) in any terminal that will render via the Python backend.

### 3c. WeasyPrint on Windows
WeasyPrint imports cleanly but rendering needs the **Pango/GTK** native libraries. Symptoms when missing:
- `OSError: cannot load library 'libgobject-2.0-0'`
- `cannot load library 'pangoft2-1.0-0'`

Fix — a GTK 3 runtime, for example via MSYS2. This is a human-run software install that needs approval and install rights; do not attempt it unattended:
1. `winget install MSYS2.MSYS2`
2. Open the **MSYS2 MINGW64** shell:
   ```bash
   pacman -S mingw-w64-x86_64-pango mingw-w64-x86_64-gtk3
   ```
3. Add `C:\msys64\mingw64\bin` to your **user** PATH (System Properties → Environment Variables).
4. Open a new terminal and re-run the check from section 4. The "WeasyPrint runtime" line should flip to OK.

Alternative: download GTK from <https://www.gtk.org/docs/installations/windows/> if you don't want MSYS2.

## 4. Verify both backends
```powershell
node "$env:USERPROFILE\.agents\skills\sn-doc-export\render.js" --check
```
Sample output with both backends ready (versions and paths differ; Python sub-report lines are prefixed `    | `):
```
sn-doc-export preflight
============================================================
Backend: node (READY)
  [OK ] Node v22.x.x (need >= 18)
  [OK ] md-to-pdf 5.x.x  (PDF renderer)
  [OK ] @adobe/helix-md2docx 2.x.x  (DOCX renderer)
  [OK ] browser: C:\Program Files\Google\Chrome\Application\chrome.exe

Backend: python (READY)
  [OK ] python found: C:\Users\you\...\python.exe
    | sn-doc-export preflight
    | ...
    | READY — preflight passed.
============================================================
READY — node backend available for PDF/DOCX.
```
Node lines use `[OK ]` / `[BAD]`; the Python sub-report also uses `[MISSING]`. Without the Python backend the block reads `Backend: python (NOT READY, optional)` and a `Note: python backend not ready…` line follows; that does not block Node output. A bare `--check` exits 0 when any output is possible (`PARTIAL — node backend can render …` included). To gate on a specific job, add `--format` and, for a framed document, `--archetype <name>`: the last lines are then `Selected: …` and `READY — …` (exit 0) or `NOT READY — …` (exit 2).

## 5. Optional — screenshots
`capture.cjs` (see SKILL.md) needs no extra install: it uses the puppeteer copy that comes with `md-to-pdf`, an installed Chrome/Edge and the installed sn-rest skill with an existing SDK OAuth alias. `--check` does not test it.

For instance captures via SNagent's `sn_doc_screenshot` (Python only, downloads a browser; approval required):
```powershell
python -m pip install playwright
python -m playwright install chromium
```

## Troubleshooting
- `node` not on PATH → ask the user for an approved Node.js install; do not install it unattended.
- `md-to-pdf — not installed` (a `[BAD]` line) after a global install → the global folder is not one the renderer searched (the line lists them). Get the global module root with `node "<resolved-npm-cli.js>" root -g` and set `$env:NODE_PATH` to that path in the same terminal call as the render or check command.
- `md-to-pdf` install fails on the puppeteer browser download behind a corporate proxy → use the approved proxy configuration and, with installation approval, re-run `node "<resolved-npm-cli.js>" install -g md-to-pdf`. The downloaded Chromium is not used by this skill; an installed Chrome/Edge is.
- `no installed browser found` or the PDF/HTML render fails to launch the browser → install Chrome or Edge through the approved channel, or set `$env:SN_DOC_BROWSER` to a working chrome.exe / msedge.exe path. Preflight only checks that the file exists, not that it can launch.
- `@adobe/helix-md2docx — not installed` → package name has the `@adobe/` scope; quote it in PowerShell: `"@adobe/helix-md2docx"`.
- `image not found` / `--image-map target not found` (exit 2, nothing written) → fix the Markdown image path or the absolute path in `--image-map`; do not delete the image reference to get a clean exit without telling the user.
- `Unsupported --format value` / `Unknown archetype` → a typo; valid values are printed.
- Missing/relative `SN_AGENT_HOME` → explicitly configure the user-selected absolute backend path; Node-only output does not require it.
- `Cannot import SNagent libs` → confirm `tools\_doc_lib\parse.py` exists under the configured `SN_AGENT_HOME`. Do not search personal folders or substitute another checkout.
- `[MISSING] myst_parser` after install → you're running a different Python than the one that installed packages. Run `python -m pip install -r ...`.
- DOCX renders but PDF fails with Pango error → §3c above.
- Long path errors on Windows → use an approved shorter project/output path; do not change machine registry or security policy.
