#!/usr/bin/env python3
"""
Step 2 of the Australia pipeline: Google ratings for the TPB firm list.

Runs Apify's Google Maps Scraper (actor compass/crawler-google-places) for each
firm in data/au/tpb_candidates.csv (step 1), keeps only confident matches, and
adds them to accountants-template.csv as country=AU rows, plus their TPB
registration facts to workers/tpb_register.json.

A Google result is a MATCH only if:
  * its postcode equals the TPB postcode, and
  * its name agrees with the TPB trading name (one contains the other once
    normalised, or they share at least 60% of their words), and
  * it isn't marked permanently closed.
Firms need 10+ Google reviews to be listed, same rule as the UK/US data.

Usage (APIFY_TOKEN from https://console.apify.com/settings/integrations):
    export APIFY_TOKEN=apify_api_xxx
    python3 scripts/au_google_match.py --run --limit 50     # trial: 50 firms, ~US$0.25
    python3 scripts/au_google_match.py --run                # all firms (see README for cost)
    python3 scripts/au_google_match.py --apply              # write matches into the CSV

--run saves raw results to data/au/google_results.json (re-runnable; --apply
reads that file, so no second Apify charge).
"""

import argparse
import collections
import csv
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'workers'))
from import_csv_to_d1 import slugify, read_csv_text  # noqa: E402

CANDIDATES = os.path.join(ROOT, 'data', 'au', 'tpb_candidates.csv')
RESULTS = os.path.join(ROOT, 'data', 'au', 'google_results.json')
FIRMS_CSV = os.path.join(ROOT, 'accountants-template.csv')
TPB_JSON = os.path.join(ROOT, 'workers', 'tpb_register.json')
ACTOR = 'compass~crawler-google-places'
API = 'https://api.apify.com/v2'
MIN_REVIEWS = 10

_STOP = {'pty', 'ltd', 'limited', 'the', 'and', 'co', 'group', 'australia', 'trust', 'trustee', 'for', 'as', 'atf'}


def name_tokens(s):
    s = (s or '').lower().replace('&', ' and ')
    return [t for t in re.sub(r'[^a-z0-9 ]+', ' ', s).split() if t not in _STOP]


def names_agree(a, b):
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return False
    ja, jb = ' '.join(ta), ' '.join(tb)
    if ja in jb or jb in ja:
        return True
    overlap = len(set(ta) & set(tb)) / min(len(set(ta)), len(set(tb)))
    return overlap >= 0.6


# ─── Apify ───────────────────────────────────────────────────────────────────

def api(path, token, data=None):
    req = urllib.request.Request(f'{API}{path}{"&" if "?" in path else "?"}token={token}',
                                 data=json.dumps(data).encode() if data is not None else None,
                                 headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=120))


def run_apify(candidates, token):
    run = api(f'/acts/{ACTOR}/runs', token, {
        'searchStringsArray': [c['search'] for c in candidates],
        'maxCrawledPlacesPerSearch': 1,     # the best match only — keeps cost down
        'language': 'en',
        'countryCode': 'au',
        'scrapePlaceDetailPage': False,
        'skipClosedPlaces': False,
    })['data']
    print(f'Apify run {run["id"]} started for {len(candidates):,} searches — this can take a while.')
    while True:
        time.sleep(30)
        status = api(f'/actor-runs/{run["id"]}', token)['data']['status']
        print(f'  status: {status}')
        if status in ('SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'):
            break
    if status != 'SUCCEEDED':
        raise SystemExit(f'Apify run ended with {status}')
    items = api(f'/datasets/{run["defaultDatasetId"]}/items?format=json&clean=true', token)
    print(f'  {len(items):,} places returned')
    return items


# ─── Matching ────────────────────────────────────────────────────────────────

