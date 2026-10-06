#!/usr/bin/env python3
"""
Generate the taxready.me sitemap and refresh the UK master directory page.

sitemap.xml is a sitemap index pointing at:
    sitemap-core.xml          country homes (= the map search), directories,
                              for-accountants, UK tax-estimator landers,
                              about + ranking-method pages
    sitemap-uk-hubs.xml       UK city hubs with 3+ firms
    sitemap-uk-profiles.xml   indexable UK firm profiles
    sitemap-us-hubs.xml       US state hubs + US city hubs with 3+ firms
    sitemap-us-profiles.xml   indexable US firm profiles

Only 200, self-canonical, indexable URLs are listed, decided by the same rules
the Worker uses for index/noindex — workers/src/render.js isProfileIndexable()
and hubTier(), mirrored EXACTLY below (is_profile_indexable / hub_tier). Change
both together; scripts/check_sitemap_parity.py checks them against
`wrangler dev`. Never listed: /other/ URLs, AU (pre-launch, noindex), legacy
and redirecting URLs, query-string URLs, noindex profiles, 1–2-firm hubs.

Firms come from import_csv_to_d1.load_firms(), i.e. exactly the rows and slugs
written to D1.

lastmod: per firm from workers/firm_dates.json (written by
import_csv_to_d1.py); a hub's lastmod is the newest date among its firms;
static pages use the date of their last git commit.

The marked blocks in uk/accounting-firms/index.html (headline counts, the A–Z
list of indexable UK hubs and its ItemList schema) are rewritten from the same
data, so the static master directory can't drift from D1.

Usage:
    python3 generate_sitemap.py            # write sitemaps + refresh directory page
    python3 generate_sitemap.py --dry-run  # print counts, write nothing
"""

import argparse
import datetime
import html
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'workers'))
from import_csv_to_d1 import load_firms, hub_slug  # noqa: E402

DOMAIN = 'https://taxready.me'
COUNTRY_DIR = {'GB': 'uk', 'US': 'us'}    # AU is pre-launch (noindex) — never listed

# ─── Index rules — mirror of workers/src/render.js ──────────────────────────
WORD_SPLIT = re.compile(r'[ \t\n\r\f\v\u00a0]+')
MIN_BIO_WORDS = 25
HUB_BEST_MIN = 8
HUB_INDEX_MIN = 3


def has_text(s):
    return any(WORD_SPLIT.split(s or ''))


def bio_word_count(bio):
    return len([w for w in WORD_SPLIT.split(bio or '') if w])


def is_profile_indexable(firm):
    """Claimed, OR (specialisms OR website) AND (bio >= 25 words OR Companies House record)."""
    if hub_slug(firm['city_slug'], firm['suburb_slug']) == 'other':
        return False
    if firm['is_claimed'] == 1:
        return True
    if not (has_text(firm['specialisms']) or has_text(firm['website'])):
        return False
    return bio_word_count(firm['bio']) >= MIN_BIO_WORDS or has_text(firm.get('ch_number', ''))


def hub_tier(firm_count):
    if firm_count >= HUB_BEST_MIN:
        return 'best'
    if firm_count >= HUB_INDEX_MIN:
        return 'index'
    return 'noindex'


# Hub paths the Worker 301s instead of serving (LEGACY_301 in workers/src/index.js).
REDIRECTED_HUBS = {('uk', 'essex'), ('uk', 'other'), ('us', 'other')}

# US state codes — mirrors STATE_CODES in workers/src/render.js. A US firm's
# state lives in the "suburb" column; /us/accounting-firms/{code}/ is a state
# hub, so a city hub can never use one of these slugs.
US_STATE_CODES = {
    'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia',
    'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
    'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt',
    'va', 'wa', 'wv', 'wi', 'wy', 'dc',
}

# Static (GitHub Pages) pages: path → file whose last commit date is lastmod.
STATIC_PAGES = [
    ('/uk/',                         'uk/index.html'),
    ('/us/',                         'us/index.html'),
    ('/uk/accounting-firms/',        'uk/accounting-firms/index.html'),
    ('/uk/for-accountants/',         'uk/for-accountants/index.html'),
    ('/us/for-accountants/',         'us/for-accountants/index.html'),
    ('/uk/estimate/employed/',       'uk/estimate/employed/index.html'),
    ('/uk/estimate/freelancer/',     'uk/estimate/freelancer/index.html'),
    ('/uk/estimate/landlord/',       'uk/estimate/landlord/index.html'),
    ('/uk/estimate/construction/',   'uk/estimate/construction/index.html'),
    ('/uk/estimate/hospitality/',    'uk/estimate/hospitality/index.html'),
    ('/uk/estimate/healthcare/',     'uk/estimate/healthcare/index.html'),
    ('/uk/estimate/retail/',         'uk/estimate/retail/index.html'),
    ('/uk/estimate/creative/',       'uk/estimate/creative/index.html'),
    ('/uk/estimate/small-business/', 'uk/estimate/small-business/index.html'),
    ('/about/',                      'about/index.html'),
    ('/how-firms-are-ranked/',       'how-firms-are-ranked/index.html'),
]

