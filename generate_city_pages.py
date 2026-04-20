#!/usr/bin/env python3
"""
Generate city hub pages for the UK accountant directory.

Each page sits at /uk/accounting-firms/{city_slug}/index.html and ranks
all firms in that city by a hybrid score (log(reviews) × rating) so
quality AND quantity both count. Includes:

  - LocalBusiness ItemList schema (big SEO signal — rich results)
  - BreadcrumbList + CollectionPage schema
  - Unique auto-generated "About the city" paragraph (prevents thin-content
    penalty)
  - AI-match CTA → /uk/find-accountant/?city={slug}
  - Nearby cities chips (internal linking + user utility)

Usage:
  python3 generate_city_pages.py                     # generate all UK cities with >= 3 firms
  python3 generate_city_pages.py --city manchester   # generate single city (PROOF MODE)
  python3 generate_city_pages.py --dry-run           # list what would be generated
  python3 generate_city_pages.py --min-firms 10      # raise firm threshold
"""

import argparse
import csv
import datetime
import html
import json
import math
import os
import re
import sys
from collections import defaultdict

# Reuse the slugify + segment-derivation helpers from the firm generator.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import slugify, derive_segments  # noqa: E402


DOMAIN = 'https://taxready.me'
COUNTRY_DIR = {'GB': 'uk', 'AU': 'au'}


def parse_int(s):
    try:
        return int((s or '').strip())
    except (ValueError, TypeError):
        return 0


def parse_float(s):
    try:
        return float((s or '').strip())
    except (ValueError, TypeError):
        return 0.0


# UK bounding box — anything outside is either bad data or swapped lat/lng
UK_LAT_MIN, UK_LAT_MAX = 49.5, 61.0
UK_LNG_MIN, UK_LNG_MAX = -8.5, 2.0


def sane_coords(firm):
    """Return (lat, lng) with swap-correction applied. The CSV has some rows
    where the latitude and longitude columns are flipped (a known data-
    quality issue flagged by the UK team). If the raw latitude falls inside
    the UK longitude range and vice versa, we swap. Returns (None, None)
    for rows with no usable coords."""
    lat = parse_float(firm.get('latitude'))
    lng = parse_float(firm.get('longitude'))
    if lat == 0 and lng == 0:
        return None, None
    # Swap check: if lat looks like a UK longitude AND lng looks like a UK
    # latitude, the fields are swapped — correct them.
    lat_looks_like_lng = UK_LNG_MIN <= lat <= UK_LNG_MAX
    lng_looks_like_lat = UK_LAT_MIN <= lng <= UK_LAT_MAX
    if lat_looks_like_lng and lng_looks_like_lat:
        lat, lng = lng, lat
    # Final sanity: return None if still OOB (better no link than a wrong one)
    if not (UK_LAT_MIN <= lat <= UK_LAT_MAX and UK_LNG_MIN <= lng <= UK_LNG_MAX):
        return None, None
    return lat, lng


_TAG_SEPS = re.compile(r'[;,|]+')
_MAX_TAG_CHARS = 30


def parse_tags(raw, max_count):
    """Split a tag-list field on any of `,;|`, trim whitespace, drop empties,
    dedupe while preserving order, and cap each tag to _MAX_TAG_CHARS with
    an ellipsis if over. The CSV currently has ~9% of rows using semicolon
    as the specialism separator instead of comma — splitting on both
    prevents "Accounts; Payroll; Tax; ..." being rendered as one 200-char
    super-tag that overflows the card layout."""
    if not raw:
        return []
    parts = [p.strip() for p in _TAG_SEPS.split(raw) if p and p.strip()]
    seen, out = set(), []
    for p in parts:
        if p.lower() in seen:
            continue
        seen.add(p.lower())
        if len(p) > _MAX_TAG_CHARS:
            p = p[:_MAX_TAG_CHARS - 1].rstrip() + '…'
        out.append(p)
        if len(out) >= max_count:
            break
    return out


