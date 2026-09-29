import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getFavouriteLineIds, getFavouriteTrips } from "../utils/favourites";
import { getLineColour } from "../constants/lineColours";
import { TIER_META, getTier } from "../utils/severity";
import { getUptimeSummary } from "../db/statusHistory";

// Mirrors the two-fetch shape LineStatus.jsx uses — the Home page needs to
// be able to resolve ANY favourited line's live status, including a
// favourited Thameslink or Tram entry, so it has to look in the same place
// Line Status does rather than a narrower list.
const NATIONAL_RAIL_LINES = ["thameslink"];
const UPTIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function Home() {
  // Read once on mount — favouriting happens on other pages, and
  // navigating back here remounts this component anyway (a fresh route),
  // so a fresh read on mount is all that's ever needed.
  const [favouriteLineIds] = useState(() => getFavouriteLineIds());
  const [favouriteTrips] = useState(() => getFavouriteTrips());

  const [favouriteLineStatuses, setFavouriteLineStatuses] = useState([]);
  const [statusLoading, setStatusLoading] = useState(favouriteLineIds.length > 0);

  useEffect(() => {
    // statusLoading's initial value above already accounts for the
    // no-favourites case (false from the start), so there's nothing to
    // synchronize here — no fetch needed, no state to settle.
    if (favouriteLineIds.length === 0) {
      return undefined;
    }

    let cancelled = false;

    async function loadFavouriteLineStatuses() {
      try {
        const apiKey = import.meta.env.VITE_TFL_API_KEY;

        const [tflResponse, nationalRailResponse] = await Promise.all([
          fetch(
            `https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr,elizabeth-line,tram/Status?app_key=${apiKey}`,
          ),
          fetch(
            `https://api.tfl.gov.uk/Line/${NATIONAL_RAIL_LINES.join(",")}/Status?app_key=${apiKey}`,
          ),
        ]);

        const tflLines = tflResponse.ok ? await tflResponse.json() : [];
        const nationalRailLines = nationalRailResponse.ok
          ? await nationalRailResponse.json()
          : [];
        const allLines = [...tflLines, ...nationalRailLines];

        const favourites = allLines.filter((line) => favouriteLineIds.includes(line.id));

        // Each tile also wants its rolling uptime figure — the same one
        // Line Status shows, read back out of the same IndexedDB history
        // (see db/statusHistory.js) rather than recomputed here.
        const withUptime = await Promise.all(
          favourites.map(async (line) => ({
            line,
            tier: getTier(line),
            uptime: await getUptimeSummary(line.id, UPTIME_WINDOW_MS),
          })),
        );

        if (!cancelled) {
          setFavouriteLineStatuses(withUptime);
        }
      } catch {
        // A failed fetch here just means the favourite-line tiles show up
        // without a live status — everything else on the page (including
        // the favourite trips below, which don't depend on this at all)
        // still works fine.
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    }

    loadFavouriteLineStatuses();

    return () => {
      cancelled = true;
    };
  }, [favouriteLineIds]);

  const hasFavourites = favouriteLineIds.length > 0 || favouriteTrips.length > 0;

  return (
    <div className="home-page">
      <section className="hero">
        <p className="eyebrow">LONDON UNDERGROUND</p>

        <h1>
          London Tube
          <br />
          Dashboard
        </h1>

        <p className="hero-description">
          Live status, a live map and journey planning for the Tube,
          Overground, DLR and Elizabeth line — all in one place.
        </p>

        <div className="hero-buttons">
          <Link to="/map" className="primary-button">
            View Live Map
          </Link>

          <Link to="/status" className="secondary-button">
            Check Line Status
          </Link>
        </div>
      </section>

      {hasFavourites ? (
        <section className="favourites-home">
          <div className="favourites-home-header">
            <h2>Your favourites</h2>
            <p>Quick access to the lines and trips you've starred.</p>
          </div>

          {favouriteLineIds.length > 0 && (
            <div className="favourite-line-tiles">
              {statusLoading ? (
                <p className="favourites-loading">Loading your favourite lines…</p>
              ) : (
                favouriteLineStatuses.map(({ line, tier, uptime }) => {
                  const meta = TIER_META[tier];
                  const color = getLineColour(line.id);

                  return (
                    <Link
                      to={`/map?line=${line.id}`}
                      className="favourite-line-tile"
                      key={line.id}
                      style={{ borderLeft: `4px solid ${color}` }}
                    >
                      <div className="favourite-line-tile-top">
                        <span className="line-swatch" style={{ backgroundColor: color }} />
                        <span className="favourite-line-tile-name">{line.name}</span>
                      </div>

                      <span className={`status ${meta.className}`}>{meta.label}</span>

                      {uptime && (
                        <span className="favourite-line-tile-uptime">
                          {uptime.goodPercent}% good, last 7 days
                        </span>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          )}

          {favouriteTrips.length > 0 && (
            <div className="favourite-trip-tiles">
              {favouriteTrips.map((trip) => (
                <Link
                  to={`/plan?from=${trip.from.id}&to=${trip.to.id}`}
                  className="favourite-trip-tile"
                  key={trip.id}
                >
                  <span className="favourite-trip-tile-route">
                    {trip.from.name} <span className="favourite-trip-tile-arrow">→</span>{" "}
                    {trip.to.name}
                  </span>
                  <span className="favourite-trip-tile-cta">Plan again →</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="favourites-home favourites-home-empty">
          <p>
            ★ Star a line on <Link to="/status">Line Status</Link> or a trip on{" "}
            <Link to="/plan">Plan a Trip</Link>, and it'll show up here for quick access.
          </p>
        </section>
      )}

      <section className="features">
        <Link to="/map" className="feature-card">
          <span className="feature-icon">🗺️</span>

          <h2>Live Tube Map</h2>

          <p>Watch trains move in real time across the Underground, Overground, DLR and Elizabeth line.</p>
        </Link>

        <Link to="/status" className="feature-card">
          <span className="feature-icon">📊</span>

          <h2>Line Status</h2>

          <p>Check current disruptions and see each line's good-service track record over time.</p>
        </Link>

        <Link to="/plan" className="feature-card">
          <span className="feature-icon">🧭</span>

          <h2>Plan a Trip</h2>

          <p>Find the fastest way between two stations, and save trips you take often.</p>
        </Link>

        <Link to="/stations" className="feature-card">
          <span className="feature-icon">🚉</span>

          <h2>Stations</h2>

          <p>Search for a station and see live arrivals, crowding and accessibility.</p>
        </Link>
      </section>
    </div>
  );
}

export default Home;
