# SEO restoration — what's needed

Recovery guide for restoring the indexable directory architecture that
existed before commits `7ab5939a` and `b27793f2`.

---

## TL;DR

```bash
git checkout b27793f2a^ -- generate.py
python3 generate.py
python3 generate_city_pages.py
python3 generate_sitemap.py
git add -A && git commit -m "Restore static directory pages + sitemap"
git push origin main
```

Then resubmit `https://taxready.me/sitemap.xml` in Google Search Console.

~30 minutes total. CSV, enrichment scripts, /uk/find-accountant/ port,
and 404.html dynamic rendering all stay as-is.

---

## The problem

GitHub Pages serves `404.html` with HTTP **404 status**. Pages rendered
that way are deindexed by Google within days regardless of how nicely
they render in the browser.

**Before commits `7ab5939a` and `b27793f2`:**
- 4,012 firm profile static files → HTTP 200 → indexable
- 242 city hub static files → HTTP 200 → indexable
- Sitemap: 4,266 URLs

**Currently:**
- 0 firm profile files → URLs served by 404.html with HTTP 404 → deindexed
- 0 city hub files (master directory only) → same
- Sitemap: 12 URLs

The directory's SEO value (programmatic ranking for *"[firm] [city]"* and
*"accountants [city]"* head terms) is currently zero.

---

## Preserve

The following must NOT be reverted:

- `accountants-template.csv` — grew 4,025 → 5,291 rows, with major
  field population improvements (specialisms 16% → 41%, bio 0% → 39%,
  website 0% → 56%, accreditations 34% → 40%, client_type 0% → 34%)
- `_enrich_utils.py`, `enrich_batch.py`, `enrich_new_rows.py` —
  enrichment workflow
- `uk/find-accountant/index.html` — port from root
- `uk/for-accountants/index.html` — profile-claim improvements
- `404.html` — dynamic CSV-lookup logic stays as a fallback for
  malformed URLs (just not as the primary rendering path)

---

## Restore

### 1. `generate.py`

```bash
git checkout b27793f2a^ -- generate.py
```

Recovers the 482-line firm-profile generator from immediately before
its removal. Compatible with the current CSV column structure
(slugify + token replacement logic is stable across the intermediate
commits).

### 2. Firm profile pages (~4,000 static files)

```bash
python3 generate.py
```

Outputs to `uk/accounting-firms/{city_slug}/{firm_slug}/index.html`.
~30s runtime. Skips rows with missing name/city.

### 3. City hub pages (~240 static files) + master directory

```bash
python3 generate_city_pages.py
```

Outputs city hubs at `uk/accounting-firms/{city_slug}/index.html` and
rebuilds master at `uk/accounting-firms/index.html`.

### 4. Sitemap

```bash
python3 generate_sitemap.py
```

Reads the now-existing static files and emits ~4,260 URLs to
`sitemap.xml`. Currently emits 12 because there are no static files
to enumerate.

### 5. Commit + push

Single large commit (~4,250 new files). Live on GitHub Pages within
~3 minutes of push.

### 6. Re-submit sitemap

`https://taxready.me/sitemap.xml` in Google Search Console.
Triggers re-crawl; typical time-to-reindex is 3–7 days.

---

## 404.html role after restoration

After recovery, 404.html becomes a fallback rather than primary rendering:

- Visitor types `/uk/accounting-firms/manchstr/sk-/` (typo) → static file
  doesn't exist → 404.html serves with its dynamic CSV lookup → can
  offer "did you mean Manchester?" suggestions
- All real URLs (4,000+ firms, 242 cities, master directory) hit static
  files first and return HTTP 200

The dynamic logic stays useful for graceful error UX. The static files
do the SEO work.

---

## Architecture comparison

| Approach | Indexable URLs | Disk | SEO | Status |
|---|---|---|---|---|
| Static files | 4,266 | ~50MB | 10/10 | Recovery target |
| Dynamic 404.html only | 12 | <1MB | 2/10 | Current state |
| Hybrid (master+cities static, firms dynamic) | 254 | ~5MB | 5/10 | Not recommended |

---

## If dynamic rendering is wanted at scale (future)

Truly dynamic page generation (firm pages computed on demand,
returning HTTP 200) requires moving off GitHub Pages:

- **Cloudflare Pages** — `_redirects` with status code 200
- **Vercel / Netlify** — serverless functions render templated HTML
- **Self-hosted** — Express/Flask serving CSV-driven templates

Static-files-on-GitHub-Pages is simpler and works. Migration only
makes sense if disk usage or regen friction becomes a real problem.

---

## Open questions

- The `city_slug='other'` suburb-bucket logic from commits `e8f3a6ad`
  and `903c825da` is no longer present in the CSV (0 rows match).
  Either roll forward (finish suburb splits) or consider it deprecated.
- Geotargetly account ID still pending — `GT-XXXXXX` placeholder lives
  in the page but isn't blocking the SEO recovery.

---

## Verification after recovery

```bash
# Firm profile static files
find uk/accounting-firms -mindepth 3 -name "index.html" | wc -l   # → ~4,000

# City hub static files
find uk/accounting-firms -mindepth 2 -maxdepth 2 -name "index.html" | wc -l   # → ~240

# Sitemap entry count
grep -c "<loc>" sitemap.xml   # → ~4,260
```

Then in a browser:
- `https://taxready.me/uk/accounting-firms/manchester/` → 200 OK, city hub renders
- `https://taxready.me/uk/accounting-firms/manchester/sk-accountants/` → 200 OK, firm profile renders
