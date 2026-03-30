#!/usr/bin/env python3
"""
remove_unused_exports.py

Reads a Knip JSON report and strips the `export` keyword from flagged symbols.
Does NOT delete symbols — de-exporting is the safe first pass.
Run `tsc --noEmit` afterward to surface anything that is now truly unreachable.

Usage:
    knip --reporter json > knip-output.json
    python remove_unused_exports.py knip-output.json
    python remove_unused_exports.py knip-output.json --dry-run
    python remove_unused_exports.py knip-output.json --delete
"""

import argparse
import json
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Matches declaration-style exports:
#   export function foo
#   export async function foo
#   export class Foo
#   export abstract class Foo
#   export const foo
#   export let foo
#   export type Foo
#   export interface Foo
#   export enum Foo
#   export default function foo   (named default)
#   export default class Foo      (named default)
DECLARATION_PATTERN = re.compile(
    r"^(?P<indent>[ \t]*)"
    r"export\s+"
    r"(?P<rest>"
    r"(?:default\s+)?"
    r"(?:async\s+)?"
    r"(?:abstract\s+)?"
    r"(?:function\*?|class|const|let|var|type|interface|enum)\s+"
    r"(?P<name>\w+)"
    r")",
    re.MULTILINE,
)

# Matches named re-export list items:
#   export { foo, bar, baz }
#   export { foo as Foo, bar }
NAMED_EXPORT_PATTERN = re.compile(
    r"export\s*\{(?P<specifiers>[^}]+)\}(?P<from_clause>\s*from\s*['\"][^'\"]+['\"])?\s*;?"
)


def _build_declaration_sub(name: str):
    """Return a substitution function that strips `export` only for the given name."""

    def sub(m: re.Match) -> str:
        if m.group("name") == name:
            # Replace the full match, keeping everything after `export `
            return m.group("indent") + m.group("rest")
        return m.group(0)

    return sub


def _remove_from_named_export(src: str, name: str) -> str:
    """
    Remove a single name from export { ... } blocks.

    If the block becomes empty after removal, the whole statement is dropped.
    Re-exports (export { x } from '...') are left untouched — those are
    deliberate public surface, not internal dead code.
    """

    def sub(m: re.Match) -> str:
        from_clause = m.group("from_clause")
        if from_clause:
            # Re-export from another module — don't touch it.
            return m.group(0)

        specifiers_raw = m.group("specifiers")
        # Each specifier is `name` or `name as alias`
        specifiers = [s.strip() for s in specifiers_raw.split(",") if s.strip()]
        filtered = []
        for spec in specifiers:
            # spec may be `foo` or `foo as Bar` — match on the local name
            local_name = spec.split()[0]
            if local_name != name:
                filtered.append(spec)

        if not filtered:
            return ""  # whole block gone
        return "export { " + ", ".join(filtered) + " };"

    return NAMED_EXPORT_PATTERN.sub(sub, src)


def de_export_symbol(src: str, name: str) -> str:
    """Strip the export keyword for a single named symbol."""
    src = DECLARATION_PATTERN.sub(_build_declaration_sub(name), src)
    src = _remove_from_named_export(src, name)
    # Collapse consecutive blank lines that removal may leave behind
    src = re.sub(r"\n{3,}", "\n\n", src)
    return src


def delete_symbol(src: str, name: str) -> str:
    """
    Best-effort deletion of a symbol declaration.

    Handles single-line const/let/var/type/interface declarations and
    function/class blocks (matched by brace counting). Anything more
    complex is left alone — use de_export_symbol + tsc to finish the job.
    """

    # Single-line: export? const foo = ...;  /  export? type Foo = ...;
    single_line = re.compile(
        rf"^[ \t]*(?:export\s+)?(?:const|let|var|type)\s+{re.escape(name)}\b[^\n]*\n?",
        re.MULTILINE,
    )
    modified, n = single_line.subn("", src)
    if n:
        return re.sub(r"\n{3,}", "\n\n", modified)

    # Multi-line block: function / class / interface / enum
    # Find the opening line then count braces to find the closing brace.
    block_start = re.compile(
        rf"^[ \t]*(?:export\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|interface|enum)\s+{re.escape(name)}\b",
        re.MULTILINE,
    )
    match = block_start.search(src)
    if not match:
        return src  # not found — leave untouched

    start = match.start()
    depth = 0
    end = start
    found_open = False

    for i in range(start, len(src)):
        ch = src[i]
        if ch == "{":
            depth += 1
            found_open = True
        elif ch == "}":
            depth -= 1
            if found_open and depth == 0:
                end = i + 1
                # consume trailing newline if present
                if end < len(src) and src[end] == "\n":
                    end += 1
                break

    if not found_open:
        return src  # no block body found — leave untouched

    modified = src[:start] + src[end:]
    return re.sub(r"\n{3,}", "\n\n", modified)


