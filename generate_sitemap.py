#!/usr/bin/env python3
"""
Generate sitemap.xml for the whole TaxReady site.

~7,400 URLs: UK + US country homes, master/state directories, per-country
find-accountant pages, the 9 UK tax-estimator landers, 50 US state hubs +
DC, every city hub, and 6,900+ firm profiles. Only canonical, index,follow,
200-status URLs are emitted — redirect stubs, noindex pages (incl. all of
the pre-launch /au/ site + the for-accountants pages), and the bare "/"
redirect are deliberately excluded (see STATIC_PAGES + collect_urls).
Without a sitemap Google takes weeks to crawl all of that — with one
submitted to Search Console it's days.

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

# Static pages — ONLY canonical, index,follow, 200-status URLs.
# Deliberately EXCLUDED (verified against each page's robots/canonical):
#   /                         → JS/meta redirect to /uk/ (list /uk/ instead)
#   /index.html, /uk/home/    → redirects
#   /find-accountant.html     → legacy; canonical is the country page below
#   /construction.html etc.   → the 7 root segment pages just 301 to
#                               /uk/estimate/{seg}/ — we list the destinations
#   /accountants.html         → redirects to a noindex page
#   /uk/for-accountants/,
#   /us/for-accountants/,
#   /au/* , social.html       → robots: noindex (AU is pre-launch)
STATIC_PAGES = [
    # Country homes (canonical — bare "/" only redirects here)
    ('/uk/',                          1.0, 'weekly'),
    ('/us/',                          1.0, 'weekly'),
    # Master / state directories (top of the hub hierarchy)
    ('/uk/accounting-firms/',         0.9, 'weekly'),
    ('/us/accounting-firms/',         0.9, 'weekly'),
    # AI matcher (per country)
    ('/uk/find-accountant/',          0.9, 'weekly'),
    ('/us/find-accountant/',          0.9, 'weekly'),
    # UK tax-estimator landing pages (the canonical home of the root segment
    # stubs; high-value persona SEO landers)
    ('/uk/estimate/employed/',        0.8, 'monthly'),
    ('/uk/estimate/freelancer/',      0.8, 'monthly'),
    ('/uk/estimate/landlord/',        0.8, 'monthly'),
    ('/uk/estimate/construction/',    0.8, 'monthly'),
    ('/uk/estimate/hospitality/',     0.8, 'monthly'),
    ('/uk/estimate/healthcare/',      0.8, 'monthly'),
    ('/uk/estimate/retail/',          0.8, 'monthly'),
    ('/uk/estimate/creative/',        0.8, 'monthly'),
    ('/uk/estimate/small-business/',  0.8, 'monthly'),
]

# US state codes — mirrors STATE_CODES in workers/src/render.js. A US firm's
# state lives in the CSV "suburb" column (2-letter code, e.g. "TX"). The state
# hub URL is /us/accounting-firms/{lowercase-code}/.
US_STATE_CODES = {
    'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia',
    'ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj',
    'nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt',
    'va','wa','wv','wi','wy','dc',
}


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

    # AU is pre-launch (all /au/ pages are robots:noindex) and has no rows in
    # the CSV today, so it contributes nothing. If AU launches, drop the
    # country guard below + add AU static pages above once they're indexable.
    COUNTRY_DIR = {'GB': 'uk', 'US': 'us'}
    # city_slug -> most recent lastmod date across all firms in that city
    city_dates = {}
    # us state code -> most recent lastmod date across all firms in that state
    state_dates = {}
    firm_urls = []

    for r in rows:
        name = (r.get('name') or '').strip()
        city = (r.get('city') or '').strip()
        if not name or not city:
            continue
        cc = (r.get('country') or 'GB').strip().upper()
        cd = COUNTRY_DIR.get(cc)
        if not cd:            # skip AU / unknown — not indexable yet
            continue
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

        # US firms: track most recent date per state for the state-hub URL.
        # State lives in the "suburb" column as a 2-letter code (e.g. "TX").
        if cc == 'US':
            st = (r.get('suburb') or '').strip().lower()
            if st in US_STATE_CODES:
                if st not in state_dates or lastmod > state_dates[st]:
                    state_dates[st] = lastmod

        firm_urls.append((f'{DOMAIN}/{cd}/accounting-firms/{cs}/{fs}/', lastmod))

    # US state hubs (/us/accounting-firms/{state}/) — top-level US directory
    # pages that sit between the master index and the city hubs.
    for st, state_lastmod in state_dates.items():
        urls.append((f'{DOMAIN}/us/accounting-firms/{st}/', 0.9, 'weekly', state_lastmod))

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
