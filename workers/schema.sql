-- Cloudflare D1 schema for TaxReady accounting firms.
-- Run via: wrangler d1 execute taxready-firms --file=workers/schema.sql --remote

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
  content_hash                TEXT,
  updated_at                  TEXT,
  UNIQUE(city_slug, firm_slug)
);

-- Migration: run once on existing databases to add the differentiators column.
-- wrangler d1 execute taxready-firms --command="ALTER TABLE firms ADD COLUMN differentiators TEXT;" --remote

CREATE INDEX IF NOT EXISTS idx_city_slug   ON firms(city_slug);
CREATE INDEX IF NOT EXISTS idx_country     ON firms(country);
CREATE INDEX IF NOT EXISTS idx_suburb_slug ON firms(suburb_slug);
