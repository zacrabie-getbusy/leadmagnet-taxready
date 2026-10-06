#!/usr/bin/env python3
"""
Step 1 of the Australia pipeline: the official list of Australian tax firms.

Downloads the Tax Practitioners Board (TPB) public register from data.gov.au
(CC BY 4.0, updated regularly) and writes data/au/tpb_candidates.csv: one row
per registered firm office (organisation registrations only, status
"Registered" or "Registered - Renewal application lodged"), with the search
string used to find it on Google Maps in step 2 (scripts/au_google_match.py).

Usage:
    python3 scripts/au_tpb_candidates.py                 # tax agents only (default)
    python3 scripts/au_tpb_candidates.py --include-bas   # + BAS agents
    python3 scripts/au_tpb_candidates.py --xlsx path/to/tpb-public-register.xlsx
"""

import argparse
import csv
import datetime
import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'data', 'au')
OUT_PATH = os.path.join(OUT_DIR, 'tpb_candidates.csv')
CKAN = 'https://data.gov.au/data/api/3/action/package_search?q=%22TPB%20Public%20Register%22&rows=1'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REGISTERED = {'Registered', 'Registered - Renewal application lodged'}
STATES = {'NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'}
FIELDS = ['tpb_number', 'name', 'type', 'street', 'suburb', 'state', 'postcode', 'registered', 'checked', 'search']


def download_register(dest_dir):
    pkg = json.load(urllib.request.urlopen(CKAN, timeout=60))['result']['results'][0]
    url = next(r['url'] for r in pkg['resources'] if (r.get('url') or '').endswith('.xlsx'))
    path = os.path.join(dest_dir, os.path.basename(url))
    print(f'Downloading {os.path.basename(url)} …')
    urllib.request.urlretrieve(url, path)
    return path


def read_xlsx(path):
    """Rows of the register sheet as dicts (the workbook's first sheet is export metadata)."""
    z = zipfile.ZipFile(path)
    sheets = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d*\.xml$', n))
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        shared = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m']))
                  for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]

    def val(c):
        if c.get('t') == 'inlineStr':
            return ''.join(t.text or '' for t in c.iter('{%s}t' % NS['m']))
        v = c.find('m:v', NS)
        if v is None:
            return ''
        return shared[int(v.text)] if c.get('t') == 's' else v.text

    for name in sheets:
        rows = ET.fromstring(z.read(name)).find('m:sheetData', NS).findall('m:row', NS)
        cells = [{re.match(r'[A-Z]+', c.get('r')).group(0): val(c) for c in r.findall('m:c', NS)} for r in rows]
        header = cells[0] if cells else {}
        if 'Registration Number' in header.values():
            return [{header[k]: v for k, v in row.items() if k in header} for row in cells[1:]]
    raise SystemExit('Register sheet not found in workbook')


def excel_date(serial):
    try:
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(serial)))).isoformat()
    except (TypeError, ValueError):
        return ''


def parse_address(raw):
    """'35 BEDFORD ST\\nBENTLEY Western Australia 6102\\nAustralia' → (street, postcode)."""
    lines = [l.strip() for l in (raw or '').split('\n') if l.strip() and l.strip().lower() != 'australia']
    pc = re.search(r'\b(\d{4})\b(?!.*\b\d{4}\b)', ' '.join(lines[1:]) or ' '.join(lines))
    return (lines[0].title() if lines else ''), (pc.group(1) if pc else '')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx', help='Use a downloaded register instead of fetching the latest')
    ap.add_argument('--include-bas', action='store_true', help='Include BAS-agent firms (bookkeepers)')
    args = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    path = args.xlsx or download_register(OUT_DIR)
    m = re.search(r'(\d{1,2})-(\d{1,2})-(\d{4})', os.path.basename(path))
    checked = f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else datetime.date.today().isoformat()

    types = {'Tax Agent'} | ({'BAS Agent'} if args.include_bas else set())
    out, seen = [], set()
    for r in read_xlsx(path):
        name = (r.get('Trading Name (Agent) (Organisation)') or '').strip()
        if not name or r.get('Public Register Status') not in REGISTERED or r.get('Practitioner Type') not in types:
            continue
        state = (r.get('State') or '').strip().upper()
        street, postcode = parse_address(r.get('Business Address'))
        suburb = (r.get('City') or '').strip().title()
        if state not in STATES or not postcode or not suburb:
            continue
        key = (re.sub(r'\W+', '', name.lower()), postcode)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            'tpb_number': (r.get('Registration Number') or '').strip(),
            'name': name,
            'type': r.get('Practitioner Type'),
            'street': street,
            'suburb': suburb,
            'state': state,
            'postcode': postcode,
            'registered': excel_date(r.get('Registration Date (Agent) (Organisation)')),
            'checked': checked,
            'search': f'{name}, {suburb} {state} {postcode}, Australia',
        })

    with open(OUT_PATH, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)
    by_state = {}
    for o in out:
        by_state[o['state']] = by_state.get(o['state'], 0) + 1
    print(f'Wrote {OUT_PATH}: {len(out):,} registered firm offices ({", ".join(sorted(types))})')
    print('  by state: ' + ', '.join(f'{k} {v:,}' for k, v in sorted(by_state.items(), key=lambda x: -x[1])))


if __name__ == '__main__':
    main()
