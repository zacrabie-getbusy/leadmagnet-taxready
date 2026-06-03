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
"""

import csv
import datetime
import hashlib
import json
import os
import re
import sys


def slugify(text):
    text = (text or '').lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-{2,}', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def parse_bool(value):
    return 1 if (value or '').strip().upper() in ('TRUE', '1', 'YES') else 0


def escape_sql(value):
    if value is None:
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


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


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    workers_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(root, 'accountants-template.csv')
    out_path = os.path.join(workers_dir, 'import.sql')
    dates_path = os.path.join(workers_dir, 'firm_dates.json')
    hashes_path = os.path.join(workers_dir, 'firm_hashes.json')

    if not os.path.exists(csv_path):
        print(f'ERROR: {csv_path} not found', file=sys.stderr)
        sys.exit(1)

    with open(csv_path, newline='', encoding='latin-1') as f:
        rows = list(csv.DictReader(f))

    print(f'Read {len(rows)} rows from {csv_path}')

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

    skipped = 0
    written = 0
    seen_slugs = set()
    new_hashes = {}
    new_dates = {}

    for row in rows:
        name = (row.get('name') or '').strip()
        if not name:
            skipped += 1
            continue

        city = (row.get('city') or '').strip()
        suburb = (row.get('suburb') or '').strip()
        country = (row.get('country') or 'GB').strip().upper()

        city_slug = (row.get('city_slug') or '').strip() or slugify(city)
        firm_slug = (row.get('firm_slug') or '').strip() or slugify(name)
        suburb_slug = slugify(suburb) if suburb else ''

        if not city_slug or not firm_slug:
            skipped += 1
            continue

        key = (city_slug, firm_slug)
        if key in seen_slugs:
            skipped += 1
            continue
        seen_slugs.add(key)

        place_id = (row.get('place_id') or '').strip()
        address = (row.get('address') or '').strip()
        rating_raw = (row.get('rating') or '').strip()
        reviews_raw = (row.get('reviews') or '0').strip()
        try:
            rating = float(rating_raw) if rating_raw else 'NULL'
        except ValueError:
            rating = 'NULL'
        try:
            reviews = int(reviews_raw) if reviews_raw else 0
        except ValueError:
            reviews = 0

        lat_raw = (row.get('latitude') or '').strip()
        lng_raw = (row.get('longitude') or '').strip()
        try:
            lat = float(lat_raw) if lat_raw else 'NULL'
        except ValueError:
            lat = 'NULL'
        try:
            lng = float(lng_raw) if lng_raw else 'NULL'
        except ValueError:
            lng = 'NULL'

        postcode = (row.get('postcode') or '').strip()
        outward = (row.get('outward_code') or '').strip()
        badge_url = (row.get('Badge') or row.get('badge') or '').strip()
        is_claimed = parse_bool(row.get('claimed'))
        specialisms = (row.get('specialisms') or '').strip()
        fees = (row.get('fees') or '').strip()
        differentiators = (row.get('differentiators') or '').strip()
        client_type = (row.get('client_type') or '').strip()
        focus_area = (row.get('focus_area') or '').strip()
        client_portal = parse_bool(row.get('client_portal'))
        accreditations = (row.get('accreditations') or '').strip()
        bio = (row.get('bio') or '').strip()
        website = (row.get('website') or '').strip()
        # Note: the column is intentionally misspelled in the CSV
        specialist_segments = (row.get('specalist_segments') or row.get('specialist_segments') or '').strip()

        flag_hospitality = parse_bool(row.get('flag_hospitality'))
        flag_construction = parse_bool(row.get('flag_construction'))
        flag_healthcare = parse_bool(row.get('flag_healthcare'))
        flag_media = parse_bool(row.get('flag_media'))
        flag_professional_services = parse_bool(row.get('flag_professional_services'))
        flag_real_estate = parse_bool(row.get('flag_real_estate'))

        # Determine updated_at: preserve old date if content unchanged
        firm_key = f'{city_slug}/{firm_slug}'
        hash_val = compute_hash({
            'name': name, 'address': address, 'specialisms': specialisms,
            'bio': bio, 'fees': fees, 'differentiators': differentiators,
            'client_type': client_type, 'focus_area': focus_area,
            'accreditations': accreditations, 'website': website, 'badge_url': badge_url,
            'is_claimed': is_claimed, 'specialist_segments': specialist_segments,
            'flag_hospitality': flag_hospitality, 'flag_construction': flag_construction,
            'flag_healthcare': flag_healthcare, 'flag_media': flag_media,
            'flag_professional_services': flag_professional_services,
            'flag_real_estate': flag_real_estate,
        })
        if old_hashes.get(firm_key) == hash_val:
            updated_at = old_dates.get(firm_key, today)
        else:
            updated_at = today

        new_hashes[firm_key] = hash_val
        new_dates[firm_key] = updated_at

        sql = (
            f'INSERT OR REPLACE INTO firms '
            f'(place_id,name,address,country,suburb,suburb_slug,city,city_slug,firm_slug,'
            f'rating,reviews,longitude,latitude,postcode,outward_code,'
            f'flag_hospitality,flag_construction,flag_healthcare,flag_media,'
            f'flag_professional_services,flag_real_estate,'
            f'badge_url,is_claimed,specialisms,fees,differentiators,client_type,focus_area,'
            f'client_portal,accreditations,bio,website,specialist_segments,'
            f'content_hash,updated_at) VALUES ('
            f'{escape_sql(place_id)},'
            f'{escape_sql(name)},'
            f'{escape_sql(address)},'
            f'{escape_sql(country)},'
            f'{escape_sql(suburb)},'
            f'{escape_sql(suburb_slug)},'
            f'{escape_sql(city)},'
            f'{escape_sql(city_slug)},'
            f'{escape_sql(firm_slug)},'
            f'{rating},'
            f'{reviews},'
            f'{lng},'
            f'{lat},'
            f'{escape_sql(postcode)},'
            f'{escape_sql(outward)},'
            f'{flag_hospitality},'
            f'{flag_construction},'
            f'{flag_healthcare},'
            f'{flag_media},'
            f'{flag_professional_services},'
            f'{flag_real_estate},'
            f'{escape_sql(badge_url)},'
            f'{is_claimed},'
            f'{escape_sql(specialisms)},'
            f'{escape_sql(fees)},'
            f'{escape_sql(differentiators)},'
            f'{escape_sql(client_type)},'
            f'{escape_sql(focus_area)},'
            f'{client_portal},'
            f'{escape_sql(accreditations)},'
            f'{escape_sql(bio)},'
            f'{escape_sql(website)},'
            f'{escape_sql(specialist_segments)},'
            f'{escape_sql(hash_val)},'
            f'{escape_sql(updated_at)}'
            f');'
        )
        lines.append(sql)
        written += 1

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    with open(hashes_path, 'w') as f:
        json.dump(new_hashes, f, indent=2, sort_keys=True)

    with open(dates_path, 'w') as f:
        json.dump(new_dates, f, indent=2, sort_keys=True)

    print(f'Wrote {written} firms to {out_path} ({skipped} skipped)')
    print(f'Updated {dates_path} and {hashes_path}')
    print()
    print('Next steps:')
    print(f'  wrangler d1 execute taxready-firms --file=workers/import.sql --remote')
    print(f'  python generate_sitemap.py')


if __name__ == '__main__':
    main()
