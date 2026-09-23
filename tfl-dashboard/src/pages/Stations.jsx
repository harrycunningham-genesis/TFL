import { useState, useEffect } from "react";

const API_KEY = import.meta.env.VITE_TFL_API_KEY;

function Stations() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [station, setStation] = useState(null);
  const [arrivals, setArrivals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


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
  if (!id.startsWith("HUB")) return id;

  const response = await fetch(
    `https://api.tfl.gov.uk/StopPoint/${id}?app_key=${API_KEY}`,
  );
  const data = await response.json();
  const tubeChild = data.children?.find((child) => child.modes?.includes("tube"));

  return tubeChild ? tubeChild.id : id;
}

async function selectStation(match) {
  setQuery("");
  setSuggestions([]);

  const stopId = await resolveStopId(match.id);

  setStation({ ...match, id: stopId });
  fetchArrivals(stopId);
}
const board = groupArrivals(arrivals);


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
            placeholder="Search for a station"
          />

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

          {Object.entries(board).map(([platform, predictions]) => (
            <div className="platform-group" key={platform}>
              <h3>{platform}</h3>
              <ul className="arrivals-list">
                {predictions.map((p) => {
                  const isTerminating = !p.destinationName;

                  return (
                    <li className="arrival-card" key={p.id}>
                      <div className="arrival-info">
                        <span className="arrival-line">{p.lineName}</span>
                        <span
                          className={`arrival-status ${
                            isTerminating ? "terminating" : "departing"
                          }`}
                        >
                          {isTerminating ? "Arriving • ends here" : "Departing"}
                        </span>
                        <span className="arrival-destination">
                          {isTerminating
                            ? `via ${p.towards}`
                            : `towards ${p.destinationName}`}
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