def hybrid_score(rating, reviews, firm=None):
    """Balances rating, review volume, AND profile completeness.

    Base signal: log(reviews+1) × rating — stops small-sample 5-star firms
    leapfrogging volume firms, or volume firms burying high-rated smaller
    ones. Either by itself gets gamed; the product is the honest signal.

    Completeness multiplier: up to 1.30× boost based on claim status +
    filled profile fields. Capped at 30% so review/rating stays dominant
    — a 500-review 4.8★ unclaimed firm can't get buried by a 50-review
    4.5★ claimed firm. But a firm who claims + fills out specialisms +
    accreditations DOES move up meaningfully, which makes "complete your
    profile to rank higher" a truthful pitch when emailing firms (not
    just a sales claim).

    Weights — intentionally transparent:
      - claimed             +0.15   biggest signal of active management
      - specialisms set     +0.06
      - bio set             +0.04
      - accreditations set  +0.03
      - fees set            +0.02
      MAX total             +0.30   → 1.30× multiplier
    """
    r = parse_float(rating)
    n = parse_int(reviews)
    if n <= 0 or r <= 0:
        return 0.0
    base = math.log1p(n) * r

    if firm is None:
        return base

    boost = 0.0
    if (firm.get('claimed') or '').strip().upper() in ('TRUE', '1', 'YES', 'CLAIMED'):
        boost += 0.15
    if (firm.get('specialisms') or '').strip():
        boost += 0.06
    if (firm.get('bio') or '').strip():
        boost += 0.04
    if (firm.get('accreditations') or '').strip():
        boost += 0.03
    if (firm.get('fees') or '').strip():
        boost += 0.02

    return base * (1 + boost)


def group_firms_by_city(rows):
    """Return {(country_dir, city_slug): [rows]} using generator's slug logic."""
    groups = defaultdict(list)
    for r in rows:
        cc = (r.get('country') or 'GB').strip().upper()
        cd = COUNTRY_DIR.get(cc, 'uk')
        # Match generate.py exactly: use explicit city_slug, else slugify city
        cs = (r.get('city_slug') or '').strip() or slugify(r.get('city', ''))
        if cs and (r.get('name') or '').strip():
            groups[(cd, cs)].append(r)
    return groups


def city_display_name(firms):
    """Derive the pretty city name from the most-common 'city' value in rows."""
    counts = defaultdict(int)
    for f in firms:
        c = (f.get('city') or '').strip()
        if c:
            counts[c] += 1
    if not counts:
        return ''
    # Return the most common capitalisation
    return max(counts.items(), key=lambda x: x[1])[0]


def top_segments(firms, top_n=3):
    """Most common firm segments (hospitality, construction, etc) in the city."""
    counts = defaultdict(int)
    for f in firms:
        segs = derive_segments(f)
        if segs:
            for seg in (s.strip() for s in segs.split(',')):
                if seg:
                    counts[seg] += 1
    top = sorted(counts.items(), key=lambda x: -x[1])[:top_n]
    return [s for s, _ in top]


