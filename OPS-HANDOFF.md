# TaxReady — Ops Handoff

## What this is

We've built a system that generates **2,690 individual accountant profile pages** from a single spreadsheet. Each page is SEO-optimised to rank on Google for local searches like *"accountant Edinburgh"* or *"small business accountant near me"*.

**You manage one file.** The system builds everything else.

---

## Part 1: The URL restructure (do this first)

We're moving from a flat site to a country-based structure so we can launch in Australia (and later the USA) without rebuilding anything.

### Recommended URL structure

```
taxready.me/                                    → Auto-redirects visitors to /uk/ or /au/ based on location (via Geotargetly)

taxready.me/uk/                                 → UK tax estimate (current homepage)
taxready.me/uk/estimate/construction/           → Construction & trades segment
taxready.me/uk/estimate/freelancer/             → Freelancer segment
taxready.me/uk/estimate/landlord/               → Landlord segment
taxready.me/uk/estimate/hospitality/            → Hospitality segment
taxready.me/uk/estimate/healthcare/             → Healthcare segment
taxready.me/uk/estimate/retail/                 → Retail segment
taxready.me/uk/estimate/creative/               → Creative segment
taxready.me/uk/estimate/employed/               → Employed (PAYE) segment
taxready.me/uk/estimate/small-business/         → Other small business segment

taxready.me/uk/for-accountants                  → Claim/sign-up page (currently accountants.html)

taxready.me/uk/accountants/                     → (future: directory/map page)
taxready.me/uk/accountants/edinburgh/           → (future: city landing page)
taxready.me/uk/accountants/edinburgh/lacey-accounting  → Individual firm profile

taxready.me/au/                                 → (June 30th: Australia launch — duplicate of /uk/ structure)
```

### Why this structure

| Decision | Reason |
|---|---|
| `/uk/` subfolder (not `uk.taxready.me`) | Keeps all domain authority in one place. Google recommends this. |
| `/uk/estimate/construction/` not `construction.html` | Each segment gets its own crawlable URL. You can now send Facebook traffic directly to `/uk/estimate/construction/` instead of hoping people scroll to it on the homepage. Each page ranks independently. |
| `/uk/accountants/{city}/{firm}` | "accountants" is the keyword people search. Clean hierarchy gives Google clear signals: UK → Accountants → Edinburgh → Firm Name. |
| `/uk/for-accountants` | Clear that this is for accounting firms, not clients. Short and memorable. |
| Root domain → geotarget redirect | When Australia launches, visitors from AU automatically land on `/au/`. UK visitors land on `/uk/`. One domain, multiple countries. |

### What needs to happen (developer tasks)

This is a one-time restructure. **You don't need to do these steps yourself** — they're development tasks. But here's what's happening so you understand:

1. **Move files** into the `/uk/` folder structure
2. **Update all internal links** in every HTML file (e.g., `href="/accountants.html"` → `href="/uk/for-accountants"`)
3. **Update the template and generator** to output pages to `/uk/accountants/{city}/{firm}.html` instead of `/accounting-firms/{city}/{firm}.html`
4. **Create 301 redirects** from every old URL to its new location, so nothing breaks:

| Old URL | Redirects to |
|---|---|
| `taxready.me/index.html` | `taxready.me/uk/` |
| `taxready.me/accountants.html` | `taxready.me/uk/for-accountants` |
| `taxready.me/construction.html` | `taxready.me/uk/estimate/construction/` |
| `taxready.me/freelancer.html` | `taxready.me/uk/estimate/freelancer/` |
| `taxready.me/accounting-firms/{city}/{firm}.html` | `taxready.me/uk/accountants/{city}/{firm}` |
| *(all other segment pages)* | `taxready.me/uk/estimate/{segment}/` |

5. **Set up Geotargetly** on the root domain to redirect based on visitor location

> **Important:** The 301 redirects preserve all existing Google rankings and any links already pointing to the current URLs. Nothing breaks. Google just learns the new address.

### When to do this

**Before generating the 2,690 pages.** There's no point generating pages at the old URLs and then immediately moving them. The sequence is:

1. Developer completes the restructure (move files, update links, set up redirects)
2. You clean the CSV data (see Part 2 below)
3. You push the CSV — pages auto-generate at the correct new URLs
4. Everything is live

---

## Part 2: Your spreadsheet — `accountants-template.csv`

