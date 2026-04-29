**Heads up — directory SEO regression to fix**

The static firm/city pages got removed in commits `7ab5939a` and `b27793f2`, leaving everything served by `404.html`. GitHub Pages serves `404.html` with HTTP 404 status, so Google deindexes those URLs regardless of how nicely they render. Sitemap dropped from 4,266 URLs to 12.

**Recovery is ~30 minutes:**

```
git checkout b27793f2a^ -- generate.py
python3 generate.py
python3 generate_city_pages.py
python3 generate_sitemap.py
git add -A && git commit -m "Restore static directory pages + sitemap"
git push origin main
```

Then resubmit `https://taxready.me/sitemap.xml` in Search Console.

**Keep everything else as-is** — the CSV growth (5,291 rows now), enrichment scripts, /uk/find-accountant/ port, and 404.html dynamic logic all stay. The 404.html keeps doing its job as a fallback for malformed URLs.

Full breakdown + verification steps in `HANDOFF-SEO-RESTORATION.md` on `main`.
