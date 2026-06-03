# TaxReady

Multi-country accounting firm directory and lead generation platform. Hosted on GitHub Pages (static) with a Cloudflare Worker serving firm profile, city hub, and US state hub pages on demand from a D1 database.

Live at [taxready.me](https://taxready.me)

---

## Architecture overview

```
Browser
  │
  ├─ taxready.me/                     → index.html (meta refresh fallback → /uk/)
  │
  ├─ taxready.me/uk/                  ┐
  ├─ taxready.me/au/                  ├─ GitHub Pages (static HTML files)
  ├─ taxready.me/us/                  ┘
  │
  ├─ taxready.me/us/accounting-firms/              ┐
  ├─ taxready.me/us/accounting-firms/{state}/      │
  ├─ taxready.me/{country}/accounting-firms/{city}/ ├─ Cloudflare Worker → D1
  ├─ taxready.me/{country}/accounting-firms/{city}/{firm}/ │
  └─ taxready.me/api/*                             ┘
```

**Static pages** (GitHub Pages) handle homepages, tax estimator pages, find-accountant, and for-accountants forms.

**Dynamic pages** (Cloudflare Worker) handle every firm profile, city hub, and US state hub — rendered on demand from the D1 database and cached for 5 minutes.

**Single source of truth** for all firm data is `accountants-template.csv`. Every change flows: CSV → `import_csv_to_d1.py` → D1 → Worker renders pages.

---

## Countries

| Country | Path | Status |
|---|---|---|
| United Kingdom | `/uk/` | Live — ~4,900 firms in D1 |
| Australia | `/au/` | Partial — estimate pages only, no firms yet |
| United States | `/us/` | Live — ~1,895 firms in D1, state/city directory active |

### Geo-redirect

`index.html` at the root uses a `<meta http-equiv="refresh">` fallback that sends everyone to `/uk/`. A proper Cloudflare Worker geo-redirect (using `request.cf.country`) is pending — see `TODO-US-LAUNCH.md`.

---

## Directory structure

```
/
├── index.html                        # Root (meta refresh → /uk/ fallback)
├── accountants-template.csv          # Master firm data (~6,800 rows, all countries)
├── accountant-profile-template.html  # Firm profile template (Worker renders this)
├── city-template.html                # City hub template (Worker renders this)
├── us-state-index-template.html      # US state directory template (Worker renders this)
├── us-state-hub-template.html        # US state hub template (Worker renders this)
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
├── us/                               # US pages
│   ├── index.html                    # US homepage
│   ├── find-accountant/              # US accountant search (zip code + state search)
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
| `suburb` | For US firms: 2-letter state code (e.g. `CA`, `TX`) — drives state hub pages and location display |
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
| `/us/accounting-firms/` | US state index (browse by state) |
| `/us/accounting-firms/{state}/` | US state hub (cities within a state — 2-letter code e.g. `ca`) |
| `/{uk\|au\|us}/accounting-firms/{city}/{firm}/` | Firm profile page |
| `/{uk\|au\|us}/accounting-firms/{city}/` | City hub page |
| `/accounting-firms/{city}/{firm}[.html]` | 301 → `/uk/` equivalent |
| `/api/enquiry` (POST) | Save lead to Supabase + Zapier (country derived from Referer) |
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

The Worker bundles `accountant-profile-template.html`, `city-template.html`, `us-state-index-template.html`, and `us-state-hub-template.html` as text strings at deploy time. `render.js` replaces `{{TOKEN}}` placeholders with firm/country data and returns complete HTML.

All templates are **country-aware** — the same template serves UK, US, and AU pages. Country-specific content (footer, mega menu, tax estimator visibility, logo, location format) is injected via tokens generated in `render.js` based on `firm.country`.

**Firm profiles** have 5 tiers based on badge status, claimed status, and review count — the tier determines which schema blocks, CTAs, and copy appear.

**City hubs** rank firms by a hybrid score: `log(reviews) × rating × (1 + content bonuses)`. Bonuses for claimed status, populated specialisms, bio, accreditations, and differentiators.

**US state hubs** group firms by their `suburb` column (2-letter state code). `/us/accounting-firms/ca/` shows all California cities; `/us/accounting-firms/` shows all states ranked by firm count.

**Firm count** shown on profile pages is queried dynamically from D1 per country and cached for the lifetime of each Worker instance.

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

The US site has no tax estimator (different tax system). The tax estimator and HMRC overpayment radar are hidden on US firm profile pages via the `{{TAX_ESTIMATOR_DISPLAY}}` token.

---

## Assets

Drop all media files into `/assets/`. Current files:

| File | Used on |
|---|---|
| `taxready-hero.mp4` | UK/AU homepage hero video + find-accountant Live now widget |
| `taxready-hero-us.mp4` | US homepage hero video + US find-accountant widget |
| `taxready-hero-aus.mp4` | AU homepage hero video |
| `freelancer.png` | UK/AU homepage foreground figure |
| `freelancer-us.png` | US homepage foreground figure |
| `freelancer-aus.png` | AU homepage foreground figure |
| `taxready.svg` | Main logo (used across UK, US and AU) |
| `taxready-badge.svg` / `taxready-32.png` / `taxready-180.png` | Favicon variants |
| `workiro-logo-*.svg` | Workiro partner branding |
| `xu-magazine-logo.webp` | Press feature logo |
| `cash-icon.json`, `find-icon.json` | Lottie animations for CTAs |
| `builder.png`, `creative.png`, etc. | Segment page illustrations |

The correct logo is injected via the `{{LOGO_SRC}}` token in Worker-rendered templates — no hardcoding needed in those files.

---

## Find accountant pages

Both UK and US have a standalone find-accountant page that loads all firms from `accountants-template.csv` client-side, displays them on a Leaflet map, and runs an AI-match scoring algorithm.

**UK** (`/uk/find-accountant/`) — geocodes postcodes via [postcodes.io](https://postcodes.io); filters to `country === 'GB'` firms only.

**US** (`/us/find-accountant/`) — supports zip code (geocoded via Nominatim), city name, full state name (e.g. "Texas"), or 2-letter state code (e.g. "TX"). State searches show all firms in that state ranked by rating/trust rather than proximity. Filters to `country === 'US'` firms only.

---

## For-accountants (claim) pages

`/uk/for-accountants/` and `/us/for-accountants/` are the firm signup pages. They show a competition map (real firm dots from the CSV, colour-coded by tier) to motivate accountants to claim their profile. Form submissions go to Supabase (`accounting_firms` table) and trigger a Zapier webhook.

Country is derived server-side from the `Referer` header — no client-side changes needed when adding new country pages.

---

## Conventions

- **Template tokens** are `{{UPPERCASE_SNAKE}}`. Never use double-brace syntax for anything else in the templates.
- **`specalist_segments`** — the column name is misspelled in the CSV and the code matches it intentionally. Do not fix the spelling without updating all references.
- **`suburb` column for US firms** — stores the 2-letter state code (e.g. `CA`, `TX`). This drives state hub routing, location display (`Chicago, IL`), and the state search in find-accountant.
- **Generated output is committed** — `sitemap.xml`, `uk/accounting-firms/other/index.html`, `workers/firm_hashes.json`, and `workers/firm_dates.json` are all tracked in git. That is correct.
- **No package manager or bundler** for the hand-authored pages. CSS and JS are served as-is.
- **`accounting-firms/` output directory** — the old static generator (`generate.py`) has been removed. Firm profiles and city hubs are now Worker-rendered from D1. Do not add generated HTML back to this path.