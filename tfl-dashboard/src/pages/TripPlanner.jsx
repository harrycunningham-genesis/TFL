import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getRecentStations, addRecentStation } from "../utils/recentStations";
import {
  getFavouriteTrips,
  isFavouriteTrip,
  toggleFavouriteTrip,
  removeFavouriteTrip,
} from "../utils/favourites";
import { getLineColor } from "../utils/lineColors";

const API_KEY = import.meta.env.VITE_TFL_API_KEY;
const RECENTS_KEY = "tfl_recent_stations";

// Modes with live arrivals via TfL's Arrivals API — used to resolve which
// child stop of an interchange hub to actually plan a journey from.
const RAIL_MODES = ["tube", "overground", "dlr", "elizabeth-line", "tram"];

// Search additionally includes "national-rail" so National-Rail-only
// stations (e.g. Thameslink stops like Radlett, with no Tube/Overground/etc
// service) show up in the dropdown too — journey planning works for them
// the same as any other station once resolveStopId has run.
const SEARCH_MODES_PARAM = [...RAIL_MODES, "national-rail"].join(",");

// Photon (komoot's free, keyless geocoder, built on OpenStreetMap data) for
// arbitrary addresses/places — unlike TfL's StopPoint search, which only
// ever matches actual stations. Chosen over Nominatim (OpenStreetMap's own
// geocoder) because Nominatim's public API doesn't send CORS headers, so it
// can't be called directly from a browser; Photon does.
const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";
// Biases results towards London without hard-restricting to it, so a
// relevant place just outside the city (e.g. an airport) can still surface.
const LONDON_BIAS = { lat: 51.5074, lon: -0.1278 };

async function searchPlaces(value) {
  const url = `${PHOTON_SEARCH_URL}?q=${encodeURIComponent(value)}&limit=5&lat=${LONDON_BIAS.lat}&lon=${LONDON_BIAS.lon}&lang=en`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return data.features || [];
  } catch {
    return [];
  }
}

// Builds a short, readable label from a Photon feature — e.g. "Baker
// Street, London" rather than its full multi-line address — deduping
// anywhere the name is repeated in the street/city.
function formatPlaceLabel(feature) {
  const p = feature.properties;
  const parts = [p.name, p.street, p.city, p.state].filter(Boolean);
  return [...new Set(parts)].slice(0, 2).join(", ");
}

