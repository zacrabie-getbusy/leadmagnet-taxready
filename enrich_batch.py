#!/usr/bin/env python3
"""
enrich_batch.py — One-off batch enrichment of existing unenriched rows.

Reads accountants-template.csv and enriches rows that have not yet been
processed (enriched != TRUE and at least one target field is blank).
Never overwrites fields that already have data.

Output: enriched_output.csv — only the rows processed in this run,
        all columns preserved. Does not modify accountants-template.csv.

Usage:
  python enrich_batch.py              # Process up to BATCH_SIZE rows (default 5)
  python enrich_batch.py --all        # Process all eligible rows
  python enrich_batch.py --batch 20   # Process up to 20 rows

Environment variables required:
  ANTHROPIC_API_KEY      —we can te Anthropic API key
  GOOGLE_PLACES_API_KEY  — (optional) enables accurate rating/review lookup
"""

import argparse
import os
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
BATCH_SIZE = 50


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--all", action="store_true",
        help="Process all eligible rows (overrides BATCH_SIZE)",
    )
    ap.add_argument(
        "--batch", type=int, default=None,
        help="Process up to N rows (overrides default BATCH_SIZE)",
    )
    args = ap.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("Error: ANTHROPIC_API_KEY environment variable not set.")

    places_api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")
    if not places_api_key:
        print("Note: GOOGLE_PLACES_API_KEY not set — rating/review lookup disabled.")

    client = anthropic.Anthropic(api_key=api_key)

    raw_fieldnames, unique_fieldnames, all_rows = read_csv_safe(CSV_PATH)
    print(f"Loaded {len(all_rows)} rows from {CSV_PATH}")

    eligible = [
        row for row in all_rows
        if row.get("enriched", "").strip().upper() != "TRUE"
        and any(not row.get(c, "").strip() for c in ENRICHMENT_TARGET_COLS)
    ]
    print(f"Eligible for enrichment: {len(eligible)}")

    if args.all:
        batch = eligible
    elif args.batch is not None:
        batch = eligible[: args.batch]
    else:
        batch = eligible[:BATCH_SIZE]

    print(f"Processing: {len(batch)} rows\n")

    if not batch:
        print("Nothing to enrich.")
        return

    enriched_rows = []
    for i, row in enumerate(batch, 1):
        name = row.get("name", "(no name)")
        city = row.get("city", "")
        print(f"[{i}/{len(batch)}] {name} ({city})")
        try:
            result = enrich_row(dict(row), client, places_api_key)
            enriched_rows.append(result)
        except Exception as e:
            print(f"  Failed: {e}")
            # Still mark enriched to avoid retrying a broken row
            row["enriched"] = "TRUE"
            enriched_rows.append(row)
        time.sleep(2)  # pause between firms to stay under token rate limit

    write_csv_output(OUTPUT_PATH, raw_fieldnames, unique_fieldnames, enriched_rows)
    print(f"\nDone. Written {len(enriched_rows)} rows to {OUTPUT_PATH}")
    print(
        "Review the output, then merge back into accountants-template.csv "
        "when satisfied (--apply flag coming in Phase 2)."
    )


if __name__ == "__main__":
    main()
