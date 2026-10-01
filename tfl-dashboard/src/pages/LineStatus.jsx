import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { LINE_COLOURS, getLineColour, getReadableTextColour } from "../constants/lineColours";
import { fetchStatus, fetchUptime } from "../api/backend";
import { getFavouriteLineIds, toggleFavouriteLine } from "../utils/favourites";
import { TIER_META, getTier } from "../utils/severity";
import { describeTrackedPeriod } from "../utils/trackedTime";

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
  // lineId -> { goodPercent, sampleCount, trackedSince, trackedHours }, from
  // the Worker's shared history (everything tracked so far, up to 90 days).
  const [uptimeByLineId, setUptimeByLineId] = useState({});
  // Line ids someone has starred — stored in localStorage (see
  // utils/favourites.js), same idea as the recent-stations list on the
  // Trip Planner page, just for lines instead of stations.
  const [favouriteLineIds, setFavouriteLineIds] = useState(() => getFavouriteLineIds());

  function handleToggleFavouriteLine(lineId) {
    setFavouriteLineIds(toggleFavouriteLine(lineId));
  }

  // Live status and uptime both come from the tfl-status Worker (see
  // api/backend.js), which polls TfL once a minute and keeps the history
  // centrally, so every visitor sees the same numbers.
  async function fetchTubeStatus() {
    try {
      setLoading(true);

      const [status, uptime] = await Promise.all([
        fetchStatus(),
        // Uptime is a nice-to-have on top of the live status, so a failure
        // here never hides the status itself.
        fetchUptime().catch((err) => {
          console.error("Failed to load uptime history", err);
          return null;
        }),
      ]);

      setLines(status.lines);
      setLastUpdated(status.updatedAt ? new Date(status.updatedAt) : new Date());
      if (uptime) setUptimeByLineId(uptime);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTubeStatus();

    // The Worker refreshes once a minute, so there's no point polling faster.
    const interval = setInterval(fetchTubeStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Ticks the "Updated Xs ago" label once a second, independent of the
  // 60-second data refresh above.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  function renderLineCard(line) {
    const status = line.lineStatuses?.[0];
    const tier = getTier(line);
    const meta = TIER_META[tier];
    const color = getLineColour(line.id);
    const plannedWindow = formatPlannedWindow(status);
    const uptime = uptimeByLineId[line.id];
    const isFavourite = favouriteLineIds.includes(line.id);

    return (
      <div className="line-card" key={line.id} style={{ borderLeft: `6px solid ${color}` }}>
        <div className="line-header">
          <h3>
            <span className="line-swatch" style={{ backgroundColor: color }} />
            {line.name}
          </h3>

          <div className="line-header-right">
            <button
              type="button"
              className={`favourite-star ${isFavourite ? "favourite-star-active" : ""}`}
              onClick={() => handleToggleFavouriteLine(line.id)}
              aria-label={
                isFavourite ? `Remove ${line.name} from favourites` : `Add ${line.name} to favourites`
              }
              title={isFavourite ? "Remove from favourites" : "Add to favourites"}
            >
              {isFavourite ? "★" : "☆"}
            </button>

            <span className={`status ${meta.className}`}>{meta.label}</span>
          </div>
        </div>

        {status?.reason && <p className="reason">{status.reason}</p>}

        {plannedWindow && <p className="planned-window">{plannedWindow}</p>}

        {uptime ? (
          <p className="uptime-summary">
            {uptime.goodPercent}% good service, {describeTrackedPeriod(uptime.trackedSince, now)}
          </p>
        ) : (
          <p className="uptime-summary uptime-summary-empty">
            History tracking started — check back soon
          </p>
        )}

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
  }

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

      {(() => {
        const favouriteLines = lines
          .filter((line) => favouriteLineIds.includes(line.id))
          .filter((line) => !disruptionsOnly || getTier(line) !== "good")
          .slice()
          .sort((a, b) => {
            const rankDiff = TIER_META[getTier(a)].rank - TIER_META[getTier(b)].rank;
            return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
          });

        if (favouriteLines.length === 0) return null;

        return (
          <section className="mode-section favourites-section">
            <h2 className="mode-section-title">★ Favourites</h2>
            <div className="line-grid">{favouriteLines.map((line) => renderLineCard(line))}</div>
          </section>
        );
      })()}

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

            <div className="line-grid">{modeLines.map((line) => renderLineCard(line))}</div>
          </section>
        );
      })}

      <footer>Data provided by Transport for London</footer>
    </div>
  );
}

export default LineStatus;
