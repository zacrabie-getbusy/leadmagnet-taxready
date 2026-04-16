# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

TaxReady is a static marketing/lead-gen site hosted on GitHub Pages (custom domain `taxready.me`, see `CNAME`). It has two distinct parts:

1. **Hand-authored segment pages** at the repo root (`index.html`, `construction.html`, `freelancer.html`, `landlord.html`, etc.) — one per UK tax-filer persona. These all load the shared `css/main.css` and `js/core.js` and render by calling `showSeg('<segment-key>')` on `DOMContentLoaded`. Segment-specific copy, tiers, placeholder accountants, etc. live in the `SEGMENTS` object at the top of `js/core.js`, not in the HTML.

2. **Generated accountant profile pages** — 2,690 pages under `accounting-firms/{city_slug}/{firm_slug}.html`, built from a single CSV + single HTML template by `generate.py`.

`OPS-HANDOFF.md` is the ops-facing guide written for the non-technical person who maintains the CSV; read it for business context on columns, claim workflow, page states, and the planned `/uk/` URL restructure.

## Generator pipeline (`generate.py`)

This is the only build step in the repo. It is the single source of truth for how profile pages are produced.

```bash
python3 generate.py              # write all pages to accounting-firms/
python3 generate.py --dry-run    # list what would be generated, no files written
```

- **Inputs:** `accountants-template.csv` (one row per firm) and `accountant-profile-template.html` (single template with `{{TOKEN}}` placeholders).
- **Output path:** `accounting-firms/{city_slug}/{firm_slug}.html`. Slugs are pulled from the CSV's `city_slug` / `firm_slug` columns if present, otherwise derived via `slugify()` from `city` / `name`. Duplicate `(city, firm)` pairs overwrite silently.
- **`build_page()`** does plain string replacement of `{{FIRM_NAME}}`, `{{FIRM_CITY}}`, `{{FIRM_LAT}}`, `{{FIRM_BADGE_URL}}`, `{{IS_CLAIMED}}`, etc. — see the `replacements` dict for the full list.
- **`derive_segments()`** converts the `flag_hospitality`, `flag_construction`, ... boolean columns into the human-readable `{{FIRM_SEGMENT}}` string using `FLAG_TO_SEGMENT`. If the CSV's `specalist-segments` column (note the typo, preserved intentionally) is filled, it overrides the derivation.
- **`clean_schema()`** strips JSON-LD fields that would be invalid when their data is blank: the `image` line for unbadged firms, the whole `aggregateRating` block when rating/reviews are missing, `knowsAbout` and fee-related FAQ questions when specialisms/fees are empty, and populates `sameAs` from `website`. If you add new placeholders with required-by-schema semantics, extend this function rather than letting empty strings leak into the output.
- **`strip_preview_block()`** removes the in-template preview UI (the `TXPREVIEW` / `tx-state-btn` toolbar, styles, and script). That toolbar only exists so designers can open `accountant-profile-template.html` directly in a browser and cycle through the 5 page states — it must never appear on generated pages. If you refactor the preview code, keep the regexes in `strip_preview_block()` in sync or generated HTML will leak internal tooling.

### Page states

Every generated page renders in one of 5 states, chosen at runtime by JS in the template based on CSV data (not baked in at generate time): badge+unclaimed, verified+unclaimed, claimed+badge, claimed+no-badge, pending (<10 reviews). The triggers are documented in `OPS-HANDOFF.md` Part 7. When editing the template, verify changes against all five `TXPREVIEW` states.

## Deployment (GitHub Actions)

`.github/workflows/generate-pages.yml` runs `generate.py` in CI, then commits `accounting-firms/` back to `main`. GitHub Pages then serves it.

**Auto-generation on CSV/template push is currently disabled** (the `push:` trigger is commented out — see the last commit `365598b`). Only `workflow_dispatch` (manual "Run workflow" button) is active until ops confirms data is clean. Do not re-enable the push trigger without explicit sign-off; that's what the comment in the workflow is protecting.

## Conventions to preserve

- **No package manager, no bundler, no build step for the hand-authored pages.** CSS and JS are served as-is from `css/main.css` and `js/core.js`. Don't introduce a toolchain just to add a feature — match the existing style.
- **Template tokens are `{{UPPERCASE_SNAKE}}`** and are replaced by naive string substitution. Don't use double-brace syntax for anything else in the template, or it'll get replaced.
- **The `specalist-segments` CSV column is misspelled** and the code matches the misspelling. Don't "fix" it without also renaming in the CSV and anywhere the column is referenced.
- **Generated output is committed to the repo** (`accounting-firms/` is tracked). That's intentional — GitHub Pages serves from the committed tree. Don't `.gitignore` the output directory.
- A `/uk/` URL restructure is planned but not yet implemented (see `OPS-HANDOFF.md` Part 1). Until it lands, the canonical URL pattern in the template is `/accounting-firms/{city_slug}/{firm_slug}`. When the restructure happens, `DOMAIN`-derived URLs in `generate.py` and all `{{FIRM_CITY_SLUG}}` / `{{FIRM_SLUG}}` references in the template need to move together, plus 301s for every old path.
