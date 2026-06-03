# TaxReady QA Report

**Date:** 2026-06-03  
**Environment:** Local wrangler dev — `http://localhost:8787`  
**Worker source:** `workers/src/index.js` + `render.js` (post-code-review fixes + token-leakage fix + `computeSEO` escaping fix applied)  
**Note on caching:** All requests use `?nocache=N` query parameters to bypass the Worker's `caches.default` layer, ensuring fresh renders for every check.

---

## Test Inventory

| Page type | URL tested | HTTP status |
|-----------|-----------|-------------|
| UK firm profile (89 reviews, has website) | `/uk/accounting-firms/edinburgh/lacey-accounting/` | 200 |
| UK firm profile (exactly 10 reviews, no website) | `/uk/accounting-firms/edinburgh/contractor-accounts-ltd/` | 200 |
| UK firm profile (`&` in name — Cowan & Partners) | `/uk/accounting-firms/edinburgh/cowan-partners-limited/` | 200 |
| UK city hub | `/uk/accounting-firms/edinburgh/` | 200 |
| US state index | `/us/accounting-firms/` | 200 |
| US firm profile | N/A — local D1 contains GB data only | 404 |
| US city hub | N/A — local D1 contains GB data only | 404 |
| 404 (non-existent firm) | `/uk/accounting-firms/london/this-does-not-exist/` | 404 |

> **Local D1 data note:** The local wrangler dev database contains **4,889 GB firms only**. The CSV and D1 have `GB` and `US` country codes — no AU data exists. Every firm in the DB has a minimum of 10 reviews; there are no sub-10-review firms to test against.

---

## Section 1 — Page Rendering

### [PASS] UK firm profile (10+ reviews) — status, title, meta, canonical, JSON-LD
- **URL:** `/uk/accounting-firms/edinburgh/lacey-accounting/`
- **Issue:** None
- **Detail:** HTTP 200. Title: `Lacey Accounting | Top-rated Accountant in Edinburgh | TaxReady`. Meta description populated. Canonical `https://taxready.me/uk/accounting-firms/edinburgh/lacey-accounting/` matches request URL. `aggregateRating` block present and valid (89 reviews). `sameAs: ["https://laceyaccounting.co.uk"]` — properly JSON-stringified. All 3 JSON-LD blocks parse without error. No `{{TOKEN}}` placeholders in page source. Footer: `4,000+` (live D1 count, correct for local DB size — see Section 1 footer note).

### [PASS] UK firm profile (10 reviews, boundary) — aggregateRating correctly present
- **URL:** `/uk/accounting-firms/edinburgh/contractor-accounts-ltd/`
- **Issue:** None
- **Detail:** HTTP 200. `aggregateRating` is **present** — correct, because the removal condition is `reviews < 10` and this firm has exactly 10. `sameAs: []` (no website). All 3 JSON-LD blocks valid. No token leakage. Footer: `4,000+`.

> **No-sub-10-reviews note:** The data set has no firms with fewer than 10 reviews (confirmed by DB query — minimum is 10). The `reviews < 10` branch in `cleanSchema` is untestable against real data. The boundary condition at 10 reviews was verified instead.

### [PASS] UK firm profile (special characters — `&` in name) — escaping correct
- **URL:** `/uk/accounting-firms/edinburgh/cowan-partners-limited/`
- **Issue:** None
- **Detail:** HTTP 200. `<title>`, `<meta name="description">`, and `<meta property="og:title">` all correctly contain `Cowan &amp; Partners Limited`. JSON-LD blocks contain raw `&` (not `&amp;`) — correct, since JSON strings inside `<script>` tags do not require HTML entity encoding. All 3 JSON-LD blocks parse as valid JSON. No token leakage.

### [WARN] Firm name raw `&` in HTML body text (template scope)
- **URL:** `/uk/accounting-firms/edinburgh/cowan-partners-limited/`
- **Issue:** 16 HTML body elements (h1, h2, div text content, alt attributes, form paragraphs) contain `Cowan & Partners Limited` with a raw `&`. These originate from `{{FIRM_NAME}}` being replaced by `jsStr(firm.name)`, which is appropriate for JS string contexts but does not HTML-encode the value for HTML content contexts.
- **Detail:** The affected elements include `<h1 id="hero-firm-name">`, `<div id="about-title">`, form headings, badge alt text, and several paragraph elements. A raw `&` in HTML text content is technically invalid but renders correctly in all browsers (the `&` is not followed by a known entity name, so it displays as a literal ampersand). No current CSV records contain `<` or `>` in firm names, so there is no XSS risk with present data.
- **Fix (out of scope for this run):** The template requires two separate tokens — one for JS contexts (`jsStr`) and one for HTML content contexts (`esc`) — or a second replacement pass for HTML body elements. This is a pre-existing template architecture issue.
- **Priority:** Low

