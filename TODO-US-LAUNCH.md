# US Launch TODO

Tasks to complete before merging `feature/us-expansion` into `main` and going live.

Work through these in order — steps 1–4 can be done in any order, but steps 5–8 must follow each other sequentially.

---

## 1. Add US hero assets

Drop two files into `/assets/`:

| File | Purpose |
|---|---|
| `assets/taxready-hero-us.mp4` | Hero background video on `/us/` homepage + "Live now" widget on `/us/find-accountant/` |
| `assets/freelancer-us.png` | Foreground figure on `/us/` homepage |

Both pages already reference these filenames. Until the files exist the video areas will be blank.

---

## 2. Create `/us/accounting-firms/index.html`

The US mega menu and footer both link to `/us/accounting-firms/` — that page doesn't exist yet. The UK equivalent is `uk/accounting-firms/index.html` (a static city directory listing). A US version needs creating that:

- Lists US cities (once firms are imported the city slugs will be known)
- Links to `/us/accounting-firms/{city}/` for each city
- Matches the UK page's style and structure

Can be done after firms are added to the CSV (step 5) so city names are known.

---

## 3. Remove GeoTargetly — replace with Cloudflare Worker geo-redirect

GeoTargetly is wired up in `index.html` but the account ID is a placeholder (`GT-XXXXXXXX`). Currently everyone is sent to `/uk/` after the 1.5-second fallback regardless of location.

### In `workers/wrangler.toml`

Add a new route:
```toml
[[routes]]
pattern = "taxready.me/"
zone_name = "taxready.me"
```

### In `workers/src/index.js`

Add this block at the very top of the `fetch` handler, before all other route checks:
```js
// Root domain: server-side geo-redirect using Cloudflare IP data (free, no third party)
if (path === '/') {
  const cc = (request.cf && request.cf.country) || '';
  const country = cc === 'AU' ? 'au' : cc === 'US' ? 'us' : 'uk';
  return Response.redirect(`https://taxready.me/${country}/`, 302);
}
```

### In `index.html`

Replace the entire `<script>` block (the one containing `gtCallback`, `GT-XXXXXXXX`, and the `localStorage` logic) and the GeoTargetly `<script src>` tag with a simple HTML fallback:
```html
<meta http-equiv="refresh" content="0;url=/uk/">
```
This only fires if the Worker doesn't respond (Cloudflare outage etc.) and sends everyone to `/uk/` as a safe default.

**No SEO or functional impact** — same destination URLs, server-side redirect is faster and more reliable than the JS approach.

---

## 4. Update `TOTAL_FIRM_COUNT` in the Worker

In `workers/src/index.js`, line 18:
```js
const TOTAL_FIRM_COUNT = 5153;
```
Update this to the new total once US firms are added to the CSV. This number appears on every firm profile page ("from X,000+ verified firms"). Round down to the nearest thousand and add a `+`.

---

## 5. Add US firms to CSV

Add US accounting firms to `accountants-template.csv`. Each row must have:

- `country` = `US`
- `city` — US city name
- `latitude` / `longitude` — required for maps and nearby-city calculations
- `postcode` — US zip code
- All other columns follow the same format as UK firms

Once added, city slugs will be known and step 2 (`/us/accounting-firms/index.html`) can be completed.

---

## 6. Run the import pipeline

```bash
# Generate import.sql from the updated CSV
python3 workers/import_csv_to_d1.py

# Push to the live D1 database
wrangler d1 execute taxready-firms --file=workers/import.sql --remote
```

Commit `workers/firm_hashes.json` and `workers/firm_dates.json` after running — these track per-firm change dates for the sitemap.

---

## 7. Deploy the Worker

```bash
cd workers
wrangler deploy
```

This deploys all Worker changes including: US route, root geo-redirect, country isolation fixes, and hreflang improvements made in this branch.

---

## 8. Regenerate and submit the sitemap

```bash
python3 generate_sitemap.py
```

Commit the updated `sitemap.xml`. Then in **Google Search Console**:
- Go to the root domain property (or add `taxready.me/us/` as a sub-property if preferred)
- Submit the new `sitemap.xml`
- US city hub and firm profile URLs will be picked up by Google once firms exist in D1

---

## 9. Merge `feature/us-expansion` to `main`

Once all the above are done, open a PR from `feature/us-expansion` → `main` and merge. GitHub Pages will deploy the static files (US pages, updated sitemap) and the Worker deployment (step 7) will already be live.

---

## Checklist

- [ ] `assets/taxready-hero-us.mp4` added
- [ ] `assets/freelancer-us.png` added
- [ ] `us/accounting-firms/index.html` created (after firms are known)
- [ ] GeoTargetly removed from `index.html`
- [ ] Worker root redirect added (`wrangler.toml` + `index.js`)
- [ ] `TOTAL_FIRM_COUNT` updated in `workers/src/index.js`
- [ ] US firms added to `accountants-template.csv`
- [ ] Import pipeline run (`import_csv_to_d1.py` + `wrangler d1 execute`)
- [ ] Worker deployed (`wrangler deploy`)
- [ ] Sitemap regenerated and committed
- [ ] Sitemap submitted to Google Search Console
- [ ] `feature/us-expansion` merged to `main`
