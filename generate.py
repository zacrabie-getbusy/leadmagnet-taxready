#!/usr/bin/env python3
"""
TaxReady Page Generator
=======================
Reads accountants-template.csv and accountant-profile-template.html,
generates one static HTML page per firm in /accounting-firms/{city}/{slug}.html

Usage:
    python3 generate.py              # Generate all pages
    python3 generate.py --dry-run    # Preview what would be generated (no files written)

The CSV is the single source of truth. Edit it, re-run this script, done.
"""

import csv
import os
import re
import json
import sys

# ── CONFIG ──────────────────────────────────────────────────────────────────
TEMPLATE_PATH = 'accountant-profile-template.html'
CSV_PATH      = 'accountants-template.csv'
OUTPUT_DIR    = 'accounting-firms'
DOMAIN        = 'https://taxready.me'
DEFAULT_OG_IMAGE = f'{DOMAIN}/taxready_hero.png'

# Map flag columns → human-readable segment labels
FLAG_TO_SEGMENT = {
    'flag_hospitality':            'Hospitality',
    'flag_construction':           'Construction',
    'flag_healthcare':             'Healthcare',
    'flag_media':                  'Media & Creative',
    'flag_professional_services':  'Professional Services',
    'flag_real_estate':            'Real Estate',
    'flag_retail':                 'Retail',
}


def slugify(text):
    """Convert text to URL-friendly slug."""
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s-]+', '-', s)
    return s.strip('-')


def derive_segments(row):
    """Build comma-separated segment string from flag_* columns."""
    if row.get('specalist-segments', '').strip():
        return row['specalist-segments']
    segs = []
    for col, label in FLAG_TO_SEGMENT.items():
        if row.get(col, '').strip().upper() == 'TRUE':
            segs.append(label)
    return ', '.join(segs) if segs else ''


def clean_schema(html, row):
    """Remove invalid schema fields when data is empty."""
    # Remove "image" line if no badge URL
    if not row.get('2026-badge-winners', '').strip():
        html = re.sub(r'\s*"image"\s*:\s*"[^"]*"\s*,?\n?', '\n', html)

    # Remove aggregateRating block if no reviews
    rating = row.get('rating', '').strip()
    reviews = row.get('reviews', '').strip()
    if not rating or not reviews:
        html = re.sub(
            r',?\s*"aggregateRating"\s*:\s*\{[^}]*\}',
            '',
            html,
            flags=re.DOTALL
        )

    # Remove knowsAbout if no specialisms
    if not row.get('specialisms', '').strip():
        html = re.sub(r'\s*"knowsAbout"\s*:\s*"[^"]*"\s*,?\n?', '\n', html)

    # Handle sameAs — populate with website or leave empty
    website = row.get('website', '').strip()
    if website:
        html = html.replace('"sameAs": []', f'"sameAs": ["{website}"]')

    # Handle og:image fallback
    badge = row.get('2026-badge-winners', '').strip()
    if not badge:
        html = re.sub(
            r'<meta property="og:image" content="[^"]*">',
            f'<meta property="og:image" content="{DEFAULT_OG_IMAGE}">',
            html
        )

    # Clean up FAQ schema — remove fees question if no fees data
    if not row.get('fees_from', '').strip():
        html = re.sub(
            r'\s*\{\s*"@type"\s*:\s*"Question"\s*,\s*"name"\s*:\s*"How much does[^}]*\}[^}]*\}\s*,?',
            '',
            html,
            flags=re.DOTALL
        )

    # Clean up FAQ — remove specialisms question if no specialisms
    if not row.get('specialisms', '').strip():
        html = re.sub(
            r'\s*\{\s*"@type"\s*:\s*"Question"\s*,\s*"name"\s*:\s*"What does[^}]*\}[^}]*\}\s*,?',
            '',
            html,
            flags=re.DOTALL
        )

    return html


