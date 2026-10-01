import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { LINE_COLOURS, getLineColour, getReadableTextColour } from "../constants/lineColours";
import {
  recordStatusSnapshot,
  getUptimeSummary,
  pruneOldSnapshots,
} from "../db/statusHistory";
import { getFavouriteLineIds, toggleFavouriteLine } from "../utils/favourites";
import { TIER_META, getTier } from "../utils/severity";

// How far back the "X% good service" figure under each line looks — long
// enough to smooth over a single bad day, short enough to still feel
// current. Purely a display choice; the database itself keeps 30 days.
const UPTIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  // lineId -> { goodPercent, sampleCount } | undefined, read back out of
  // IndexedDB — never written to directly, only ever refreshed from it.
  const [uptimeByLineId, setUptimeByLineId] = useState({});
  // Line ids someone has starred — stored in localStorage (see
  // utils/favourites.js), same idea as the recent-stations list on the
  // Trip Planner page, just for lines instead of stations.
  const [favouriteLineIds, setFavouriteLineIds] = useState(() => getFavouriteLineIds());

  function handleToggleFavouriteLine(lineId) {
    setFavouriteLineIds(toggleFavouriteLine(lineId));
  }

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
      const allLines = [...tflLines, ...nationalRailLines];

      setLines(allLines);
      setLastUpdated(new Date());
      setError(null);

      // Fire-and-forget: log this poll's tier per line to IndexedDB for the
      // uptime history feature below. Never awaited and never lets a
      // storage failure affect the page — the whole point of local history
      // is that it's a nice-to-have layered on top of the live status,
      // never something the live status depends on.
      recordStatusSnapshot(
        allLines.map((line) => ({ lineId: line.id, tier: getTier(line) })),
      ).catch((err) => console.error("Failed to record status history", err));
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

    // Trim anything older than 30 days once per page load — cheap once
    // the store's already pruned, and keeps a machine left running for
    // months from growing the database forever.
    pruneOldSnapshots().catch((err) =>
      console.error("Failed to prune status history", err),
    );

    return () => clearInterval(interval);
  }, []);

  // Whenever a fresh poll comes in, re-read each line's rolling uptime back
  // out of IndexedDB. This is a read of what recordStatusSnapshot() above
  // just wrote (plus everything written on every previous poll/session),
  // not a recomputation from `lines` itself — `lines` only ever has the
  // single latest status, never history.
  useEffect(() => {
    if (lines.length === 0) return undefined;
    let cancelled = false;

    Promise.all(
      lines.map(async (line) => {
        const summary = await getUptimeSummary(line.id, UPTIME_WINDOW_MS);
        return [line.id, summary];
      }),
    ).then((entries) => {
      if (!cancelled) {
        setUptimeByLineId(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lines]);

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
          <p className="uptime-summary">{uptime.goodPercent}% good service, last 7 days</p>
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
