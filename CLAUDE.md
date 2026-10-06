# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

TaxReady (`taxready.me`) is a UK + US accountant directory and tax-estimate lead-gen site. Two systems serve it:

1. **GitHub Pages** serves the static, hand-authored pages committed to this repo (`/uk/`, `/us/`, `/uk/estimate/*`, find-accountant, for-accountants, the UK master directory, `sitemap*.xml`, `robots.txt`). Pushing to `main` publishes them.
2. **A Cloudflare Worker** (`workers/`) sits in front of the routes listed in `workers/wrangler.toml`. It server-renders every firm profile, city hub and US state page on request from a **D1** database (`taxready-firms`), turns legacy URLs into 301s, and handles `/api/*`. Anything the Worker doesn't match is passed through to GitHub Pages. Deploying it is a separate step (`npx wrangler deploy`).

There are **no generated profile or hub files** in the repo, and `generate.py` no longer exists. `OPS-HANDOFF.md` has business context for the CSV columns and claim workflow. `HANDOFF-SEO-RESTORATION.md` is superseded; don't follow it.

## Who serves what

| URL | Served by | To change it |
|---|---|---|
| `/` and `/index.html` | Worker: 301 to `/uk/` for everyone. `/uk/` shows US visitors a dismissible "Looking for a US CPA?" banner, using `GET /api/geo` | `workers/src/index.js`, `uk/index.html` |
| `www.taxready.me/*` | Worker: 301 straight to the final apex URL (one hop). Only works if the www DNS record is proxied | `index.js` |
| `/uk/`, `/us/` (the home page **is** the map search), `/uk/estimate/*`, `/{uk,us}/for-accountants/` | GitHub Pages (static) | edit the file |
| `/{uk,us}/find-accountant/` | Worker: 301 to `/{uk,us}/` (query string kept, e.g. `?city=reading`). The static files are noindex redirect stubs | `index.js` |
| `/uk/accounting-firms/` (UK master directory) | GitHub Pages. Static `uk/accounting-firms/index.html`; its counts, A–Z hub list and ItemList schema are rewritten by `generate_sitemap.py` (`<!--dir:…-->` and `DIR-GRID` markers) | edit the file / rerun the script |
| `/{uk,us}/accounting-firms/{city}/` (city hubs) | Worker `handleCityHub` → `buildCityPage()` → `city-template.html` | `render.js` / template |
| `/{us,au}/accounting-firms/` and `/{us,au}/accounting-firms/{state}/` | Worker `handleStateIndex` / `handleStateHub` + `{us,au}-state-*-template.html` (per-country config: `STATE_REGIONS` in `render.js`) | same |
| `/{uk,us}/accounting-firms/{city}/{firm}/` (profiles) | Worker `handleFirmProfile` → `buildFirmProfile()` → `accountant-profile-template.html` | same |
| `/accounting-firms/*` (pre-`/uk/` paths), legacy `*.html` stubs, `/uk/accounting-firms/essex/`, `/{dir}/accounting-firms/other/…`, old mangled slugs, missing trailing slash | Worker: one 301 each (`resolveRedirect()`, `LEGACY_301`, `workers/slug_redirects.json`) | `index.js` (+ a `[[routes]]` entry for any new top-level path) |
| `/api/enquiry`, `/api/claim`, `/api/firm`, `/api/firms` | Worker → Supabase / Zapier / D1 | `index.js`, but treat these as stable |
| `/about/`, `/how-firms-are-ranked/` | GitHub Pages (static trust pages, linked from every Worker footer). The ranking page documents `hybridScore()` in `render.js`; keep them in sync | edit the file |
| `sitemap.xml` (index) + `sitemap-{core,uk-hubs,uk-profiles,us-hubs,us-profiles}.xml`, `robots.txt` | GitHub Pages (static, generated) | `generate_sitemap.py` |

The legacy root `*.html` "Redirecting…" stubs (`accountants.html`, `landlord.html`, etc.) still exist as files, but the Worker 301s those paths before GitHub Pages sees them. Delete the files once the Worker is live. `social.html` is an internal, noindex asset board and is deliberately not redirected.

AU (`/au/`) is built but not launched. See "Australia" below for the data steps and the launch checklist.

## Data pipeline

