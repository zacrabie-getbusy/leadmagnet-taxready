#!/usr/bin/env python3
"""
Match UK firms to Companies House and save the facts we publish on profiles.

Writes workers/companies_house.json: {"{city_slug}/{firm_slug}": {...facts}}.
import_csv_to_d1.py merges it into D1 (ch_* columns) and generate_sitemap.py
uses it for the index rule, so re-run this, then the import, then the sitemap.

Data source: Companies House "Free Company Data Product", a free monthly
snapshot of every UK company (no API key):
    https://download.companieshouse.gov.uk/en_output.html
    → BasicCompanyDataAsOneFile-YYYY-MM-DD.zip (~500 MB zipped, ~2.8 GB unzipped)

Only facts we're sure of are kept:
  * a CERTAIN match: the firm's name equals the company name once normalised
    (Ltd/Limited, &/and, punctuation, case) AND the full postcode on our listing
    equals the registered-office postcode. Exactly one company must qualify.
  * the company is Active (dissolved / striking-off / liquidation are dropped)
  * the latest-accounts date is kept only if the accounts aren't overdue
Director / officer names are never collected.

Usage:
    python3 scripts/enrich_companies_house.py --download          # fetch latest snapshot, then match
    python3 scripts/enrich_companies_house.py path/to/BasicCompanyDataAsOneFile-2026-10-01.csv
    python3 scripts/enrich_companies_house.py ... --dry-run       # report only, write nothing
"""

import argparse
import collections
import csv
import datetime
import io
import json
import os
import re
import sys
import tempfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'workers'))
from import_csv_to_d1 import load_firms  # noqa: E402

OUT_PATH = os.path.join(ROOT, 'workers', 'companies_house.json')
INDEX_URL = 'https://download.companieshouse.gov.uk/en_output.html'

_SUFFIX = re.compile(r'\b(limited|ltd|llp|plc|l\.l\.p|lp|company|co|the|uk|u\.k)\b')


def norm_name(s):
    s = (s or '').lower().replace('&', ' and ').replace('+', ' and ')
    s = re.sub(r"[’'`]", '', s)
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    s = _SUFFIX.sub(' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def norm_postcode(s):
    return re.sub(r'\s+', '', (s or '').upper())


def iso_date(ddmmyyyy):
    """Companies House dates are DD/MM/YYYY; '' if blank or malformed."""
    try:
        return datetime.datetime.strptime(ddmmyyyy.strip(), '%d/%m/%Y').date().isoformat()
    except ValueError:
        return ''


def download_latest():
    html = urllib.request.urlopen(INDEX_URL, timeout=60).read().decode('utf-8', 'replace')
    name = re.search(r'BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip', html).group(0)
    tmp = tempfile.mkdtemp(prefix='companies-house-')
    zpath = os.path.join(tmp, name)
    print(f'Downloading {name} (~500 MB) …')
    urllib.request.urlretrieve(f'https://download.companieshouse.gov.uk/{name}', zpath)
    with zipfile.ZipFile(zpath) as z:
        csv_name = z.namelist()[0]
        z.extract(csv_name, tmp)
    os.remove(zpath)
    return os.path.join(tmp, csv_name)


def snapshot_date(path):
    m = re.search(r'(\d{4}-\d{2}-\d{2})', os.path.basename(path))
    return m.group(1) if m else datetime.date.today().isoformat()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv', nargs='?', help='Unzipped BasicCompanyDataAsOneFile CSV')
    ap.add_argument('--download', action='store_true', help='Download the latest snapshot first')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    if not args.csv and not args.download:
        ap.error('give the snapshot CSV path, or --download')
    ch_csv = download_latest() if args.download else args.csv
    checked = snapshot_date(ch_csv)

    firms, _, _ = load_firms(os.path.join(ROOT, 'accountants-template.csv'))
    uk = [f for f in firms if f['country'] == 'GB' and norm_name(f['name']) and norm_postcode(f['postcode'])]
    wanted = {norm_name(f['name']) for f in uk}

    # One pass over the register, keeping companies whose name we might need.
    by_name = collections.defaultdict(list)
    with open(ch_csv, newline='', encoding='utf-8', errors='replace') as fh:
        rd = csv.reader(fh)
        hdr = [h.strip() for h in next(rd)]
        ix = {h: i for i, h in enumerate(hdr)}
        sic_cols = [ix[f'SICCode.SicText_{i}'] for i in range(1, 5)]
        for row in rd:
            if len(row) < len(hdr):
                continue
            n = norm_name(row[ix['CompanyName']])
            if n not in wanted:
                continue
            by_name[n].append({
                'number':        row[ix['CompanyNumber']].strip(),
                'postcode':      norm_postcode(row[ix['RegAddress.PostCode']]),
                'status':        row[ix['CompanyStatus']].strip(),
                'category':      row[ix['CompanyCategory']].strip(),
                'incorporated':  iso_date(row[ix['IncorporationDate']]),
                'accounts_made_up': iso_date(row[ix['Accounts.LastMadeUpDate']]),
                'accounts_next_due': iso_date(row[ix['Accounts.NextDueDate']]),
                # "69201 - Accounting and audit" → "Accounting and audit"
                'activities': [re.sub(r'^\d+\s*-\s*', '', row[k]).strip() for k in sic_cols
                               if row[k].strip() and not row[k].strip().lower().startswith('none')],
            })

    out, tally = {}, collections.Counter()
    for f in uk:
        same_pc = [c for c in by_name.get(norm_name(f['name']), []) if c['postcode'] == norm_postcode(f['postcode'])]
        if len(same_pc) != 1:
            tally['no certain match'] += 1
            continue
        c = same_pc[0]
        if c['status'] != 'Active':
            tally[f'skipped: {c["status"]}'] += 1
            continue
        overdue = bool(c['accounts_next_due']) and c['accounts_next_due'] < checked
        out[f"{f['city_slug']}/{f['firm_slug']}"] = {
            'number':       c['number'],
            'category':     c['category'],
            'incorporated': c['incorporated'],
            'accounts_made_up': '' if overdue else c['accounts_made_up'],
            'activities':   c['activities'][:3],
            'checked':      checked,
        }
        tally['published'] += 1

    print(f'Companies House snapshot {checked}: {len(uk):,} UK firms with a postcode')
    for k, v in tally.most_common():
        print(f'  {k:28} {v:6,}')
    if args.dry_run:
        return
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write('\n')
    print(f'Wrote {OUT_PATH} ({len(out):,} firms)')


if __name__ == '__main__':
    main()
