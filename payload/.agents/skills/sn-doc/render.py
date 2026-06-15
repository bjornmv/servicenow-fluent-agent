#!/usr/bin/env python3
"""sn-doc render shim — preflight + render MyST markdown to PDF/DOCX.

Reuses the SNagent (C:\\Personal\\SNagent) render libraries directly so we
don't need the SN-Agent REPL running. Honors the same MyST flavor, the same
archetype registry, and the same image_map convention as sn_doc_compose /
sn_doc_export.

Usage:
    python render.py --check
    python render.py --in body.md --archetype runbook --format pdf,docx \\
        --out docs/dist/ --meta-title "Foo" --meta-author "Bar" \\
        [--image-map name.png=C:\\path\\to\\file.png ...] [--force]
"""
from __future__ import annotations

import argparse
import importlib
import os
import re
import sys
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Locate the SNagent libs and inject onto sys.path BEFORE any SNagent import.
# ---------------------------------------------------------------------------

SN_AGENT_HOME = os.environ.get("SN_AGENT_HOME", r"C:\Personal\SNagent")
_LIB = Path(SN_AGENT_HOME) / "tools" / "_doc_lib"
_TOOLS = Path(SN_AGENT_HOME) / "tools"


def _inject_paths() -> list[str]:
    """Add SNagent paths to sys.path. Returns list of issues found."""
    issues = []
    if not Path(SN_AGENT_HOME).is_dir():
        issues.append(f"SN_AGENT_HOME does not exist: {SN_AGENT_HOME}")
        return issues
    if not _LIB.is_dir():
        issues.append(f"SNagent _doc_lib not found at: {_LIB}")
    if not _TOOLS.is_dir():
        issues.append(f"SNagent tools not found at: {_TOOLS}")
    for p in (_LIB, _TOOLS):
        s = str(p)
        if s not in sys.path:
            sys.path.insert(0, s)
    return issues


# ---------------------------------------------------------------------------
# Preflight — check every dep, report cleanly, never raise.
# ---------------------------------------------------------------------------

PYTHON_MIN = (3, 11)

REQUIRED_MODULES = [
    # (import name, pip name, what it's for)
    ("docutils", "docutils>=0.22", "doctree IR"),
    ("myst_parser", "myst-parser>=4.0", "markdown parser"),
    ("docx", "python-docx>=1.2", "DOCX renderer"),
    ("lxml", "lxml>=4.9", "HTML/XML processing"),
    ("weasyprint", "weasyprint>=68", "PDF renderer"),
    ("premailer", "premailer>=3.10", "KB-fragment inlining"),
]

VALID_ARCHETYPES = (
    "plain", "knowledge_article", "runbook", "compliance_report",
    "release_notes", "architecture", "customer_deliverable", "letter",
)

SNAGENT_MODULES = [
    "parse",
    "render.pdf_weasyprint",
    "render.docx_profile",
    "archetypes.registry",
]


def _check_python() -> tuple[bool, str]:
    cur = sys.version_info[:2]
    ok = cur >= PYTHON_MIN
    msg = f"Python {cur[0]}.{cur[1]} (need >= {PYTHON_MIN[0]}.{PYTHON_MIN[1]})"
    return ok, msg


def _check_module(name: str) -> tuple[bool, str]:
    try:
        m = importlib.import_module(name)
        v = getattr(m, "__version__", "?")
        return True, f"{name} {v}"
    except Exception as e:
        return False, f"{name} — {type(e).__name__}: {e}"


def _check_weasyprint_runtime() -> tuple[bool, str]:
    """WeasyPrint imports cleanly but needs Pango/GTK runtime DLLs on Windows
    for actual rendering. Probe by rendering a 1-byte HTML to bytes."""
    try:
        import weasyprint  # type: ignore
        weasyprint.HTML(string="<p>x</p>").write_pdf()
        return True, "WeasyPrint runtime (Pango/GTK) — OK"
    except Exception as e:
        return False, f"WeasyPrint runtime — {type(e).__name__}: {e}"