function StationField({ label, query, setQuery, station, setStation, suggestions, setSuggestions, onSearch }) {
  const [recents, setRecents] = useState(() => getRecentStations(RECENTS_KEY));
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const placeSearchTimeoutRef = useRef(null);

  async function handleChange(value) {
    setQuery(value);
    setStation(null);
    setLocationError(null);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setPlaceSuggestions([]);
      return;
    }

    onSearch(value);

    // Debounced separately from the (already-instant) TfL station search —
    // Photon is a third-party service, so it's worth not hitting it on
    // every single keystroke.
    clearTimeout(placeSearchTimeoutRef.current);
    placeSearchTimeoutRef.current = setTimeout(async () => {
      setPlaceSuggestions(await searchPlaces(value));
    }, 300);
  }

  function selectStation(match) {
    setStation(match);
    setQuery(match.name);
    setSuggestions([]);
    setPlaceSuggestions([]);
    setFocused(false);
    setLocationError(null);
    setRecents(addRecentStation(RECENTS_KEY, { id: match.id, name: match.name }));
  }

  function selectPlace(feature) {
    const [lon, lat] = feature.geometry.coordinates;

    // Same "lat,lon" shape as "Use my location" below — TfL's Journey
    // Planner accepts it directly as either endpoint, no StopPoint id
    // needed.
    selectStation({ id: `${lat},${lon}`, name: formatPlaceLabel(feature) });
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("Geolocation isn't supported in this browser.");
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // TfL's Journey Planner accepts a raw "lat,lon" pair as either
        // endpoint, resolved server-side — no StopPoint id needed.
        setStation({ id: `${latitude},${longitude}`, name: "My Location" });
        setQuery("My Location");
        setSuggestions([]);
        setPlaceSuggestions([]);
        setFocused(false);
        setLocating(false);
      },
      (geoError) => {
        setLocating(false);

        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationError("Location access was denied.");
        } else if (geoError.code === geoError.TIMEOUT) {
          setLocationError("Location request timed out.");
        } else {
          setLocationError("Couldn't determine your location.");
        }
      },
      { timeout: 10000 },
    );
  }

  return (
    <div className="search-box">
      <label className="field-label">{label}</label>

      <div className="station-input-row">
        <input
          type="text"
          className="station-input"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search for a station or address"
        />

        <button
          type="button"
          className="use-location-button"
          onClick={useMyLocation}
          disabled={locating}
          title="Use my current location"
          aria-label="Use my current location"
        >
          {locating ? "..." : "📍"}
        </button>
      </div>

      {locationError && <p className="location-error">{locationError}</p>}

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

      {(suggestions.length > 0 || placeSuggestions.length > 0) && (
        <ul className="suggestions">
          {suggestions.length > 0 && (
            <>
              <li className="suggestions-label">Stations</li>
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
            </>
          )}

          {placeSuggestions.length > 0 && (
            <>
              <li className="suggestions-label">Places</li>
              {placeSuggestions.map((feature) => (
                <li key={`${feature.properties.osm_type}-${feature.properties.osm_id}`}>
                  <button
                    type="button"
                    className="suggestion-item"
                    onClick={() => selectPlace(feature)}
                  >
                    📍 {formatPlaceLabel(feature)}
                  </button>
                </li>
              ))}
            </>
          )}
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

  // "now" plans for right now (no date/time sent, matching the previous
  // behaviour exactly); "depart"/"arrive" send an explicit date + time to
  // TfL's Journey Planner, for planning a future (or past) trip.
  const [timeMode, setTimeMode] = useState("now");
  const [travelDate, setTravelDate] = useState("");
  const [travelTime, setTravelTime] = useState("");

  function selectTimeMode(mode) {
    setTimeMode(mode);

    // Pre-fill with the current local date/time the first time either
    // "Depart at" or "Arrive by" is chosen, so the inputs never start empty.
    if (mode !== "now" && !travelDate && !travelTime) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      setTravelDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
      setTravelTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    }
  }

  const [favouriteTrips, setFavouriteTrips] = useState(() => getFavouriteTrips());
  const currentTripIsFavourited = isFavouriteTrip(fromStation, toStation);

  // "?from={id}&to={id}" — arrives from a favourite-trip card on the Home
  // page. Matched against the saved favourites list (rather than an
  // arbitrary station lookup) since that's the only thing that ever links
  // here this way, and it means no extra StopPoint fetch is needed — the
  // favourite already carries the station's name alongside its id.
  const [searchParams] = useSearchParams();
  const deepLinkAppliedRef = useRef(false);

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
      `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(value)}?modes=${SEARCH_MODES_PARAM}&app_key=${API_KEY}`,
    );
    const data = await response.json();
    setSuggestions(data.matches || []);
  }

  // timeOverride lets a caller (selectFavouriteTrip) pass the time context
  // explicitly rather than relying on timeMode/travelDate/travelTime state —
  // those are set just beforehand via setTimeMode etc., but React state
  // updates aren't visible in this closure until the next render, so
  // reading them here would still see the *previous* values.
  async function planJourneyFor(fromSt, toSt, timeOverride) {
    if (!fromSt || !toSt) return;

    if (fromSt.id === toSt.id) {
      setJourneys([]);
      setError("Please choose two different stations.");
      setSearched(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const fromId = await resolveStopId(fromSt.id);
      const toId = await resolveStopId(toSt.id);

      let url = `https://api.tfl.gov.uk/Journey/JourneyResults/${fromId}/to/${toId}?app_key=${API_KEY}`;

      const effectiveMode = timeOverride?.timeMode ?? timeMode;
      const effectiveDate = timeOverride?.travelDate ?? travelDate;
      const effectiveTime = timeOverride?.travelTime ?? travelTime;

      if (effectiveMode !== "now" && effectiveDate && effectiveTime) {
        url += `&date=${effectiveDate.replaceAll("-", "")}`;
        url += `&time=${effectiveTime.replace(":", "")}`;
        url += `&timeIs=${effectiveMode === "arrive" ? "arriving" : "departing"}`;
      }

      const response = await fetch(url);

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

  async function planJourney() {
    await planJourneyFor(fromStation, toStation);
  }

  function handleToggleFavouriteTrip() {
    if (!fromStation || !toStation) return;

    const timeContext =
      timeMode !== "now" && travelTime ? { timeMode, travelTime } : null;

    setFavouriteTrips(toggleFavouriteTrip(fromStation, toStation, timeContext));
  }

  function selectFavouriteTrip(trip) {
    setFromQuery(trip.from.name);
    setFromStation(trip.from);
    setFromSuggestions([]);

    setToQuery(trip.to.name);
    setToStation(trip.to);
    setToSuggestions([]);

    // A saved favourite only ever carries a time-of-day (see favourites.js)
    // — applied against today's date, whichever day the favourite happens
    // to be used on.
    let timeOverride = { timeMode: "now" };

    if (trip.timeMode && trip.travelTime) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      setTimeMode(trip.timeMode);
      setTravelDate(today);
      setTravelTime(trip.travelTime);

      timeOverride = { timeMode: trip.timeMode, travelDate: today, travelTime: trip.travelTime };
    } else {
      setTimeMode("now");
    }

    planJourneyFor(trip.from, trip.to, timeOverride);
  }

  function handleRemoveFavouriteTrip(trip, event) {
    event.stopPropagation();
    setFavouriteTrips(removeFavouriteTrip(trip.from, trip.to));
  }

  // Applies the "?from=&to=" deep link at most once, and only once its
  // match has actually been found in favouriteTrips (which loads
  // synchronously from localStorage on mount, so in practice this runs
  // on the very first render where searchParams has both ids).
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;

    const fromId = searchParams.get("from");
    const toId = searchParams.get("to");
    if (!fromId || !toId) return;

    const match = favouriteTrips.find(
      (trip) => trip.from.id === fromId && trip.to.id === toId,
    );
    if (!match) return;

    deepLinkAppliedRef.current = true;
    selectFavouriteTrip(match);
  }, [searchParams, favouriteTrips]);

  function formatTime(dateTime) {
    return new Date(dateTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="page">
      <h1>Plan a Trip</h1>
      <p>
        Find the best way to get between two stations, addresses or places across London — or
        tap 📍 to plan from your current location.
      </p>

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

      <div className="time-mode-bar">
        <button
          type="button"
          className={`time-mode-tab ${timeMode === "now" ? "active" : ""}`}
          onClick={() => selectTimeMode("now")}
        >
          Leave now
        </button>
        <button
          type="button"
          className={`time-mode-tab ${timeMode === "depart" ? "active" : ""}`}
          onClick={() => selectTimeMode("depart")}
        >
          Depart at
        </button>
        <button
          type="button"
          className={`time-mode-tab ${timeMode === "arrive" ? "active" : ""}`}
          onClick={() => selectTimeMode("arrive")}
        >
          Arrive by
        </button>
      </div>

      {timeMode !== "now" && (
        <div className="time-mode-inputs">
          <input
            type="date"
            className="time-mode-input"
            value={travelDate}
            onChange={(e) => setTravelDate(e.target.value)}
          />
          <input
            type="time"
            className="time-mode-input"
            value={travelTime}
            onChange={(e) => setTravelTime(e.target.value)}
          />
        </div>
      )}

      <div className="trip-actions">
        <button
          className="plan-button"
          onClick={planJourney}
          disabled={!fromStation || !toStation || loading}
        >
          {loading ? "Planning..." : "Plan Journey"}
        </button>

        <button
          type="button"
          className={`favourite-toggle-button ${currentTripIsFavourited ? "favourite-toggle-button-active" : ""}`}
          onClick={handleToggleFavouriteTrip}
          disabled={!fromStation || !toStation}
          aria-label={
            currentTripIsFavourited ? "Remove this trip from favourites" : "Save this trip as a favourite"
          }
          title={currentTripIsFavourited ? "Remove from favourites" : "Save as favourite"}
        >
          {currentTripIsFavourited ? "★ Favourited" : "☆ Favourite"}
        </button>
      </div>

      {favouriteTrips.length > 0 && (
        <div className="favourite-trips">
          <span className="favourite-trips-label">Favourite trips</span>
          <div className="favourite-trip-chips">
            {favouriteTrips.map((trip) => (
              <button
                type="button"
                key={trip.id}
                className="favourite-trip-chip"
                onClick={() => selectFavouriteTrip(trip)}
              >
                {trip.from.name} → {trip.to.name}
                {trip.timeMode && trip.travelTime && (
                  <span className="favourite-trip-time">
                    {trip.timeMode === "arrive" ? "by" : "at"} {trip.travelTime}
                  </span>
                )}
                <span
                  className="favourite-trip-remove"
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${trip.from.name} to ${trip.to.name} from favourites`}
                  onClick={(event) => handleRemoveFavouriteTrip(trip, event)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      handleRemoveFavouriteTrip(trip, event);
                    }
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {searched && !loading && !error && journeys.length > 0 && (
        <p className="results-count">
          {journeys.length} route{journeys.length === 1 ? "" : "s"} found, fastest first
          {journeys[0]?.startDateTime && (
            <>
              {" "}
              — for{" "}
              {new Date(journeys[0].startDateTime).toLocaleDateString([], {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </>
          )}
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