# ---------------------------------------------------------------------------
# Report parsing
# ---------------------------------------------------------------------------


def parse_knip_report(path: Path) -> dict[str, list[str]]:
    """
    Returns { relative_file_path: [symbol_name, ...] } from a Knip JSON report.

    Knip's JSON shape (as of v5):
    {
      "files": ["src/unused.ts", ...],
      "issues": [
        {
          "file": "src/foo.ts",
          "owners": [...],
          "exports": [{ "name": "bar", "line": 5, "col": 0 }, ...],
          "types":   [{ "name": "Baz", ... }],
          ...
        },
        ...
      ]
    }
    """
    text = path.read_text()
    # Knip may emit progress lines before the JSON object when stdout is a TTY.
    # Seek to the first `{` to skip any leading non-JSON content.
    json_start = text.find("{")
    if json_start == -1:
        raise ValueError("No JSON object found in report file.")
    raw, _ = json.JSONDecoder().raw_decode(text, json_start)

    result: dict[str, list[str]] = {}

    issues = raw.get("issues", [])
    for file_issues in issues:
        file_path = file_issues.get("file")
        if not file_path:
            continue

        names: list[str] = []
        for key in ("exports", "types"):
            for entry in file_issues.get(key, []):
                name = entry.get("name")
                if name:
                    names.append(name)

        if names:
            result[file_path] = names

    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def process_file(
    file_path: Path,
    symbols: list[str],
    *,
    dry_run: bool,
    delete: bool,
) -> list[str]:
    """Process one file. Returns list of human-readable change descriptions."""
    if not file_path.exists():
        return [f"  SKIP  {file_path} (file not found)"]

    original = file_path.read_text(encoding="utf-8")
    src = original
    changes = []

    for name in symbols:
        before = src
        if delete:
            src = delete_symbol(src, name)
            if src != before:
                changes.append(f"  DELETED   {name}")
            else:
                # Fall back to de-export if deletion couldn't find the block
                src = de_export_symbol(src, name)
                if src != before:
                    changes.append(f"  DE-EXPORT {name} (delete fallback)")
        else:
            src = de_export_symbol(src, name)
            if src != before:
                changes.append(f"  DE-EXPORT {name}")

        if src == before and not dry_run:
            changes.append(
                f"  NO-MATCH  {name} (pattern did not match — check manually)"
            )

    if not dry_run and src != original:
        file_path.write_text(src, encoding="utf-8")

    return changes


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Strip unused exports identified by Knip."
    )
    parser.add_argument(
        "report",
        type=Path,
        help="Path to knip --reporter json output file",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing files",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help=(
            "Attempt to delete symbol declarations entirely instead of just "
            "stripping `export`. Best-effort; falls back to de-export on complex cases."
        ),
    )
    args = parser.parse_args()

    if not args.report.exists():
        print(f"Error: report file not found: {args.report}", file=sys.stderr)
        return 1

    try:
        file_map = parse_knip_report(args.report)
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        print(f"Error parsing Knip report: {exc}", file=sys.stderr)
        print(
            "Tip: regenerate with `knip --reporter json --no-progress > knip-output.json`",
            file=sys.stderr,
        )
        return 1

    if not file_map:
        print("No unused exports found in report.")
        return 0

    mode = "DRY RUN — " if args.dry_run else ""
    action = "delete" if args.delete else "de-export"
    print(f"{mode}Processing {len(file_map)} file(s) — action: {action}\n")

    total_symbols = 0
    for rel_path, symbols in sorted(file_map.items()):
        file_path = Path(rel_path)
        print(f"{file_path}  ({len(symbols)} symbol(s))")
        changes = process_file(
            file_path, symbols, dry_run=args.dry_run, delete=args.delete
        )
        for line in changes:
            print(line)
        total_symbols += len(symbols)
        print()

    print(
        f"{'Would process' if args.dry_run else 'Processed'} "
        f"{total_symbols} symbol(s) across {len(file_map)} file(s)."
    )
    if not args.dry_run:
        print(
            "Next step: run `tsc --noEmit` to surface symbols that are now unreachable."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
