#!/usr/bin/env python3
"""
loc_counter.py — Lines of Code counter for a src directory.

Usage:
    python loc_counter.py                  # defaults to ./src
    python loc_counter.py /path/to/src     # custom path
"""

import os
import sys
from pathlib import Path
from collections import defaultdict

# ── Configuration ─────────────────────────────────────────────────────────────

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".next", "dist", "build", ".venv"}

LANGUAGE_MAP = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (JSX)",
    ".js": "JavaScript",
    ".jsx": "JavaScript (JSX)",
    ".css": "CSS",
    ".scss": "SCSS",
    ".html": "HTML",
    ".json": "JSON",
    ".md": "Markdown",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".sh": "Shell",
    ".env": "Env",
    ".toml": "TOML",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".rb": "Ruby",
    ".php": "PHP",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C/C++ Header",
}

# ── Helpers ────────────────────────────────────────────────────────────────────


def count_lines(filepath: Path) -> tuple[int, int, int]:
    """Return (total, code, blank) line counts for a file."""
    try:
        lines = filepath.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return 0, 0, 0
    total = len(lines)
    blank = sum(1 for l in lines if l.strip() == "")
    code = total - blank
    return total, code, blank


def collect_files(root: Path) -> list[Path]:
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skipped directories in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in filenames:
            files.append(Path(dirpath) / fname)
    return sorted(files)


def language(filepath: Path) -> str:
    return LANGUAGE_MAP.get(filepath.suffix.lower(), "Other")


# ── Display ────────────────────────────────────────────────────────────────────

COL_W = {"file": 52, "lang": 20, "total": 8, "code": 8, "blank": 8}


def header():
    return (
        f"{'File':<{COL_W['file']}} "
        f"{'Language':<{COL_W['lang']}} "
        f"{'Total':>{COL_W['total']}} "
        f"{'Code':>{COL_W['code']}} "
        f"{'Blank':>{COL_W['blank']}}"
    )


def divider():
    return "-" * (sum(COL_W.values()) + len(COL_W))


def row(rel_path: str, lang: str, total: int, code: int, blank: int) -> str:
    # Truncate long paths from the left
    display = (
        rel_path
        if len(rel_path) <= COL_W["file"]
        else "…" + rel_path[-(COL_W["file"] - 1) :]
    )
    return (
        f"{display:<{COL_W['file']}} "
        f"{lang:<{COL_W['lang']}} "
        f"{total:>{COL_W['total']}} "
        f"{code:>{COL_W['code']}} "
        f"{blank:>{COL_W['blank']}}"
    )


# ── Main ───────────────────────────────────────────────────────────────────────


def main():
    src_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("./src")

    if not src_root.exists():
        print(f"❌  Directory not found: {src_root.resolve()}")
        sys.exit(1)

    files = collect_files(src_root)
    if not files:
        print(f"No files found under {src_root.resolve()}")
        sys.exit(0)

    # Pre-compute LOC for every file, then sort most lines first
    file_stats = [(fp, count_lines(fp)) for fp in files]
    file_stats.sort(key=lambda x: x[1][0], reverse=True)

    print(f"\n📂  {src_root.resolve()}\n")
    print(header())
    print(divider())

    grand_total = grand_code = grand_blank = 0
    by_lang: dict[str, list[int]] = defaultdict(
        lambda: [0, 0, 0]
    )  # [total, code, blank]

    for filepath, (total, code, blank) in file_stats:
        rel = str(filepath.relative_to(src_root.parent))
        lang = language(filepath)

        print(row(rel, lang, total, code, blank))

        grand_total += total
        grand_code += code
        grand_blank += blank
        by_lang[lang][0] += total
        by_lang[lang][1] += code
        by_lang[lang][2] += blank

    # ── Totals ─────────────────────────────────────────────────────────────────
    print(divider())
    print(row("TOTAL", f"{len(files)} files", grand_total, grand_code, grand_blank))

    # ── Language breakdown ──────────────────────────────────────────────────────
    print(f"\n{'─' * 40}")
    print(f"{'Language Breakdown':^40}")
    print(f"{'─' * 40}")
    print(f"  {'Language':<22} {'Files':>5}  {'Code':>7}")
    print(f"  {'─' * 22}  {'─' * 5}  {'─' * 7}")

    file_count_by_lang: dict[str, int] = defaultdict(int)
    for filepath, _ in file_stats:
        file_count_by_lang[language(filepath)] += 1

    for lang, (tot, code, blank) in sorted(by_lang.items(), key=lambda x: -x[1][1]):
        print(f"  {lang:<22} {file_count_by_lang[lang]:>5}  {code:>7,}")

    print(f"{'─' * 40}")
    print(f"  {'TOTAL':<22} {len(files):>5}  {grand_code:>7,}")
    print()


if __name__ == "__main__":
    main()