def strip_preview_block(html):
    """Remove the preview mode toolbar and script — not needed on generated pages."""
    # Remove the preview bar HTML
    html = re.sub(
        r'<!-- PREVIEW STATE BAR.*?</div>\s*',
        '',
        html,
        flags=re.DOTALL
    )
    # Remove the preview script block (TXPREVIEW states, txSetState, etc.)
    html = re.sub(
        r'<style>\s*\.tx-state-btn.*?</script>\s*',
        '',
        html,
        flags=re.DOTALL
    )
    return html


def build_page(template, row):
    """Replace all {{PLACEHOLDER}} tokens and clean up."""
    firm_slug = row.get('firm_slug', '').strip() or slugify(row['name'])
    city_slug = row.get('city_slug', '').strip() or slugify(row['city'])
    segments  = derive_segments(row)

    # Build the replacement map
    replacements = {
        '{{FIRM_NAME}}':           row['name'],
        '{{FIRM_ADDRESS}}':        row['address'],
        '{{FIRM_CITY}}':           row['city'],
        '{{FIRM_GOOGLE_RATING}}':  row['rating'],
        '{{FIRM_GOOGLE_REVIEWS}}': row['reviews'],
        '{{FIRM_LAT}}':            row['latitude'],
        '{{FIRM_LNG}}':            row['longitude'],
        '{{FIRM_POSTCODE}}':       row['postcode'],
        '{{FIRM_BADGE_URL}}':      row.get('2026-badge-winners', ''),
        '{{FIRM_SLUG}}':           firm_slug,
        '{{FIRM_CITY_SLUG}}':      city_slug,
        '{{FIRM_SEGMENT}}':        segments,
        '{{FIRM_SPECIALISMS}}':    row.get('specialisms', ''),
        '{{FIRM_CERTIFICATIONS}}': row.get('certifications', ''),
        '{{FIRM_FEES_FROM}}':      row.get('fees_from', ''),
        '{{FIRM_EXTRA}}':          row.get('bio', ''),
        '{{FIRM_WEBSITE}}':        row.get('website', ''),
        '{{IS_CLAIMED}}':          row.get('is_claimed', ''),
        '{{HAS_SECURE_PORTAL}}':   '',
    }

    html = template
    for token, value in replacements.items():
        html = html.replace(token, value)

    # Clean up schema for empty fields
    html = clean_schema(html, row)

    # Strip preview mode (not needed on live pages)
    html = strip_preview_block(html)

    return html, city_slug, firm_slug


def main():
    dry_run = '--dry-run' in sys.argv

    # Read template
    with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        template = f.read()

    # Read CSV
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f'Template: {TEMPLATE_PATH}')
    print(f'CSV:      {CSV_PATH} ({len(rows)} firms)')
    print(f'Output:   {OUTPUT_DIR}/')
    print()

    generated = 0
    skipped   = 0
    errors    = 0

    for i, row in enumerate(rows):
        name = row.get('name', '').strip()
        city = row.get('city', '').strip()
        reviews = row.get('reviews', '0').strip()

        if not name or not city:
            print(f'  SKIP row {i+2}: missing name or city')
            skipped += 1
            continue

        try:
            html, city_slug, firm_slug = build_page(template, row)
        except Exception as e:
            print(f'  ERROR row {i+2} ({name}): {e}')
            errors += 1
            continue

        out_dir  = os.path.join(OUTPUT_DIR, city_slug)
        out_file = os.path.join(out_dir, f'{firm_slug}.html')

        if dry_run:
            badge = 'BADGE' if row.get('2026-badge-winners', '').strip() else '     '
            print(f'  [{badge}] {out_file}  ({name}, {city}, {reviews} reviews)')
        else:
            os.makedirs(out_dir, exist_ok=True)
            with open(out_file, 'w', encoding='utf-8') as f:
                f.write(html)

        generated += 1

    print()
    if dry_run:
        print(f'DRY RUN complete: {generated} pages would be generated, {skipped} skipped, {errors} errors')
    else:
        print(f'Done: {generated} pages generated, {skipped} skipped, {errors} errors')
        print(f'Pages are in: {OUTPUT_DIR}/')


if __name__ == '__main__':
    main()
