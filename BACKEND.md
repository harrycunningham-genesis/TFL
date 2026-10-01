# London Tube Status Dashboard: Cloudflare backend

## What we're building
A shared London Tube dashboard where every visitor sees the same live line status
and the same history. Previously each browser called TfL directly and stored its own
history in IndexedDB, which was different for everyone and only grew while a tab was
open. A Cloudflare Worker now polls TfL every minute and stores the history centrally.
The end goal is graphs and statistics built on that shared history, such as
per-line reliability and disruption over time.

## Repo
https://github.com/harrycunningham-genesis/TFL (branch: master)
- `tfl-dashboard/`: React 19 + Vite frontend, deployed to GitHub Pages
  (base path `/TFL/`) via `.github/workflows/deploy.yml`
- `worker/`: Cloudflare Worker (JavaScript, Wrangler 4)
  - `src/index.js`: cron `collect()` and the API routes
  - `src/lib.js`: pure helpers (slots, points, param parsing), unit tested
  - `schema.sql`: D1 tables (safe to re-run)
  - `test/`: `npm test` (plain `node --test`)

## Cloudflare resources
- Account ID: 5aecdd948a6395629a269e213e98d280
- Worker: `tfl-status`
- Worker URL: https://tfl-status.harry-genesis-tfl.workers.dev
- Cron trigger: every minute (`* * * * *`)
- D1 database: `tfl-db`, ID `ca854123-e7c9-4ce7-835b-85a8ddfedfe2` (region WEUR),
  bound in the Worker as `env.DB`
- Secret: `TFL_API_KEY` (set with `npx wrangler secret put TFL_API_KEY`;
  never committed to the repo)
- Hyperdrive is NOT used. D1 is simpler and nothing external is needed.

## How it works
Every minute the Worker's `collect()`:
1. Fetches TfL line status (tube, overground, dlr, elizabeth-line, tram, and
   thameslink) in one pass, with the key kept server-side.
2. Classifies each line into a tier (good/minor/moderate/severe/unknown) using the
   frontend's own `tfl-dashboard/src/utils/severity.js` (imported by the Worker,
   so there is one source of truth).
3. Writes in a single D1 batch:
   - `hourly_status`: increments a per-line, per-hour counter for that tier
     (long-term store, kept 90 days, pruned hourly)
   - `minute_status`: per-line rotating buffer of 180 slots (slot = minute mod 180),
     giving the last 3 hours at one-minute resolution with no deletes
   - `latest_status`: the full TfL JSON snapshot served to everyone
4. At the top of each hour it rebuilds the 90-day uptime summary into
   `summary_cache`. That avoids scanning about 54k rows per request, and the
   Cache API does not work on workers.dev. If the cache is empty (straight after
   a fresh deploy), the first `/api/uptime` request builds it.

All timestamps (`t`, `hour`, `updatedAt`, `trackedSince`) are epoch milliseconds.

## API (public, read-only, CORS open to any origin)
- `GET /api/status` returns `{ updatedAt, lines: [...TfL line objects] }`
- `GET /api/uptime` returns
  `{ [lineId]: { goodPercent, sampleCount, trackedSince, trackedHours } }`
  covering everything tracked so far, capped at 90 days
- `GET /api/history?line=<id>&bucket=minute|hour|day&days=1-90` returns
  `{ line, bucket, points: [{ t, good, minor, moderate, severe, unknown, total,
  goodPercent }] }`
  - `bucket=minute` covers the last 3 hours only (points also include `tier`)
  - day buckets are UTC days
  - `line` is required; `bucket` defaults to `hour`; `days` defaults to 1
    (30 for `day`)

## Commands
```bash
cd worker
npm install
npm run db:init:remote   # create/upgrade the D1 tables (idempotent)
npm run deploy
npm run tail             # live logs
npm test

# Local: run against a local D1 and (optionally) a fake TfL
npm run db:init:local
npx wrangler dev --test-scheduled --var TFL_BASE_URL:http://localhost:8799
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # trigger one collect()
```

## Frontend wiring
- `src/api/backend.js` exports `fetchStatus()`, `fetchUptime()` and
  `fetchLineHistory(lineId, { days, bucket })`. It reads `VITE_API_URL`.
- `VITE_API_URL=https://tfl-status.harry-genesis-tfl.workers.dev`
  - local: in `tfl-dashboard/.env` (git-ignored)
  - deploy: GitHub repo Settings, Secrets and variables, Actions, Variables
    tab, repository variable `VITE_API_URL` (read by `deploy.yml` as
    `vars.VITE_API_URL`)
- `src/utils/trackedTime.js`: `describeTrackedPeriod(trackedSince)` produces labels
  like "last 5 hours" or "last 12 days", capped at 90 days
- `LineStatus.jsx` and `Home.jsx` (favourite-line tiles) both use the Worker.
  Favourite line IDs are per-browser in localStorage key `tfl_favourite_lines`.

## Storage and limits
- 3 hours at one-minute detail, then hourly buckets for up to 90 days
- Roughly 73k D1 rows written per day against the free-tier limit of 100k.
  Check the D1 Metrics tab. The paid Workers plan ($5/month) removes the limit.

## Status
Done:
- Worker, D1 schema and cron (rebuilt on 2026-10-01 after the local copy was lost;
  it had never been pushed)
- Line Status and Home pages read from the Worker
- Uptime label grows from hours to days up to 90 days
- `/api/history` endpoint for graphs (hour/day/minute)

To confirm or do:
- Redeploy the Worker (`cd worker && npm install && npm run db:init:remote && npm run deploy`)
  so the deployed code matches this repo
- Add the `VITE_API_URL` repository variable, then merge to master so GitHub Pages
  rebuilds
- Move the remaining pages to the Worker: Stations, Trip Planner and both Tube Map
  pages still call TfL directly with the browser key `VITE_TFL_API_KEY`. This
  needs a small proxy route in the Worker.
- Rotate the old TfL API key. It is exposed in the currently published bundle, so
  after rotating, run `npx wrangler secret put TFL_API_KEY`.
- Build the graphs (suggested: recharts). Ideas: stacked daily bars per line by
  status, a 3-hour minute strip, and a network-wide view (this needs a small daily
  rollup table).
- Optional cleanup: delete the now-unused `src/db/statusHistory.js`, its test, and
  the `idb` dependency.

## Known issues and notes
- Tests for `/map` and `/about` in `App.test.jsx` fail on the untouched repo too
  (not caused by this work)
- The uptime percentage and sample count can lag up to an hour (hourly summary);
  the "last N hours/days" label updates on each poll
- `TFL_BASE_URL` is an optional Worker variable used only to test against a fake
  TfL locally
- Never commit `.env` or the TfL key
- Push work to GitHub regularly. The first version of this backend was lost
  because it only existed locally.
