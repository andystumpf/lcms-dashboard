# SQLite schema

The dashboard reads from `data/lcms.db` via `GET /api/lcms` (`lib/load-from-sql.mjs`).

| File | Purpose |
|------|---------|
| [`schema.sql`](schema.sql) | Table definitions |
| [`views.sql`](views.sql) | Convenience views for ad-hoc queries |

## Key tables

- `churches` — congregation records and headline stats
- `church_financials` — current-year PDF financial profile
- `church_yearly` — 10-year history (baptized, confirmed, attendance)
- `districts` — 35 LCMS districts
- `national_yearly` — synod-wide trend series for charts
- `synod_summary` / `build_meta` — totals and import metadata

Use the **SQL** page (`/sql.html`) or any SQLite client to explore the database.
