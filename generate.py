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
DOMAIN        = 'https://taxready.me'

# Maps CSV country code → URL subdirectory
COUNTRY_DIR = {
    'GB': 'uk',
    'AU': 'au',
    # Add more here as new countries launch: 'US': 'us', 'CA': 'ca'
}
COUNTRY_LABEL = {
    'GB': 'UK',
    'AU': 'Australian',
}
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


def fmt_count(n):
    """Round n down to nearest 100 and format with + suffix, e.g. 4012 → '4,000+'."""
    return f'{(n // 100) * 100:,}+'


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


def compute_seo(row, firm_name, city, postcode, segment):
    """Compose state-aware SEO strings (title, description, OG, Twitter).

    Qualifier tiering — determined at build time from the same fields JS
    uses for the 5-state runtime branching, plus a rating check to protect
    against calling a 3.2-star firm "highly-rated":

        Has 2026 badge                          → "Top-rated Accountant"
        Claimed, no badge                       → "Verified Accountant"
        Unclaimed + ≥10 reviews + rating ≥ 4.5  → "Highly-rated Accountant"
        Unclaimed + ≥10 reviews + rating ≥ 4.0  → "Well-reviewed Accountant"
        Unclaimed + ≥10 reviews + rating < 4.0  → "Accountant" (no claim)
        <10 reviews (state 5)                   → "Accountant" (no claim)

    Returns a dict with:
        title, description, og_title, og_description,
        twitter_title, twitter_description,
        is_state5  — bool, consumed by clean_schema to strip FAQ/aggregateRating
    """
    try:
        reviews = int(row.get('reviews', '0') or '0')
    except ValueError:
        reviews = 0
    try:
        rating = float(row.get('rating', '0') or '0')
    except ValueError:
        rating = 0.0

    has_badge = bool((row.get('Badge') or '').strip())
    claimed   = (row.get('claimed') or '').strip().upper() == 'TRUE'
    is_state5 = reviews < 10 and not claimed

    # Choose qualifier tier
    if has_badge:
        title_qual = 'Top-rated Accountant'
        desc_adj   = 'top-rated'
        has_claim  = True
    elif claimed:
        title_qual = 'Verified Accountant'
        desc_adj   = 'verified'
        has_claim  = True
    elif is_state5 or rating < 4.0:
        title_qual = 'Accountant'
        desc_adj   = ''
        has_claim  = False
    elif rating >= 4.5:
        title_qual = 'Highly-rated Accountant'
        desc_adj   = 'highly-rated'
        has_claim  = True
    else:  # 4.0 ≤ rating < 4.5
        title_qual = 'Well-reviewed Accountant'
        desc_adj   = 'well-reviewed'
        has_claim  = True

    # Compose strings
    title = f'{firm_name} | {title_qual} in {city} | TaxReady'

    if has_claim:
        description = (
            f'{firm_name} is a {desc_adj} {segment} accountant in {city}, {postcode}. '
            f'View specialisms, certifications and fees — or send a free enquiry.'
        ) if segment else (
            f'{firm_name} is a {desc_adj} accountant in {city}, {postcode}. '
            f'View specialisms, certifications and fees — or send a free enquiry.'
        )
        og_description = (
            f'{firm_name}, {city}. {desc_adj.capitalize()} {segment} accountant. '
            f'View profile and get in touch.'
        ) if segment else (
            f'{firm_name}, {city}. {desc_adj.capitalize()} accountant. '
            f'View profile and get in touch.'
        )
        twitter_description = (
            f'{desc_adj.capitalize()} {segment} accountant in {city}. '
            f'View profile and send an enquiry directly.'
        ) if segment else (
            f'{desc_adj.capitalize()} accountant in {city}. '
            f'View profile and send an enquiry directly.'
        )
    else:
        # No qualifier claim — neutral, honest copy
        description = (
            f'{firm_name} is an accountant in {city}, {postcode}, listed on TaxReady. '
            f'View profile details — or send a free enquiry.'
        )
        og_description = f'{firm_name}, {city}. Accountant listed on TaxReady. View profile and get in touch.'
        twitter_description = f'Accountant in {city}, listed on TaxReady. View profile and send an enquiry directly.'

    og_title      = f'{firm_name} — {title_qual} in {city} | TaxReady'
    twitter_title = f'{firm_name} — {title_qual} in {city}'

    # LocalBusiness schema description — separate from SERP description,
    # consumed by Google's rich-result parser
    specialisms = row.get('specialisms', '').strip()
    parts = []
    if has_claim and segment:
        parts.append(f'{desc_adj.capitalize()} {segment} accountant in {city}, {postcode}.')
    elif has_claim:
        parts.append(f'{desc_adj.capitalize()} accountant in {city}, {postcode}.')
    elif segment:
        parts.append(f'{segment} accountant in {city}, {postcode}.')
    else:
        parts.append(f'Accountant in {city}, {postcode}.')
    if specialisms:
        parts.append(f'Specialising in {specialisms}.')
    schema_description = ' '.join(parts)

    return {
        'title': title,
        'description': description,
        'og_title': og_title,
        'og_description': og_description,
        'twitter_title': twitter_title,
        'twitter_description': twitter_description,
        'schema_description': schema_description,
        'is_state5': is_state5,
    }


