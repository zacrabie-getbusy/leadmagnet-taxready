#!/usr/bin/env python3
"""
2027 "TaxReady Top Accountant" badge winners, per city.

Fairer than ranking by review volume (which rewards the biggest firms and
national brands): firms are ranked by a confidence-weighted rating — their
Google rating, pulled towards the city average until they have enough reviews
to trust it:

    score = (reviews × rating + PRIOR × city_avg) / (reviews + PRIOR)

So a 5.0★ firm with 40 reviews beats a 4.6★ firm with 4,000, but a 5.0★ firm
with 3 reviews doesn't beat either.

Rules (publish these on /how-firms-are-ranked/ when the badges go out):
  * eligible: rating ≥ 4.7, ≥ 25 Google reviews, an accounting practice
    (not a debt / insolvency / mortgage / app business), and in Australia a
    current Tax Practitioners Board registration
  * only cities with 8+ listed firms award badges
  * winners per city: the top 5% of listed firms, at least 1, at most 10

Writes data/badges/2027-{uk,us,au}.csv with each winner's rank, score,
website and profile URL. `needs_check` flags names worth a human glance.

Usage:
    python3 scripts/badge_winners.py            # all countries with data
    python3 scripts/badge_winners.py --year 2027
"""

import argparse
import collections
import csv
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'workers'))
from import_csv_to_d1 import load_firms, hub_slug  # noqa: E402

PRIOR = 30            # reviews' worth of "city average" every firm starts with
MIN_RATING = 4.7
MIN_REVIEWS = 25
MIN_CITY_FIRMS = 8
SHARE, MIN_WINNERS, MAX_WINNERS = 0.05, 1, 10
COUNTRY_DIR = {'GB': 'uk', 'US': 'us', 'AU': 'au'}

# Not accounting practices — excluded outright.
EXCLUDE = re.compile(r'\b(debt|insolven|bankrupt|mortgage|loans?|taxfix|taxscouts|h\s*&\s*r block|jackson hewitt|'
                     r'liberty tax|solicitors?|law firm|attorneys?|estate agents?|wealth management)\b', re.I)
# Plausibly fine, but worth a human look before a card goes out.
CHECK = re.compile(r'\b(financial planning|financial services|advisers?|advisors?|consult|wealth|insurance|'
                   r'payroll bureau|software|app)\b', re.I)


def city_label(firms):
    labels = collections.Counter(f['suburb'] if f['city'].lower() == 'other' and f['suburb'] else f['city'] for f in firms)
    return labels.most_common(1)[0][0] if labels else ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--year', default='2027')
    args = ap.parse_args()
    firms, _, _ = load_firms(os.path.join(ROOT, 'accountants-template.csv'))
    out_dir = os.path.join(ROOT, 'data', 'badges')
    os.makedirs(out_dir, exist_ok=True)

    by_country = collections.defaultdict(lambda: collections.defaultdict(list))
    for f in firms:
        cd = COUNTRY_DIR.get(f['country'])
        hub = hub_slug(f['city_slug'], f['suburb_slug'])
        if cd and hub != 'other':
            by_country[cd][hub].append(f)

    for cd, hubs in sorted(by_country.items()):
        rows = []
        for hub, members in hubs.items():
            if len(members) < MIN_CITY_FIRMS:
                continue
            rated = [m for m in members if m['rating'] and m['reviews'] > 0]
            if not rated:
                continue
            city_avg = sum(m['rating'] * m['reviews'] for m in rated) / sum(m['reviews'] for m in rated)
            eligible = [m for m in rated
                        if m['rating'] >= MIN_RATING and m['reviews'] >= MIN_REVIEWS
                        and not EXCLUDE.search(m['name'])
                        and (cd != 'au' or m.get('tpb_number'))]
            for m in eligible:
                m['_score'] = (m['reviews'] * m['rating'] + PRIOR * city_avg) / (m['reviews'] + PRIOR)
            eligible.sort(key=lambda m: (-m['_score'], -m['reviews']))
            # The CSV sometimes lists one Google business twice under two names
            # (e.g. "MSF Associates Ltd" / "M S F Associates Limited"): keep one.
            seen, unique = set(), []
            for m in eligible:
                keys = {('pid', m['place_id'])} if m['place_id'] else set()
                keys.add(('stats', m['postcode'].replace(' ', '').upper(), m['rating'], m['reviews']))
                if keys & seen:
                    continue
                seen |= keys
                unique.append(m)
            eligible = unique
            n = max(MIN_WINNERS, min(MAX_WINNERS, math.ceil(len(members) * SHARE)))
            city = city_label(members)
            for rank, m in enumerate(eligible[:n], 1):
                rows.append({
                    'country': cd.upper(), 'city': city, 'rank': rank, 'firm': m['name'],
                    'rating': m['rating'], 'reviews': m['reviews'], 'score': f"{m['_score']:.3f}",
                    'claimed': 'yes' if m['is_claimed'] else '', 'has_2026_badge': 'yes' if m['badge_url'] else '',
                    'website': m['website'],
                    'profile': f"https://taxready.me/{cd}/accounting-firms/{hub}/{m['firm_slug']}/",
                    'needs_check': 'yes' if CHECK.search(m['name']) else '',
                })
        rows.sort(key=lambda r: (r['city'], r['rank']))
        path = os.path.join(out_dir, f'{args.year}-{cd}.csv')
        if rows:
            with open(path, 'w', newline='', encoding='utf-8') as fh:
                w = csv.DictWriter(fh, fieldnames=list(rows[0]))
                w.writeheader()
                w.writerows(rows)
        cities = len({r['city'] for r in rows})
        print(f'{cd.upper()}: {len(rows):,} winners in {cities:,} cities → {os.path.relpath(path, ROOT)}'
              f'  ({sum(1 for r in rows if r["needs_check"])} flagged for a quick check)')


if __name__ == '__main__':
    main()
