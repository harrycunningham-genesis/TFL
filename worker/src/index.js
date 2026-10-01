// tfl-status: polls TfL once a minute and serves one shared line-status
// snapshot and history to every visitor of the dashboard.
//
// Previously each browser called TfL itself and kept its own history in
// IndexedDB, so everyone saw different numbers, and history only grew while
// a tab was open. Now this Worker is the only thing that talks to TfL (the
// key stays server-side) and the history lives centrally in D1.
//
// Storage (see schema.sql):
//   hourly_status  per-line, per-hour tier counters, kept 90 days
//   minute_status  per-line 180-slot ring buffer, the last 3 hours at 1-min detail
//   latest_status  the full TfL JSON from the most recent poll
//   summary_cache  the 90-day uptime summary, rebuilt at the top of each hour
//
// The tiering logic is imported straight from the frontend so there's one
// source of truth for what counts as "minor" vs "severe".
import { getTier } from "../../tfl-dashboard/src/utils/severity.js";
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  MINUTE_SLOTS,
  NATIONAL_RAIL_LINES,
  RETENTION_DAYS,
  TFL_MODES,
  TIERS,
  floorTo,
  minuteSlot,
  parseHistoryParams,
  toPoint,
} from "./lib.js";

const UPTIME_CACHE_KEY = "uptime";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

// ---- Collecting ----

async function fetchTflLines(env) {
  const base = env.TFL_BASE_URL || "https://api.tfl.gov.uk";
  const key = env.TFL_API_KEY ? `?app_key=${encodeURIComponent(env.TFL_API_KEY)}` : "";

  const [modesResponse, railResponse] = await Promise.all([
    fetch(`${base}/Line/Mode/${TFL_MODES.join(",")}/Status${key}`),
    fetch(`${base}/Line/${NATIONAL_RAIL_LINES.join(",")}/Status${key}`),
  ]);

  if (!modesResponse.ok) {
    throw new Error(`TfL line status request failed: ${modesResponse.status}`);
  }

  const modeLines = await modesResponse.json();
  // National Rail is a nice-to-have: a failure there shouldn't lose the
  // whole minute's data for every other line.
  const railLines = railResponse.ok ? await railResponse.json() : [];
  return [...modeLines, ...railLines];
}

