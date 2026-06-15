# sn-doc — install guide

Two backends. Install whichever you need.

| Backend | When you need it | What to install |
|---|---|---|
| **node** (default) | Quick PDFs/DOCX from plain Markdown | `md-to-pdf`, `@adobe/helix-md2docx` (global) |
| **python** (optional) | Framed archetypes — runbook, compliance_report, release_notes, architecture, customer_deliverable, letter, knowledge_article | Python 3.11+, SNagent libs, WeasyPrint runtime (Windows = GTK) |

## 1. Command form

Run the renderer directly from the user profile path:

```powershell
$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --check
```

For the Python backend only, set `SN_AGENT_HOME` when it is missing. Optional VS Code user setting:
```json
{
  "terminal.integrated.env.windows": {
    "SN_AGENT_HOME": "C:\\Personal\\SNagent"
  }
}
```
Reload VS Code. New terminals see the Python backend home.

If running without a workspace open, set them in the shell:
```powershell
$env:SN_AGENT_HOME = "C:\Personal\SNagent"
```

## 2. Node backend — required
Already have Node (the agent does). Install the two renderer packages globally:
```powershell
npm.cmd install -g md-to-pdf "@adobe/helix-md2docx"
```
`md-to-pdf` pulls a puppeteer Chromium download (~170 MB) on install. **On locked-down systems** (AppLocker / EDR / WDAC) the puppeteer-bundled Chromium often fails to launch from `%USERPROFILE%\.cache\puppeteer\` — the skill auto-detects installed **Chrome** or **Edge** and uses that instead.

### Browser selection (PDF render)
Preflight reports which browser will be used. Override via env var if needed:
```powershell
$env:SN_DOC_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
```
Search order: `$env:SN_DOC_BROWSER` → `$env:PUPPETEER_EXECUTABLE_PATH` → standard Chrome/Edge install paths → puppeteer-bundled Chromium (fallback).

Verify:
```powershell
$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --check
```
Expected: `Backend: node (READY)` with both packages and a `browser:` line.

### Smoke test (human-only file write)
```powershell
"# Hello`r`n`r`nThis is a test.`r`n`r`n:::{tip}`r`nIt works.`r`n:::" | Set-Content hello.md
$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --in hello.md --out . --format pdf,docx --meta title=hello
```
This snippet is for a human running a one-off local smoke test. Agents should create `hello.md` with file-editing tools instead of shell write commands. The render should produce `hello.pdf` + `hello.docx` next to `hello.md`.

## 3. Python backend — optional (for framed archetypes)
Skip this section if you only need plain PDFs/DOCX.

### 3a. Python 3.11+
```powershell
python --version          # check
winget install Python.Python.3.12   # if missing
```
Re-open the terminal so `python` is on PATH.

### 3b. Python packages
```powershell
python -m pip install -r "$env:USERPROFILE\.agents\skills\sn-doc\requirements.txt"
```
Pulls `docutils`, `myst-parser`, `python-docx`, `lxml`, `weasyprint`, `premailer`.

Prefer a venv? Create one in SNagent:
```powershell
cd C:\Personal\SNagent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r "$env:USERPROFILE\.agents\skills\sn-doc\requirements.txt"
```
Activate it (`.\.venv\Scripts\Activate.ps1`) in any terminal that will render via the Python backend.

### 3c. WeasyPrint on Windows
WeasyPrint imports cleanly but rendering needs the **Pango/GTK** native libraries. Symptoms when missing:
- `OSError: cannot load library 'libgobject-2.0-0'`
- `cannot load library 'pangoft2-1.0-0'`

Fix — install GTK 3 runtime via MSYS2:
1. `winget install MSYS2.MSYS2`
2. Open the **MSYS2 MINGW64** shell:
   ```bash
   pacman -S mingw-w64-x86_64-pango mingw-w64-x86_64-gtk3
   ```
3. Add `C:\msys64\mingw64\bin` to your **user** PATH (System Properties → Environment Variables).
4. Re-open the terminal and re-run `$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --check`. The "WeasyPrint runtime" line should flip to OK.

Alternative: download GTK from <https://www.gtk.org/docs/installations/windows/> if you don't want MSYS2.

## 4. Verify both backends
```powershell
$SnDoc = Join-Path $env:USERPROFILE '.agents\skills\sn-doc\render.js'; node "$SnDoc" --check
```
Expected sample output:
```
Backend: node (READY)
  [OK ] Node v25.2.1 (need >= 18)
  [OK ] md-to-pdf 5.x  (PDF renderer)
  [OK ] @adobe/helix-md2docx 2.x  (DOCX renderer)

Backend: python (READY)
  [OK ] python found: C:\Users\you\...\python.exe
  [OK ] sn-doc preflight … READY — preflight passed.

READY — node backend available.
```

## 5. Optional — Playwright screenshots
For instance captures via SNagent's `sn_doc_screenshot` (Python only):
```powershell
python -m pip install playwright
python -m playwright install chromium
```

## Troubleshooting
- `node` not on PATH → install Node from <https://nodejs.org> (LTS).
- `[MISSING] md-to-pdf` after global install → re-open the terminal so `NODE_PATH` / global modules resolve. Or set `$env:NODE_PATH = (npm.cmd root -g)`.
- `md-to-pdf` Chromium download fails behind a corporate proxy → set `HTTPS_PROXY` and re-run `npm.cmd install -g md-to-pdf`. If the download itself is blocked, install Chrome/Edge instead — sn-doc will use them automatically.
- PDF render fails with `spawn UNKNOWN` → AV/AppLocker blocked the puppeteer-bundled Chromium under `%USERPROFILE%\.cache\puppeteer\`. Install Chrome or Edge, or set `$env:SN_DOC_BROWSER` to a chrome.exe / msedge.exe path. Preflight will report which browser is used.
- `[MISSING] @adobe/helix-md2docx` → package name has the `@adobe/` scope; quote it in PowerShell: `"@adobe/helix-md2docx"`.
- `Cannot import SNagent libs` → `SN_AGENT_HOME` is wrong. Confirm `C:\Personal\SNagent\tools\_doc_lib\parse.py` exists.
- `[MISSING] myst_parser` after install → you're running a different Python than the one that installed packages. Run `python -m pip install -r ...`.
- DOCX renders but PDF fails with Pango error → §3c above.
- Long path errors on Windows → enable long paths via `gpedit` or set `LongPathsEnabled = 1` in `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`.
