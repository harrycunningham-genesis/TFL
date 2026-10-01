// Pure helpers with no Cloudflare bindings, so they can be unit tested with
// plain `node --test`.

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

// 3 hours of one-minute detail per line.
export const MINUTE_SLOTS = 180;
// Long-term retention for the hourly counters (and the uptime summary).
export const RETENTION_DAYS = 90;

// Every tier getTier() can return. These double as column names in
// hourly_status, so this list is also the whitelist for building SQL.
export const TIERS = ["good", "minor", "moderate", "severe", "unknown"];

export const TFL_MODES = ["tube", "overground", "dlr", "elizabeth-line", "tram"];
// National Rail lines TfL reports status for (see LineStatus.jsx).
export const NATIONAL_RAIL_LINES = ["thameslink"];

export function floorTo(ms, unit) {
  return Math.floor(ms / unit) * unit;
}

// Which ring-buffer slot a poll at `ms` writes to.
export function minuteSlot(ms) {
  return Math.floor(ms / MINUTE_MS) % MINUTE_SLOTS;
}

// Turns raw tier counts into one history/graph point.
export function toPoint(t, counts) {
  const point = { t };
  let total = 0;
  for (const tier of TIERS) {
    point[tier] = Number(counts[tier]) || 0;
    total += point[tier];
  }
  point.total = total;
  point.goodPercent = total > 0 ? Math.round((point.good / total) * 1000) / 10 : null;
  return point;
}

// Validates /api/history query params. Returns { error } or the parsed
// { line, bucket, days }.
export function parseHistoryParams(searchParams) {
  const line = searchParams.get("line");
  if (!line || !/^[a-z0-9-]{1,64}$/i.test(line)) {
    return { error: "`line` is required (a TfL line id, e.g. `central`)" };
  }

  const bucket = searchParams.get("bucket") || "hour";
  if (!["minute", "hour", "day"].includes(bucket)) {
    return { error: "`bucket` must be one of minute, hour, day" };
  }

  const rawDays = searchParams.get("days");
  let days = rawDays === null ? (bucket === "day" ? 30 : 1) : Number(rawDays);
  if (!Number.isFinite(days)) {
    return { error: "`days` must be a number between 1 and 90" };
  }
  days = Math.min(RETENTION_DAYS, Math.max(1, Math.floor(days)));

  return { line: line.toLowerCase(), bucket, days };
}
