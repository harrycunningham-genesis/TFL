// Shared between Line Status and the Home page's favourites section, so
// both agree on what counts as "disrupted" and use the exact same colours
// for it — a line shouldn't look "moderate" on one page and "minor" on
// another just because the tiering logic got duplicated and drifted.
//
// TfL's severityLevel is a shared 0-20 enum across every mode (see
// GET /Line/Meta/Severity) — but the NUMBER itself isn't a severity
// ranking: 10 is "Good Service", the normal healthy state, sitting right
// in the middle of the scale. So sorting or colour-coding by that raw
// number would be meaningless (a "Part Closure" at 5 isn't worse than
// "Severe Delays" at 6 just because 5 < 6). This is our own judgement call
// on how bad each of TfL's real-world status descriptions actually is for
// a passenger, grouped into four tiers used for both sorting and colour.
export const SEVERITY_TIER_BY_DESCRIPTION = {
  Closed: "severe",
  "Service Closed": "severe",
  Suspended: "severe",
  "Not Running": "severe",
  "Part Suspended": "severe",
  "Severe Delays": "severe",

  "Part Closure": "moderate",
  "Part Closed": "moderate",
  "Reduced Service": "moderate",
  "Bus Service": "moderate",
  "Planned Closure": "moderate",
  Diverted: "moderate",
  "Issues Reported": "moderate",

  "Minor Delays": "minor",
  "Change of frequency": "minor",
  "Exit Only": "minor",
  "No Step Free Access": "minor",

  "Good Service": "good",
  "Special Service": "good",
  "No Issues": "good",
  Information: "good",
};

// Sort order (lower = shown first = worse) and display metadata per tier.
// "unknown" covers a missing/unrecognised status rather than silently
// treating it as fine.
export const TIER_META = {
  severe: { rank: 0, label: "Severe disruption", className: "severe" },
  moderate: { rank: 1, label: "Disrupted", className: "moderate" },
  minor: { rank: 2, label: "Minor issue", className: "minor" },
  good: { rank: 3, label: "Good service", className: "good" },
  unknown: { rank: 4, label: "Unknown", className: "unknown" },
};

export function getTier(line) {
  const description = line.lineStatuses?.[0]?.statusSeverityDescription;
  return SEVERITY_TIER_BY_DESCRIPTION[description] || "unknown";
}
