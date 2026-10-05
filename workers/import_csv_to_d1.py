#!/usr/bin/env python3
"""
Generate a SQL import file from accountants-template.csv for Cloudflare D1.

Usage:
  python workers/import_csv_to_d1.py
  wrangler d1 execute taxready-firms --file=workers/import.sql --remote

Run this whenever accountants-template.csv changes to update D1.
No page generation, no git commit required — pages are served live from D1.

Hash tracking: firm_hashes.json and firm_dates.json are written alongside
import.sql. They persist updated_at dates across runs so only firms whose
content actually changed get today's date — everything else keeps its old
date. Commit both files so dates survive fresh clones.

Encoding + slugs: the CSV is read as UTF-8 (BOM tolerated), falling back to
cp1252 line by line if a line isn't valid UTF-8. Slugs are pure ASCII —
accents folded (é → e), look-alike Cyrillic/Greek letters mapped to Latin,
everything else (U+FFFD, CJK, mojibake) dropped. Earlier imports read the CSV
as latin-1, which put mojibake like "ï½" into slugs; slug_redirects.json maps
every such old slug to its new URL so the Worker can 301 it. That file only
ever grows — entries are never removed.

generate_sitemap.py imports load_firms() from here so the sitemap is built
from exactly the rows (and slugs) that end up in D1.
"""

import csv
import datetime
import hashlib
import io
import json
import os
import re
import sys
import unicodedata


# ─── Reading the CSV ─────────────────────────────────────────────────────────

def read_csv_text(path):
    """CSV file → text. UTF-8 (with or without BOM); any line that isn't valid
    UTF-8 is decoded as cp1252 instead (then latin-1, which can't fail)."""
    raw = open(path, 'rb').read()
    try:
        return raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        pass
    if raw.startswith(b'\xef\xbb\xbf'):
        raw = raw[3:]
    out = []
    for line in raw.splitlines(keepends=True):
        for enc in ('utf-8', 'cp1252', 'latin-1'):
            try:
                out.append(line.decode(enc))
                break
            except UnicodeDecodeError:
                continue
    return ''.join(out)


def read_rows(path):
    return list(csv.DictReader(io.StringIO(read_csv_text(path), newline='')))


def read_rows_legacy(path):
    """The CSV as previous imports saw it (latin-1). Only used to work out
    which old slugs need a redirect."""
    with open(path, newline='', encoding='latin-1') as f:
        return list(csv.DictReader(f))


# ─── Slugs ───────────────────────────────────────────────────────────────────

# Look-alike letters NFKD can't fold (e.g. Cyrillic "а" in "Sаn Josе").
_CONFUSABLES = str.maketrans({
    'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't',
    'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l',
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
    'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
    'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O',
    'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'ο': 'o', 'ν': 'v', 'ι': 'i',
    'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'ø': 'o', 'Ø': 'O', 'œ': 'oe', 'Œ': 'OE', 'ł': 'l', 'Ł': 'L',
    'đ': 'd', 'Đ': 'D', 'þ': 'th', 'Þ': 'TH', 'ð': 'd', 'Ð': 'D',
})
# Mojibake / replacement-character artefacts that must never reach a slug.
_ARTEFACTS = re.compile('ï¿½|ï½|�')


def slugify(text):
    """ASCII slug: fold accents, map look-alikes, drop everything non-ASCII."""
    text = _ARTEFACTS.sub('', text or '')
    text = unicodedata.normalize('NFKD', text.translate(_CONFUSABLES))
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-{2,}', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def legacy_slugify(text):
    """The slugify previous imports used (Unicode \\w, no folding)."""
    text = (text or '').lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-{2,}', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


# ─── Rows → firms ────────────────────────────────────────────────────────────

COUNTRY_DIR = {'GB': 'uk', 'US': 'us', 'AU': 'au'}


def parse_bool(value):
    return 1 if (value or '').strip().upper() in ('TRUE', '1', 'YES') else 0


def escape_sql(value):
    if value is None:
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


def _slugs(row, slug_fn):
    city = (row.get('city') or '').strip()
    name = (row.get('name') or '').strip()
    suburb = (row.get('suburb') or '').strip()
    city_slug = slug_fn((row.get('city_slug') or '').strip() or city)
    firm_slug = slug_fn((row.get('firm_slug') or '').strip() or name)
    suburb_slug = slug_fn(suburb) if suburb else ''
    return city_slug, firm_slug, suburb_slug