This is the only file you manage. Every accountant profile page is generated from it.

### How to edit it

Open it in Google Sheets, Excel, or any spreadsheet tool. Each row = one accounting firm. Each column = one piece of data about that firm.

### What each column does

| Column | What it controls | Example | Required? |
|---|---|---|---|
| `name` | Firm name — appears in page title, headings, badge embed code, Google schema | Cloud 9 Accounting Team Ltd | Yes |
| `address` | Full street address shown on the profile | 3 Orchard Grove, Crombie, Dunfermline KY12 8JP, UK | Yes |
| `city` | City name — used in headlines, map, SEO, URL | Dunfermline | Yes |
| `rating` | Google star rating (number) | 4.8 | Yes |
| `reviews` | Google review count (whole number) | 47 | Yes |
| `latitude` | Map pin position — latitude | 56.0481753 | Yes |
| `longitude` | Map pin position — longitude | -3.5263858 | Yes |
| `postcode` | UK postcode | KY12 8JP | Yes |
| `2026-badge-winners` | Full URL of the badge image. If filled, this firm gets the "Top Accountant" badge on their page. If blank, no badge. | https://cdn.prod.website-files.com/... | Badge = URL, No badge = leave blank |
| `flag_hospitality` | Does this firm serve hospitality clients? | TRUE or FALSE | Yes |
| `flag_construction` | Does this firm serve construction clients? | TRUE or FALSE | Yes |
| `flag_healthcare` | Healthcare clients? | TRUE or FALSE | Yes |
| `flag_media` | Media & creative clients? | TRUE or FALSE | Yes |
| `flag_professional_services` | Professional services clients? | TRUE or FALSE | Yes |
| `flag_real_estate` | Real estate clients? | TRUE or FALSE | Yes |
| `flag_retail` | Retail clients? | TRUE or FALSE | Yes |

### Columns that fill in when a firm claims their profile

These are blank for most firms right now. They get populated when an accountant submits the claim form:

| Column | What it does | Example |
|---|---|---|
| `specialisms` | Comma-separated specialist tags | Self Assessment, VAT Returns, Payroll |
| `certifications` | Professional body memberships | ICAEW, ACCA, Xero Certified |
| `fees_from` | Monthly starting price (number only, no £ sign) | 149 |
| `bio` | One-paragraph firm description | The team at Cloud 9 has been helping small businesses... |
| `website` | Firm's own website URL | https://cloud9accounting.co.uk |
| `is_claimed` | Set to CLAIMED when a firm submits their details | CLAIMED (or leave blank) |

### Columns you don't need to touch

| Column | Why |
|---|---|
| `place_id` | Google Maps internal ID — used for data matching |
| `suburb` | Optional — not shown on pages |
| `outward_code` | Postcode prefix — not used on pages |
| `submitted-entry` | Internal tracking |
| `firm_slug` | Auto-generated from firm name (e.g. "cloud-9-accounting-team-ltd") |
| `city_slug` | Auto-generated from city (e.g. "dunfermline") |
| `specalist-segments` | Auto-derived from the flag columns — you don't need to fill this |

---

## Part 3: Adding new firms

To add a new firm, simply **add a new row** to the CSV with the required columns filled in. Push the update and the page generates automatically.

To add a new **badge winner**, paste the badge image URL into the `2026-badge-winners` column for that firm.

To **remove a firm**, delete the row. The old HTML file will still exist until someone manually deletes it from the `accounting-firms/` (or future `uk/accountants/`) folder, but it won't be linked from anywhere.

---

## Part 4: When a firm claims their profile

When an accountant submits their details through the claim form:

1. Find their row in the CSV
2. Set `is_claimed` to `CLAIMED`
3. Fill in whichever of these they provided: `specialisms`, `certifications`, `fees_from`, `bio`, `website`
4. Push the CSV update

Their page automatically switches from "unclaimed" mode (speaking to the firm owner, encouraging them to claim) to "claimed" mode (speaking to potential clients, focused on getting enquiries).

---

## Part 5: How pages update

Pages regenerate **automatically** whenever the CSV changes. You have two options:

### Option A: Edit directly in GitHub (simplest)

1. Go to the GitHub repository
2. Click on `accountants-template.csv`
3. Click the pencil icon to edit, or click "Add file" → "Upload files" to replace it
4. Write a short commit message (e.g., "Added 50 new firms") and click "Commit changes"
5. Done — pages regenerate within a few minutes and deploy automatically

