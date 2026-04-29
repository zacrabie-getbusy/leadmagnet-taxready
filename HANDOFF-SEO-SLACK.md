Hey team — wanted to flag something on the directory architecture and share a recovery plan.

We've put a lot of work into making the firm/city pages rank programmatically for SEO (every "[firm] [city]" and "accountants [city]" search is the prize), but I noticed after the recent commits — particularly `7ab5939a` (*"remove city index files and created one 404 redirect file"*) and `b27793f2` (*"Remove python script that keeps trying to generate individual index files per firm"*) — the static firm + city pages got replaced with a single 404.html that renders dynamically from the CSV.

The catch: **GitHub Pages serves 404.html with HTTP 404 status code**, even when the page renders fine in a browser. Google deindexes 404'd URLs regardless of how they look. So our 4,012 firm pages + 242 city hubs are currently invisible to search. Sitemap dropped from 4,266 URLs to 12.

I asked Claude (which had full context from the prior architecture work — the templates, the schema choices, hybrid scoring, etc.) to map out the recovery. The crisp version:

```
git checkout b27793f2a^ -- generate.py
python3 generate.py
python3 generate_city_pages.py
python3 generate_sitemap.py
git add -A && git commit -m "Restore static directory pages + sitemap"
git push origin main
```

Then resubmit `https://taxready.me/sitemap.xml` in Google Search Console.

About 30 minutes total. **All the recent CSV work is preserved** — the row growth (4,025 → 5,291 firms), the enrichment scripts (`_enrich_utils.py`, `enrich_batch.py`, `enrich_new_rows.py`), the `/uk/find-accountant/` port, and the 404.html dynamic logic all stay. 404.html keeps doing its job as a fallback for malformed URLs (typos etc.) — it just shouldn't be the primary rendering path for the canonical URLs we want indexed.

Full doc with rationale, architecture comparison, verification commands, and notes on future dynamic-rendering options is on main:
**`HANDOFF-SEO-RESTORATION.md`** — https://github.com/zacrabie-getbusy/leadmagnet-taxready/blob/main/HANDOFF-SEO-RESTORATION.md

Happy to walk through any of it if useful 🙏