def preflight(verbose: bool = True) -> bool:
    print("sn-doc preflight")
    print("=" * 60)
    all_ok = True

    # Python
    ok, msg = _check_python()
    print(f"  [{'OK ' if ok else 'BAD'}] {msg}")
    all_ok &= ok

    # SNagent layout
    inject_issues = _inject_paths()
    if inject_issues:
        for i in inject_issues:
            print(f"  [BAD] {i}")
        all_ok = False
    else:
        print(f"  [OK ] SN_AGENT_HOME = {SN_AGENT_HOME}")

    # Python packages
    for imp, pip_name, purpose in REQUIRED_MODULES:
        ok, msg = _check_module(imp)
        tag = "OK " if ok else "MISSING"
        print(f"  [{tag}] {msg}  ({purpose})")
        all_ok &= ok

    # WeasyPrint runtime (only if import succeeded)
    if all_ok:
        ok, msg = _check_weasyprint_runtime()
        print(f"  [{'OK ' if ok else 'BAD'}] {msg}")
        all_ok &= ok

    # SNagent libs
    if not inject_issues:
        for mod in SNAGENT_MODULES:
            ok, msg = _check_module(mod)
            tag = "OK " if ok else "MISSING"
            print(f"  [{tag}] SNagent.{msg}")
            all_ok &= ok

    print("=" * 60)
    if all_ok:
        print("READY — preflight passed.")
        return True

    print("NOT READY. Fix the items marked BAD/MISSING above.")
    print()
    print("Common fixes:")
    print(f"  python -m pip install -r \"{Path(__file__).parent / 'requirements.txt'}\"")
    print("  If WeasyPrint runtime fails on Windows, see install.md "
          "(Pango/GTK runtime).")
    print(f"  If SN_AGENT_HOME is wrong, set it: "
          f"$env:SN_AGENT_HOME = 'C:\\path\\to\\SNagent'")
    return False


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._-]+", "-", s).strip("-")
    return (s or "document").lower()[:80]


