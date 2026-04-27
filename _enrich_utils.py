"""
Shared utilities for accountant profile enrichment.
Used by both enrich_batch.py and enrich_new_rows.py.

Dependencies: pip install anthropic requests beautifulsoup4
"""

import csv
import json
import re
import time
import unicodedata

import anthropic
import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Fields the scripts may fill in -- never overwritten if already populated
ENRICHMENT_TARGET_COLS = [
    "bio", "website", "latitude", "longitude", "rating", "reviews",
    "specialisms", "focus_area", "client_type", "accreditations",
    "flag_hospitality", "flag_construction", "flag_healthcare",
    "flag_media", "flag_professional_services", "flag_real_estate",
]

FLAG_COLS = [
    "flag_hospitality", "flag_construction", "flag_healthcare",
    "flag_media", "flag_professional_services", "flag_real_estate",
]

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_HEADERS = {
    "User-Agent": "taxready-enrichment/1.0 kay.anderson@getbusy.com"
}

_SYSTEM_PROMPT = (
    "You extract structured profile data for UK accounting firms from website text.\n"
    "Return ONLY valid JSON with these exact keys:\n"
    "  bio               - 1-2 sentence factual description (plain ASCII, no superlatives)\n"
    "  specialisms       - accounting/tax SERVICES the firm offers, comma-separated\n"
    "                      e.g. \"Annual accounts, VAT returns, Payroll, Self-assessment\"\n"
    "  focus_area        - INDUSTRIES or client NICHES the firm serves, comma-separated\n"
    "                      e.g. \"Construction, Property investors, Healthcare\"\n"
    "                      NOT client entity types, NOT service names\n"
    "  client_type       - WHO the firm serves (entity/business types), comma-separated\n"
    "                      e.g. \"Sole traders, Limited companies, Contractors\"\n"
    "                      NOT industries, NOT services\n"
    "  accreditations    - professional memberships: FULL NAME (ABBREVIATION) format\n"
    "                      e.g. \"Association of Chartered Certified Accountants (ACCA)\"\n"
    "  flag_hospitality           - \"TRUE\" if firm specialises in hospitality/restaurants/pubs clients, else \"FALSE\"\n"
    "  flag_construction          - \"TRUE\" if firm specialises in construction/trades/builders/contractors clients, else \"FALSE\"\n"
    "  flag_healthcare            - \"TRUE\" if firm specialises in healthcare/medical/dental/care clients, else \"FALSE\"\n"
    "  flag_media                 - \"TRUE\" if firm specialises in media/creative/marketing/entertainment clients, else \"FALSE\"\n"
    "  flag_professional_services - \"TRUE\" if firm specialises in professional services/legal/consulting clients, else \"FALSE\"\n"
    "  flag_real_estate           - \"TRUE\" if firm specialises in property/landlord/real estate clients, else \"FALSE\"\n"
    "\n"
    "Rules:\n"
    "- Plain ASCII only: no curly quotes, em dashes, bullets, or HTML entities\n"
    "- Comma-separated lists use \", \" as the separator\n"
    "- Flags must be exactly \"TRUE\" or \"FALSE\" - never empty\n"
    "- Return empty string \"\" for profile fields that cannot be determined from the text\n"
    "- Never fabricate information not present in the source text"
)

# ---------------------------------------------------------------------------
# Text cleaning (mirrors normalize_csv_separators.py logic)
# All non-ASCII keys written as \uXXXX escapes so this file is ASCII-safe.
# ---------------------------------------------------------------------------

_CHAR_MAP = {
    "\u2018": "'", "\u2019": "'",   # curly single quotes
    "\u201c": '"', "\u201d": '"',   # curly double quotes
    "\u2013": "-", "\u2014": "-",   # en/em dash
    "\u2022": "",  "\u00b7": "",    # bullets
    "\u00e9": "e", "\u00e8": "e", "\u00ea": "e",   # accented e
    "\u00e0": "a", "\u00e2": "a",   # accented a
    "\u00f3": "o", "\u00f4": "o",   # accented o
    "\u00fc": "u", "\u00fb": "u",   # accented u
    "\u00ee": "i", "\u00ef": "i",   # accented i
    "\u00e7": "c",                               # cedilla
    "\u00e6": "ae",                              # ae ligature
}

_SPLIT_BAD = re.compile(r"\s*[;|]\s*")
_COMMA_TIDY = re.compile(r"\s*,\s*")


def clean_text(s):
    """Strip curly quotes, dashes, HTML entities, and non-ASCII."""
    if not s:
        return ""
    for bad, good in _CHAR_MAP.items():
        s = s.replace(bad, good)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return s.strip()


def clean_list_field(s):
    """Normalise ; | separators to ', ' and tidy whitespace."""
    if not s:
        return ""
    s = clean_text(s)
    s = _SPLIT_BAD.sub(",", s)
    s = _COMMA_TIDY.sub(", ", s).strip().strip(",").strip()
    while ",," in s:
        s = s.replace(",,", ",")
    return s


