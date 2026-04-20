#!/usr/bin/env python3
"""
Normalise list-field separators in accountants-template.csv.

Some rows in the `specialisms` column (and a few others) use semicolons
or pipes instead of commas — which breaks code that splits on comma.
We have defensive parsers on the rendering side (they split on [,;|]),
but the CSV should be clean at source so downstream tools (exports,
API, third-party ingestion) don't need to know about the quirk.

What this script does:
  - Reads accountants-template.csv
  - Normalises separators in these columns: specialisms, client_type,
    focus_area, accreditations, specalist_segments (note the spelling
    typo preserved on purpose — matches the CSV column name)
  - Converts any `;` or `|` between items into `, `
  - Collapses double commas, trims leading/trailing whitespace per item
  - Writes back in place (no data loss — same row count, same columns,
    only the separator characters change)
  - Prints a summary of rows changed per column

Usage:
  python3 normalize_csv_separators.py              # dry-run (default, no write)
  python3 normalize_csv_separators.py --apply      # actually modify the CSV
  python3 normalize_csv_separators.py --diff       # dry-run + show per-row diffs
"""

import argparse
import csv
import os
import re
import sys
from collections import Counter

# Fields that hold comma-separated lists. Add others here if the team
# later introduces new list columns.
LIST_COLUMNS = [
    'specialisms',
    'client_type',
    'focus_area',
    'accreditations',
    'specalist_segments',  # CSV typo preserved — column is actually spelled this way
]

# Regex splits on ; or | with optional surrounding whitespace. Commas are
# left alone (they're the canonical separator we want everything to use).
SPLIT_BAD = re.compile(r'\s*[;|]\s*')
# Collapse any double commas and trim whitespace around commas
COMMA_TIDY = re.compile(r'\s*,\s*')


def normalise_value(s):
    """Turn ;/| separators into ", ". Idempotent on already-clean rows."""
    if not s:
        return s
    # Step 1: any ; or | → ","  (with no whitespace around)
    s1 = SPLIT_BAD.sub(',', s)
    # Step 2: normalise any surrounding whitespace around commas, collapse doubles
    s2 = COMMA_TIDY.sub(', ', s1).strip().strip(',').strip()
    # Step 3: collapse any "double commas" that may have slipped through
    while ',,' in s2:
        s2 = s2.replace(',,', ',')
    return s2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true',
                    help='Actually write changes to the CSV (default: dry-run)')
    ap.add_argument('--diff', action='store_true',
                    help='Print per-row diffs (implies dry-run)')
    args = ap.parse_args()

    root = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(root, 'accountants-template.csv')

    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # Check which list columns actually exist in the CSV (skip any that don't)
    present_cols = [c for c in LIST_COLUMNS if c in fieldnames]
    missing = [c for c in LIST_COLUMNS if c not in fieldnames]
    if missing:
        print(f'Columns not in CSV (skipped): {missing}')

    changes = Counter()
    diffs = []
    new_rows = []

    for i, row in enumerate(rows):
        new_row = dict(row)
        for col in present_cols:
            old = row.get(col) or ''
            new = normalise_value(old)
            if new != old:
                changes[col] += 1
                if args.diff and len(diffs) < 20:
                    diffs.append((i, row.get('name', '?'), col, old, new))
                new_row[col] = new
        new_rows.append(new_row)

    print(f'CSV rows: {len(rows)}')
    print('Rows changed per column:')
    for col in present_cols:
        print(f'  {col:24s}: {changes.get(col, 0)}')
    print(f'  {"TOTAL rows touched":24s}: {sum(1 for i, r in enumerate(rows) if r != new_rows[i])}')

    if args.diff:
        print('\nSample diffs (first 20):')
        for i, name, col, old, new in diffs:
            print(f'\n  Row {i} — {name[:40]} [{col}]')
            print(f'    before: {old[:150]}')
            print(f'    after:  {new[:150]}')

    if not args.apply:
        print('\nDry-run only. Pass --apply to write changes to the CSV.')
        return

    # Atomic write via a .tmp sidecar so an interrupted run can't corrupt
    tmp_path = csv_path + '.tmp'
    with open(tmp_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(new_rows)
    os.replace(tmp_path, csv_path)
    print(f'\nWrote {csv_path} ({sum(changes.values())} field changes across {sum(1 for i,r in enumerate(rows) if r != new_rows[i])} rows).')


if __name__ == '__main__':
    main()
