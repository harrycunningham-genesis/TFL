import { useState, useEffect } from "react";

import { getRecentStations, addRecentStation } from "../utils/recentStations";
import { getLineColor } from "../utils/lineColors";

const API_KEY = import.meta.env.VITE_TFL_API_KEY;
const RECENTS_KEY = "tfl_recent_stations";

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


  useEffect(() => {
    if (station || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const response = await fetch(
        `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(query)}?modes=tube&app_key=${API_KEY}`,
      );
      const data = await response.json();
      setSuggestions(data.matches || []);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, station]);

  useEffect(() => {
    if (!station) return;

    const interval = setInterval(() => fetchArrivals(station.id), 30000);

    return () => clearInterval(interval);
  }, [station]);

  async function fetchArrivals(stopId) {
  try {
    setLoading(true);

    const response = await fetch(
      `https://api.tfl.gov.uk/StopPoint/${stopId}/Arrivals?app_key=${API_KEY}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch arrivals");
    }

    const data = await response.json();
    setArrivals(data);
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



async function resolveStopId(id) {
  // Interchange stations (e.g. Farringdon) resolve to a hub id with no
  // arrivals of its own — look up its Tube-specific child stop instead.
  // Some stations (e.g. Amersham) have no child tagged "tube" at all because
  // the Underground platforms are grouped under National Rail in TfL's data —
  // fall back to any child rather than leaving the unresolved hub id, which
  // the API rejects as ambiguous.
  if (!id.startsWith("HUB")) return id;

  const response = await fetch(
    `https://api.tfl.gov.uk/StopPoint/${id}?app_key=${API_KEY}`,
  );
  const data = await response.json();
  const tubeChild = data.children?.find((child) => child.modes?.includes("tube"));

  return tubeChild ? tubeChild.id : data.children?.[0]?.id || id;
}

async function selectStation(match) {
  setQuery("");
  setSuggestions([]);
  setFocused(false);
  setFilter("all");
  setRecents(addRecentStation(RECENTS_KEY, { id: match.id, name: match.name }));

  const stopId = await resolveStopId(match.id);

  setStation({ ...match, id: stopId });
  fetchArrivals(stopId);
}

const filteredArrivals = arrivals.filter((p) => {
  if (filter === "all") return true;

  const terminating = isTerminatingArrival(p, station?.name);

  return filter === "departing" ? !terminating : terminating;
});

const board = groupArrivals(filteredArrivals);


  return (
    <div className="page">
      <h1>Stations</h1>

      <p>
        Search for an Underground station to see live arrivals.
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
              <button onClick={() => fetchArrivals(station.id)}>Refresh</button>
              <button
                onClick={() => {
                  setStation(null);
                  setArrivals([]);
                  setError(null);
                }}
              >
                Back to search
              </button>
            </div>
          </div>

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

          {!loading && !error && arrivals.length > 0 && filteredArrivals.length === 0 && (
            <p>
              {filter === "departing"
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