def hub_slug(city_slug, suburb_slug):
    """The hub a firm is served under: "other"-bucket firms use their suburb."""
    return suburb_slug if city_slug == 'other' and suburb_slug else city_slug


def _num(raw, cast, default):
    raw = (raw or '').strip()
    if not raw:
        return default
    try:
        return cast(raw)
    except ValueError:
        return default


def load_firms(csv_path):
    """Deduplicated firms exactly as they are written to D1, in CSV order,
    plus {old url key: new path} for every slug the encoding fix changed.

    Each firm is a dict with the D1 column names (rating/latitude/longitude are
    None when blank, matching NULL in D1)."""
    rows = read_rows(csv_path)
    legacy = read_rows_legacy(csv_path)
    if len(legacy) != len(rows):          # can't align rows — skip redirect mapping
        legacy = [None] * len(rows)

    firms, renames, seen = [], {}, set()
    skipped = 0
    for row, old_row in zip(rows, legacy):
        name = (row.get('name') or '').strip()
        if not name:
            skipped += 1
            continue
        city_slug, firm_slug, suburb_slug = _slugs(row, slugify)
        if not city_slug or not firm_slug:
            skipped += 1
            continue
        key = (city_slug, firm_slug)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)

        country = (row.get('country') or 'GB').strip().upper()
        firm = {
            'place_id':        (row.get('place_id') or '').strip(),
            'name':            name,
            'address':         (row.get('address') or '').strip(),
            'country':         country,
            'suburb':          (row.get('suburb') or '').strip(),
            'suburb_slug':     suburb_slug,
            'city':            (row.get('city') or '').strip(),
            'city_slug':       city_slug,
            'firm_slug':       firm_slug,
            'rating':          _num(row.get('rating'), float, None),
            'reviews':         _num(row.get('reviews') or '0', int, 0),
            'longitude':       _num(row.get('longitude'), float, None),
            'latitude':        _num(row.get('latitude'), float, None),
            'postcode':        (row.get('postcode') or '').strip(),
            'outward_code':    (row.get('outward_code') or '').strip(),
            'flag_hospitality':           parse_bool(row.get('flag_hospitality')),
            'flag_construction':          parse_bool(row.get('flag_construction')),
            'flag_healthcare':            parse_bool(row.get('flag_healthcare')),
            'flag_media':                 parse_bool(row.get('flag_media')),
            'flag_professional_services': parse_bool(row.get('flag_professional_services')),
            'flag_real_estate':           parse_bool(row.get('flag_real_estate')),
            'badge_url':       (row.get('Badge') or row.get('badge') or '').strip(),
            'is_claimed':      parse_bool(row.get('claimed')),
            'specialisms':     (row.get('specialisms') or '').strip(),
            'fees':            (row.get('fees') or '').strip(),
            'differentiators': (row.get('differentiators') or '').strip(),
            'client_type':     (row.get('client_type') or '').strip(),
            'focus_area':      (row.get('focus_area') or '').strip(),
            'client_portal':   parse_bool(row.get('client_portal')),
            'accreditations':  (row.get('accreditations') or '').strip(),
            'bio':             (row.get('bio') or '').strip(),
            'website':         (row.get('website') or '').strip(),
            # Note: the column is intentionally misspelled in the CSV
            'specialist_segments': (row.get('specalist_segments') or row.get('specialist_segments') or '').strip(),
        }
        firms.append(firm)

        # Old slug (latin-1 read) → new URL, for both URL shapes the old slug
        # appeared under: the raw city ("other") and the suburb hub.
        if old_row is not None:
            o_city, o_firm, o_suburb = _slugs(old_row, legacy_slugify)
            if (o_city, o_firm, o_suburb) != (city_slug, firm_slug, suburb_slug):
                cd = COUNTRY_DIR.get(country, 'uk')
                new_path = f'/{cd}/accounting-firms/{hub_slug(city_slug, suburb_slug)}/{firm_slug}/'
                for old_city in {o_city, hub_slug(o_city, o_suburb)}:
                    renames[f'{cd}/{old_city}/{o_firm}'] = new_path

    return firms, renames, skipped


# Fields whose values determine whether a firm's content has changed.
_HASH_FIELDS = [
    'name', 'address', 'specialisms', 'bio', 'fees', 'differentiators',
    'client_type', 'focus_area', 'accreditations', 'website', 'badge_url',
    'is_claimed', 'specialist_segments',
    'flag_hospitality', 'flag_construction', 'flag_healthcare',
    'flag_media', 'flag_professional_services', 'flag_real_estate',
]


