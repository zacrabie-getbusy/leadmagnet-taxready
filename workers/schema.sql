-- Cloudflare D1 schema for TaxReady accounting firms.
-- import_csv_to_d1.py prepends this (after DROP TABLE) to import.sql, so every
-- import rebuilds the table to exactly this shape. Edit columns here only.

CREATE TABLE IF NOT EXISTS firms (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id                    TEXT,
  name                        TEXT NOT NULL,
  address                     TEXT,
  country                     TEXT DEFAULT 'GB',
  suburb                      TEXT,
  suburb_slug                 TEXT,
  city                        TEXT,
  city_slug                   TEXT NOT NULL,
  firm_slug                   TEXT NOT NULL,
  rating                      REAL,
  reviews                     INTEGER DEFAULT 0,
  longitude                   REAL,
  latitude                    REAL,
  postcode                    TEXT,
  outward_code                TEXT,
  flag_hospitality            INTEGER DEFAULT 0,
  flag_construction           INTEGER DEFAULT 0,
  flag_healthcare             INTEGER DEFAULT 0,
  flag_media                  INTEGER DEFAULT 0,
  flag_professional_services  INTEGER DEFAULT 0,
  flag_real_estate            INTEGER DEFAULT 0,
  badge_url                   TEXT,
  is_claimed                  INTEGER DEFAULT 0,
  specialisms                 TEXT,
  fees                        TEXT,
  differentiators             TEXT,
  client_type                 TEXT,
  focus_area                  TEXT,
  client_portal               INTEGER DEFAULT 0,
  accreditations              TEXT,
  bio                         TEXT,
  website                     TEXT,
  specialist_segments         TEXT,
  -- Companies House facts (scripts/enrich_companies_house.py → workers/companies_house.json).
  -- Only certain matches to active companies; blank otherwise.
  ch_number                   TEXT DEFAULT '',
  ch_category                 TEXT DEFAULT '',
  ch_incorporated             TEXT DEFAULT '',
  ch_accounts_made_up         TEXT DEFAULT '',
  ch_activities               TEXT DEFAULT '',
  ch_checked                  TEXT DEFAULT '',
  -- Tax Practitioners Board register (AU; scripts/au_google_match.py → workers/tpb_register.json).
  tpb_number                  TEXT DEFAULT '',
  tpb_type                    TEXT DEFAULT '',
  tpb_registered              TEXT DEFAULT '',
  tpb_checked                 TEXT DEFAULT '',
  content_hash                TEXT,
  updated_at                  TEXT,
  UNIQUE(city_slug, firm_slug)
);

CREATE INDEX IF NOT EXISTS idx_city_slug   ON firms(city_slug);
CREATE INDEX IF NOT EXISTS idx_firm_slug   ON firms(firm_slug);
CREATE INDEX IF NOT EXISTS idx_country     ON firms(country);
CREATE INDEX IF NOT EXISTS idx_suburb_slug ON firms(suburb_slug);
