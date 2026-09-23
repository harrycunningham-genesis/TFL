import { useState } from "react";

const API_KEY = import.meta.env.VITE_TFL_API_KEY;

function StationField({ label, query, setQuery, station, setStation, suggestions, setSuggestions, onSearch }) {
  async function handleChange(value) {
    setQuery(value);
    setStation(null);

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    onSearch(value);
  }

  function selectStation(match) {
    setStation(match);
    setQuery(match.name);
    setSuggestions([]);
  }

  return (
    <div className="search-box">
      <label className="field-label">{label}</label>
      <input
        type="text"
        className="station-input"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
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
  );
}

function TripPlanner() {
  const [fromQuery, setFromQuery] = useState("");
  const [fromStation, setFromStation] = useState(null);
  const [fromSuggestions, setFromSuggestions] = useState([]);

  const [toQuery, setToQuery] = useState("");
  const [toStation, setToStation] = useState(null);
  const [toSuggestions, setToSuggestions] = useState([]);

  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  async function resolveStopId(id) {
    // Interchange stations (e.g. King's Cross) resolve to a hub id that the
    // Journey Planner can't route from directly — look up its tube-specific
    // child stop instead. Some stations (e.g. Amersham) have no child tagged
    // "tube" at all because the Underground platforms are grouped under
    // National Rail in TfL's data — fall back to any child rather than
    // leaving the unresolved hub id, which the API rejects as ambiguous.
    if (!id.startsWith("HUB")) return id;

    const response = await fetch(
      `https://api.tfl.gov.uk/StopPoint/${id}?app_key=${API_KEY}`,
    );
    const data = await response.json();
    const tubeChild = data.children?.find((child) => child.modes?.includes("tube"));

    return tubeChild ? tubeChild.id : data.children?.[0]?.id || id;
  }

  async function searchStations(value, setSuggestions) {
    const response = await fetch(
      `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(value)}?modes=tube,overground,dlr,elizabeth-line&app_key=${API_KEY}`,
    );
    const data = await response.json();
    setSuggestions(data.matches || []);
  }

  async function planJourney() {
    if (!fromStation || !toStation) return;

    try {
      setLoading(true);

      const fromId = await resolveStopId(fromStation.id);
      const toId = await resolveStopId(toStation.id);

      const response = await fetch(
        `https://api.tfl.gov.uk/Journey/JourneyResults/${fromId}/to/${toId}?app_key=${API_KEY}`,
      );

      if (!response.ok) {
        throw new Error("Failed to plan journey");
      }

      const data = await response.json();
      const sorted = [...(data.journeys || [])].sort((a, b) => a.duration - b.duration);

      setJourneys(sorted);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  function formatTime(dateTime) {
    return new Date(dateTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="page">
      <h1>Plan a Trip</h1>
      <p>Find the best way to get between two stations across the TfL network.</p>

      <div className="trip-fields">
        <StationField
          label="From"
          query={fromQuery}
          setQuery={setFromQuery}
          station={fromStation}
          setStation={setFromStation}
          suggestions={fromSuggestions}
          setSuggestions={setFromSuggestions}
          onSearch={(value) => searchStations(value, setFromSuggestions)}
        />

        <StationField
          label="To"
          query={toQuery}
          setQuery={setToQuery}
          station={toStation}
          setStation={setToStation}
          suggestions={toSuggestions}
          setSuggestions={setToSuggestions}
          onSearch={(value) => searchStations(value, setToSuggestions)}
        />
      </div>

      <button
        className="plan-button"
        onClick={planJourney}
        disabled={!fromStation || !toStation || loading}
      >
        {loading ? "Planning..." : "Plan Journey"}
      </button>

      {error && <p className="error">{error}</p>}

      {searched && !loading && !error && (
        <p className="results-count">
          {journeys.length > 0
            ? `${journeys.length} route${journeys.length === 1 ? "" : "s"} found, fastest first`
            : "No routes found between these stations."}
        </p>
      )}

      <div className="journeys">
        {journeys.map((journey, index) => (
          <div className="journey-card" key={index}>
            <div className="journey-header">
              <span className="journey-title">
                Route {index + 1}
                {index === 0 && <span className="journey-tag">Fastest</span>}
              </span>
              <span className="journey-duration">{journey.duration} min</span>
            </div>

            <span className="journey-times">
              {formatTime(journey.startDateTime)} – {formatTime(journey.arrivalDateTime)}
            </span>

            <ul className="legs-list">
              {journey.legs.map((leg, legIndex) => (
                <li className="leg-item" key={legIndex}>
                  <span className="leg-mode">{leg.mode?.name}</span>
                  <span className="leg-instruction">{leg.instruction?.summary}</span>
                  <span className="leg-time">
                    {formatTime(leg.departureTime)} – {formatTime(leg.arrivalTime)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <footer>Data provided by Transport for London</footer>
    </div>
  );
}

export default TripPlanner;