def firm_card_html(firm, rank, country_dir):
    """Render a single firm card. Explicit #N rank is shown on every card —
    fair because ranking now factors profile completeness (hybrid_score),
    not just raw reviews. A firm's #N is something they can earn down by
    claiming + filling their profile. That makes the number part of the
    email pitch ("your rank is #47 — fill specialisms to climb").
    Top 3 get a soft teal accent on the rank pill; rest use muted grey.

    Tags are split by semantic group matching the rest of the site:
      - green  = client-type / segment  (who they serve: Hospitality...)
      - purple = specialism              (what they do: VAT Returns...)"""
    name = (firm.get('name') or '').strip()
    firm_slug = (firm.get('firm_slug') or '').strip() or slugify(name)
    city_slug = (firm.get('city_slug') or '').strip() or slugify(firm.get('city', ''))
    rating = parse_float(firm.get('rating'))
    reviews = parse_int(firm.get('reviews'))
    suburb = (firm.get('suburb') or '').strip()
    city = (firm.get('city') or '').strip()
    loc = ', '.join([p for p in [suburb, city] if p])
    postcode_out = (firm.get('outward_code') or '').strip()
    if postcode_out and postcode_out not in loc:
        loc = (loc + ' · ' + postcode_out) if loc else postcode_out

    # Segments (client types — green tags). Robust to comma/semicolon/pipe
    # separators + length-capped per tag.
    seg_tags = parse_tags(derive_segments(firm), max_count=2)
    # Specialisms (services — purple tags)
    spec_tags = parse_tags(firm.get('specialisms'), max_count=3)

    # If no segments came through, fall back to showing a bit more specialism
    if not seg_tags and not spec_tags:
        tag_html = ''
    else:
        tag_parts = []
        for s in seg_tags:
            tag_parts.append(f'<span class="cd-tag-seg">{html.escape(s)}</span>')
        for s in spec_tags:
            tag_parts.append(f'<span class="cd-tag-spec">{html.escape(s)}</span>')
        tag_html = ''.join(tag_parts)

    profile_url = f'/{country_dir}/accounting-firms/{city_slug}/{firm_slug}/'
    rating_txt = f'{rating:.1f}' if rating else '—'
    reviews_txt = f'{reviews:,}' if reviews else '—'

    return (
        f'<a class="cd-card" href="{profile_url}">'
        '<div class="cd-card-top">'
        f'<span class="cd-rank">#{rank}</span>'
        '<span class="cd-rating">'
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="#F5A623" stroke="none" aria-hidden="true">'
        '<path d="M12 2l2.4 7.4H22l-6.2 4.5L18 21l-6-4.4L6 21l2.2-7.1L2 9.4h7.6z"/>'
        '</svg>'
        f'{rating_txt}<span class="cd-rating-reviews">({reviews_txt})</span>'
        '</span>'
        '</div>'
        f'<h3 class="cd-card-name">{html.escape(name)}</h3>'
        + (f'<div class="cd-card-loc">'
           '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
           'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
           '<path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z"/>'
           '<circle cx="12" cy="10" r="3"/></svg>'
           f'{html.escape(loc)}</div>' if loc else '')
        + (f'<div class="cd-tags">{tag_html}</div>' if tag_html else '')
        + '<div class="cd-card-cta">'
        '<span class="cd-view">See how they help &rarr;</span>'
        '</div>'
        '</a>'
    )