def fix_jsonld_trailing_commas(html):
    """After schema strips, the JSON-LD blocks can have stray trailing commas
    (e.g. knowsAbout stripped leaves "...: \"...\",\n    \"aggregateRating\"..."
    → stripping aggregateRating next leaves the previous comma dangling).
    Fix scoped to JSON-LD script bodies only so HTML commas aren't touched."""
    def _fix(match):
        body = match.group(1)
        body = re.sub(r',(\s*[}\]])', r'\1', body)
        return f'<script type="application/ld+json">{body}</script>'
    return re.sub(
        r'<script type="application/ld\+json">(.*?)</script>',
        _fix,
        html,
        flags=re.DOTALL,
    )


def clean_schema(html, row, is_state5=False):
    """Remove invalid or misleading schema fields.

    is_state5 (reviews < 10, unclaimed) triggers extra stripping:
        - Entire FAQPage JSON-LD block (its answers misrepresent pending firms)
        - aggregateRating (prevents weak rich-snippet stars in SERPs)
    """
    # Remove "image" line if no badge URL
    if not row.get('Badge', '').strip():
        html = re.sub(r'\s*"image"\s*:\s*"[^"]*"\s*,?\n?', '\n', html)

    # Remove aggregateRating block if no reviews OR if state 5 (pending)
    rating = row.get('rating', '').strip()
    reviews = row.get('reviews', '').strip()
    if not rating or not reviews or is_state5:
        html = re.sub(
            r',?\s*"aggregateRating"\s*:\s*\{[^}]*\}',
            '',
            html,
            flags=re.DOTALL
        )

    # State 5: strip the entire FAQPage JSON-LD block. Uses the HTML comment
    # markers in the template so this is delimiter-safe — it can't accidentally
    # consume neighbouring <script type="application/ld+json"> blocks.
    if is_state5:
        html = re.sub(
            r'<!-- FAQ-SCHEMA-START[^>]*-->.*?<!-- FAQ-SCHEMA-END -->',
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
    badge = row.get('Badge', '').strip()
    if not badge:
        html = re.sub(
            r'<meta property="og:image" content="[^"]*">',
            f'<meta property="og:image" content="{DEFAULT_OG_IMAGE}">',
            html
        )

    # Clean up FAQ schema — remove fees question if no fees data
    if not row.get('fees', '').strip():
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

    # Fix trailing commas left behind by any of the strips above — JSON-LD
    # would be invalid without this and Google rejects the whole block silently.
    html = fix_jsonld_trailing_commas(html)

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


def build_page(template, row, country_firm_count=0):
    """Replace all {{PLACEHOLDER}} tokens and clean up."""
    firm_slug    = row.get('firm_slug', '').strip() or slugify(row['name'])
    city_slug    = row.get('city_slug', '').strip() or slugify(row['city'])
    segments     = derive_segments(row)
    country_code = row.get('country', 'GB').strip().upper()
    country_dir  = COUNTRY_DIR.get(country_code, 'uk')

    # Compose state-aware SEO strings (title, description, OG, Twitter)
    seo = compute_seo(row, row['name'], row['city'], row['postcode'], segments)

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
        '{{FIRM_BADGE_URL}}':      row.get('Badge', ''),
        '{{FIRM_SLUG}}':           firm_slug,
        '{{FIRM_CITY_SLUG}}':      city_slug,
        '{{FIRM_SEGMENT}}':        segments,
        '{{FIRM_SPECIALISMS}}':    row.get('specialisms', ''),
        '{{FIRM_CERTIFICATIONS}}': row.get('accreditations', ''),
        '{{FIRM_FEES_FROM}}':      row.get('fees', ''),
        '{{FIRM_EXTRA}}':          row.get('bio', ''),
        '{{FIRM_WEBSITE}}':        row.get('website', ''),
        '{{IS_CLAIMED}}':          'CLAIMED' if (row.get('claimed') or '').strip().upper() == 'TRUE' else '',
        '{{HAS_SECURE_PORTAL}}':   '',
        '{{FIRM_COUNTRY_DIR}}':    country_dir,
        '{{FIRM_COUNTRY_CODE}}':   country_code,
        '{{TOTAL_FIRM_COUNT}}':    fmt_count(country_firm_count),
        '{{FIRM_COUNTRY_LABEL}}':  COUNTRY_LABEL.get(country_code, 'UK'),
        # State-aware SEO tokens (see compute_seo for qualifier logic)
        '{{SEO_TITLE}}':               seo['title'],
        '{{SEO_DESCRIPTION}}':         seo['description'],
        '{{SEO_OG_TITLE}}':            seo['og_title'],
        '{{SEO_OG_DESCRIPTION}}':      seo['og_description'],
        '{{SEO_TWITTER_TITLE}}':       seo['twitter_title'],
        '{{SEO_TWITTER_DESCRIPTION}}': seo['twitter_description'],
        '{{SEO_SCHEMA_DESCRIPTION}}':  seo['schema_description'],
    }

    html = template
    for token, value in replacements.items():
        html = html.replace(token, value)

    # Clean up schema (state 5 gets FAQ + aggregateRating stripped too)
    html = clean_schema(html, row, is_state5=seo['is_state5'])

    # Strip preview mode (not needed on live pages)
    html = strip_preview_block(html)

    return html, city_slug, firm_slug, country_dir


