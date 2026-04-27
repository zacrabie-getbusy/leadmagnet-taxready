#!/usr/bin/env python3
"""
enrich_new_rows.py — Detect and enrich rows added since the last commit.

Compares the current CSV against the HEAD version (or HEAD~1 when running
in CI after a push) using git to identify newly added rows, then applies
stricter enrichment rules:

  - Row HAS a place_id:
      Enrich all blank enrichment fields. Never overwrite populated data.

  - Row has NO place_id:
      Only enrich if the row is completely bare — all enrichment target
      fields (bio, website, specialisms, focus_area, client_type,
      accreditations, rating, reviews, lat/lng, flags) are blank.
      If ANY enrichment field has data, skip the row entirely.

Output: enriched_output.csv — processed rows only, all columns preserved.
        Does not modify accountants-template.csv.

Usage:
  python enrich_new_rows.py              # auto-detects context (local vs CI)
  python enrich_new_rows.py --dry-run    # show which rows would be processed, no API calls

GitHub Actions trigger (add to .github/workflows/generate-pages.yml):
  on:
    push:
      paths:
        - 'accountants-template.csv'

Environment variables required:
  ANTHROPIC_API_KEY      — Anthropic API key
  GOOGLE_PLACES_API_KEY  — (optional) enables accurate rating/review lookup
"""

import argparse
import csv
import io
import os
import subprocess
import sys
import time
from pathlib import Path

import anthropic

from _enrich_utils import (
    ENRICHMENT_TARGET_COLS,
    enrich_row,
    read_csv_safe,
    write_csv_output,
)

CSV_PATH = Path("accountants-template.csv")
OUTPUT_PATH = Path("enriched_output.csv")


# ---------------------------------------------------------------------------
# New-row detection via git
# ---------------------------------------------------------------------------

def _csv_has_uncommitted_changes() -> bool:
    """Return True if accountants-template.csv has uncommitted changes."""
    result = subprocess.run(
        ["git", "status", "--porcelain", str(CSV_PATH)],
        capture_output=True, text=True,
    )
    return bool(result.stdout.strip())


def _get_head_place_ids(ref: str = "HEAD") -> set:
    """
    Return the set of place_id values present in a prior git ref of the CSV.
    Uses the first column (index 0) to avoid the duplicate-header issue.
    Falls back to empty set if the ref doesn't exist (e.g. initial commit).
    """
    try:
        result = subprocess.run(
            ["git", "show", f"{ref}:{CSV_PATH}"],
            capture_output=True, text=True, check=True,
        )
        reader = csv.reader(io.StringIO(result.stdout))
        next(reader, None)  # skip header
        return {row[0].strip() for row in reader if row and row[0].strip()}
    except subprocess.CalledProcessError:
        return set()


def detect_new_rows(all_rows: list) -> list:
    """
    Return rows that are new since HEAD (local context) or HEAD~1 (CI context).

    Logic:
    - If the CSV has uncommitted local changes, compare against HEAD.
    - Otherwise (e.g. running in GitHub Actions after a push), compare against HEAD~1.
    - Rows whose place_id is not in the previous ref are considered new.
    - Rows without a place_id are checked using is_bare_row() below.
    """
    if _csv_has_uncommitted_changes():
        ref = "HEAD"
    else:
        ref = "HEAD~1"

    previous_ids = _get_head_place_ids(ref)

    new_rows = []
    for row in all_rows:
        pid = row.get("place_id", "").strip()
        if pid:
            # Row is new if its place_id was not in the previous version
            if pid not in previous_ids:
                new_rows.append(row)
        else:
            # No place_id — cannot reliably match across versions.
            # Include if it passes the bare-row check (applied later).
            if is_bare_row(row):
                new_rows.append(row)

    return new_rows


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

def is_bare_row(row: dict) -> bool:
    """Return True if all enrichment target fields are blank (name+address only)."""
    return all(not row.get(c, "").strip() for c in ENRICHMENT_TARGET_COLS)


def should_enrich(row: dict) -> bool:
    """
    Apply the strict new-row enrichment rules.

    With place_id: enrich if any enrichment field is blank.
    Without place_id: only enrich if the row is completely bare.
    """
    pid = row.get("place_id", "").strip()
    if row.get("enriched", "").strip().upper() == "TRUE":
        return False
    if pid:
        return any(not row.get(c, "").strip() for c in ENRICHMENT_TARGET_COLS)
    else:
        return is_bare_row(row)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Show which rows would be processed without making any API calls",
    )
    args = ap.parse_args()

    if not args.dry_run:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            sys.exit("Error: ANTHROPIC_API_KEY environment variable not set.")
        places_api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")
        if not places_api_key:
            print("Note: GOOGLE_PLACES_API_KEY not set — rating/review lookup disabled.")
        client = anthropic.Anthropic(api_key=api_key)
    else:
        api_key = None
        places_api_key = ""
        client = None

    raw_fieldnames, unique_fieldnames, all_rows = read_csv_safe(CSV_PATH)
    print(f"Loaded {len(all_rows)} rows from {CSV_PATH}")

    new_rows = detect_new_rows(all_rows)
    print(f"New rows detected: {len(new_rows)}")

    to_enrich = [row for row in new_rows if should_enrich(row)]
    skipped = len(new_rows) - len(to_enrich)
    print(
        f"To enrich: {len(to_enrich)} | "
        f"Skipped (already enriched or partial data without place_id): {skipped}"
    )

    if args.dry_run:
        print("\nDry run — rows that would be processed:")
        for row in to_enrich:
            pid = row.get("place_id", "(no place_id)")
            print(f"  {row.get('name', '?')} ({row.get('city', '?')}) [{pid}]")
        return

    if not to_enrich:
        print("Nothing to enrich.")
        return

    enriched_rows = []
    for i, row in enumerate(to_enrich, 1):
        name = row.get("name", "(no name)")
        city = row.get("city", "")
        pid = row.get("place_id", "no place_id")
        print(f"\n[{i}/{len(to_enrich)}] {name} ({city}) [{pid}]")
        try:
            result = enrich_row(dict(row), client, places_api_key)
            enriched_rows.append(result)
        except Exception as e:
            print(f"  Failed: {e}")
            row["enriched"] = "TRUE"
            enriched_rows.append(row)
        time.sleep(0.5)

    write_csv_output(OUTPUT_PATH, raw_fieldnames, unique_fieldnames, enriched_rows)
    print(f"\nDone. Written {len(enriched_rows)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
