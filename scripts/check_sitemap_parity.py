#!/usr/bin/env python3
"""
Check that the sitemap and the Worker agree on what is indexable.

Samples URLs from the Worker-served sitemaps (hubs + profiles) and profile URLs
that are NOT in the sitemap, requests them from a running `wrangler dev`, and
asserts:
  * every sitemap URL returns 200, `index` robots and a self-referencing canonical
  * every non-sitemap profile returns 200 with `noindex`

Static pages in sitemap-core.xml are served by GitHub Pages, which wrangler dev
can't render, so they're not sampled.

Usage (local D1 loaded with workers/import.sql):
    cd workers && npx wrangler dev          # in another terminal
    python3 scripts/check_sitemap_parity.py [--base http://localhost:8787] [--n 200] [--seed 1]
"""

import argparse
import os
import random
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'workers'))
from import_csv_to_d1 import load_firms, hub_slug  # noqa: E402

DOMAIN = 'https://taxready.me'
WORKER_SITEMAPS = ['sitemap-uk-hubs.xml', 'sitemap-uk-profiles.xml', 'sitemap-us-hubs.xml', 'sitemap-us-profiles.xml']
COUNTRY_DIR = {'GB': 'uk', 'US': 'us'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def fetch(url):
    try:
        with OPENER.open(url, timeout=30) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''
    except OSError as e:
        return 0, str(e)


def robots(html):
    m = re.search(r'<meta name="robots" content="([^"]+)"', html)
    return m.group(1) if m else ''


def canonical(html):
    m = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    return m.group(1) if m else ''


def sitemap_locs():
    locs = []
    for name in WORKER_SITEMAPS:
        with open(os.path.join(ROOT, name), encoding='utf-8') as f:
            locs += re.findall(r'<loc>([^<]+)</loc>', f.read())
    return locs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:8787')
    ap.add_argument('--n', type=int, default=200, help='URLs to sample from each side')
    ap.add_argument('--seed', type=int, default=1)
    args = ap.parse_args()
    rnd = random.Random(args.seed)

    in_sitemap = sitemap_locs()
    listed = set(in_sitemap)
    firms, _, _ = load_firms(os.path.join(ROOT, 'accountants-template.csv'))
    profiles = set()
    for f in firms:
        cd = COUNTRY_DIR.get(f['country'])
        hub = hub_slug(f['city_slug'], f['suburb_slug'])
        if cd and hub != 'other':
            profiles.add(f'{DOMAIN}/{cd}/accounting-firms/{hub}/{f["firm_slug"]}/')
    not_listed = sorted(profiles - listed)

    sample_in = rnd.sample(in_sitemap, min(args.n, len(in_sitemap)))
    sample_out = rnd.sample(not_listed, min(args.n, len(not_listed)))
    print(f'Sitemap (Worker-served) URLs: {len(in_sitemap):,}   profiles not in sitemap: {len(not_listed):,}')
    print(f'Sampling {len(sample_in)} + {len(sample_out)} against {args.base}')

    def check(url, expect_index):
        status, html = fetch(url.replace(DOMAIN, args.base))
        rb, cn = robots(html), canonical(html)
        if expect_index:
            ok = status == 200 and rb.startswith('index') and cn == url
        else:
            ok = status == 200 and rb.startswith('noindex')
        return ok, url, status, rb, cn

    with ThreadPoolExecutor(max_workers=8) as pool:
        res_in = list(pool.map(lambda u: check(u, True), sample_in))
        res_out = list(pool.map(lambda u: check(u, False), sample_out))

    failures = [r for r in res_in + res_out if not r[0]]
    print(f'  sitemap URLs     → 200 + index + self-canonical: {sum(r[0] for r in res_in)}/{len(res_in)}')
    print(f'  non-sitemap URLs → 200 + noindex:                {sum(r[0] for r in res_out)}/{len(res_out)}')
    for _, url, status, rb, cn in failures[:20]:
        print(f'  FAIL {status} robots="{rb}" canonical={cn}  {url}')
    if failures:
        print(f'FAILED: {len(failures)} mismatches')
        sys.exit(1)
    print('PASS')


if __name__ == '__main__':
    main()
