// Labels how far back a line's uptime figure covers, e.g. "last 5 hours"
// or "last 12 days". The Worker keeps 90 days, so that's the cap.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_DAYS = 90;

export function describeTrackedPeriod(trackedSince, now = Date.now()) {
  if (trackedSince === null || trackedSince === undefined) return null;
  const since = typeof trackedSince === "number" ? trackedSince : Date.parse(trackedSince);
  if (!Number.isFinite(since)) return null;

  const elapsed = Math.max(0, now - since);

  if (elapsed < 2 * HOUR_MS) return "last hour";
  if (elapsed < 2 * DAY_MS) return `last ${Math.floor(elapsed / HOUR_MS)} hours`;

  const days = Math.min(MAX_DAYS, Math.floor(elapsed / DAY_MS));
  return `last ${days} days`;
}
