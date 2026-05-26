#!/usr/bin/env python3
"""
Generate a SQL import file from accountants-template.csv for Cloudflare D1.

Usage:
  python workers/import_csv_to_d1.py
  wrangler d1 execute taxready-firms --file=workers/import.sql --remote

Run this whenever accountants-template.csv changes to update D1.
No page generation, no git commit required — pages are served live from D1.
"""

import csv
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


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = os.path.join(root, 'accountants-template.csv')
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'import.sql')

    if not os.path.exists(csv_path):
        print(f'ERROR: {csv_path} not found', file=sys.stderr)
        sys.exit(1)

    with open(csv_path, newline='', encoding='cp1252') as f:
        rows = list(csv.DictReader(f))

    print(f'Read {len(rows)} rows from {csv_path}')

    lines = ['DELETE FROM firms;']
    # D1 does not allow PRAGMA statements or DDL in batch execute files.
    # Schema (CREATE TABLE / indexes) is applied separately via schema.sql.
    # This file contains DELETE + INSERT OR REPLACE statements.

    skipped = 0
    written = 0
    seen_slugs = set()

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

        # Map country to direction
        country_dir = 'au' if country == 'AU' else 'uk'  # noqa: F841 (available for future use)

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

        sql = (
            f'INSERT OR REPLACE INTO firms '
            f'(place_id,name,address,country,suburb,suburb_slug,city,city_slug,firm_slug,'
            f'rating,reviews,longitude,latitude,postcode,outward_code,'
            f'flag_hospitality,flag_construction,flag_healthcare,flag_media,'
            f'flag_professional_services,flag_real_estate,'
            f'badge_url,is_claimed,specialisms,fees,client_type,focus_area,'
            f'client_portal,accreditations,bio,website,specialist_segments) VALUES ('
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
            f'{escape_sql(client_type)},'
            f'{escape_sql(focus_area)},'
            f'{client_portal},'
            f'{escape_sql(accreditations)},'
            f'{escape_sql(bio)},'
            f'{escape_sql(website)},'
            f'{escape_sql(specialist_segments)}'
            f');'
        )
        lines.append(sql)
        written += 1

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'Wrote {written} firms to {out_path} ({skipped} skipped)')
    print()
    print('Next step:')
    print(f'  wrangler d1 execute taxready-firms --file=workers/import.sql --remote')


if __name__ == '__main__':
    main()
