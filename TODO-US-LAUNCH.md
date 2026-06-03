# US Launch TODO

Remaining tasks before the US site is fully live.

---

## 1. Remove GeoTargetly — replace with Cloudflare Worker geo-redirect

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

## 2. Regenerate and submit the sitemap

```bash
python3 generate_sitemap.py
```

Commit the updated `sitemap.xml`. Then in **Google Search Console**:
- Go to the root domain property (or add `taxready.me/us/` as a sub-property if preferred)
- Submit the new `sitemap.xml`
- US city hub and firm profile URLs will be picked up by Google once firms exist in D1

---

## Checklist

- [x] `assets/taxready-hero-us.mp4` added
- [x] `assets/freelancer-us.png` added
- [x] `assets/taxready-us.svg` added (US logo — drop into `/assets/` if not already there)
- [x] US state/city directory (`/us/accounting-firms/`) live via Worker
- [x] GeoTargetly removed from `index.html` — replaced with meta refresh fallback
- [x] Worker root redirect added (`wrangler.toml` + `index.js`)
- [x] Firm count now dynamic per country (queried from D1)
- [x] US firms added to `accountants-template.csv` (~1,895 firms)
- [x] Import pipeline run (`import_csv_to_d1.py` + `wrangler d1 execute`)
- [x] Worker deployed (`wrangler deploy`)
- [ ] GeoTargetly replaced with Cloudflare geo-redirect (see step 1 above)
- [ ] Sitemap regenerated and committed
- [ ] Sitemap submitted to Google Search Console