```
accountants-template.csv ──► workers/import_csv_to_d1.py ──► workers/import.sql ──► D1 taxready-firms
                                         │                         (gitignored)
                                         ├─► workers/firm_dates.json / firm_hashes.json  (per-firm lastmod; commit)
                                         └─► workers/slug_redirects.json                 (old slug → new URL; commit; only grows)
generate_sitemap.py ── imports load_firms() from the importer ──► sitemap*.xml + uk/accounting-firms/index.html
scripts/enrich_companies_house.py ──► workers/companies_house.json  (merged into the ch_* columns by the importer; commit)
```

- **Companies House facts** come from the free monthly bulk snapshot (`--download` fetches it, ~500 MB). Only certain matches are kept: same normalised name **and** same full postcode, active companies only, and no accounts date if the accounts are overdue. Director names are never collected. Profiles show them as plain sentences (`companyFactsHtml()`) with a source line, plus `foundingDate` / `identifier` in the JSON-LD. Refresh monthly: run the script, then the importer, then the sitemap.
- **`import.sql` rebuilds the table**: `DROP TABLE` + `workers/schema.sql` + inserts. Schema changes go in `schema.sql` only; there are no separate migrations.

- The CSV is read as UTF-8 (BOM OK), with a per-line cp1252 fallback. Slugs are **ASCII only**: accents are folded, look-alike Cyrillic/Greek letters are mapped, and U+FFFD and mojibake are dropped. The `firm_slug` / `city_slug` CSV columns override derivation when filled.
- Duplicate `(city_slug, firm_slug)` rows are skipped; the first row wins.
- Firms in the `Other` city bucket live under their suburb's hub (`profileHubSlug()` / `hub_slug()`). `/…/other/` URLs only ever 301.
- The `specalist-segments` / `specalist_segments` CSV column is misspelled on purpose. Keep the misspelling.

Updating production data is Matt's job (never run `--remote` commands from here): `python3 workers/import_csv_to_d1.py && cd workers && npx wrangler d1 execute taxready-firms --remote --file=import.sql`, then `python3 generate_sitemap.py` and commit the outputs.

## Australia (built, not launched)

Everything for `/au/` is in place but dark: the AU pages are `noindex`, the AU Worker routes are commented out, and the sitemap skips AU. Each switch is marked `AU-LAUNCH` in the code.

**Firm data pipeline** (official list first, then Google ratings):
1. `python3 scripts/au_tpb_candidates.py` downloads the Tax Practitioners Board public register (data.gov.au, CC BY 4.0) and writes `data/au/tpb_candidates.csv`. That's one row per registered tax-agent firm office, about 13,800; add `--include-bas` to include BAS agents.
2. `APIFY_TOKEN=… python3 scripts/au_google_match.py --run --limit 50` is a trial run of Apify's Google Maps Scraper (`compass/crawler-google-places`), taking the best result per firm. Check the match counts, then repeat without `--limit`. Raw results go to `data/au/google_results.json` (gitignored), so re-running the match doesn't cost anything.
3. `python3 scripts/au_google_match.py --apply` appends confident matches to `accountants-template.csv`:
   - columns: `country=AU`, `suburb` = state code, `city` = suburb;
   - match rule: same postcode, names agree, not closed, 10+ reviews;
   - TPB facts go to `workers/tpb_register.json`, which the importer merges into the `tpb_*` columns.

AU profiles then show "has been a registered tax agent with the Tax Practitioners Board since…" (`tpbFactsHtml()`). A TPB record counts as an official record in the index rule, like Companies House.

**Launching Australia** (after the data step):
1. `generate_sitemap.py`: add `'AU': 'au'` to `COUNTRY_DIR`.
2. `workers/wrangler.toml`: uncomment both AU routes.
3. `au/index.html` and `au/for-accountants/index.html`: set robots to `index, follow`.
4. Add `hreflang="en-au"` links to `uk/index.html`, `us/index.html` and both `for-accountants` pages.
5. Run `python3 workers/import_csv_to_d1.py` and `python3 generate_sitemap.py`, then do the normal D1 import, deploy, cache purge and merge.
6. Check `/au/`, `/au/accounting-firms/`, `/au/accounting-firms/nsw/` and a profile.

## Rendering (`workers/src/render.js`)

