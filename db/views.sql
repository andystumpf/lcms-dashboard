-- Analyst-facing views for LCMS SQLite schema.
-- NOT IN USE YET — apply after schema.sql when a database exists.

CREATE VIEW IF NOT EXISTS v_churches AS
SELECT
  c.lookup_id,
  c.uuid,
  c.name,
  c.status,
  c.city,
  c.state,
  c.zip,
  c.phone,
  c.email,
  c.website,
  d.name AS district,
  c.district_lookup_id,
  c.circuit_name,
  c.date_organized,
  c.last_stat_year,
  c.attendance,
  c.baptized,
  c.communing,
  c.has_stats,
  f.report_year,
  f.contributions AS giving,
  f.at_home_expenses,
  f.contribs_per_confirmed_member,
  f.per_member_giving,
  f.child_baptisms,
  f.junior_confirmations,
  f.adult_confirmations,
  COALESCE(f.junior_confirmations, 0) + COALESCE(f.adult_confirmations, 0) AS confirmations,
  f.weekly_visitors,
  f.percent_visitors
FROM churches c
LEFT JOIN districts d ON d.lookup_id = c.district_lookup_id
LEFT JOIN church_financials f ON f.lookup_id = c.lookup_id;

CREATE VIEW IF NOT EXISTS v_church_history AS
SELECT
  y.lookup_id,
  c.name AS church_name,
  d.name AS district,
  c.state,
  y.year,
  y.baptized,
  y.confirmed,
  y.attendance
FROM church_yearly y
JOIN churches c ON c.lookup_id = y.lookup_id
LEFT JOIN districts d ON d.lookup_id = c.district_lookup_id;

CREATE VIEW IF NOT EXISTS v_district_scraped AS
SELECT
  d.lookup_id,
  d.name AS district,
  COUNT(c.lookup_id) AS churches_enumerated,
  SUM(CASE WHEN c.has_stats = 1 THEN 1 ELSE 0 END) AS churches_with_stats,
  SUM(CASE WHEN c.attendance IS NOT NULL OR c.baptized IS NOT NULL THEN 1 ELSE 0 END) AS churches_with_headline,
  SUM(c.baptized) AS baptized,
  SUM(c.communing) AS communing,
  SUM(c.attendance) AS attendance,
  ROUND(SUM(f.contributions) / 1e6, 2) AS giving_millions
FROM districts d
LEFT JOIN churches c ON c.district_lookup_id = d.lookup_id
LEFT JOIN church_financials f ON f.lookup_id = c.lookup_id
GROUP BY d.lookup_id, d.name;

CREATE VIEW IF NOT EXISTS v_district_official AS
SELECT
  lookup_id,
  name AS district,
  member_congregations AS churches,
  baptized_members AS baptized,
  communicant_members AS communing,
  preschools,
  elementary_schools,
  high_schools
FROM districts;

CREATE VIEW IF NOT EXISTS v_national_yearly AS
SELECT
  y.year,
  COUNT(DISTINCT y.lookup_id) AS sample_size,
  SUM(y.baptized) AS baptized_members,
  SUM(y.confirmed) AS communing_members,
  SUM(y.attendance) AS avg_weekly_attendance,
  ROUND(SUM(f.contributions) / 1e6, 2) AS total_giving_millions,
  ROUND(SUM(f.at_home_expenses) / 1e6, 2) AS at_home_millions,
  SUM(f.child_baptisms) AS infant_baptisms,
  SUM(COALESCE(f.junior_confirmations, 0) + COALESCE(f.adult_confirmations, 0)) AS confirmations,
  SUM(
    COALESCE(f.child_baptisms, 0)
    + COALESCE(f.junior_confirmations, 0)
    + COALESCE(f.adult_confirmations, 0)
  ) AS new_members
FROM church_yearly y
LEFT JOIN church_financials f
  ON f.lookup_id = y.lookup_id
  AND f.report_year = y.year
GROUP BY y.year
ORDER BY y.year;

CREATE VIEW IF NOT EXISTS v_scrape_progress AS
SELECT
  (SELECT COUNT(*) FROM churches) AS churches_total,
  (SELECT COUNT(*) FROM churches WHERE has_stats = 1) AS with_stats,
  (SELECT COUNT(*) FROM churches WHERE attendance IS NOT NULL OR baptized IS NOT NULL) AS with_headline,
  (SELECT COUNT(*) FROM church_financials WHERE contributions IS NOT NULL) AS with_giving,
  (SELECT COUNT(DISTINCT lookup_id) FROM church_yearly) AS with_history,
  (SELECT fetched_at FROM build_meta WHERE id = 1) AS last_import;