DIRECTORY_PAGE = os.path.join(ROOT, 'uk', 'accounting-firms', 'index.html')


def today_iso():
    return datetime.date.today().isoformat()


def git_date(rel_path):
    """Date of the last commit touching a file (falls back to its mtime)."""
    try:
        out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', rel_path], cwd=ROOT,
                             capture_output=True, text=True, timeout=10).stdout.strip()
        if out:
            return out
    except (OSError, subprocess.SubprocessError):
        pass
    path = os.path.join(ROOT, rel_path)
    if os.path.exists(path):
        return datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()
    return today_iso()


def load_firm_dates():
    path = os.path.join(ROOT, 'workers', 'firm_dates.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def hub_display_name(firms):
    """Same choice as render.js buildCityPage: the most common place label."""
    labels = Counter()
    for f in firms:
        label = f['suburb'] if f['city'].lower() == 'other' and f['suburb'] else f['city']
        if label:
            labels[label] += 1
    return labels.most_common(1)[0][0] if labels else ''


def collect(firms, firm_dates):
    """→ (urls by sitemap name, uk hub records for the directory page)."""
    today = today_iso()
    urls = defaultdict(list)          # sitemap name → [(loc, lastmod)]
    hubs = defaultdict(list)          # (dir, hub slug) → [firm]
    states = defaultdict(str)         # us state code → newest lastmod
    seen_profiles = set()

    for f in firms:
        cd = COUNTRY_DIR.get(f['country'])
        if not cd or not f['city']:
            continue
        hub = hub_slug(f['city_slug'], f['suburb_slug'])
        if hub == 'other':
            continue
        f['_lastmod'] = firm_dates.get(f"{f['city_slug']}/{f['firm_slug']}", today)
        hubs[(cd, hub)].append(f)
        if cd == 'us':
            st = f['suburb'].lower()
            if st in US_STATE_CODES and f['_lastmod'] > states[st]:
                states[st] = f['_lastmod']
        # The Worker serves the first row (lowest id = CSV order) for a URL.
        key = (cd, hub, f['firm_slug'])
        if key in seen_profiles:
            continue
        seen_profiles.add(key)
        if is_profile_indexable(f):
            urls[f'{cd}-profiles'].append((f'{DOMAIN}/{cd}/accounting-firms/{hub}/{f["firm_slug"]}/', f['_lastmod']))

    for (cd, hub), members in hubs.items():
        if (cd, hub) in REDIRECTED_HUBS or (cd == 'us' and hub in US_STATE_CODES):
            continue
        if hub_tier(len(members)) == 'noindex':
            continue
        urls[f'{cd}-hubs'].append((f'{DOMAIN}/{cd}/accounting-firms/{hub}/', max(m['_lastmod'] for m in members)))

    for st, lastmod in states.items():
        urls['us-hubs'].append((f'{DOMAIN}/us/accounting-firms/{st}/', lastmod))

    newest = {cd: max((d for _, d in urls[f'{cd}-profiles'] + urls[f'{cd}-hubs']), default=today) for cd in ('uk', 'us')}
    for path, rel in STATIC_PAGES:
        urls['core'].append((DOMAIN + path, git_date(rel)))
    # Worker-rendered US state index: as fresh as the newest US firm.
    urls['core'].append((f'{DOMAIN}/us/accounting-firms/', newest['us']))

    uk_hubs = []
    for (cd, hub), members in hubs.items():
        if cd != 'uk' or (cd, hub) in REDIRECTED_HUBS or hub_tier(len(members)) == 'noindex':
            continue
        rated = [m for m in members if m['reviews'] > 0 and m['rating']]
        uk_hubs.append({
            'slug': hub,
            'name': hub_display_name(members),
            'count': len(members),
            'rating': sum(m['rating'] for m in rated) / len(rated) if rated else 0,
        })
    uk_hubs.sort(key=lambda h: h['name'].lower())
    return urls, uk_hubs


# ─── Writing ─────────────────────────────────────────────────────────────────

SITEMAPS = ['core', 'uk-hubs', 'uk-profiles', 'us-hubs', 'us-profiles']


def urlset(entries):
    body = ''.join(f'  <url><loc>{escape(loc)}</loc><lastmod>{lm}</lastmod></url>\n'
                   for loc, lm in sorted(entries))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '</urlset>\n')


def sitemap_index(urls):
    body = ''.join(
        f'  <sitemap><loc>{DOMAIN}/sitemap-{name}.xml</loc>'
        f'<lastmod>{max(lm for _, lm in urls[name])}</lastmod></sitemap>\n'
        for name in SITEMAPS if urls[name])
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '</sitemapindex>\n')