# ---------------------------------------------------------------------------
# CSV helpers -- handle duplicate 'place_id' column in the source CSV
# ---------------------------------------------------------------------------

def read_csv_safe(path):
    """
    Read CSV handling duplicate column names by appending _dup suffix.
    Returns (raw_fieldnames, unique_fieldnames, rows_as_dicts).

    raw_fieldnames preserves the original header for writing back with
    write_csv_output().
    """
    # Source CSV is Windows-1252 encoded (contains accented characters)
    with open(path, newline="", encoding="latin-1") as f:
        reader = csv.reader(f)
        raw_fieldnames = next(reader)
        all_raw_rows = list(reader)

    seen = {}
    unique_fieldnames = []
    for col in raw_fieldnames:
        if col in seen:
            seen[col] += 1
            suffix = "_dup" if seen[col] == 1 else "_dup{}".format(seen[col])
            unique_fieldnames.append("{}{}".format(col, suffix))
        else:
            seen[col] = 0
            unique_fieldnames.append(col)

    rows = []
    for raw_row in all_raw_rows:
        padded = raw_row + [""] * max(0, len(unique_fieldnames) - len(raw_row))
        rows.append(dict(zip(unique_fieldnames, padded)))

    return raw_fieldnames, unique_fieldnames, rows


def write_csv_output(path, raw_fieldnames, unique_fieldnames, rows):
    """
    Write rows to CSV using the original raw_fieldnames as the header,
    mapping values back through unique_fieldnames by position.
    """
    with open(path, "w", newline="", encoding="latin-1", errors="replace") as f:
        writer = csv.writer(f)
        writer.writerow(raw_fieldnames)
        for row in rows:
            out_row = [row.get(uf, "") for uf in unique_fieldnames]
            writer.writerow(out_row)


# ---------------------------------------------------------------------------
# Geocoding -- OpenStreetMap Nominatim (free, 1 req/sec limit)
# ---------------------------------------------------------------------------

def geocode_address(address, name):
    """
    Geocode a UK firm address via Nominatim.
    Returns dict with latitude, longitude, postcode, outward_code or {}.
    Caller must sleep(1) after this call to respect Nominatim rate limit.
    """
    params = {
        "q": "{}, {}, UK".format(name, address),
        "format": "json",
        "limit": 1,
        "addressdetails": 1,
        "countrycodes": "gb",
    }
    try:
        r = requests.get(
            _NOMINATIM_URL, params=params,
            headers=_NOMINATIM_HEADERS, timeout=10
        )
        r.raise_for_status()
        results = r.json()
        if not results:
            return {}
        hit = results[0]
        addr = hit.get("address", {})
        postcode = addr.get("postcode", "")
        return {
            "latitude": hit.get("lat", ""),
            "longitude": hit.get("lon", ""),
            "postcode": postcode,
            "outward_code": postcode.split(" ")[0] if postcode else "",
        }
    except Exception as e:
        print("    Geocode error: {}".format(e))
        return {}


# ---------------------------------------------------------------------------
# Google Places lookup -- rating, reviews, place_id
# ---------------------------------------------------------------------------

def lookup_places(firm_name, address, places_api_key):
    """
    Look up rating/reviews via Google Places API if a key is available.
    Returns dict with place_id, rating, reviews or {}.
    """
    if not places_api_key:
        return {}
    url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
    params = {
        "input": "{} {}".format(firm_name, address),
        "inputtype": "textquery",
        "fields": "place_id,rating,user_ratings_total",
        "key": places_api_key,
    }
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        candidates = r.json().get("candidates", [])
        if candidates:
            c = candidates[0]
            return {
                "place_id": c.get("place_id", ""),
                "rating": str(c.get("rating", "")),
                "reviews": str(c.get("user_ratings_total", "")),
            }
    except Exception as e:
        print("    Places API error: {}".format(e))
    return {}


# ---------------------------------------------------------------------------
# Rate-limit retry helper
# ---------------------------------------------------------------------------

def _with_retry(fn, max_retries=5, base_delay=60):
    """
    Call fn(), retrying on 429 RateLimitError with exponential backoff.
    Raises the final exception if all retries are exhausted.
    """
    for attempt in range(max_retries):
        try:
            return fn()
        except anthropic.RateLimitError as e:
            if attempt == max_retries - 1:
                raise
            delay = base_delay * (2 ** attempt)
            print("    Rate limit hit — waiting {}s before retry ({}/{})...".format(
                delay, attempt + 1, max_retries - 1
            ))
            time.sleep(delay)


# ---------------------------------------------------------------------------
# Website discovery -- Claude web search
# ---------------------------------------------------------------------------