def compute_hash(values):
    raw = '|'.join(str(values.get(k, '')) for k in _HASH_FIELDS)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]


_SQL_COLUMNS = [
    'place_id', 'name', 'address', 'country', 'suburb', 'suburb_slug', 'city', 'city_slug', 'firm_slug',
    'rating', 'reviews', 'longitude', 'latitude', 'postcode', 'outward_code',
    'flag_hospitality', 'flag_construction', 'flag_healthcare', 'flag_media',
    'flag_professional_services', 'flag_real_estate',
    'badge_url', 'is_claimed', 'specialisms', 'fees', 'differentiators', 'client_type', 'focus_area',
    'client_portal', 'accreditations', 'bio', 'website', 'specialist_segments',
    'content_hash', 'updated_at',
]
_NUMERIC = {'rating', 'reviews', 'longitude', 'latitude', 'flag_hospitality', 'flag_construction',
            'flag_healthcare', 'flag_media', 'flag_professional_services', 'flag_real_estate',
            'is_claimed', 'client_portal'}


def _sql_value(col, v):
    if col in _NUMERIC:
        return 'NULL' if v is None else str(v)
    return escape_sql(v)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    workers_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(root, 'accountants-template.csv')
    out_path = os.path.join(workers_dir, 'import.sql')
    dates_path = os.path.join(workers_dir, 'firm_dates.json')
    hashes_path = os.path.join(workers_dir, 'firm_hashes.json')
    redirects_path = os.path.join(workers_dir, 'slug_redirects.json')

    if not os.path.exists(csv_path):
        print(f'ERROR: {csv_path} not found', file=sys.stderr)
        sys.exit(1)

    firms, renames, skipped = load_firms(csv_path)
    print(f'Read {len(firms) + skipped} rows from {csv_path}')

    # Load persisted hashes and dates from previous run
    old_hashes = {}
    old_dates = {}
    if os.path.exists(hashes_path):
        with open(hashes_path) as f:
            old_hashes = json.load(f)
    if os.path.exists(dates_path):
        with open(dates_path) as f:
            old_dates = json.load(f)

    today = datetime.date.today().isoformat()

    lines = ['DELETE FROM firms;']
    # D1 does not allow PRAGMA statements or DDL in batch execute files.
    # Schema (CREATE TABLE / indexes) is applied separately via schema.sql.
    # This file contains DELETE + INSERT OR REPLACE statements.

    new_hashes = {}
    new_dates = {}
    for firm in firms:
        # Determine updated_at: preserve old date if content unchanged
        firm_key = f"{firm['city_slug']}/{firm['firm_slug']}"
        hash_val = compute_hash(firm)
        if old_hashes.get(firm_key) == hash_val:
            updated_at = old_dates.get(firm_key, today)
        else:
            updated_at = today
        new_hashes[firm_key] = hash_val
        new_dates[firm_key] = updated_at

        values = dict(firm, content_hash=hash_val, updated_at=updated_at)
        lines.append(
            f'INSERT OR REPLACE INTO firms ({",".join(_SQL_COLUMNS)}) VALUES ('
            + ','.join(_sql_value(c, values[c]) for c in _SQL_COLUMNS) + ');'
        )

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    with open(hashes_path, 'w') as f:
        json.dump(new_hashes, f, indent=2, sort_keys=True)

    with open(dates_path, 'w') as f:
        json.dump(new_dates, f, indent=2, sort_keys=True)

    # Redirect map only grows: keep entries from earlier runs.
    redirects = {}
    if os.path.exists(redirects_path):
        with open(redirects_path, encoding='utf-8') as f:
            redirects = json.load(f)
    redirects.update(renames)
    with open(redirects_path, 'w', encoding='utf-8') as f:
        json.dump(redirects, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write('\n')

    print(f'Wrote {len(firms)} firms to {out_path} ({skipped} skipped)')
    print(f'Updated {dates_path} and {hashes_path}')
    print(f'{len(redirects)} slug redirects in {redirects_path}')
    print()
    print('Next steps:')
    print(f'  wrangler d1 execute taxready-firms --file=workers/import.sql --remote')
    print(f'  python generate_sitemap.py')


if __name__ == '__main__':
    main()