def _parse_image_map(items: list[str] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for it in items or []:
        if "=" not in it:
            print(f"  warn: --image-map ignored (no '='): {it}", file=sys.stderr)
            continue
        k, v = it.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def render(args: argparse.Namespace) -> int:
    # Preflight silently first; if anything is missing, run the full report.
    inject_issues = _inject_paths()
    if inject_issues:
        print("Preflight failed — run with --check for details.", file=sys.stderr)
        return 0 if preflight() else 2

    try:
        from parse import parse_markdown                          # type: ignore
        from archetypes.registry import get_archetype             # type: ignore
    except Exception as e:
        print(f"Cannot import SNagent libs: {e}", file=sys.stderr)
        preflight()
        return 2

    in_path = Path(args.in_path)
    if not in_path.is_file():
        print(f"Input not found: {in_path}", file=sys.stderr)
        return 2

    body_md = in_path.read_text(encoding="utf-8")
    formats = [f.strip().lower() for f in args.format.split(",") if f.strip()]
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    archetype_cfg = get_archetype(args.archetype)
    if archetype_cfg is None:
        print(f"Unknown archetype: {args.archetype}. Valid values: "
              f"{', '.join(VALID_ARCHETYPES)}", file=sys.stderr)
        return 2

    metadata = {
        k[len("meta_"):]: v for k, v in vars(args).items()
        if k.startswith("meta_") and v is not None
    }
    metadata.update(getattr(args, "extra_meta", {}))

    image_map = _parse_image_map(args.image_map)
    title = metadata.get("title") or in_path.stem
    slug = _slugify(title)

    print(f"Parsing {in_path} ({len(body_md):,} bytes) …")
    doctree, warnings = parse_markdown(body_md)
    for w in warnings:
        print(f"  myst warn: {w}", file=sys.stderr)

    results = []
    for fmt in formats:
        out_path = (out_dir / f"{slug}.{fmt}").resolve()
        try:
            if out_path.exists() and not args.force:
                print(
                    f"  [FAIL] {fmt}: Output exists: {out_path}. "
                    "Re-run with --force only after confirming overwrite.",
                    file=sys.stderr,
                )
                return 2
            if fmt == "pdf":
                # Re-parse: render_pdf transforms the doctree, so use a fresh one
                # for each format (matches sn_doc_export pattern).
                dt, _ = parse_markdown(body_md)
                from render.pdf_weasyprint import render_pdf       # type: ignore
                render_pdf(dt, output_path=str(out_path),
                           title=title, image_map=image_map,
                           archetype_cfg=archetype_cfg, metadata=metadata)
            elif fmt == "docx":
                dt, _ = parse_markdown(body_md)
                from render.docx_profile import render_docx        # type: ignore
                render_docx(dt, output_path=str(out_path),
                            title=title, image_map=image_map,
                            archetype_cfg=archetype_cfg, metadata=metadata)
            elif fmt == "html":
                dt, _ = parse_markdown(body_md)
                from render.html_profile import render_doc         # type: ignore
                html = render_doc(dt, title=title, image_map=image_map,
                                  archetype_cfg=archetype_cfg, metadata=metadata)
                out_path.write_text(html, encoding="utf-8")
            else:
                print(f"  Unsupported format: {fmt}", file=sys.stderr)
                continue
            size = out_path.stat().st_size
            print(f"  [OK ] {fmt:4s} -> {out_path}  ({size:,} bytes)")
            results.append((fmt, str(out_path)))
        except Exception as e:
            print(f"  [FAIL] {fmt}: {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc(limit=3)
            return 3

    if not results:
        return 1
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="sn-doc — render MyST markdown to PDF/DOCX via SNagent libs.")
    ap.add_argument("--check", action="store_true",
                    help="Run preflight and exit (no render).")
    ap.add_argument("--in", dest="in_path",
                    help="Input markdown file (MyST flavor).")
    ap.add_argument("--out", default="docs/dist",
                    help="Output directory (default: docs/dist).")
    ap.add_argument("--archetype", default="plain",
                    help=" | ".join(VALID_ARCHETYPES))
    ap.add_argument("--format", default="pdf,docx",
                    help="Comma-separated: pdf,docx,html (default: pdf,docx)")
    ap.add_argument("--image-map", action="append", default=[],
                    help="name.png=C:\\path\\to\\file.png (repeatable)")
    ap.add_argument("--force", action="store_true",
                    help="Overwrite existing output files after confirmation.")
    # Free-form metadata: --meta-title, --meta-author, --meta-version, etc.
    # argparse can't accept arbitrary --meta-*; predefine the common ones.
    for key in ("title", "subtitle", "author", "version", "date",
                "audience", "classification", "control_id", "framework",
                "category", "last_reviewed", "logo_path"):
        ap.add_argument(f"--meta-{key}", default=None, dest=f"meta_{key}")
    args, unknown = ap.parse_known_args(argv)

    extra_meta: dict[str, str] = {}
    remainder: list[str] = []
    i = 0
    while i < len(unknown):
        item = unknown[i]
        if item.startswith("--meta-"):
            raw = item[len("--meta-"):]
            if "=" in raw:
                key, value = raw.split("=", 1)
            else:
                if i + 1 >= len(unknown):
                    ap.error(f"argument {item}: expected one argument")
                key = raw
                i += 1
                value = unknown[i]
            extra_meta[key.replace("-", "_")] = value
        else:
            remainder.append(item)
        i += 1
    if remainder:
        ap.error("unrecognized arguments: " + " ".join(remainder))
    args.extra_meta = extra_meta

    if args.check:
        return 0 if preflight() else 2

    if not args.in_path:
        ap.error("--in is required unless --check is used")
    return render(args)


if __name__ == "__main__":
    sys.exit(main())
