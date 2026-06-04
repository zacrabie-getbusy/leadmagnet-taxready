# AU Launch Checklist

Everything that needs to be activated, built, or updated when AU goes live.

---

## 1. Worker — add AU to the geo-redirect

**File:** `workers/src/index.js` — line 47

Change:
```js
const country = cc === 'US' ? 'us' : 'uk';
```
To:
```js
const country = cc === 'US' ? 'us' : cc === 'AU' ? 'au' : 'uk';
```

---

## 2. Worker — uncomment the AU route

**File:** `workers/wrangler.toml` — lines 30–32

Change:
```toml
# [[routes]]
# pattern = "taxready.me/au/accounting-firms/*"
# zone_name = "taxready.me"
```
To:
```toml
[[routes]]
pattern = "taxready.me/au/accounting-firms/*"
zone_name = "taxready.me"
```

Then run `wrangler deploy` from the `workers/` directory.

---

## 3. AU pages — flip back to indexable

**All 10 files** (run this from the repo root):
```bash
for f in au/index.html au/estimate/construction/index.html au/estimate/creative/index.html au/estimate/employed/index.html au/estimate/freelancer/index.html au/estimate/healthcare/index.html au/estimate/hospitality/index.html au/estimate/landlord/index.html au/estimate/retail/index.html au/estimate/small-business/index.html; do
  sed -i 's/content="noindex, nofollow"/content="index, follow"/g' "$f"
done
```

---

## 4. AU homepage — restore the CTA link

**File:** `au/index.html` — around line 291

Remove the comment wrapper and update the href. Replace:
```html
<!-- AU for-accountants page not yet live — uncomment and update href to /au/for-accountants/ when ready
<a href="/au/for-accountants/" style="...">
  Claim my free profile →
</a>
-->
```
With:
```html
<a href="/au/for-accountants/" style="display:inline-flex;align-items:center;gap:10px;background:#00B1B2;color:#fff;font-family:'IBM Plex Sans',sans-serif;font-size:16px;font-weight:700;padding:18px 36px;border-radius:12px;text-decoration:none;transition:opacity .15s;" onmouseover="this.style.opacity='.87'" onmouseout="this.style.opacity='1'">
  Claim my free profile →
</a>
```

---

## 5. Build the missing AU pages

These pages are linked in the AU footer and mega-menu but don't exist yet:

| Page | Model on |
|---|---|
| `au/find-accountant/index.html` | `us/find-accountant/index.html` |
| `au/for-accountants/index.html` | `us/for-accountants/index.html` |
| `au/for-accountants/intro/index.html` | `us/for-accountants/intro/index.html` |

---

## 6. Import AU firms into D1

Once the AU CSV rows are ready:
```bash
python workers/import_csv_to_d1.py
wrangler d1 execute taxready-firms --file=workers/import.sql --remote
```

---

## 7. Add AU URLs to the sitemap

```bash
python generate_sitemap.py
```

Verify AU city hub and firm profile URLs appear in `sitemap.xml` before pushing.
