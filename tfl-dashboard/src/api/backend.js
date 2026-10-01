// Client for the tfl-status Cloudflare Worker (see /worker). The Worker
// polls TfL once a minute and stores history centrally, so every visitor
// sees the same live status and the same history, and the TfL key never
// ships in the browser bundle.
//
// VITE_API_URL is the Worker's origin, e.g.
// https://tfl-status.harry-genesis-tfl.workers.dev — set it in
// tfl-dashboard/.env locally, and as a repository variable for the
// GitHub Pages build.
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

async function getJson(path) {
  if (!API_URL) {
    throw new Error("VITE_API_URL is not set");
  }
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed (${response.status})`);
  }
  return response.json();
}

// { updatedAt, lines: [...TfL line objects] }
export function fetchStatus() {
  return getJson("/api/status");
}

// { [lineId]: { goodPercent, sampleCount, trackedSince, trackedHours } }
export function fetchUptime() {
  return getJson("/api/uptime");
}

// { line, bucket, points: [{ t, good, minor, moderate, severe, unknown, total, goodPercent }] }
// bucket: "minute" (last 3 hours only) | "hour" | "day" (UTC days); days: 1-90.
export function fetchLineHistory(lineId, { days = 1, bucket = "hour" } = {}) {
  const params = new URLSearchParams({ line: lineId, bucket, days: String(days) });
  return getJson(`/api/history?${params}`);
}
