#!/usr/bin/env python3
"""Generate uk/accounting-firms/other/index.html for GB firms with no city."""
import csv, re, html as H, collections, os, math

postcode_re = re.compile(r'\b([A-Z]{1,2}[0-9][0-9A-Z]?\s[0-9][A-Z]{2})\b', re.IGNORECASE)

def extract_town(address):
    addr = re.sub(r',?\s*(United Kingdom|UK)\s*$', '', address.strip(), flags=re.IGNORECASE)
    parts = [p.strip() for p in addr.split(',')]
    for i, part in enumerate(parts):
        m = postcode_re.search(part)
        if m:
            town = postcode_re.sub('', part).strip().strip('.')
            if town and len(town) > 1:
                return town
            elif i > 0:
                return parts[i - 1].strip()
    return parts[-1].strip() if parts else 'Unknown'

root = os.path.dirname(os.path.abspath(__file__))
firms = []
with open(os.path.join(root, 'accountants-template.csv'), encoding='utf-8') as f:
    for row in csv.DictReader(f):
        if row['country'].strip() == 'GB' and not row['city'].strip() and row.get('name', '').strip():
            addr = row.get('address', '').strip()
            town = extract_town(addr) if addr else 'Unknown'
            try:
                rating = float(row.get('rating', '0').strip() or '0')
            except ValueError:
                rating = 0.0
            try:
                reviews = int(row.get('reviews', '0').strip() or '0')
            except ValueError:
                reviews = 0
            postcode = row.get('postcode', '').strip()
            pc_area = postcode.split()[0] if postcode else ''
            firms.append({'name': row['name'].strip(), 'town': town,
                          'rating': rating, 'reviews': reviews, 'pc': pc_area})

by_town = collections.defaultdict(list)
for f in firms:
    by_town[f['town']].append(f)
groups = sorted(by_town.items(), key=lambda x: (-len(x[1]), x[0]))
total = len(firms)

STAR = ('<svg width="13" height="13" viewBox="0 0 24 24" fill="#F5A623" stroke="none" aria-hidden="true">'
        '<path d="M12 2l2.4 7.4H22l-6.2 4.5L18 21l-6-4.4L6 21l2.2-7.1L2 9.4h7.6z"/></svg>')
PIN = ('<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
       'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
       '<path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z"/>'
       '<circle cx="12" cy="10" r="3"/></svg>')