### [PASS] UK city hub — correct status, firm count, card escaping, JSON-LD
- **URL:** `/uk/accounting-firms/edinburgh/`
- **Issue:** None
- **Detail:** HTTP 200. Title: `Best Accounting Firms in Edinburgh | 38 Local Firms | TaxReady`. Meta and canonical correct. 38 firm cards rendered. No `{{TOKEN}}` placeholders. JSON-LD block (38,874 chars) parses as valid JSON. Firm card for "Cowan & Partners Limited" correctly renders `Cowan &amp; Partners Limited` in the `<h3>` element — the `esc()` fix is working. No raw `&` in card HTML. No `/us/` links leaked into page.

### [PASS] US state index — renders correctly with empty data set
- **URL:** `/us/accounting-firms/`
- **Issue:** None
- **Detail:** HTTP 200. Title: `US Accounting Firms Directory | 0 Verified Firms | TaxReady`. Meta description: `Browse 0 verified US accounting firms across 0 states...`. No token leakage. JSON-LD block (1,517 chars) is valid JSON. The page degrades gracefully to an empty-but-functional state when no US data is loaded.

### [PASS] 404 page — correct status, noindex, no token leakage
- **URL:** `/uk/accounting-firms/london/this-does-not-exist/`
- **Issue:** None
- **Detail:** HTTP 404. Title: `Not found | TaxReady`. `<meta name="robots" content="noindex">` present. "Page not found" copy present. No `{{TOKEN}}` placeholders.

### [INFO] Footer firm count reflects live D1 count, not hardcoded value
- **URL:** All UK pages
- **Issue:** None (informational)
- **Detail:** Footer shows `4,000+` on all tested pages. This is the dynamically computed value: `Math.floor(4889/1000) + ',000+'` where 4,889 is the actual GB firm count in the local D1. The hardcoded `5,000+` that previously appeared on city hub pages has been replaced by the live DB count. The local DB is an older import than production (production has 5,153+ firms); the footer will automatically update to the correct production count once the production D1 is refreshed.

---

## Section 2 — API Endpoints (GET only)

### [PASS] `GET /api/firm` returns valid JSON with expected fields
- **URL:** `http://localhost:8787/api/firm?firm_slug=lacey-accounting&city_slug=edinburgh`
- **Issue:** None
- **Detail:** HTTP 200. Body: `{"name":"Lacey Accounting","city":"Edinburgh","specialisms":"...","client_type":"...","accreditations":"..."}`. Valid JSON, five fields returned as documented.

### [PASS] `GET /api/claim` with nonexistent email returns `null` with status 502
- **URL:** `http://localhost:8787/api/claim?email=nonexistent%40test.com`
- **Issue:** None
- **Detail:** HTTP 502, body `null`. Supabase env var is not configured in local dev, so the fetch fails and the Worker returns 502 — confirming the `handleClaimGet` fix is in effect (previously this would have returned 200 with a swallowed error).

### [PASS] `GET /api/claim` with empty email returns `null` with status 200
- **URL:** `http://localhost:8787/api/claim?email=`
- **Issue:** None
- **Detail:** HTTP 200, body `null`. Early-return guard fires correctly; no Supabase call is attempted.

### [PASS] `GET /api/firm` with no parameters returns `null`
- **URL:** `http://localhost:8787/api/firm`
- **Issue:** None
- **Detail:** HTTP 200, body `null`. Missing-params guard fires correctly.

### [PASS] `GET /api/firms` returns full firm list with correct structure
- **URL:** `http://localhost:8787/api/firms?country=GB`
- **Issue:** None
- **Detail:** HTTP 200. 4,889 firms returned; each has `firmSlug`, `citySlug`, `country`, `lat`, `lng`, `rating`, `reviews`, and other expected fields.

---

## Section 3 — Static Assets

