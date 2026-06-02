# TaxReady

Multi-country accounting firm directory and lead generation platform. Hosted on GitHub Pages (static) with a Cloudflare Worker serving firm profile and city hub pages on demand from a D1 database.

Live at [taxready.me](https://taxready.me)

---

## Architecture overview

```
Browser
  │
  ├─ taxready.me/                     → index.html (geo-redirect only)
  │
  ├─ taxready.me/uk/                  ┐
  ├─ taxready.me/au/                  ├─ GitHub Pages (static HTML files)
  ├─ taxready.me/us/                  ┘
  │
  ├─ taxready.me/{country}/accounting-firms/{city}/          ┐
  ├─ taxready.me/{country}/accounting-firms/{city}/{firm}/   ├─ Cloudflare Worker → D1
  └─ taxready.me/api/*                                       ┘
```

**Static pages** (GitHub Pages) handle homepages, tax estimator pages, find-accountant, and for-accountants forms.

**Dynamic pages** (Cloudflare Worker) handle every firm profile and city hub — rendered on demand from the D1 database and cached for 5 minutes.

**Single source of truth** for all firm data is `accountants-template.csv`. Every change flows: CSV → `import_csv_to_d1.py` → D1 → Worker renders pages.

---

## Countries

| Country | Path | Status |
|---|---|---|
| United Kingdom | `/uk/` | Live — ~5,000 firms in D1 |
| Australia | `/au/` | Partial — estimate pages only, no firms yet |
| United States | `/us/` | In progress (`feature/us-expansion` branch) — pages built, firms pending |

### Geo-redirect

`index.html` at the root runs silently — no visible content. It checks `localStorage['tx_country']` first (cached from a previous visit), then calls **GeoTargetly** with a 1.5-second fallback:

```
AU  → /au/
US  → /us/
*   → /uk/
```

GeoTargetly account ID is currently a placeholder (`GT-XXXXXXXX`) in `index.html` — replace with the real ID before launch.

---

## Directory structure

```
/
├── index.html                        # Root geo-redirect (no visible content)
├── accountants-template.csv          # Master firm data (5,000+ rows, all countries)
├── accountant-profile-template.html  # Firm profile template (Worker renders this)
├── city-template.html                # City hub template (Worker renders this)
├── generate_sitemap.py               # Generates sitemap.xml
├── generate_other_page.py            # Generates the /other/ page for uncitied firms
├── sitemap.xml                       # Auto-generated — commit after running script
├── robots.txt
├── CNAME                             # taxready.me
│
├── assets/                           # All static media (video, images, icons, Lottie)
├── css/                              # main.css, site-nav.css, site-footer.css
├── js/                               # core.js (segment data), site-nav.js
│
├── uk/                               # UK country pages (GitHub Pages)
│   ├── index.html                    # UK homepage
│   ├── estimate/{segment}/           # Tax calculators (9 segments)
│   ├── find-accountant/              # AI-matched accountant search
│   ├── for-accountants/              # Firm claim/profile signup
│   └── accounting-firms/index.html  # Master directory (city list, static)
│
├── au/                               # Australia pages (estimate only, no firms yet)
│   └── estimate/{segment}/
│
├── us/                               # US pages (feature branch)
│   ├── index.html                    # US homepage (find-accountant only, no estimator)
│   ├── find-accountant/              # US accountant search (zip-code geocoded)
│   └── for-accountants/             # US firm claim form
│
└── workers/                          # Cloudflare Worker
    ├── wrangler.toml                 # Routes + D1 binding
    ├── src/
    │   ├── index.js                  # Request router + API handlers
    │   └── render.js                 # Template rendering (tokens, schema, ranking)
    ├── schema.sql                    # D1 table definition
    ├── import_csv_to_d1.py           # CSV → import.sql pipeline
    ├── import.sql                    # Generated — do not edit manually
    ├── firm_hashes.json              # Per-firm content hashes (change detection)
    └── firm_dates.json               # Per-firm lastmod dates (for sitemap)
```

---

## CSV data model

`accountants-template.csv` is the single source of truth for all firm data. Every row is one firm.

### Key columns

| Column | Description |
|---|---|
| `name` | Firm display name |
| `address` | Full street address |
| `country` | `GB`, `AU`, or `US` — determines which country URL the firm appears under |
| `city` | City name (used in URL slug and page headlines) |
| `suburb` | Optional locality (used if `city` is blank or `other`) |
| `rating` | Google star rating (float) |
| `reviews` | Google review count (integer) — gates page state and schema |
| `latitude` / `longitude` | Map coordinates |
| `postcode` | UK/AU postcode or US zip code |
| `flag_hospitality` … `flag_real_estate` | `TRUE`/`FALSE` — industry segment tags |
| `Badge` | Badge image URL if firm is a Top Accountant winner (blank = no badge) |
| `claimed` | `TRUE` when firm has claimed their profile |
| `specialisms` | Comma-separated services (populated on claim) |
| `fees` | Fee description (populated on claim) |
| `bio` | Firm description (populated on claim) |
| `differentiators` | Key selling point (populated on claim) |
| `accreditations` | Professional bodies (populated on claim) |
| `website` | Firm website URL |
| `client_portal` | `TRUE` if firm offers a secure client portal |
| `firm_slug` | Auto-generated URL slug from name — override if needed |
| `city_slug` | Auto-generated URL slug from city — override if needed |
| `specalist_segments` | Override segment tags (note: column name is intentionally misspelled — matches the CSV header) |

### Adding US firms

Add rows to `accountants-template.csv` with `country=US`. US zip codes go in the `postcode` column. Run the import pipeline (see below) — US firms will automatically appear at `/us/accounting-firms/{city}/{firm}/`.

---

## D1 database pipeline

### Import CSV → D1

```bash
# 1. Generate the SQL import file
python3 workers/import_csv_to_d1.py

# 2. Push to the remote D1 database
wrangler d1 execute taxready-firms --file=workers/import.sql --remote
```

`import_csv_to_d1.py` computes a content hash for each firm. If the hash matches the previous run, the firm keeps its old `updated_at` date (so the sitemap `<lastmod>` doesn't change unnecessarily). Only changed or new firms get today's date.

After importing, commit `firm_hashes.json` and `firm_dates.json` — they track per-firm state across runs.

### D1 database

- **Database name:** `taxready-firms`
- **Database ID:** `a69d6232-b83b-404d-a9da-13e421a84287`
- **Binding:** `env.DB` (used in `workers/src/index.js`)

Schema is in `workers/schema.sql`. The `firms` table has a `UNIQUE(city_slug, firm_slug)` constraint — duplicate slugs within a city silently overwrite.

---

## Cloudflare Worker

### Routes

The Worker intercepts these paths before GitHub Pages sees them:

| Pattern | Handler |
|---|---|
| `/{uk\|au\|us}/accounting-firms/{city}/{firm}/` | Firm profile page |
| `/{uk\|au\|us}/accounting-firms/{city}/` | City hub page |
| `/accounting-firms/{city}/{firm}[.html]` | 301 → `/uk/` equivalent |
| `/api/enquiry` (POST) | Save lead to Supabase + Zapier |
| `/api/claim` (GET/POST) | Firm profile claim flow |
| `/api/firm` (GET) | Firm data lookup for claim form pre-fill |
| `/api/firms` (GET) | All firms JSON feed for map (`?country=GB\|AU\|US`) |

Everything else passes through to GitHub Pages unchanged.

### Deploying the Worker

```bash
cd workers
wrangler deploy
```

### Environment variables (set in Cloudflare dashboard)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `ZAPIER_WEBHOOK_URL` | Zapier webhook for enquiry notifications |
| `CLAIM_ZAPIER_WEBHOOK_URL` | Zapier webhook for claim submissions |

### Page rendering

The Worker imports `accountant-profile-template.html` and `city-template.html` as bundled text strings (via `wrangler.toml` rules). `render.js` replaces `{{TOKEN}}` placeholders with firm data and returns complete HTML.

**Firm profiles** have 5 tiers based on badge status, claimed status, and review count — the tier determines which schema blocks, CTAs, and copy appear.

**City hubs** rank firms by a hybrid score: `log(reviews) × rating × (1 + content bonuses)`. Bonuses for claimed status, populated specialisms, bio, accreditations, and differentiators.

---

## Scripts

### Regenerate the sitemap

```bash
python3 generate_sitemap.py           # writes sitemap.xml
python3 generate_sitemap.py --dry-run # count URLs without writing
```

Reads `accountants-template.csv` and `workers/firm_dates.json`. Generates URLs for all countries present in the CSV (`country` column). Always commit `sitemap.xml` after running.

### Regenerate the /other/ page

```bash
python3 generate_other_page.py
# writes uk/accounting-firms/other/index.html
```

Handles UK firms that have no `city` value in the CSV — groups them by town extracted from their address.

---

## Tax estimator segments (UK only)

Nine segments, each with a tailored tax calculator and matched accountant suggestions. Segment data (copy, deduction tiers, example accountants) lives in `js/core.js` under the `SEGMENTS` object.

| Segment | URL |
|---|---|
| Employed (PAYE) | `/uk/estimate/employed/` |
| Freelancer / Sole Trader | `/uk/estimate/freelancer/` |
| Landlord / Buy-to-let | `/uk/estimate/landlord/` |
| Construction (CIS) | `/uk/estimate/construction/` |
| Hospitality | `/uk/estimate/hospitality/` |
| Healthcare | `/uk/estimate/healthcare/` |
| Retail / E-commerce | `/uk/estimate/retail/` |
| Creative | `/uk/estimate/creative/` |
| Small Business | `/uk/estimate/small-business/` |

The US site has no tax estimator (different tax system). The homepage at `/us/` only shows the "Find accountant" CTA.

---

## Assets

Drop all media files into `/assets/`. Current files:

| File | Used on |
|---|---|
| `taxready-hero.mp4` | UK/AU homepage hero video + find-accountant Live now widget |
| `taxready-hero-us.mp4` | US homepage hero video + US find-accountant widget (**pending — drop here**) |
| `freelancer.png` | UK/AU homepage foreground figure |
| `freelancer-us.png` | US homepage foreground figure (**pending — drop here**) |
| `builder.png`, `creative.png`, etc. | Segment page illustrations |
| `taxready.svg` / `taxready-badge.svg` / `taxready-32.png` / `taxready-180.png` | Logo and favicons |
| `workiro-logo-*.svg` | Workiro partner branding |
| `xu-magazine-logo.webp` | Press feature logo |
| `cash-icon.json`, `find-icon.json` | Lottie animations for CTAs |

---

## Find accountant pages

Both UK and US have a standalone find-accountant page that loads all firms from `accountants-template.csv` client-side, displays them on a Leaflet map, and runs an AI-match scoring algorithm against a postcode/zip code input.

**UK** (`/uk/find-accountant/`) — geocodes via [postcodes.io](https://postcodes.io); filters firms by UK bounding box.

**US** (`/us/find-accountant/`) — geocodes via [Nominatim/OpenStreetMap](https://nominatim.openstreetmap.org); filters firms by `country === 'US'` from CSV.

The scoring algorithm weights: proximity (50km radius), Google rating/reviews, claimed status, badge status, and optionally a specialism match.

---

## For-accountants (claim) pages

`/uk/for-accountants/` and `/us/for-accountants/` are the firm signup pages. They show a competition map (real firm dots from the CSV, colour-coded by tier) to motivate accountants to claim their profile. Form submissions go to Supabase (`accounting_firms` table) and trigger a Zapier webhook.

The map uses the same CSV as the find-accountant page — UK filtered by UK lat/lng bounding box, US filtered by `country === 'US'`.

---

## Conventions

- **Template tokens** are `{{UPPERCASE_SNAKE}}`. Never use double-brace syntax for anything else in the templates.
- **`specalist_segments`** — the column name is misspelled in the CSV and the code matches it intentionally. Do not fix the spelling without updating all references.
- **Generated output is committed** — `sitemap.xml`, `uk/accounting-firms/other/index.html`, `workers/firm_hashes.json`, and `workers/firm_dates.json` are all tracked in git. That is correct.
- **No package manager or bundler** for the hand-authored pages. CSS and JS are served as-is.
- **`accounting-firms/` output directory** — the old static generator (`generate.py`) has been removed. Firm profiles and city hubs are now Worker-rendered from D1. Do not add generated HTML back to this path.

---

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production — GitHub Pages serves from here |
| `feature/us-expansion` | US country rollout — merge to main once US firms are loaded |