def main():
    dry_run = '--dry-run' in sys.argv

    # Read template
    with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        template = f.read()

    # Read CSV
    with open(CSV_PATH, 'r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # Pre-compute per-country firm counts (valid rows only)
    country_counts = {}
    for row in rows:
        if row.get('name', '').strip() and row.get('city', '').strip():
            cc = row.get('country', 'GB').strip().upper()
            country_counts[cc] = country_counts.get(cc, 0) + 1

    print(f'Template: {TEMPLATE_PATH}')
    print(f'CSV:      {CSV_PATH} ({len(rows)} firms)')
    print(f'Output:   {{country}}/accounting-firms/{{city}}/{{firm}}/index.html')
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
            cc = row.get('country', 'GB').strip().upper()
            html, city_slug, firm_slug, country_dir = build_page(template, row, country_counts.get(cc, 0))
        except Exception as e:
            print(f'  ERROR row {i+2} ({name}): {e}')
            errors += 1
            continue

        out_dir  = os.path.join(country_dir, 'accounting-firms', city_slug, firm_slug)
        out_file = os.path.join(out_dir, 'index.html')

        if dry_run:
            badge = 'BADGE' if row.get('Badge', '').strip() else '     '
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
        print(f'Pages are in: uk/accounting-firms/ and au/accounting-firms/')


if __name__ == '__main__':
    main()