def match(candidates, items):
    by_search = collections.defaultdict(list)
    for it in items:
        by_search[(it.get('searchString') or '').strip()].append(it)
    matched, tally = [], collections.Counter()
    for c in candidates:
        hits = by_search.get(c['search'], [])
        if not hits:
            tally['no Google result'] += 1
            continue
        it = hits[0]
        pc = re.sub(r'\D', '', str(it.get('postalCode') or ''))
        if pc != c['postcode']:
            tally['different postcode'] += 1
            continue
        if not names_agree(c['name'], it.get('title')):
            tally['different name'] += 1
            continue
        if it.get('permanentlyClosed'):
            tally['permanently closed'] += 1
            continue
        if int(it.get('reviewsCount') or 0) < MIN_REVIEWS:
            tally[f'under {MIN_REVIEWS} reviews'] += 1
            continue
        loc = it.get('location') or {}
        if loc.get('lat') is None:
            tally['no map location'] += 1
            continue
        tally['matched'] += 1
        matched.append((c, it))
    return matched, tally


def apply(matched):
    """Append AU rows to accountants-template.csv and refresh workers/tpb_register.json."""
    text = read_csv_text(FIRMS_CSV)
    reader = csv.reader(text.splitlines())
    header = next(reader)
    existing = {r[header.index('place_id')] for r in reader if len(r) == len(header)}
    rows, tpb = [], {}
    if os.path.exists(TPB_JSON):
        tpb = json.load(open(TPB_JSON, encoding='utf-8'))
    for c, it in matched:
        if it.get('placeId') in existing:
            continue
        name = (it.get('title') or c['name']).strip()
        city = c['suburb']
        loc = it.get('location') or {}
        rec = {h: '' for h in header}
        rec.update({
            'place_id': it.get('placeId', ''), 'name': name, 'address': it.get('street') or c['street'],
            'country': 'AU', 'suburb': c['state'], 'city': city,
            'rating': it.get('totalScore') or '', 'reviews': it.get('reviewsCount') or 0,
            'latitude': loc.get('lat', ''), 'longitude': loc.get('lng', ''), 'postcode': c['postcode'],
            'website': it.get('website') or '',
        })
        rows.append([rec[h] if h != 'place_id' else rec['place_id'] for h in header])
        existing.add(it.get('placeId'))
        tpb[f'{slugify(city)}/{slugify(name)}'] = {
            'number': c['tpb_number'], 'type': c['type'], 'registered': c['registered'], 'checked': c['checked'],
        }
    with open(FIRMS_CSV, 'a', newline='', encoding='utf-8') as f:
        if not text.endswith('\n'):
            f.write('\n')
        csv.writer(f).writerows(rows)
    with open(TPB_JSON, 'w', encoding='utf-8') as f:
        json.dump(tpb, f, indent=1, sort_keys=True, ensure_ascii=False)
        f.write('\n')
    print(f'Added {len(rows):,} AU firms to accountants-template.csv; {len(tpb):,} TPB records in workers/tpb_register.json')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', action='store_true', help='Run the Apify scrape (needs APIFY_TOKEN)')
    ap.add_argument('--limit', type=int, help='Only the first N firms (trial run)')
    ap.add_argument('--apply', action='store_true', help='Write matches into accountants-template.csv')
    args = ap.parse_args()

    candidates = list(csv.DictReader(open(CANDIDATES, encoding='utf-8')))
    if args.limit:
        candidates = candidates[:args.limit]
    if args.run:
        token = os.environ.get('APIFY_TOKEN') or sys.exit('Set APIFY_TOKEN first (Apify → Settings → Integrations).')
        items = run_apify(candidates, token)
        with open(RESULTS, 'w', encoding='utf-8') as f:
            json.dump(items, f)
    if not os.path.exists(RESULTS):
        sys.exit('No results yet — run with --run first.')
    items = json.load(open(RESULTS, encoding='utf-8'))
    matched, tally = match(candidates, items)
    print(f'{len(candidates):,} TPB firms checked:')
    for k, v in tally.most_common():
        print(f'  {k:22} {v:6,}')
    if args.apply:
        apply(matched)


if __name__ == '__main__':
    main()