def refresh_directory_page(firms, uk_hubs):
    """Rewrite the generated parts of uk/accounting-firms/index.html."""
    uk = [f for f in firms if f['country'] == 'GB']
    rated = [f for f in uk if f['reviews'] > 0 and f['rating']]
    top5 = sorted(uk_hubs, key=lambda h: -h['count'])[:5]
    values = {
        'firms':   f'{len(uk):,}',
        'hubs':    f'{len(uk_hubs):,}',
        'rating':  f'{sum(f["rating"] for f in rated) / len(rated):.1f}' if rated else '—',
        'reviews': f'{sum(f["reviews"] for f in uk):,}',
        'top5':    ', '.join(html.escape(h['name']) for h in top5),
    }
    with open(DIRECTORY_PAGE, encoding='utf-8') as f:
        page = f.read()

    page = re.sub(r'<!--dir:(\w+)-->.*?<!--/dir-->',
                  lambda m: f'<!--dir:{m.group(1)}-->{values[m.group(1)]}<!--/dir-->', page)

    def tile(h):
        meta = f'{h["count"]:,} firms'
        if h['rating']:
            meta += f' &middot; <span class="dr-tile-rating">{h["rating"]:.1f}&#9733;</span>'
        name = html.escape(h['name'])
        return (f'    <a class="dr-tile" href="/uk/accounting-firms/{h["slug"]}/" data-city-name="{name}">'
                f'<h3 class="dr-tile-name">{name}</h3><div class="dr-tile-meta">{meta}</div></a>\n')
    grid = '<!-- DIR-GRID START (generated by generate_sitemap.py) -->\n' + ''.join(tile(h) for h in uk_hubs) + '    <!-- DIR-GRID END -->'
    page, n = re.subn(r'<!-- DIR-GRID START[^>]*-->[\s\S]*?<!-- DIR-GRID END -->', lambda _: grid, page)
    assert n == 1, 'DIR-GRID markers missing from uk/accounting-firms/index.html'

    canonical = f'{DOMAIN}/uk/accounting-firms/'
    schema = {
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': f'{DOMAIN}/uk/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'UK accounting firms', 'item': canonical}]},
            {'@type': 'CollectionPage', '@id': canonical + '#page', 'url': canonical,
             'name': 'UK Accounting Firms Directory',
             'description': 'Compare UK accounting firms town by town. Ranked by Google reviews + profile strength.',
             'datePublished': '2026-04-01', 'dateModified': today_iso(), 'inLanguage': 'en-GB',
             'isPartOf': {'@type': 'WebSite', 'name': 'TaxReady', 'url': f'{DOMAIN}/'},
             'breadcrumb': {'@id': canonical + '#breadcrumb'},
             'mainEntity': {'@id': canonical + '#list'}},
            {'@type': 'ItemList', '@id': canonical + '#list',
             'name': 'UK towns and cities with accounting firms listed',
             'numberOfItems': len(uk_hubs),
             'itemListOrder': 'https://schema.org/ItemListOrderAscending',
             'itemListElement': [
                 {'@type': 'ListItem', 'position': i + 1, 'item': {
                     '@type': 'Place', 'name': h['name'], 'url': f'{canonical}{h["slug"]}/',
                     'address': {'@type': 'PostalAddress', 'addressLocality': h['name'], 'addressCountry': 'GB'}}}
                 for i, h in enumerate(uk_hubs)]},
        ],
    }
    ld = json.dumps(schema, indent=2, ensure_ascii=False).replace('<', '\\u003c')
    page, n = re.subn(r'<script type="application/ld\+json">[\s\S]*?</script>',
                      lambda _: f'<script type="application/ld+json">\n{ld}\n</script>', page, count=1)
    assert n == 1, 'ld+json block missing from uk/accounting-firms/index.html'

    with open(DIRECTORY_PAGE, 'w', encoding='utf-8') as f:
        f.write(page)
    return values


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='Print counts without writing anything')
    args = ap.parse_args()

    firm_dates = load_firm_dates()
    print(f'Loaded {len(firm_dates):,} firm dates from firm_dates.json' if firm_dates
          else 'No firm_dates.json found — firm lastmod dates will be today')
    firms, _, _ = load_firms(os.path.join(ROOT, 'accountants-template.csv'))
    urls, uk_hubs = collect(firms, firm_dates)

    total = sum(len(urls[n]) for n in SITEMAPS)
    for name in SITEMAPS:
        print(f'  sitemap-{name}.xml'.ljust(30) + f'{len(urls[name]):>6,} URLs')
    print(f'  {"total".ljust(28)}{total:>6,} URLs')
    if args.dry_run:
        return

    for name in SITEMAPS:
        with open(os.path.join(ROOT, f'sitemap-{name}.xml'), 'w', encoding='utf-8') as f:
            f.write(urlset(urls[name]))
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(sitemap_index(urls))
    print(f'Wrote sitemap.xml (index of {len([n for n in SITEMAPS if urls[n]])} sitemaps)')

    values = refresh_directory_page(firms, uk_hubs)
    print(f'Refreshed uk/accounting-firms/index.html: {values["hubs"]} hubs A–Z, {values["firms"]} UK firms')


if __name__ == '__main__':
    main()
