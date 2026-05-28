# LCMS Data Dashboard

Interactive dashboard for LCMS congregation statistics in the United States. Data is served from a bundled SQLite database (`data/lcms.db`) — no scraper or build pipeline required.

## Quick start

```bash
git clone https://github.com/andystumpf/lcms-data-dashboard.git
cd lcms-data-dashboard
npm install
npm start
```

Open [http://localhost:8000](http://localhost:8000)

Or: `bash start.sh`

## Pages

| URL | Description |
|-----|-------------|
| `/index.html` | Main dashboard — KPIs, trends, Top 50, 36 story charts |
| `/compare.html` | Compare 2–10 congregations side by side |
| `/sql.html` | Read-only SQL console against `data/lcms.db` |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/lcms` | Full dashboard payload (churches, districts, national yearly series) |
| `GET /api/health` | `{ ok, churches, districts, db }` |
| `POST /api/sql/execute` | Run read-only SELECT queries (SQL console) |

Environment variables:

- `LCMS_PORT` — default `8000`
- `LCMS_DB_PATH` — default `data/lcms.db`

## Data

The dashboard reads **only** from `data/lcms.db` at runtime via `/api/lcms`. There is no placeholder or illustrative data — if the server is not running, pages show an empty state.

Schema reference: [`db/schema.sql`](db/schema.sql), [`db/views.sql`](db/views.sql)

## License

Data originates from [locator.lcms.org](https://locator.lcms.org). Use in accordance with LCMS terms and applicable privacy guidelines.
