import { useState } from "react";

import { getRecentStations, addRecentStation } from "../utils/recentStations";
import { getLineColor } from "../utils/lineColors";

const API_KEY = import.meta.env.VITE_TFL_API_KEY;
const RECENTS_KEY = "tfl_recent_stations";
const RAIL_MODES = ["tube", "overground", "dlr", "elizabeth-line", "tram"];
const RAIL_MODES_PARAM = RAIL_MODES.join(",");

function StationField({ label, query, setQuery, station, setStation, suggestions, setSuggestions, onSearch }) {
  const [recents, setRecents] = useState(() => getRecentStations(RECENTS_KEY));
  const [focused, setFocused] = useState(false);

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
    setFocused(false);
    setRecents(addRecentStation(RECENTS_KEY, { id: match.id, name: match.name }));
  }

  return (
    <div className="search-box">
      <label className="field-label">{label}</label>
      <input
        type="text"
        className="station-input"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
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
    // Journey Planner can't route from directly — look up a rail-specific
    // child stop instead. Some stations (e.g. Amersham) have no child tagged
    // with any of our rail modes because the Underground/Overground/etc
    // platforms are grouped under National Rail in TfL's data — fall back to
    // any child rather than leaving the unresolved hub id, which the API
    // rejects as ambiguous.
    if (!id.startsWith("HUB")) return id;

    const response = await fetch(
      `https://api.tfl.gov.uk/StopPoint/${id}?app_key=${API_KEY}`,
    );
    const data = await response.json();
    const railChild = data.children?.find((child) =>
      child.modes?.some((mode) => RAIL_MODES.includes(mode)),
    );

    return railChild ? railChild.id : data.children?.[0]?.id || id;
  }

  function swapStations() {
    setFromQuery(toQuery);
    setFromStation(toStation);
    setFromSuggestions([]);

    setToQuery(fromQuery);
    setToStation(fromStation);
    setToSuggestions([]);
  }

  async function searchStations(value, setSuggestions) {
    const response = await fetch(
      `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(value)}?modes=${RAIL_MODES_PARAM}&app_key=${API_KEY}`,
    );
    const data = await response.json();
    setSuggestions(data.matches || []);
  }

  async function planJourney() {
    if (!fromStation || !toStation) return;

    if (fromStation.id === toStation.id) {
      setJourneys([]);
      setError("Please choose two different stations.");
      setSearched(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const fromId = await resolveStopId(fromStation.id);
      const toId = await resolveStopId(toStation.id);

      const response = await fetch(
        `https://api.tfl.gov.uk/Journey/JourneyResults/${fromId}/to/${toId}?app_key=${API_KEY}`,
      );

      if (!response.ok) {
        throw new Error(
          "We couldn't plan a journey between these stations. Please try again in a moment.",
        );
      }

      const data = await response.json();
      const sorted = [...(data.journeys || [])].sort((a, b) => a.duration - b.duration);

      setJourneys(sorted);
    } catch (err) {
      setJourneys([]);
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

        <button
          type="button"
          className="swap-button"
          onClick={swapStations}
          disabled={!fromQuery && !toQuery}
          aria-label="Swap from and to stations"
          title="Swap stations"
        >
          ⇄
        </button>

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

      {searched && !loading && !error && journeys.length > 0 && (
        <p className="results-count">
          {journeys.length} route{journeys.length === 1 ? "" : "s"} found, fastest first
        </p>
      )}

      {searched && !loading && !error && journeys.length === 0 && (
        <div className="no-results">
          <span className="no-results-icon">🧭</span>
          <h3>No routes found</h3>
          <p>
            TfL couldn't find a journey between {fromStation?.name} and {toStation?.name}.
            Double-check both stations, or try again — services may be too disrupted
            right now to plan a route.
          </p>
        </div>
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
              {journey.legs.map((leg, legIndex) => {
                const lineName = leg.routeOptions?.[0]?.name;
                const color = lineName ? getLineColor(lineName) : null;

                return (
                  <li className="leg-item" key={legIndex}>
                    <span
                      className="leg-mode"
                      style={
                        color
                          ? { backgroundColor: color.bg, color: color.text }
                          : undefined
                      }
                    >
                      {lineName || leg.mode?.name}
                    </span>
                    <span className="leg-instruction">{leg.instruction?.summary}</span>
                    <span className="leg-time">
                      {formatTime(leg.departureTime)} – {formatTime(leg.arrivalTime)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <footer>Data provided by Transport for London</footer>
    </div>
  );
}

export default TripPlanner;