sections_html = []
rank = 1
for town_name, town_firms in groups:
    sorted_f = sorted(town_firms, key=lambda x: -(
        math.log1p(x['reviews']) * x['rating'] if x['reviews'] and x['rating'] else 0))
    cards = []
    for f in sorted_f:
        rv = f'<span class="cd-rating-reviews">({f["reviews"]})</span>' if f['reviews'] else ''
        rat_html = f'<span class="cd-rating">{STAR}{f["rating"]:.1f}{rv}</span>' if f['rating'] else ''
        loc = f'{H.escape(town_name)} &middot; {H.escape(f["pc"])}' if f['pc'] else H.escape(town_name)
        cards.append(
            f'      <div class="cd-card cd-card--noprofile">'
            f'<div class="cd-card-top"><span class="cd-rank">#{rank}</span>{rat_html}</div>'
            f'<h3 class="cd-card-name">{H.escape(f["name"])}</h3>'
            f'<div class="cd-card-loc">{PIN}{loc}</div>'
            f'</div>'
        )
        rank += 1
    noun = 'firm' if len(town_firms) == 1 else 'firms'
    sections_html.append(
        f'    <section class="cd-town-section">\n'
        f'      <h2 class="cd-town-h">{H.escape(town_name)} '
        f'<span class="cd-town-count">({len(town_firms)} {noun})</span></h2>\n'
        f'      <div class="cd-grid">\n'
        + '\n'.join(cards) + '\n'
        f'      </div>\n'
        f'    </section>'
    )

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f0f0e">
<title>Other UK Accounting Firms | {total} Firms by Location | TaxReady</title>
<meta name="description" content="Browse {total} UK accounting firms not assigned to a major city hub, grouped by town. Ranked by Google reviews and rating.">
<link rel="canonical" href="https://taxready.me/uk/accounting-firms/other/">
<meta property="og:type" content="website">
<meta property="og:url" content="https://taxready.me/uk/accounting-firms/other/">
<meta property="og:title" content="Other UK Accounting Firms | {total} Firms | TaxReady">
<meta property="og:description" content="Browse {total} UK accounting firms grouped by town. Ranked by Google reviews and rating.">
<meta property="og:site_name" content="TaxReady">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Other UK Accounting Firms | {total} Firms | TaxReady">
<meta name="twitter:description" content="Browse {total} UK accounting firms grouped by town.">
<link rel="alternate" hreflang="en-gb" href="https://taxready.me/uk/accounting-firms/other/">
<link rel="alternate" hreflang="x-default" href="https://taxready.me/uk/accounting-firms/other/">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<link rel="icon" type="image/png" href="https://cdn.prod.website-files.com/6512a8b117cf6f7907ce200e/69ded1478a2d79efa2bdb7f5_TaxReady%20Icon%202.png">
<link rel="apple-touch-icon" href="https://cdn.prod.website-files.com/6512a8b117cf6f7907ce200e/69ded1478a2d79efa2bdb7f5_TaxReady%20Icon%202.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=IBM+Plex+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{{--bg:#faf9f7;--surface:#f4f3f0;--border:#e8e8e3;--text:#0f0f0e;--muted:#6b6b66;--teal:#00B1B2;--grad:linear-gradient(90deg,#E77481 0%,#7E49E7 100%);}}
  *{{box-sizing:border-box;}}html,body{{margin:0;padding:0;}}
  body{{font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased;}}
  a{{color:inherit;}}
  .nav{{display:flex;align-items:center;justify-content:space-between;padding:12px 40px;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:100;}}
  .nav-logo{{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;}}
  .nav-logo img{{width:26px;height:26px;border-radius:6px;display:block;}}
  .logo-name{{font-family:'Playfair Display',serif;font-size:19px;font-weight:500;color:var(--text);line-height:1;}}
  .logo-sub{{font-size:10px;color:var(--muted);display:block;margin-top:2px;font-family:'IBM Plex Sans',sans-serif;}}
  .nav-cta{{font-size:13px;font-weight:600;color:var(--teal);text-decoration:none;padding:7px 15px;border:1px solid var(--teal);border-radius:100px;transition:background .15s,color .15s;}}
  .nav-cta:hover{{background:var(--teal);color:#fff;}}
  @media(max-width:700px){{.nav{{padding:10px 18px;}}.nav-cta{{font-size:11px;padding:5px 11px;}}}}
  .cd-crumb{{max-width:1240px;margin:0 auto;padding:18px 40px 0;font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);letter-spacing:.04em;}}
  .cd-crumb a{{color:var(--muted);text-decoration:none;border-bottom:1px dotted transparent;transition:border-color .15s,color .15s;}}
  .cd-crumb a:hover{{color:var(--text);border-bottom-color:rgba(107,107,102,.5);}}
  .cd-crumb .sep{{margin:0 8px;opacity:.5;}}
  .cd-crumb .cur{{color:var(--text);}}
  @media(max-width:700px){{.cd-crumb{{padding:14px 18px 0;}}}}
  .cd-hero{{max-width:1240px;margin:0 auto;padding:28px 40px 20px;text-align:center;}}
  @media(max-width:700px){{.cd-hero{{padding:22px 18px 16px;}}}}
  .cd-eyebrow{{display:inline-flex;align-items:center;gap:9px;font-family:'DM Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin-bottom:16px;}}
  .cd-eyebrow-dot{{width:6px;height:6px;border-radius:50%;background:var(--teal);box-shadow:0 0 10px rgba(0,177,178,.55);}}
  .cd-h1{{font-family:'Playfair Display',serif;font-size:clamp(32px,5.2vw,58px);font-weight:400;line-height:1.05;color:var(--text);margin:0 0 16px;letter-spacing:-.01em;max-width:880px;margin-left:auto;margin-right:auto;}}
  .cd-h1 em{{background:linear-gradient(135deg,#E77481 0%,#9B3FC7 50%,#6B21A8 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font-style:italic;}}
  .cd-sub{{font-size:16px;color:var(--muted);line-height:1.6;max-width:640px;margin:0 auto 24px;}}
  .cd-sub strong{{color:var(--text);font-weight:600;}}
  .cd-stats{{display:inline-flex;gap:0;align-items:center;background:#fff;border:1px solid var(--border);border-radius:100px;padding:4px;margin:0 auto 30px;box-shadow:0 2px 10px rgba(15,15,14,.04);flex-wrap:wrap;}}
  .cd-stat{{display:flex;align-items:baseline;gap:6px;padding:8px 16px;border-right:1px solid var(--border);}}
  .cd-stat:last-child{{border-right:none;}}
  .cd-stat-val{{font-family:'Playfair Display',serif;font-size:20px;font-weight:500;color:var(--text);line-height:1;}}
  .cd-stat-lbl{{font-family:'DM Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);}}
  .cd-main{{max-width:1240px;margin:0 auto;padding:10px 40px 60px;}}
  @media(max-width:700px){{.cd-main{{padding:8px 18px 44px;}}}}
  .cd-town-section{{margin-bottom:48px;}}
  .cd-town-h{{font-family:'Playfair Display',serif;font-size:clamp(20px,2.2vw,26px);font-weight:500;color:var(--text);margin:0 0 16px;line-height:1.2;border-bottom:1.5px solid var(--border);padding-bottom:10px;}}
  .cd-town-count{{font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);font-weight:400;}}
  .cd-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}}
  .cd-card{{background:#fff;border:1.5px solid var(--border);border-radius:14px;padding:20px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:12px;}}
  .cd-card--noprofile{{cursor:default;}}
  .cd-card-top{{display:flex;align-items:center;justify-content:space-between;gap:12px;}}
  .cd-rank{{font-family:'DM Mono',monospace;font-size:11px;font-weight:600;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:100px;padding:3px 11px;white-space:nowrap;}}
  .cd-rating{{display:flex;align-items:center;gap:4px;font-family:'IBM Plex Sans',sans-serif;font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;margin-left:auto;}}
  .cd-rating-reviews{{font-weight:400;color:var(--muted);font-size:12px;}}
  .cd-card-name{{font-family:'Playfair Display',serif;font-size:18px;font-weight:500;line-height:1.25;color:var(--text);margin:0;}}
  .cd-card-loc{{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:5px;}}
  .cd-card-loc svg{{flex-shrink:0;opacity:.6;}}
  footer{{max-width:1240px;margin:60px auto 0;padding:22px 40px;border-top:1px solid var(--border);font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;text-transform:uppercase;letter-spacing:.1em;}}
  footer a{{color:var(--muted);text-decoration:none;}}
  @media(max-width:600px){{footer{{padding:18px;flex-direction:column;gap:8px;text-align:center;}}}}
</style>
</head>
<body>

<nav class="nav">
  <a class="nav-logo" href="/">
    <img src="https://cdn.prod.website-files.com/6512a8b117cf6f7907ce200e/69ded1478a2d79efa2bdb7f5_TaxReady%20Icon%202.png" alt="TaxReady">
    <div><span class="logo-name">TaxReady</span><span class="logo-sub">UK accountant directory</span></div>
  </a>
  <a class="nav-cta" href="/uk/find-accountant/">Find my accountant</a>
</nav>

<div class="cd-crumb">
  <a href="/">Home</a><span class="sep">/</span>
  <a href="/uk/accounting-firms/">UK accounting firms</a><span class="sep">/</span>
  <span class="cur">Other</span>
</div>

<header class="cd-hero">
  <div class="cd-eyebrow"><span class="cd-eyebrow-dot"></span><span>UK accounting firms directory</span></div>
  <h1 class="cd-h1">Other UK accounting firms,<br><em>grouped by town.</em></h1>
  <p class="cd-sub"><strong>{total} verified UK firms</strong> across <strong>{len(groups)} locations</strong> not assigned to a major city hub. Ranked by Google review volume and rating within each town.</p>
  <div class="cd-stats">
    <div class="cd-stat"><span class="cd-stat-val">{total}</span><span class="cd-stat-lbl">firms</span></div>
    <div class="cd-stat"><span class="cd-stat-val">{len(groups)}</span><span class="cd-stat-lbl">locations</span></div>
  </div>
</header>

<main class="cd-main">
{chr(10).join(sections_html)}
</main>

<footer>
  <span>&copy; 2025 TaxReady</span>
  <a href="/uk/accounting-firms/">All UK cities</a>
  <a href="/uk/find-accountant/">AI accountant match</a>
</footer>
</body>
</html>"""

out_dir = os.path.join(root, 'uk', 'accounting-firms', 'other')
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, 'index.html')
with open(out_path, 'w', encoding='utf-8') as fout:
    fout.write(page)
# remove temp body file if it exists
body_tmp = os.path.join(out_dir, '_body.html')
if os.path.exists(body_tmp):
    os.remove(body_tmp)
print(f'Written {out_path}  ({total} firms, {len(groups)} town sections)')