### [WARN] `/sitemap.xml` returns 301 from Worker in local dev (correct in production)
- **URL:** `http://localhost:8787/sitemap.xml`
- **Issue:** In local wrangler dev the Worker passes non-matched requests to the GitHub Pages origin via `fetch(request)`, which in turn responds with a 301 redirect to the HTTPS equivalent. The file is not directly reachable through the Worker locally.
- **Detail:** The static `sitemap.xml` file exists in the repo and contains **7,396 URL entries** with correct `<urlset>` structure, `taxready.me` domain, and `<lastmod>` dates (sample: `2026-06-03`). In production the Worker correctly passes through to GitHub Pages, which serves the file. This is a local dev limitation only.

---

## Section 4 — Token Leakage

### [PASS] No `{{TOKEN}}` placeholders on any tested page
- **URL:** All 6 tested pages (UK profiles ×3, UK city hub, US state index, 404)
- **Issue:** None
- **Detail:** Full sweep of all fetched pages found zero unreplaced `{{TOKEN}}` patterns. The footer claim-link token leakage (`{{FIRM_SLUG}}` / `{{FIRM_CITY_SLUG}}`) that was identified in the previous QA run is now resolved by moving `{{FOOTER_HTML}}` to the first position in the `replacements` object.

---

## Section 5 — Country Routing

### [PASS] UK firm slug under `/us/` returns 404
- **URL:** `http://localhost:8787/us/accounting-firms/edinburgh/lacey-accounting/`
- **Issue:** None
- **Detail:** HTTP 404. The `country = 'US'` filter in the D1 query prevents the GB firm from appearing under the US country path.

### [PASS] US slug under `/uk/` returns 404
- **URL:** `http://localhost:8787/uk/accounting-firms/new-york/h-r-block/`
- **Issue:** None
- **Detail:** HTTP 404. No US firms in local D1; in production the country filter would equally prevent a US firm appearing at a `/uk/` URL.

### [PASS] UK city hub contains UK-only content and links
- **URL:** `http://localhost:8787/uk/accounting-firms/edinburgh/`
- **Issue:** None
- **Detail:** JSON-LD schema contains `addressCountry: "GB"`. All navigation and footer links use `/uk/` paths. No `/us/` paths are present in the rendered HTML.

### [PASS] US city hub returns 404 when no US data is loaded
- **URL:** `http://localhost:8787/us/accounting-firms/new-york/`
- **Issue:** None
- **Detail:** HTTP 404 with "Page not found" copy. With no US firms in the local D1, the `MIN_FIRMS_FOR_CITY` guard correctly prevents a city hub from rendering.

---

## Section 6 — Redirect Behaviour

### [PASS] UK firm URL without trailing slash → 301
- **URL:** `http://localhost:8787/uk/accounting-firms/edinburgh/lacey-accounting`
- **Issue:** None
- **Detail:** HTTP 301 → `http://localhost:8787/uk/accounting-firms/edinburgh/lacey-accounting/`

### [PASS] UK city URL without trailing slash → 301
- **URL:** `http://localhost:8787/uk/accounting-firms/edinburgh`
- **Issue:** None
- **Detail:** HTTP 301 → `http://localhost:8787/uk/accounting-firms/edinburgh/`

### [PASS] US firm URL without trailing slash → 301
- **URL:** `http://localhost:8787/us/accounting-firms/dallas/acme-tax`
- **Issue:** None
- **Detail:** HTTP 301 → `http://localhost:8787/us/accounting-firms/dallas/acme-tax/` — redirect fires before the 404 is evaluated.

### [PASS] US city URL without trailing slash → 301
- **URL:** `http://localhost:8787/us/accounting-firms/dallas`
- **Issue:** None
- **Detail:** HTTP 301 → `http://localhost:8787/us/accounting-firms/dallas/`

### [PASS] Legacy `/accounting-firms/` firm URL → 301 to `/uk/`
- **URL:** `http://localhost:8787/accounting-firms/edinburgh/lacey-accounting`
- **Issue:** None
- **Detail:** HTTP 301 → `https://taxready.me/uk/accounting-firms/edinburgh/lacey-accounting/` (wrangler dev rewrites the production domain to localhost in Location headers). Legacy pattern is handled before trailing-slash normalisation.

### [PASS] Legacy `/accounting-firms/` city URL → 301 to `/uk/`
- **URL:** `http://localhost:8787/accounting-firms/edinburgh`
- **Issue:** None
- **Detail:** HTTP 301 → `https://taxready.me/uk/accounting-firms/edinburgh/`

