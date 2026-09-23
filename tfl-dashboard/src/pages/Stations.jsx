import { useState, useEffect } from "react";

import { getRecentStations, addRecentStation } from "../utils/recentStations";
import { getLineColor } from "../utils/lineColors";

const API_KEY = import.meta.env.VITE_TFL_API_KEY;
const RECENTS_KEY = "tfl_recent_stations";
const RAIL_MODES = ["tube", "overground", "dlr", "elizabeth-line", "tram"];
const RAIL_MODES_PARAM = RAIL_MODES.join(",");

function Stations() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [station, setStation] = useState(null);
  const [arrivals, setArrivals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recents, setRecents] = useState(() => getRecentStations(RECENTS_KEY));
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState(null);
  const [lineStatus, setLineStatus] = useState(null);
  const [lineStatusLoading, setLineStatusLoading] = useState(false);


  useEffect(() => {
    if (station || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const response = await fetch(
        `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(query)}?modes=${RAIL_MODES_PARAM}&app_key=${API_KEY}`,
      );
      const data = await response.json();
      setSuggestions(data.matches || []);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, station]);

  useEffect(() => {
    if (!station) return;

    const interval = setInterval(() => fetchArrivals(station.stopIds), 30000);

    return () => clearInterval(interval);
  }, [station]);

  async function fetchArrivals(stopIds) {
  try {
    setLoading(true);

    const responses = await Promise.all(
      stopIds.map((stopId) =>
        fetch(`https://api.tfl.gov.uk/StopPoint/${stopId}/Arrivals?app_key=${API_KEY}`),
      ),
    );

    if (responses.some((response) => !response.ok)) {
      throw new Error("Failed to fetch arrivals");
    }

    const results = await Promise.all(responses.map((response) => response.json()));

    setArrivals(results.flat());
    setError(null);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}
function cleanStationName(name) {
  return name ? name.replace(/\s*Underground Station$/i, "").trim() : name;
}

function isSameStation(nameA, nameB) {
  if (!nameA || !nameB) return false;
  return cleanStationName(nameA).toLowerCase() === cleanStationName(nameB).toLowerCase();
}

function isTerminatingArrival(p, stationName) {
  const isUnknownDestination = p.towards?.toLowerCase() === "check front of train";

  return (
    !p.destinationName ||
    isUnknownDestination ||
    isSameStation(p.destinationName, stationName)
  );
}

function groupArrivals(predictions) {
  const sorted = [...predictions].sort((a, b) => a.timeToStation - b.timeToStation);

  return sorted.reduce((groups, prediction) => {
    const key = prediction.platformName || prediction.direction || "Unknown platform";

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(prediction);

    return groups;
  }, {});
}



function extractFacilities(additionalProperties) {
  const props = Object.fromEntries(
    (additionalProperties || []).map((p) => [p.key, p.value]),
  );

  return {
    zone: props.Zone || null,
    wifi: props.WiFi?.toLowerCase() === "yes",
    toilets: props.Toilets?.toLowerCase() === "yes" || props.Toilet?.toLowerCase() === "yes",
    stepFree: props.AccessViaLift?.toLowerCase() === "yes" || Number(props.Lifts) > 0,
    nightTube: props.Night?.toLowerCase() === "yes",
  };
}

function describeCrowding(percentageOfBaseline) {
  if (percentageOfBaseline < 0.5) return { label: "Quiet", className: "quiet" };
  if (percentageOfBaseline < 0.85) return { label: "Below average", className: "quiet" };
  if (percentageOfBaseline < 1.15) return { label: "Typical", className: "typical" };
  if (percentageOfBaseline < 1.5) return { label: "Busy", className: "busy" };
  return { label: "Very busy", className: "busy" };
}

async function getCrowding(stopIds) {
  // Live crowding (current footfall vs this station's typical baseline for
  // the time of day) is only tracked for a subset of major stations — hub
  // ids and smaller/quieter stations report dataAvailable: false. Try each
  // rail-mode stop id in turn and use the first one with real data.
  for (const stopId of stopIds) {
    try {
      const response = await fetch(
        `https://api.tfl.gov.uk/crowding/${stopId}/live?app_key=${API_KEY}`,
      );

      if (!response.ok) continue;

      const data = await response.json();

      if (data.dataAvailable) return data;
    } catch {
      // try the next stop id
    }
  }

  return null;
}

async function getStationDetail(id) {
  // Interchange stations (e.g. Farringdon) resolve to a hub id with no
  // arrivals of its own. Some hubs split their platforms across several
  // child stops by mode (Farringdon has separate Tube, Elizabeth line and
  // National Rail children) — arrivals only cover whichever single stop you
  // ask for, so fetch every rail-mode child and merge them, rather than
  // picking just one and silently dropping the others' departures.
  // Some stations (e.g. Amersham) have no child tagged with any of our rail
  // modes because the Underground/Overground/etc platforms are grouped under
  // National Rail in TfL's data — fall back to any child rather than leaving
  // the unresolved hub id, which the API rejects as ambiguous.
  const [detailResponse, disruptionResponse] = await Promise.all([
    fetch(`https://api.tfl.gov.uk/StopPoint/${id}?app_key=${API_KEY}`),
    fetch(`https://api.tfl.gov.uk/StopPoint/${id}/Disruption?app_key=${API_KEY}`),
  ]);

  const detail = await detailResponse.json();
  const disruptions = disruptionResponse.ok ? await disruptionResponse.json() : [];

  let stopIds = [id];

  if (id.startsWith("HUB")) {
    const railChildren = detail.children?.filter((child) =>
      child.modes?.some((mode) => RAIL_MODES.includes(mode)),
    );

    if (railChildren?.length > 0) {
      stopIds = railChildren.map((child) => child.id);
    } else {
      stopIds = detail.children?.[0] ? [detail.children[0].id] : [id];
    }
  }

  const crowding = await getCrowding(stopIds);

  return {
    stopIds,
    lines: detail.lines || [],
    facilities: extractFacilities(detail.additionalProperties),
    disruptions,
    crowding,
  };
}

async function selectStation(match) {
  setQuery("");
  setSuggestions([]);
  setFocused(false);
  setFilter("all");
  setLineFilter(null);
  setRecents(addRecentStation(RECENTS_KEY, { id: match.id, name: match.name }));

  const detail = await getStationDetail(match.id);

  setStation({ ...match, id: detail.stopIds[0], ...detail });
  fetchArrivals(detail.stopIds);
}

const arrivalLineNames = new Set(arrivals.map((p) => p.lineName));

// Some lines a station serves (e.g. Thameslink) have no real-time
// predictions in TfL's Arrivals feed at all — they're run by a separate
// National Rail operator. When that's the selected filter, fall back to
// that line's current service status instead of a dead "no departures"
// message.
const showLineStatusFallback =
  lineFilter && arrivals.length > 0 && !arrivalLineNames.has(lineFilter);

useEffect(() => {
  if (!showLineStatusFallback) {
    setLineStatus(null);
    return;
  }

  const lineId = station.lines?.find((l) => l.name === lineFilter)?.id;

  if (!lineId) {
    setLineStatus(null);
    return;
  }

  setLineStatusLoading(true);

  fetch(`https://api.tfl.gov.uk/Line/${lineId}/Status?app_key=${API_KEY}`)
    .then((response) => response.json())
    .then((data) => setLineStatus(data[0] || null))
    .catch(() => setLineStatus(null))
    .finally(() => setLineStatusLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showLineStatusFallback, lineFilter]);

const filteredArrivals = arrivals.filter((p) => {
  if (lineFilter && p.lineName !== lineFilter) return false;

  if (filter === "all") return true;

  const terminating = isTerminatingArrival(p, station?.name);

  return filter === "departing" ? !terminating : terminating;
});

const board = groupArrivals(filteredArrivals);


  return (
    <div className="page">
      <h1>Stations</h1>

      <p>
        Search for a Tube, Overground, DLR, Elizabeth line or Tram station to see live arrivals.
      </p>

      {!station && (
        <div className="search-box">
          <input
            type="text"
            className="station-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Search for a station"
          />

          {query.trim().length === 0 && focused && recents.length > 0 && (
            <ul className="suggestions">
              <li className="suggestions-label">Recent</li>
              {recents.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    className="suggestion-item"
                    onClick={() => selectStation(match)}
                  >
                    {match.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    className="suggestion-item"
                    onClick={() => selectStation(match)}
                  >
                    {match.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {station && (
        <>
          <div className="station-header">
            <h2>{station.name}</h2>

            <div className="station-actions">
              <button onClick={() => fetchArrivals(station.stopIds)}>Refresh</button>
              <button
                onClick={() => {
                  setStation(null);
                  setArrivals([]);
                  setError(null);
                  setLineFilter(null);
                }}
              >
                Back to search
              </button>
            </div>
          </div>

          {station.crowding && (
            <div className="crowding-indicator">
              <span
                className={`crowding-badge ${describeCrowding(station.crowding.percentageOfBaseline).className}`}
              >
                {describeCrowding(station.crowding.percentageOfBaseline).label}
              </span>
              <span className="crowding-detail">
                {Math.round(station.crowding.percentageOfBaseline * 100)}% of typical footfall
                for this time
              </span>
            </div>
          )}

          {station.lines?.length > 0 && (
            <div className="line-chips">
              {station.lines.map((line) => {
                const color = getLineColor(line.name);
                const isActive = lineFilter === line.name;

                return (
                  <button
                    type="button"
                    key={line.id}
                    className={`line-chip ${isActive ? "active" : ""}`}
                    style={{ backgroundColor: color.bg, color: color.text }}
                    onClick={() => setLineFilter(isActive ? null : line.name)}
                  >
                    {line.name}
                  </button>
                );
              })}
            </div>
          )}

          {(station.facilities?.zone ||
            station.facilities?.wifi ||
            station.facilities?.toilets ||
            station.facilities?.stepFree ||
            station.facilities?.nightTube) && (
            <div className="facility-badges">
              {station.facilities.zone && (
                <span className="facility-badge">Zone {station.facilities.zone}</span>
              )}
              {station.facilities.stepFree && (
                <span className="facility-badge">Step-free access</span>
              )}
              {station.facilities.nightTube && (
                <span className="facility-badge">Night Tube</span>
              )}
              {station.facilities.wifi && <span className="facility-badge">WiFi</span>}
              {station.facilities.toilets && (
                <span className="facility-badge">Toilets</span>
              )}
            </div>
          )}

          {station.disruptions?.length > 0 && (
            <div className="station-disruptions">
              {station.disruptions.map((d, i) => (
                <p className="station-disruption" key={i}>
                  {d.description}
                </p>
              ))}
            </div>
          )}

          {lineFilter && (
            <p className="line-filter-note">
              Showing {lineFilter} only.{" "}
              <button type="button" className="link-button" onClick={() => setLineFilter(null)}>
                Clear
              </button>
            </p>
          )}

          {loading && <p>Loading arrivals...</p>}
          {error && <p className="error">{error}</p>}

          {!loading && !error && arrivals.length === 0 && (
            <p>No live arrivals available for this station right now.</p>
          )}

          {!loading && !error && arrivals.length > 0 && (
            <div className="filter-tabs">
              <button
                type="button"
                className={`filter-tab ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-tab ${filter === "departing" ? "active" : ""}`}
                onClick={() => setFilter("departing")}
              >
                Departing
              </button>
              <button
                type="button"
                className={`filter-tab ${filter === "terminating" ? "active" : ""}`}
                onClick={() => setFilter("terminating")}
              >
                Ends here
              </button>
            </div>
          )}

          {showLineStatusFallback && (
            <div className="line-status-fallback">
              <p className="line-status-fallback-note">
                {lineFilter} is run by a separate National Rail operator, so live train times
                aren't available here — showing current service status instead.
              </p>

              {lineStatusLoading && <p>Loading service status...</p>}

              {!lineStatusLoading && lineStatus && (
                <div
                  className="line-card"
                  style={{ borderLeft: `6px solid ${getLineColor(lineFilter).bg}` }}
                >
                  <div className="line-header">
                    <h3>
                      <span
                        className="line-swatch"
                        style={{ backgroundColor: getLineColor(lineFilter).bg }}
                      />
                      {lineFilter}
                    </h3>

                    <span
                      className={`status ${
                        lineStatus.lineStatuses?.[0]?.statusSeverityDescription ===
                        "Good Service"
                          ? "good"
                          : "warning"
                      }`}
                    >
                      {lineStatus.lineStatuses?.[0]?.statusSeverityDescription || "Unknown"}
                    </span>
                  </div>

                  {lineStatus.lineStatuses?.[0]?.reason && (
                    <p className="reason">{lineStatus.lineStatuses[0].reason}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!loading && !error && arrivals.length > 0 && !showLineStatusFallback && filteredArrivals.length === 0 && (
            <p>
              {lineFilter
                ? `No live departures for ${lineFilter} right now.`
                : filter === "departing"
                  ? "No departing trains right now — every arrival ends at this station."
                  : "No trains ending here right now."}
            </p>
          )}

          {Object.entries(board).map(([platform, predictions]) => (
            <div className="platform-group" key={platform}>
              <h3>{platform}</h3>
              <ul className="arrivals-list">
                {predictions.map((p) => {
                  const isUnknownDestination = p.towards?.toLowerCase() === "check front of train";
                  const isTerminating = isTerminatingArrival(p, station.name);

                  return (
                    <li className="arrival-card" key={p.id}>
                      <div className="arrival-info">
                        <span
                          className="arrival-line"
                          style={{
                            backgroundColor: getLineColor(p.lineName).bg,
                            color: getLineColor(p.lineName).text,
                          }}
                        >
                          {p.lineName}
                        </span>
                        <span
                          className={`arrival-status ${
                            isTerminating ? "terminating" : "departing"
                          }`}
                        >
                          {isTerminating ? "Arriving • ends here" : "Departing"}
                        </span>
                        <span className="arrival-destination">
                          {isUnknownDestination
                            ? "Check the front of the train for its destination"
                            : isTerminating
                              ? "Terminates at this station"
                              : `towards ${cleanStationName(p.destinationName)}`}
                        </span>
                      </div>
                      <span className="arrival-time">
                        {p.timeToStation < 30
                          ? "Due"
                          : `${Math.round(p.timeToStation / 60)} min`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      )}

    </div>
  );
}

export default Stations;