- **Page state** is decided server-side by `computeState()`: 1 badge + unclaimed, 2 verified + unclaimed, 3 claimed + badge, 4 claimed without badge, 5 pending (unclaimed, <10 reviews). Pending beats badge. It's emitted as `<body data-state="N">`.
- **Template blocks.** `stripBlocks()` keeps only matching blocks:
  - `<!-- STATE:1,3 START -->…<!-- STATE END -->` keeps the block in those page states.
  - `<!-- COUNTRY:GB START -->…<!-- COUNTRY END -->` keeps it for that market.
  - `<!-- HAS:ABOUT START -->…<!-- HAS END -->` keeps it only when the firm has that data (`ABOUT` = a bio or Companies House facts; `TAGS`; `CERTS`).

  Blocks of different kinds may nest; blocks of the same kind may not. Inactive states' markup never reaches the browser.
- **Preview tooling.** Everything between `<!-- TXPREVIEW-START -->` and `<!-- TXPREVIEW-END -->` is designer-only and is stripped by `stripPreviewBlock()`. Open `accountant-profile-template.html?preview=1&state=1..5&country=uk|us|au` directly in a browser to preview a state; the preview script applies the same block rules client-side. When editing the template, check all five states.
- **Tokens** are `{{UPPERCASE_SNAKE}}`, filled by `fillTokens()` with context-aware escaping: JSON inside `ld+json`, JS string literal inside other `<script>`s, HTML everywhere else. Raw-HTML tokens (`FOOTER_HTML`, `MENU_*`, `SIMILAR_FIRMS_HTML`, `SCHEMA_JSON`) are listed in `RAW_TOKENS`. Don't use double braces for anything else in templates, comments included.
- **Profile JSON-LD** is built as an object (`buildProfileSchema()`) and serialised, so blank fields are omitted rather than left as empty strings or dangling commas.
- **No `aggregateRating` in any schema.** The ratings are Google's, and Google's review-snippet guidelines only allow ratings the site collected itself. Show them as visible text ("4.8 · 62 Google reviews") only.
- **Honest status wording.** Only claimed firms (states 3–4) are described as "Verified" ("Verified by firm"). Unclaimed firms are "Listed on TaxReady". The badge copy claims top rating on Google reviews, nothing more.
- **Firm facts are server-rendered**: bio, specialism and certification chips, and detail cards (`chipLinksHtml()`, `detailCardsHtml()`). The client script only drives the rating stars, map, form and badge embed code.
- Profile titles are capped at 60 characters (`profileTitle()`). Hub titles come from `hubSeoTitle()`; "Best" is used only for hubs with 8+ firms.

## Index rules (one source of truth, mirrored in Python)

- **Profile** is indexable when claimed, OR when the firm lists specialisms or a website AND has either a bio of at least 25 words or a Companies House record (`isProfileIndexable()`). Every other profile is `noindex, follow` but stays live with its form and claim CTA.
- **Hub:** 8+ firms is index with the "Best" title; 3–7 is index with a plain title; 1–2 is `noindex, follow` but still live and still linked. US state hubs and the state index are always indexed.
- Hubs link only to indexable profiles. Non-indexable firms are listed without a profile link. Profiles show up to 6 indexable "Similar firms" from the same hub.
- `generate_sitemap.py` mirrors these rules exactly (`is_profile_indexable`, `hub_tier`). If you change one, change the other, then run `scripts/check_sitemap_parity.py` against `wrangler dev`.

## Local testing

```bash
python3 workers/import_csv_to_d1.py
cd workers
npx wrangler d1 execute taxready-firms --local --file=schema.sql
npx wrangler d1 execute taxready-firms --local --file=import.sql
npx wrangler dev                              # http://localhost:8787, local D1
python3 ../scripts/check_sitemap_parity.py    # from another terminal
```

Paths that fall through to GitHub Pages won't render locally. `wrangler dev` rewrites `Location` headers to `localhost`; add `--local-upstream=upstream.invalid` to see the real ones. The local Cache API persists in `workers/.wrangler/state/v3/cache`, so delete it after template changes.

## Conventions to preserve

- **No package manager, no bundler, no build step** for the static pages; `wrangler` bundles the Worker. Match the existing style.
- **Generated output is committed**: `sitemap*.xml`, the directory page's generated blocks, `firm_dates.json`, `firm_hashes.json` and `slug_redirects.json`. `workers/import.sql` is not committed.
- **Never `git push`, `wrangler deploy` or any `wrangler d1 … --remote`** without Matt. A push to `main` publishes the static site.
- Don't change the `/api/*` handlers, Supabase/Zapier wiring, the enquiry and claim forms, or `MAP_TILE_KEY` as part of unrelated work.
- Don't delete pages that hold links. Use `noindex, follow` or a 301. Don't create new programmatic pages or generated prose about named firms.