def build_schema(city_name, city_slug, country_dir, firms_ranked, firm_count, avg_rating, total_reviews):
    """JSON-LD for BreadcrumbList + CollectionPage + ItemList with
    AccountingService entities. This is the heavy lift for SEO — Google
    reads this to render rich results (star ratings, list previews in SERP)."""
    canonical = f'{DOMAIN}/{country_dir}/accounting-firms/{city_slug}/'

    item_list_elements = []
    for i, f in enumerate(firms_ranked[:50], 1):  # cap schema at 50 for performance
        name = (f.get('name') or '').strip()
        firm_slug = (f.get('firm_slug') or '').strip() or slugify(name)
        addr = (f.get('address') or '').strip()
        rating = parse_float(f.get('rating'))
        reviews = parse_int(f.get('reviews'))
        lat, lng = sane_coords(f)  # returns None,None for bad/OOB coords
        postcode = (f.get('postcode') or '').strip()
        website = (f.get('website') or '').strip()

        item = {
            '@type': 'AccountingService',
            'name': name,
            'url': f'{DOMAIN}/{country_dir}/accounting-firms/{city_slug}/{firm_slug}/',
            'address': {
                '@type': 'PostalAddress',
                'streetAddress': addr,
                'postalCode': postcode,
                'addressLocality': city_name,
                'addressCountry': 'GB',
            },
        }
        if rating > 0 and reviews > 0:
            item['aggregateRating'] = {
                '@type': 'AggregateRating',
                'ratingValue': rating,
                'reviewCount': reviews,
                'bestRating': 5,
                'worstRating': 1,
            }
        if lat is not None and lng is not None:
            item['geo'] = {
                '@type': 'GeoCoordinates',
                'latitude': lat,
                'longitude': lng,
            }
        if website and website.startswith('http'):
            item['sameAs'] = website

        item_list_elements.append({
            '@type': 'ListItem',
            'position': i,
            'item': item,
        })

    graph = [
        {
            '@type': 'BreadcrumbList',
            '@id': canonical + '#breadcrumb',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': DOMAIN + '/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'UK accounting firms',
                 'item': f'{DOMAIN}/{country_dir}/accounting-firms/'},
                {'@type': 'ListItem', 'position': 3, 'name': city_name,
                 'item': canonical},
            ],
        },
        {
            '@type': 'CollectionPage',
            '@id': canonical + '#page',
            'url': canonical,
            'name': f'Best accounting firms in {city_name}',
            'description': f'Compare {firm_count} local accounting firms in {city_name}. '
                           f'Ranked by Google reviews · average rating {avg_rating:.1f}★.',
            # Freshness signal for Google — generation date doubles as the
            # "last updated" signal until a per-row timestamp lands in the CSV.
            'datePublished': '2026-04-01',
            'dateModified': datetime.date.today().isoformat(),
            'inLanguage': 'en-GB',
            'isPartOf': {
                '@type': 'WebSite',
                'name': 'TaxReady',
                'url': DOMAIN + '/',
            },
            'breadcrumb': {'@id': canonical + '#breadcrumb'},
            'mainEntity': {'@id': canonical + '#list'},
        },
        {
            '@type': 'ItemList',
            '@id': canonical + '#list',
            'name': f'Accounting firms in {city_name}',
            'numberOfItems': firm_count,
            'itemListOrder': 'https://schema.org/ItemListOrderDescending',
            'itemListElement': item_list_elements,
        },
    ]

    return json.dumps({'@context': 'https://schema.org', '@graph': graph},
                      indent=2, ensure_ascii=False)


def city_about_html(city_name, firms, top_segs, avg_rating, total_reviews):
    """Auto-generated description paragraph. Needs to vary enough city-to-city
    that Google doesn't flag duplicate content."""
    parts = []

    firm_count = len(firms)
    rated = [f for f in firms if parse_int(f.get('reviews')) > 0]
    top_firms_by_rev = sorted(rated, key=lambda f: -parse_int(f.get('reviews')))[:3]

    segs_text = ''
    if top_segs:
        if len(top_segs) == 1:
            segs_text = f' with specialisms concentrated in <strong>{html.escape(top_segs[0])}</strong>'
        elif len(top_segs) == 2:
            segs_text = (f' with specialisms spanning <strong>{html.escape(top_segs[0])}</strong> '
                         f'and <strong>{html.escape(top_segs[1])}</strong>')
        else:
            segs_text = (f' with specialisms spanning <strong>{html.escape(top_segs[0])}</strong>, '
                         f'<strong>{html.escape(top_segs[1])}</strong>, and <strong>{html.escape(top_segs[2])}</strong>')

    parts.append(
        f'<p>{html.escape(city_name)} is home to <strong>{firm_count} accounting firms</strong> '
        f'on the TaxReady directory{segs_text}. Across the city, firms hold an average Google rating '
        f'of <strong>{avg_rating:.1f}★</strong> over <strong>{total_reviews:,} reviews</strong> — '
        f'a genuine signal of local reputation rather than marketing spend.</p>'
    )

    if top_firms_by_rev:
        top_names = [html.escape((f.get('name') or '').strip()) for f in top_firms_by_rev]
        if len(top_names) == 1:
            names_text = top_names[0]
        elif len(top_names) == 2:
            names_text = ' and '.join(top_names)
        else:
            names_text = ', '.join(top_names[:-1]) + f', and {top_names[-1]}'
        parts.append(
            f'<p>The most-reviewed firms in {html.escape(city_name)} include '
            f'<strong>{names_text}</strong> — all listed below with full profiles, '
            f'specialisms, and direct enquiry.</p>'
        )

    parts.append(
        f'<p>Not sure who to pick? Our AI reviews all {firm_count} firms against your situation '
        f'(business type, specialism, fee range, city) and returns your top 3 matches in 60 seconds. '
        f'<a href="/find-accountant.html?city={slugify(city_name)}" '
        f'style="color:var(--teal);text-decoration:none;border-bottom:1px dotted rgba(0,177,178,.4);">'
        f'Get AI-matched for {html.escape(city_name)} &rarr;</a></p>'
    )

    return '\n    '.join(parts)