### [PASS] Legacy `.html` URL → 301 to `/uk/` (extension stripped)
- **URL:** `http://localhost:8787/accounting-firms/edinburgh/lacey-accounting.html`
- **Issue:** None
- **Detail:** HTTP 301 → `https://taxready.me/uk/accounting-firms/edinburgh/lacey-accounting/` — the `(?:\.html)?` in the legacy pattern correctly strips the extension.

---

## Section 7 — XSS Escaping

### [PASS] `<title>` and `<meta>` tags correctly encode `&` as `&amp;`
- **URL:** `/uk/accounting-firms/edinburgh/cowan-partners-limited/`
- **Issue:** None
- **Detail:** `computeSEO()` now applies `esc()` to raw SEO strings before placing them into HTML attribute contexts. Verified:
  - `<title>Cowan &amp; Partners Limited | Top-rated Accountant in Edinburgh | TaxReady</title>` ✓
  - `<meta name="description" content="Cowan &amp; Partners Limited is a top-rated...">` ✓
  - `<meta property="og:title" content="Cowan &amp; Partners Limited | ...">` ✓

### [PASS] JSON-LD uses raw `&` (not double-encoded) and all blocks are valid JSON
- **URL:** `/uk/accounting-firms/edinburgh/cowan-partners-limited/`
- **Issue:** None
- **Detail:** All three JSON-LD `<script>` blocks contain `"name": "Cowan & Partners Limited"` with a raw `&` — correct for JSON context. No `&amp;` found in any JSON-LD block. All three blocks parse as valid JSON.

### [PASS] City hub firm cards correctly escape `&` as `&amp;`
- **URL:** `/uk/accounting-firms/edinburgh/`
- **Issue:** None
- **Detail:** The `firmCardHtml()` function applies `esc()` to firm names. The card `<h3>` for "Cowan & Partners Limited" renders as `Cowan &amp; Partners Limited`. No raw `&` in any `.cd-card-name` element. City hub is server-rendered (no client-side `bindPopup` in hub HTML), so there is no Leaflet popup injection concern.

### [WARN] Firm name `&` appears raw in 16 HTML body elements (pre-existing template issue)
- **URL:** `/uk/accounting-firms/edinburgh/cowan-partners-limited/`
- **Issue:** 16 HTML body elements (h1, h2, div text, alt attributes, form paragraphs) contain `Cowan & Partners Limited` with a raw `&`. These are all in elements whose text is populated via `{{FIRM_NAME}}` → `jsStr(firm.name)`, which escapes for JS context but not HTML context.
- **Detail:** Affected elements include `<h1 id="hero-firm-name">`, `<div id="about-title">`, `<h2 id="form-h">`, `<img alt="...">`, badge share text, and form copy. Raw `&` in HTML text content is technically invalid but renders correctly in all browsers. The other 11 raw `&` instances are in JSON-LD string values and the `var FIRM_NAME` JS declaration — both correct. No `<` or `>` characters exist in any current CSV firm name, so there is no exploitable XSS vector.
- **Fix (future):** Use a separate `{{FIRM_NAME_HTML}}` token for HTML body contexts (applying `esc()`), keeping `{{FIRM_NAME}}` for the `var FIRM_NAME = '...'` JS declaration. Alternatively, escape `{{FIRM_NAME}}` universally and encode the `'` in the JS string as `\'` (which `jsStr` already handles for the JS case).
- **Priority:** Low

### [PASS] No `<` or `>` characters found in any current firm name (XSS pre-condition absent)
- **URL:** All pages
- **Issue:** None
- **Detail:** Full CSV scan confirms zero firm names contain `<` or `>`. A firm name like `<script>` would create a stored-XSS vector via the raw `{{FIRM_NAME}}` HTML body substitution. The data is clean today; data validation on import (e.g. `import_csv_to_d1.py` could strip `<`/`>`) is recommended as a preventive measure.

---

## Summary

| 1 | Low | Raw `&` in 16 HTML body elements via `{{FIRM_NAME}}` → `jsStr` (pre-existing template issue) | WARN |
| 2 | Low | `jsStr()` does not escape `<`/`>` — latent XSS if a firm name ever contains angle brackets | WARN |
| 3 | Info | Local D1 is GB-only (4,889 firms); US routes and the `<10 reviews` branch are untestable locally | WARN |
| 4 | Info | `/sitemap.xml` returns 301 via Worker in local dev (passthrough is correct in production) | WARN |
| 5 | Info | Footer shows `4,000+` — accurate live D1 count for local DB; will reflect production count after next D1 import | INFO |

