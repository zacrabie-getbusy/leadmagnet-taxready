#!/usr/bin/env python3
"""
Generate sitemap.xml for the whole TaxReady site.

The directory expansion means we now have ~5,400 URLs: homepage, segment
pages, find-accountant, accountants.html, master directory, city hubs,
and 4,800+ firm profiles. Without a sitemap Google would take
weeks/months to crawl all of that — with one submitted to Search Console
it's days.

lastmod dates come from workers/firm_dates.json (written by
import_csv_to_d1.py). Firms whose content hasn't changed since the last
import keep their old date; changed firms get today. City hub dates are
the most recent date of any firm in that city. Static pages always get
today.

Inventory:
    /                                    homepage
    /construction.html                   segment pages (hospitality,
    /freelancer.html                     healthcare, etc.)
    /healthcare.html                     ...
    /hospitality.html
    /landlord.html
    /othersmallbusiness.html
    /retail.html
    /creative.html
    /find-accountant.html                AI match flow
    /accountants.html                    claim/submit flow
    /uk/                                 (country home — if exists)
    /uk/estimate/                        (UK estimator pages — if generated)
    /uk/accounting-firms/                master directory
    /uk/accounting-firms/{city}/         city hubs
    /uk/accounting-firms/{city}/{firm}/  firm profiles (4,800+)

Priorities (guidance to Google — relative, not absolute):
    1.0   homepage, master directory
    0.9   find-accountant, segment pages
    0.8   city hubs
    0.7   firm profiles
    0.5   claim page

Changefreq is intentionally conservative (weekly for data-driven pages,
monthly for static copy) — Google ignores it in practice but honest
values won't hurt.

Usage:
    python3 generate_sitemap.py           # write sitemap.xml to root
    python3 generate_sitemap.py --stdout  # print to stdout (for piping)
    python3 generate_sitemap.py --dry-run # count URLs, don't write
"""

import argparse
import csv
import datetime
import json
import os
import re
import sys
from xml.sax.saxutils import escape


DOMAIN = 'https://taxready.me'

# Static pages at the root — every hand-authored HTML we want indexed.
# /accountants.html stays in because it's the canonical claim URL even
# though it redirects to /uk/for-accountants/ — Google follows the
# redirect cleanly and the metadata carries.
STATIC_PAGES = [
    ('/',                         1.0, 'weekly'),
    ('/find-accountant.html',     0.9, 'weekly'),
    ('/uk/accounting-firms/',     1.0, 'weekly'),
    ('/us/',                      1.0, 'weekly'),
    ('/us/find-accountant/',      0.9, 'weekly'),
    ('/us/accounting-firms/',     1.0, 'weekly'),
    ('/construction.html',        0.9, 'monthly'),
    ('/creative.html',            0.9, 'monthly'),
    ('/freelancer.html',          0.9, 'monthly'),
    ('/healthcare.html',          0.9, 'monthly'),
    ('/hospitality.html',         0.9, 'monthly'),
    ('/landlord.html',            0.9, 'monthly'),
    ('/othersmallbusiness.html',  0.9, 'monthly'),
    ('/retail.html',              0.9, 'monthly'),
    ('/accountants.html',         0.5, 'monthly'),
]


def slugify(text):
    text = (text or '').lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-{2,}', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def today_iso():
    return datetime.date.today().isoformat()


def urlset_header():
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')


def urlset_footer():
    return '</urlset>\n'


def url_entry(loc, priority, changefreq, lastmod=None):
    """One <url> block. Escapes the URL defensively (no ampersands in
    our URL scheme today, but safer to always escape)."""
    lm = lastmod or today_iso()
    return (
        '  <url>\n'
        f'    <loc>{escape(loc)}</loc>\n'
        f'    <lastmod>{lm}</lastmod>\n'
        f'    <changefreq>{changefreq}</changefreq>\n'
        f'    <priority>{priority:.1f}</priority>\n'
        '  </url>\n'
    )


def load_firm_dates(root):
    """Load persisted per-firm lastmod dates from import_csv_to_d1.py output."""
    dates_path = os.path.join(root, 'workers', 'firm_dates.json')
    if os.path.exists(dates_path):
        with open(dates_path) as f:
            return json.load(f)
    return {}


def collect_urls(csv_path, root, firm_dates):
    """Build the full URL list. Returns a list of
    (url, priority, changefreq, lastmod) tuples."""
    urls = []
    today = today_iso()

    # Static pages — always use today
    for path, pri, cf in STATIC_PAGES:
        urls.append((DOMAIN + path, pri, cf, today))

    with open(csv_path, newline='', encoding='latin-1') as f:
        rows = list(csv.DictReader(f))

    COUNTRY_DIR = {'GB': 'uk', 'AU': 'au', 'US': 'us'}
    # city_slug -> most recent lastmod date across all firms in that city
    city_dates = {}
    firm_urls = []

    for r in rows:
        name = (r.get('name') or '').strip()
        city = (r.get('city') or '').strip()
        if not name or not city:
            continue
        cc = (r.get('country') or 'GB').strip().upper()
        cd = COUNTRY_DIR.get(cc, 'uk')
        cs = (r.get('city_slug') or '').strip() or slugify(city)
        fs = (r.get('firm_slug') or '').strip() or slugify(name)
        if not cs or not fs:
            continue

        firm_key = f'{cs}/{fs}'
        lastmod = firm_dates.get(firm_key, today)

        # Track the most recent date per city for the hub URL
        city_key = (cd, cs)
        if city_key not in city_dates or lastmod > city_dates[city_key]:
            city_dates[city_key] = lastmod

        firm_urls.append((f'{DOMAIN}/{cd}/accounting-firms/{cs}/{fs}/', lastmod))

    for (cd, cs), city_lastmod in city_dates.items():
        urls.append((f'{DOMAIN}/{cd}/accounting-firms/{cs}/', 0.8, 'weekly', city_lastmod))

    for firm_url, lastmod in firm_urls:
        urls.append((firm_url, 0.7, 'weekly', lastmod))

    return urls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stdout', action='store_true',
                    help='Print sitemap to stdout instead of writing file')
    ap.add_argument('--dry-run', action='store_true',
                    help='Count URLs without writing')
    args = ap.parse_args()

    root = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(root, 'accountants-template.csv')
    firm_dates = load_firm_dates(root)

    if firm_dates:
        print(f'Loaded {len(firm_dates):,} firm dates from firm_dates.json')
    else:
        print('No firm_dates.json found — all lastmod dates will be today')

    urls = collect_urls(csv_path, root, firm_dates)

    if args.dry_run:
        print(f'Total URLs: {len(urls):,}')
        pri_counts = {}
        for _, pri, _, _ in urls:
            pri_counts.setdefault(pri, 0)
            pri_counts[pri] += 1
        for pri in sorted(pri_counts.keys(), reverse=True):
            print(f'  priority {pri}: {pri_counts[pri]:,}')
        return

    xml_parts = [urlset_header()]
    for loc, pri, cf, lastmod in urls:
        xml_parts.append(url_entry(loc, pri, cf, lastmod))
    xml_parts.append(urlset_footer())
    xml_content = ''.join(xml_parts)

    if args.stdout:
        sys.stdout.write(xml_content)
        return

    out_path = os.path.join(root, 'sitemap.xml')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(xml_content)
    print(f'Wrote {out_path} ({len(urls):,} URLs, {len(xml_content) / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
