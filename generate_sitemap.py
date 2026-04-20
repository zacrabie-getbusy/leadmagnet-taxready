#!/usr/bin/env python3
"""
Generate sitemap.xml for the whole TaxReady site.

The directory expansion means we now have ~4,260 URLs: homepage, segment
pages, find-accountant, accountants.html, master directory, 242 city
hubs, and 4,000+ firm profiles. Without a sitemap Google would take
weeks/months to crawl all of that — with one submitted to Search Console
it's days.

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
    /uk/accounting-firms/{city}/         city hubs (242)
    /uk/accounting-firms/{city}/{firm}/  firm profiles (4,012)

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
import os
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import slugify  # noqa: E402


DOMAIN = 'https://taxready.me'

# Static pages at the root — every hand-authored HTML we want indexed.
# /accountants.html stays in because it's the canonical claim URL even
# though it redirects to /uk/for-accountants/ — Google follows the
# redirect cleanly and the metadata carries.
STATIC_PAGES = [
    ('/',                         1.0, 'weekly'),
    ('/find-accountant.html',     0.9, 'weekly'),
    ('/uk/accounting-firms/',     1.0, 'weekly'),
    ('/construction.html',        0.9, 'monthly'),
    ('/creative.html',            0.9, 'monthly'),
    ('/freelancer.html',          0.9, 'monthly'),
    ('/healthcare.html',          0.9, 'monthly'),
    ('/hospitality.html',         0.9, 'monthly'),
    ('/landlord.html',            0.9, 'monthly'),
    ('/othersmallbusiness.html',  0.9, 'monthly'),
    ('/retail.html',              0.9, 'monthly'),
    ('/accountants.html',         0.5, 'monthly'),  # redirect stub; still worth
                                                    # listing as canonical intent
]


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


def collect_urls(csv_path, root):
    """Build the full URL list. Returns a list of (url, priority,
    changefreq) tuples."""
    urls = []

    # Static pages first
    for path, pri, cf in STATIC_PAGES:
        urls.append((DOMAIN + path, pri, cf))

    # Firm profile pages — derived from the CSV to match generate.py
    # exactly. Uses slugify fallback the same way as the generator.
    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    COUNTRY_DIR = {'GB': 'uk', 'AU': 'au'}
    # Group by (country_dir, city_slug) to emit city hubs, while also
    # collecting firm URLs from the same pass.
    cities = {}  # (country_dir, city_slug) -> True (we only need the key set)
    firm_urls = []
    for r in rows:
        name = (r.get('name') or '').strip()
        city = (r.get('city') or '').strip()
        if not name or not city:
            continue  # same skip rule as generate.py
        cc = (r.get('country') or 'GB').strip().upper()
        cd = COUNTRY_DIR.get(cc, 'uk')
        cs = (r.get('city_slug') or '').strip() or slugify(city)
        fs = (r.get('firm_slug') or '').strip() or slugify(name)
        if not cs or not fs:
            continue
        cities[(cd, cs)] = True
        firm_urls.append(f'{DOMAIN}/{cd}/accounting-firms/{cs}/{fs}/')

    # City hubs — only include those that were actually generated
    # (i.e. a directory exists on disk). That matches the ≥3-firm
    # threshold we use when generating, without having to duplicate
    # the threshold logic here.
    for (cd, cs) in cities:
        city_page = os.path.join(root, cd, 'accounting-firms', cs, 'index.html')
        if os.path.isfile(city_page):
            urls.append((f'{DOMAIN}/{cd}/accounting-firms/{cs}/', 0.8, 'weekly'))

    # Firm profile pages — only include URLs whose generated file exists
    # (handles the 13 rows generate.py skips for missing data cleanly)
    for firm_url in firm_urls:
        # Turn URL back into filesystem path to check existence
        rel = firm_url.replace(DOMAIN, '').strip('/')
        fs_path = os.path.join(root, rel, 'index.html')
        if os.path.isfile(fs_path):
            urls.append((firm_url, 0.7, 'weekly'))

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

    urls = collect_urls(csv_path, root)

    if args.dry_run:
        print(f'Total URLs: {len(urls):,}')
        pri_counts = {}
        for _, pri, _ in urls:
            pri_counts.setdefault(pri, 0)
            pri_counts[pri] += 1
        for pri in sorted(pri_counts.keys(), reverse=True):
            print(f'  priority {pri}: {pri_counts[pri]:,}')
        return

    xml_parts = [urlset_header()]
    for loc, pri, cf in urls:
        xml_parts.append(url_entry(loc, pri, cf))
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