### Option B: Click the button (manual trigger)

1. Go to the **Actions** tab in the GitHub repo
2. Click **"Generate Accountant Pages"** on the left sidebar
3. Click the green **"Run workflow"** button
4. Pages regenerate and deploy

**You never need to run any code, open a terminal, or touch the template.** Edit the spreadsheet, push it, pages update.

---

## Part 6: Data quality checklist

Before the first full generation, please verify:

- [ ] Every row has `name`, `city`, `rating`, `reviews`, `latitude`, `longitude`, `postcode`, `address` filled in
- [ ] `rating` is a number like `4.8` (not text like "4.8 stars")
- [ ] `reviews` is a whole number like `47` (not text like "47 reviews")
- [ ] `2026-badge-winners` has the full image URL for badge firms, completely blank for others
- [ ] All `flag_*` columns are exactly `TRUE` or `FALSE` (not "Yes"/"No" or "1"/"0")
- [ ] No duplicate firm names within the same city (they'd generate the same filename and overwrite each other)
- [ ] Addresses don't contain unusual characters that might break HTML

---

## Part 7: What's on each page (so you know what the data controls)

Every firm page has:

- **Hero section**: Firm name, city, address, star rating, review count, specialisms chips, CTA button
- **Map**: Interactive map with a pin at the firm's lat/lng coordinates
- **About section**: Firm bio (if provided), or a prompt to claim
- **Specialisms**: Tags derived from flag columns + any manually added specialisms
- **Details**: Fees, location, client type, verification status
- **Certifications**: Professional body memberships
- **Contact form**: Enquiry form that routes to the firm via Workiro
- **Badge section**: (if applicable) Displays the badge with a copyable embed code for their website
- **SEO**: Full structured data (LocalBusiness schema, FAQ schema, breadcrumbs), review stars for Google, geo meta tags, Open Graph for social sharing

### The 5 page states

| State | Who sees it | Triggered by |
|---|---|---|
| **Unclaimed + Badge** | Firm owners | `2026-badge-winners` has URL, `is_claimed` is blank |
| **Unclaimed, no badge** | Firm owners | `2026-badge-winners` is blank, `is_claimed` is blank |
| **Claimed + Badge** | Potential clients | `2026-badge-winners` has URL, `is_claimed` = CLAIMED |
| **Claimed, no badge** | Potential clients | `2026-badge-winners` is blank, `is_claimed` = CLAIMED |
| **Pending (< 10 reviews)** | Firm owners | `reviews` is less than 10 |

You don't need to set the state manually — it's determined automatically from the data.

---

## Part 8: Sequence of operations

Here's the order everything should happen:

| Step | Who | What | Status |
|---|---|---|---|
| 1 | Developer | Complete the `/uk/` site restructure (move files, update links, set up redirects) | Pending |
| 2 | Developer | Update template and generator for new `/uk/accountants/` URL paths | Pending |
| 3 | You | Clean the CSV data (use the checklist in Part 6) | **Your first task** |
| 4 | Developer | Configure Geotargetly on root domain | Pending |
| 5 | You | Push the clean CSV to GitHub | Triggers page generation |
| 6 | Automated | 2,690 pages generate and deploy | Automatic |
| 7 | Ongoing | Add new firms, update claimed profiles, add badge winners | As needed |

**You can start Step 3 (data cleanup) right now** while the developer works on Steps 1-2. When both are done, you push the CSV and everything goes live.

---

## Quick reference

| Task | What to do |
|---|---|
| Add a new firm | Add a row to the CSV, push to GitHub |
| Add a badge winner | Paste the badge image URL into `2026-badge-winners` for that row |
| Mark a firm as claimed | Set `is_claimed` to `CLAIMED`, fill in their profile data |
| Update a firm's details | Edit the relevant cells in their row, push to GitHub |
| Regenerate all pages | Push any CSV change (auto) or click "Run workflow" in GitHub Actions |
| Change the page design | Edit `accountant-profile-template.html` — all 2,690 pages rebuild from it |

---

*Template: `accountant-profile-template.html` | Data: `accountants-template.csv` | Generator: `generate.py`*
*Pages auto-deploy via GitHub Actions when either the CSV or template changes.*