def nearby_cities(current_slug, all_groups, current_firms, limit=8):
    """Find the closest N cities by average firm lat/lng. Adjacency via
    geography is more useful than alphabetical for SEO internal linking.
    Uses sane_coords() to correct for the swapped-field data quality bug
    in the CSV before averaging."""
    def avg_coord(firms):
        coords = [sane_coords(f) for f in firms]
        coords = [(a, b) for a, b in coords if a is not None]
        if not coords:
            return None, None
        lats = [a for a, _ in coords]
        lngs = [b for _, b in coords]
        return sum(lats) / len(lats), sum(lngs) / len(lngs)

    cur_lat, cur_lng = avg_coord(current_firms)
    if cur_lat is None:
        return []

    candidates = []
    for (cd, cs), firms in all_groups.items():
        if cd != 'uk' or cs == current_slug or len(firms) < 3:
            continue
        lat, lng = avg_coord(firms)
        if lat is None:
            continue
        # Simple euclidean on lat/lng — fine for UK-scale comparisons
        dist = ((lat - cur_lat) ** 2 + (lng - cur_lng) ** 2) ** 0.5
        candidates.append((dist, cs, firms))
    candidates.sort()
    return candidates[:limit]


def nearby_html(nearby):
    if not nearby:
        return ('<a class="cd-nearby-chip" href="/uk/accounting-firms/">'
                'All UK cities &rarr;</a>')
    parts = []
    for dist, cs, firms in nearby:
        name = city_display_name(firms) or cs.replace('-', ' ').title()
        parts.append(
            f'<a class="cd-nearby-chip" href="/uk/accounting-firms/{cs}/">'
            f'{html.escape(name)}<span class="cd-nearby-count">{len(firms)}</span>'
            f'</a>'
        )
    parts.append(
        '<a class="cd-nearby-chip" href="/uk/accounting-firms/" '
        'style="border-color:var(--teal);color:var(--teal);font-weight:600;">'
        'All UK cities &rarr;</a>'
    )
    return '\n    '.join(parts)