async function collect(env, scheduledTime) {
  const now = floorTo(scheduledTime, MINUTE_MS);
  const hour = floorTo(now, HOUR_MS);
  const slot = minuteSlot(now);
  const lines = await fetchTflLines(env);

  const statements = [];
  for (const line of lines) {
    const tier = getTier(line);
    // `tier` is always one of TIERS (getTier falls back to "unknown"), so
    // interpolating it as a column name is safe.
    statements.push(
      env.DB.prepare(
        `INSERT INTO hourly_status (line_id, hour, ${tier}) VALUES (?1, ?2, 1)
         ON CONFLICT (line_id, hour) DO UPDATE SET ${tier} = ${tier} + 1`,
      ).bind(line.id, hour),
      env.DB.prepare(
        `INSERT INTO minute_status (line_id, slot, t, tier) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (line_id, slot) DO UPDATE SET t = excluded.t, tier = excluded.tier`,
      ).bind(line.id, slot, now, tier),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO latest_status (id, updated_at, payload) VALUES (1, ?1, ?2)
       ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`,
    ).bind(Date.now(), JSON.stringify(lines)),
  );

  await env.DB.batch(statements);

  // Hourly housekeeping: prune old counters and rebuild the uptime summary.
  if (new Date(now).getUTCMinutes() === 0) {
    await env.DB.prepare("DELETE FROM hourly_status WHERE hour < ?1")
      .bind(now - RETENTION_DAYS * DAY_MS)
      .run();
    await rebuildUptimeSummary(env, now);
  }
}

// ---- Uptime summary ----

async function computeUptimeSummary(env, now) {
  const { results } = await env.DB.prepare(
    `SELECT line_id,
            SUM(good) AS good,
            SUM(good + minor + moderate + severe + unknown) AS total,
            MIN(hour) AS first_hour,
            COUNT(*) AS hours
       FROM hourly_status
      WHERE hour >= ?1
      GROUP BY line_id`,
  )
    .bind(now - RETENTION_DAYS * DAY_MS)
    .all();

  const summary = {};
  for (const row of results) {
    if (!row.total) continue;
    summary[row.line_id] = {
      goodPercent: Math.round((row.good / row.total) * 100),
      sampleCount: row.total,
      trackedSince: row.first_hour,
      trackedHours: row.hours,
    };
  }
  return summary;
}

async function rebuildUptimeSummary(env, now) {
  const summary = await computeUptimeSummary(env, now);
  await env.DB.prepare(
    `INSERT INTO summary_cache (key, updated_at, payload) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`,
  )
    .bind(UPTIME_CACHE_KEY, now, JSON.stringify(summary))
    .run();
  return summary;
}

// ---- API ----

async function handleStatus(env) {
  const row = await env.DB.prepare(
    "SELECT updated_at, payload FROM latest_status WHERE id = 1",
  ).first();
  if (!row) {
    return json({ error: "No data collected yet" }, { status: 503 });
  }
  return json(
    { updatedAt: row.updated_at, lines: JSON.parse(row.payload) },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}

async function handleUptime(env) {
  const row = await env.DB.prepare(
    "SELECT payload FROM summary_cache WHERE key = ?1",
  )
    .bind(UPTIME_CACHE_KEY)
    .first();

  // First request after a fresh deploy, before the top-of-hour rebuild has
  // run: build it once now rather than returning nothing for up to an hour.
  const summary = row
    ? JSON.parse(row.payload)
    : await rebuildUptimeSummary(env, Date.now());

  return json(summary, { headers: { "Cache-Control": "public, max-age=300" } });
}

async function handleHistory(env, url) {
  const params = parseHistoryParams(url.searchParams);
  if (params.error) {
    return json({ error: params.error }, { status: 400 });
  }
  const { line, bucket, days } = params;
  const now = Date.now();

  let points;
  if (bucket === "minute") {
    // Only the ring buffer has minute detail, so this is always the last 3h.
    const { results } = await env.DB.prepare(
      `SELECT t, tier FROM minute_status
        WHERE line_id = ?1 AND t >= ?2
        ORDER BY t`,
    )
      .bind(line, now - MINUTE_SLOTS * MINUTE_MS)
      .all();
    points = results.map((row) => ({ ...toPoint(row.t, { [row.tier]: 1 }), tier: row.tier }));
  } else {
    const since = bucket === "day" ? floorTo(now, DAY_MS) - (days - 1) * DAY_MS : now - days * DAY_MS;
    const tierSums = TIERS.map((tier) => `SUM(${tier}) AS ${tier}`).join(", ");
    // Day buckets are UTC days.
    const bucketExpr = bucket === "day" ? `(hour / ${DAY_MS}) * ${DAY_MS}` : "hour";

    const { results } = await env.DB.prepare(
      `SELECT ${bucketExpr} AS t, ${tierSums}
         FROM hourly_status
        WHERE line_id = ?1 AND hour >= ?2
        GROUP BY t
        ORDER BY t`,
    )
      .bind(line, since)
      .all();
    points = results.map((row) => toPoint(row.t, row));
  }

  return json(
    { line, bucket, points },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      switch (url.pathname) {
        case "/api/status":
          return await handleStatus(env);
        case "/api/uptime":
          return await handleUptime(env);
        case "/api/history":
          return await handleHistory(env, url);
        case "/":
          return json({
            name: "tfl-status",
            endpoints: ["/api/status", "/api/uptime", "/api/history?line=<id>&bucket=minute|hour|day&days=1-90"],
          });
        default:
          return json({ error: "Not found" }, { status: 404 });
      }
    } catch (err) {
      console.error(err);
      return json({ error: "Internal error" }, { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(collect(env, event.scheduledTime));
  },
};