def find_website(firm_name, city, client):
    """
    Use Claude's built-in web search to find the firm's official website.
    Returns URL string or empty string if not found.
    """
    try:
        def _call():
            return client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                tools=[{"type": "web_search_20250305", "name": "web_search"}],
                messages=[{
                    "role": "user",
                    "content": (
                        'Find the official website URL for "{}", '
                        "an accounting firm in {}, UK. "
                        "Return ONLY the URL with no other text. "
                        "If you cannot find a confident match, return NOT_FOUND."
                    ).format(firm_name, city),
                }],
            )
        response = _with_retry(_call)
        for block in reversed(response.content):
            if hasattr(block, "text"):
                url = block.text.strip()
                if url.startswith("http") and "NOT_FOUND" not in url:
                    return url.split()[0]  # first token only
    except Exception as e:
        print("    Website search error: {}".format(e))
    return ""


# ---------------------------------------------------------------------------
# Website scraping
# ---------------------------------------------------------------------------

def scrape_website(url, max_chars=4000):
    """
    Scrape text from a firm's homepage. Returns plain text or empty string.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    try:
        r = requests.get(url, headers=headers, timeout=12, allow_redirects=True)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        text = " ".join(soup.get_text(separator=" ").split())
        return text[:max_chars]
    except Exception as e:
        print("    Scrape error ({}): {}".format(url, e))
        return ""


# ---------------------------------------------------------------------------
# Claude extraction
# ---------------------------------------------------------------------------

def extract_with_claude(firm_name, city, website_text, client):
    """
    Extract structured profile fields from website text using Claude.
    Returns dict with bio, specialisms, focus_area, client_type, accreditations,
    and all six flag_* keys.
    """
    user_msg = "Firm: {}, {}\n\nWebsite text:\n{}".format(firm_name, city, website_text)
    def _call():
        return client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=[{"type": "text", "text": _SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_msg}],
        )
    response = _with_retry(_call)
    raw = response.content[0].text.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Row enrichment -- orchestrates all steps, never overwrites populated fields
# ---------------------------------------------------------------------------

def enrich_row(row, client, places_api_key=""):
    """
    Enrich a single row dict. Only fills blank fields -- never overwrites.
    Modifies and returns the dict.

    Steps (each only runs if the relevant field is blank):
      1. Geocode if lat/lng missing
      2. Places lookup if rating/reviews missing (requires GOOGLE_PLACES_API_KEY)
      3. Find website via Claude web search if blank
      4. Scrape + Claude extract if bio is blank and website is available
    """
    name = row.get("name", "").strip()
    city = row.get("city", "").strip()
    address = row.get("address", "").strip()

    # Step 1: Geocode
    if not row.get("latitude", "").strip() or not row.get("longitude", "").strip():
        geo = geocode_address(address, name)
        if geo:
            for k, v in geo.items():
                if not row.get(k, "").strip():
                    row[k] = v
            print("    Geocoded: {}, {}".format(geo.get("latitude"), geo.get("longitude")))
        else:
            print("    Geocode: no result")
        time.sleep(1)  # Nominatim rate limit: max 1 req/sec

    # Step 2: Places lookup
    if not row.get("rating", "").strip() or not row.get("reviews", "").strip():
        places = lookup_places(name, address, places_api_key)
        if places:
            for k in ("place_id", "rating", "reviews"):
                if places.get(k) and not row.get(k, "").strip():
                    row[k] = places[k]
            print("    Places: rating={}, reviews={}".format(
                row.get("rating"), row.get("reviews")
            ))
        elif places_api_key:
            print("    Places: no result")

    # Step 3: Find website
    url = row.get("website", "").strip()
    if not url:
        print("    No website -- searching...")
        url = find_website(name, city, client)
        if url:
            row["website"] = url
            print("    Found: {}".format(url))
        else:
            print("    Website not found")

    # Step 4: Scrape and extract
    if not row.get("bio", "").strip() and url:
        text = scrape_website(url)
        if text:
            try:
                data = extract_with_claude(name, city, text, client)

                if data.get("bio") and not row.get("bio", "").strip():
                    row["bio"] = clean_text(data["bio"])

                for field in ("specialisms", "focus_area", "client_type", "accreditations"):
                    if data.get(field) and not row.get(field, "").strip():
                        row[field] = clean_list_field(data[field])

                # Flag columns: fill only if currently blank
                for flag in FLAG_COLS:
                    if not row.get(flag, "").strip():
                        val = data.get(flag, "FALSE").strip().upper()
                        row[flag] = "TRUE" if val == "TRUE" else "FALSE"

                print("    Extracted bio + fields")
            except json.JSONDecodeError as e:
                print("    Claude JSON parse error: {}".format(e))
            except Exception as e:
                print("    Claude extraction error: {}".format(e))
        else:
            print("    Scrape returned no content")
    elif not url:
        print("    Skipping extraction (no website)")
    else:
        print("    Bio already populated, skipping extraction")

    row["enriched"] = "TRUE"
    return row