def build_city_page(template, country_dir, city_slug, firms, all_groups):
    """Produce the HTML for a single city page."""
    # Rank firms by hybrid score. Factors in rating × review volume (base
    # signal) plus a completeness multiplier that rewards claimed + filled
    # profiles — makes "complete your profile to rank higher" a truthful
    # pitch to firms, not a sales line.
    firms_ranked = sorted(firms, key=lambda f: -hybrid_score(f.get('rating'), f.get('reviews'), f))
    city_name = city_display_name(firms)
    firm_count = len(firms_ranked)

    # Aggregate stats (rated firms only — avoids inflating with 0-review entries)
    rated = [f for f in firms_ranked if parse_int(f.get('reviews')) > 0]
    total_reviews = sum(parse_int(f.get('reviews')) for f in rated)
    avg_rating = (sum(parse_float(f.get('rating')) for f in rated) / len(rated)) if rated else 0.0
    top_segs = top_segments(firms_ranked, top_n=3)

    # SEO meta
    seo_title = f'Best Accounting Firms in {city_name} | {firm_count} Local Firms | TaxReady'
    # Descriptions cap ~160 chars for optimal SERP
    seo_desc = (f'Compare {firm_count} local accounting firms in {city_name}. '
                f'Ranked by Google reviews · avg {avg_rating:.1f}★ over '
                f'{total_reviews:,} reviews. AI-matched recommendations in 60 seconds.')
    if len(seo_desc) > 160:
        seo_desc = seo_desc[:157].rsplit(' ', 1)[0] + '...'

    canonical = f'{DOMAIN}/{country_dir}/accounting-firms/{city_slug}/'

    firm_cards_html = '\n    '.join(
        firm_card_html(f, i + 1, country_dir) for i, f in enumerate(firms_ranked)
    )

    about_html = city_about_html(city_name, firms_ranked, top_segs, avg_rating, total_reviews)
    nearby = nearby_cities(city_slug, all_groups, firms_ranked)
    nearby_html_str = nearby_html(nearby)
    schema_json = build_schema(city_name, city_slug, country_dir, firms_ranked,
                               firm_count, avg_rating, total_reviews)

    replacements = {
        '{{CITY_NAME}}': city_name,
        '{{CITY_SLUG}}': city_slug,
        '{{FIRM_COUNT}}': f'{firm_count:,}',
        '{{AVG_RATING}}': f'{avg_rating:.2f}',
        '{{TOTAL_REVIEWS}}': f'{total_reviews:,}',
        '{{SEO_TITLE}}': seo_title,
        '{{SEO_DESCRIPTION}}': seo_desc,
        '{{CANONICAL_URL}}': canonical,
        '{{FIRM_LIST_HTML}}': firm_cards_html,
        '{{CITY_ABOUT_HTML}}': about_html,
        '{{NEARBY_CITIES_HTML}}': nearby_html_str,
        '{{SCHEMA_JSON}}': schema_json,
    }

    output = template
    for tok, val in replacements.items():
        output = output.replace(tok, val)
    return output


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--city', help='Generate a single city only (slug, e.g. manchester)')
    ap.add_argument('--min-firms', type=int, default=3,
                    help='Minimum firms required to generate a city page (default: 3)')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    root = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(root, 'city-template.html')
    csv_path = os.path.join(root, 'accountants-template.csv')

    with open(template_path, encoding='utf-8') as f:
        template = f.read()
    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    groups = group_firms_by_city(rows)

    uk_groups = {k: v for k, v in groups.items() if k[0] == 'uk'}
    eligible = {k: v for k, v in uk_groups.items() if len(v) >= args.min_firms}

    if args.city:
        key = ('uk', args.city)
        if key not in uk_groups:
            print(f'City slug "{args.city}" not found. Available top-20:')
            top = sorted(uk_groups.items(), key=lambda x: -len(x[1]))[:20]
            for (_, cs), fs in top:
                print(f'  {cs:30s} {len(fs)} firms')
            sys.exit(1)
        eligible = {key: uk_groups[key]}

    print(f'Generating {len(eligible)} city page(s) '
          f'(min {args.min_firms} firms per city)')
    if args.dry_run:
        for (cd, cs), firms in sorted(eligible.items(), key=lambda x: -len(x[1])):
            print(f'  would write: /{cd}/accounting-firms/{cs}/index.html  ({len(firms)} firms)')
        return

    written = 0
    for (cd, cs), firms in eligible.items():
        html_out = build_city_page(template, cd, cs, firms, groups)
        out_dir = os.path.join(root, cd, 'accounting-firms', cs)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, 'index.html')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html_out)
        written += 1
        if written <= 5 or written % 50 == 0:
            print(f'  wrote {out_path} ({len(firms)} firms)')

    print(f'\nDone. {written} city pages written.')


if __name__ == '__main__':
    main()
