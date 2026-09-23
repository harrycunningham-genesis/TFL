import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { LINE_COLOURS, getLineColour, getReadableTextColour } from "../constants/lineColours";

// Which line ids the live map (TubeMap.jsx) actually knows how to draw —
// everything in the shared colour lookup except Trams and Thameslink,
// which aren't part of that map's data yet. Used to only offer a
// "View on live map" link for lines that will actually go somewhere.
const MAPPABLE_LINE_IDS = new Set(
  Object.keys(LINE_COLOURS).filter((id) => id !== "tram" && id !== "thameslink"),
);

const MODE_ORDER = ["tube", "overground", "dlr", "elizabeth-line", "tram", "national-rail"];
const MODE_LABELS = {
  tube: "Underground",
  overground: "Overground",
  dlr: "DLR",
  "elizabeth-line": "Elizabeth line",
  tram: "Trams",
  "national-rail": "National Rail",
};

// TfL's live Arrivals API has no real-time predictions for National Rail
// operators (they run their own separate systems) — but it does track
// service-level status for some of them. Thameslink calls at several
// stations this app already covers (Farringdon, St Pancras), so it's
// listed here even though it isn't part of the tube/overground/etc modes
// above. Add more national-rail line ids here if useful later.
const NATIONAL_RAIL_LINES = ["thameslink"];

// TfL's severityLevel is a shared 0-20 enum across every mode (see
// GET /Line/Meta/Severity) — but the NUMBER itself isn't a severity
// ranking: 10 is "Good Service", the normal healthy state, sitting right
// in the middle of the scale. So sorting or colour-coding by that raw
// number would be meaningless (a "Part Closure" at 5 isn't worse than
// "Severe Delays" at 6 just because 5 < 6). This is our own judgement call
// on how bad each of TfL's real-world status descriptions actually is for
// a passenger, grouped into four tiers used for both sorting and colour.
const SEVERITY_TIER_BY_DESCRIPTION = {
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
const TIER_META = {
  severe: { rank: 0, label: "Severe disruption", className: "severe" },
  moderate: { rank: 1, label: "Disrupted", className: "moderate" },
  minor: { rank: 2, label: "Minor issue", className: "minor" },
  good: { rank: 3, label: "Good service", className: "good" },
  unknown: { rank: 4, label: "Unknown", className: "unknown" },
};

function getTier(line) {
  const description = line.lineStatuses?.[0]?.statusSeverityDescription;
  return SEVERITY_TIER_BY_DESCRIPTION[description] || "unknown";
}

// Only worth showing a "closed until…" window for disruptions TfL already
// knows the schedule for (planned engineering work, etc.) — for a live,
// still-unfolding incident (category "RealTime"), the validity period's
// end time is usually just a same-day placeholder rather than a genuine
// estimate, so showing it as if it were one would be misleading.
function formatPlannedWindow(status) {
  const disruption = status?.disruption;
  const period = status?.validityPeriods?.[0];
  if (!disruption || disruption.category === "RealTime" || !period?.toDate) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

  return `Until ${formatter.format(new Date(period.toDate))}`;
}

function formatUpdatedAgo(lastUpdated, now) {
  if (!lastUpdated) return null;
  const seconds = Math.max(0, Math.round((now - lastUpdated) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function LineStatus() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [disruptionsOnly, setDisruptionsOnly] = useState(false);

  async function fetchTubeStatus() {
    try {
      setLoading(true);

      const apiKey = import.meta.env.VITE_TFL_API_KEY;

      const [tflResponse, nationalRailResponse] = await Promise.all([
        fetch(
          `https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr,elizabeth-line,tram/Status?app_key=${apiKey}`,
        ),
        fetch(
          `https://api.tfl.gov.uk/Line/${NATIONAL_RAIL_LINES.join(",")}/Status?app_key=${apiKey}`,
        ),
      ]);

      if (!tflResponse.ok) {
        throw new Error("Failed to fetch line status");
      }

      const tflLines = await tflResponse.json();
      const nationalRailLines = nationalRailResponse.ok ? await nationalRailResponse.json() : [];

      setLines([...tflLines, ...nationalRailLines]);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTubeStatus();

    // Refresh every 60 seconds
    const interval = setInterval(fetchTubeStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  // Ticks the "Updated Xs ago" label once a second, independent of the
  // 60-second data refresh above.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const disruptedLines = lines.filter((line) => getTier(line) !== "good");
  const worstTier = disruptedLines.some((line) => getTier(line) === "severe")
    ? "severe"
    : disruptedLines.some((line) => getTier(line) === "moderate")
      ? "moderate"
      : disruptedLines.length > 0
        ? "minor"
        : "good";

  return (
    <div className="page">
      <h1>Line Status</h1>
      <p>Live service information for the Tube, Overground, DLR, Elizabeth line and Trams</p>

      <div
        className={`network-banner network-banner-${worstTier}`}
      >
        {disruptedLines.length === 0 ? (
          <span>Good service across the network</span>
        ) : (
          <span>
            {disruptedLines.length} of {lines.length} lines affected —{" "}
            {disruptedLines
              .slice(0, 4)
              .map((line) => `${line.name} (${line.lineStatuses?.[0]?.statusSeverityDescription})`)
              .join(", ")}
            {disruptedLines.length > 4 && ` +${disruptedLines.length - 4} more`}
          </span>
        )}
      </div>

      <div className="status-controls">
        <button onClick={fetchTubeStatus}>Refresh</button>

        <label className="disruptions-only-toggle">
          <input
            type="checkbox"
            checked={disruptionsOnly}
            onChange={(event) => setDisruptionsOnly(event.target.checked)}
          />
          Show disruptions only
        </label>

        {lastUpdated && (
          <span className="updated-ago">Updated {formatUpdatedAgo(lastUpdated, now)}</span>
        )}
      </div>

      {loading && <p>Loading line status...</p>}

      {error && <p className="error">{error}</p>}

      {MODE_ORDER.map((mode) => {
        const modeLines = lines
          .filter((line) => line.modeName === mode)
          .filter((line) => !disruptionsOnly || getTier(line) !== "good")
          .slice()
          .sort((a, b) => {
            const rankDiff = TIER_META[getTier(a)].rank - TIER_META[getTier(b)].rank;
            return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
          });

        if (modeLines.length === 0) return null;

        return (
          <section className="mode-section" key={mode}>
            <h2 className="mode-section-title">{MODE_LABELS[mode]}</h2>

            <div className="line-grid">
              {modeLines.map((line) => {
                const status = line.lineStatuses?.[0];
                const tier = getTier(line);
                const meta = TIER_META[tier];
                const color = getLineColour(line.id);
                const plannedWindow = formatPlannedWindow(status);

                return (
                  <div
                    className="line-card"
                    key={line.id}
                    style={{ borderLeft: `6px solid ${color}` }}
                  >
                    <div className="line-header">
                      <h3>
                        <span className="line-swatch" style={{ backgroundColor: color }} />
                        {line.name}
                      </h3>

                      <span className={`status ${meta.className}`}>{meta.label}</span>
                    </div>

                    {status?.reason && <p className="reason">{status.reason}</p>}

                    {plannedWindow && <p className="planned-window">{plannedWindow}</p>}

                    {MAPPABLE_LINE_IDS.has(line.id) && (
                      <Link
                        to={`/map?line=${line.id}`}
                        className="view-on-map-link"
                        style={{ background: color, color: getReadableTextColour(color) }}
                      >
                        View on live map →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <footer>Data provided by Transport for London</footer>
    </div>
  );
}

export default LineStatus;
