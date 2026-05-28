-- LCMS congregation data schema (SQLite)
-- Source of truth design for data from locator.lcms.org scraper pipeline.
-- NOT IN USE YET — DDL only. Apply when import-sqlite.mjs is implemented.
--
-- Usage (future):
--   sqlite3 data/lcms.db < db/schema.sql
--   sqlite3 data/lcms.db < db/views.sql
--
-- Enable foreign keys on every connection:
PRAGMA foreign_keys = ON;

-- ── Districts (35 LCMS districts) ────────────────────────────────────────────
-- Maps to data/districts.json and scraped.json "districts[]"
CREATE TABLE IF NOT EXISTS districts (
  lookup_id             INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  member_congregations  INTEGER,
  ncs_congregations     INTEGER,
  baptized_members      INTEGER,
  communicant_members   INTEGER,
  preschools            INTEGER,
  elementary_schools    INTEGER,
  high_schools          INTEGER,
  address               TEXT,
  attendance            INTEGER,
  giving_millions       REAL,
  updated_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_districts_name ON districts (name);

-- ── Churches (congregations) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS churches (
  lookup_id             INTEGER PRIMARY KEY,
  uuid                  TEXT,
  name                  TEXT NOT NULL,
  status                TEXT,
  date_organized        TEXT,
  last_stat_year        INTEGER,
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  zip                   TEXT,
  lat                   REAL,
  lng                   REAL,
  phone                 TEXT,
  email                 TEXT,
  website               TEXT,
  district_lookup_id    INTEGER REFERENCES districts (lookup_id),
  circuit_lookup_id     INTEGER,
  circuit_name          TEXT,
  attendance            INTEGER,
  baptized              INTEGER,
  communing             INTEGER,
  has_stats             INTEGER NOT NULL DEFAULT 0,
  updated_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_churches_district ON churches (district_lookup_id);
CREATE INDEX IF NOT EXISTS idx_churches_state ON churches (state);
CREATE INDEX IF NOT EXISTS idx_churches_name ON churches (name);
CREATE INDEX IF NOT EXISTS idx_churches_attendance ON churches (attendance);
CREATE INDEX IF NOT EXISTS idx_churches_baptized ON churches (baptized);

-- ── Church financials (current-year PDF profile, 1:1 with church) ────────────
CREATE TABLE IF NOT EXISTS church_financials (
  lookup_id                      INTEGER PRIMARY KEY REFERENCES churches (lookup_id),
  report_year                    INTEGER,
  contributions                  REAL,
  at_home_expenses               REAL,
  contribs_per_confirmed_member  REAL,
  expenses_per_baptized_member   REAL,
  child_baptisms                 INTEGER,
  junior_confirmations           INTEGER,
  adult_confirmations            INTEGER,
  weekly_visitors                INTEGER,
  percent_visitors               REAL,
  similar_churches               INTEGER,
  per_member_giving              INTEGER,
  updated_at                     TEXT
);

CREATE INDEX IF NOT EXISTS idx_church_financials_contributions
  ON church_financials (contributions);
CREATE INDEX IF NOT EXISTS idx_church_financials_report_year
  ON church_financials (report_year);

-- ── Church yearly history (PDF 10-year series, long format) ──────────────────
CREATE TABLE IF NOT EXISTS church_yearly (
  lookup_id   INTEGER NOT NULL REFERENCES churches (lookup_id),
  year        INTEGER NOT NULL,
  baptized    INTEGER,
  confirmed   INTEGER,
  attendance  INTEGER,
  PRIMARY KEY (lookup_id, year)
);

CREATE INDEX IF NOT EXISTS idx_church_yearly_year ON church_yearly (year);

-- ── Schools linked to a congregation ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS church_schools (
  lookup_id         INTEGER NOT NULL REFERENCES churches (lookup_id),
  school_lookup_id  INTEGER,
  school_name       TEXT NOT NULL,
  city              TEXT,
  state             TEXT,
  PRIMARY KEY (lookup_id, school_name)
);

-- ── Ministries linked to a congregation ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS church_ministries (
  lookup_id   INTEGER NOT NULL REFERENCES churches (lookup_id),
  ministry    TEXT NOT NULL,
  category    TEXT,
  PRIMARY KEY (lookup_id, ministry)
);

-- ── Synod-wide summary snapshot ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synod_summary (
  id                              INTEGER PRIMARY KEY CHECK (id = 1),
  congregations_official          INTEGER,
  districts_official              INTEGER,
  schools_official                INTEGER,
  workers_official                INTEGER,
  baptized_members_official       INTEGER,
  communing_members_official      INTEGER,
  avg_weekly_attendance_official  INTEGER,
  total_giving_millions_official  REAL,
  congregations_scraped           INTEGER,
  congregations_with_stats        INTEGER,
  baptized_members_scraped        INTEGER,
  communing_members_scraped       INTEGER,
  avg_weekly_attendance_scraped   INTEGER,
  total_giving_millions_scraped   REAL,
  updated_at                      TEXT
);

-- ── Build / import metadata ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS build_meta (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at      TEXT NOT NULL,
  source          TEXT,
  church_count    INTEGER,
  stats_count     INTEGER,
  district_count  INTEGER,
  yearly_rows     INTEGER
);

-- National yearly time series (dashboard trend charts)
CREATE TABLE IF NOT EXISTS national_yearly (
  year                    INTEGER PRIMARY KEY,
  baptized_members        INTEGER,
  communing_members       INTEGER,
  avg_weekly_attendance   INTEGER,
  congregations           INTEGER,
  sample_size             INTEGER,
  total_giving_millions   REAL,
  at_home_millions        REAL,
  infant_baptisms         INTEGER,
  adult_baptisms          INTEGER,
  confirmations           INTEGER,
  new_members             INTEGER,
  removals                INTEGER
);
