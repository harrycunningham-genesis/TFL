import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import { getLineColour } from "../constants/lineColours";
import "leaflet/dist/leaflet.css";

// Roughly centred on central London — a sensible starting point before the
// map auto-fits to wherever the fetched stations actually are.
const LONDON_CENTER = [51.5074, -0.1278];
const INITIAL_ZOOM = 11;

// A single line is drawn at this weight (in pixels). Where two or more
// lines share the exact same physical track (Circle/District/Hammersmith &
// City especially), each one is nudged sideways into its own parallel
// strand at this same weight rather than stacking on top of each other —
// so a shared stretch reads as roughly double the width of a normal line,
// with every colour actually visible instead of the last one drawn hiding
// the rest.
const LINE_WEIGHT = 3;
const SHARED_TRACK_SPACING_METERS = 25;

// Approximate metres per degree of latitude — used to convert the sideways
// offset above into a lat/lng nudge. Longitude is corrected for London's
// latitude (a degree of longitude covers less ground the further you are
// from the equator).
const METERS_PER_DEGREE_LAT = 111320;

function TubeMap() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchTubeLocations() {
    try {
      setLoading(true);

      const apiKey = import.meta.env.VITE_TFL_API_KEY;

      const linesResponse = await fetch(
        `https://api.tfl.gov.uk/Line/Mode/tube?app_key=${apiKey}`,
      );
      if (!linesResponse.ok) {
        throw new Error("Failed to fetch Tube lines");
      }
      const tubeLines = await linesResponse.json();

      const lineWithStations = await Promise.all(
        tubeLines.map(async (line) => {
          // Fetch both in parallel: StopPoints gives us every station (with
          // lat/lon) but in no particular order, while Route/Sequence gives
          // us the correct end-to-end order per branch — that ordering is
          // what lets the lines below connect stations correctly instead of
          // however the StopPoints list happens to be sorted.
          const [stopPointsResponse, routeSequenceResponse] = await Promise.all([
            fetch(
              `https://api.tfl.gov.uk/Line/${line.id}/StopPoints?app_key=${apiKey}`,
            ),
            fetch(
              `https://api.tfl.gov.uk/Line/${line.id}/Route/Sequence/outbound?app_key=${apiKey}`,
            ),
          ]);

          if (!stopPointsResponse.ok) {
            throw new Error("Failed to fetch Tube lines");
          }
          if (!routeSequenceResponse.ok) {
            throw new Error("Failed to fetch Tube line route sequence");
          }

          const stations = await stopPointsResponse.json();
          const routeSequence = await routeSequenceResponse.json();

          return {
            ...line,
            stations,
            orderedLineRoutes: routeSequence.orderedLineRoutes,
          };
        }),
      );

      setLines(lineWithStations);
      setError(null);
    } catch (err) {
      console.error("[TubeMap] fetchTubeLocations failed:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTubeLocations();
  }, []);

  // Line id -> its proper display name (e.g. "circle" -> "Circle"), for
  // labelling the coloured stripes in each station's hover tooltip.
  const lineNameById = new Map();
  lines.forEach((line) => {
    lineNameById.set(line.id, line.name);
  });

  // naptanId -> station, deduped across lines — but every line a station
  // sits on is recorded in lineIds, not just the first one, so an
  // interchange station's tooltip can list all of them.
  const stationMap = new Map();
  lines.forEach((line) => {
    line.stations.forEach((s) => {
      const existing = stationMap.get(s.naptanId);
      if (existing) {
        if (!existing.lineIds.includes(line.id)) {
          existing.lineIds.push(line.id);
        }
        return;
      }

      stationMap.set(s.naptanId, {
        id: s.naptanId,
        // The TfL API's commonName includes an " Underground Station"
        // suffix (e.g. "Temple Underground Station") — trimmed here so
        // the tooltip just reads "Temple".
        name: s.commonName.replace(/ Underground Station$/, ""),
        lat: s.lat,
        lng: s.lon, // the TfL API calls it "lon", not "lng"
        lineIds: [line.id],
      });
    });
  });
  const stations = Array.from(stationMap.values());

  // One segment per adjacent pair in each branch's ordered route — this is
  // what makes the lines connect station-to-station in the order they
  // actually run, rather than as straight lines between arbitrary stations.
  const connections = [];
  lines.forEach((line) => {
    (line.orderedLineRoutes || []).forEach((route) => {
      const ids = route.naptanIds || [];
      for (let i = 0; i < ids.length - 1; i++) {
        connections.push({
          id: `${line.id}-${ids[i]}-${ids[i + 1]}`,
          from: ids[i],
          to: ids[i + 1],
          lineId: line.id,
        });
      }
    });
  });

  // Group connections by the station pair they connect, regardless of
  // direction, so we know how many distinct lines share that exact edge —
  // e.g. Circle/District/Hammersmith & City run on the same physical track
  // for long stretches around Paddington and Edgware Road.
  const edgeLineGroups = new Map();
  connections.forEach((conn) => {
    const [a, b] = [conn.from, conn.to].sort();
    const edgeKey = `${a}|${b}`;
    if (!edgeLineGroups.has(edgeKey)) {
      edgeLineGroups.set(edgeKey, []);
    }
    const group = edgeLineGroups.get(edgeKey);
    if (!group.includes(conn.lineId)) {
      group.push(conn.lineId);
    }
  });

  // For a station pair shared by several lines, nudge each line's segment
  // sideways (perpendicular to the segment) into its own parallel strand,
  // evenly spaced either side of the true geographic line — a segment used
  // by only one line gets no offset at all.
  function offsetSegment(fromStation, toStation, lineId) {
    const [a, b] = [fromStation.id, toStation.id].sort();
    const group = edgeLineGroups.get(`${a}|${b}`) || [lineId];
    if (group.length <= 1) {
      return [
        [fromStation.lat, fromStation.lng],
        [toStation.lat, toStation.lng],
      ];
    }

    const offsetIndex = group.indexOf(lineId) - (group.length - 1) / 2;
    const offsetMeters = offsetIndex * SHARED_TRACK_SPACING_METERS;

    // Measure direction canonically as "a -> b" (flipping sign if this
    // connection actually runs b -> a), so lines sharing this edge but
    // recorded in opposite directions by their own route still offset the
    // same way instead of being pushed onto opposite sides and crossing.
    const directionSign = fromStation.id === a ? 1 : -1;
    const refLat = (fromStation.lat + toStation.lat) / 2;
    const lngCorrection = Math.cos((refLat * Math.PI) / 180);

    // Work in a local metres-based approximation (x = east/west, y =
    // north/south) so the perpendicular is a simple rotation, then convert
    // the resulting offset back into degrees.
    const dx =
      (toStation.lng - fromStation.lng) *
      lngCorrection *
      METERS_PER_DEGREE_LAT *
      directionSign;
    const dy =
      (toStation.lat - fromStation.lat) * METERS_PER_DEGREE_LAT * directionSign;
    const segmentLength = Math.hypot(dx, dy) || 1;
    const perpX = -dy / segmentLength;
    const perpY = dx / segmentLength;

    const offsetLng =
      (perpX * offsetMeters) / (METERS_PER_DEGREE_LAT * lngCorrection);
    const offsetLat = (perpY * offsetMeters) / METERS_PER_DEGREE_LAT;

    return [
      [fromStation.lat + offsetLat, fromStation.lng + offsetLng],
      [toStation.lat + offsetLat, toStation.lng + offsetLng],
    ];
  }

  return (
    <div className="page tube-map-page">
      <h1>Live Tube Map</h1>

      <div className="leaflet-frame">
        <MapContainer
          center={LONDON_CENTER}
          zoom={INITIAL_ZOOM}
          className="leaflet-container-fixed"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {connections.map((conn) => {
            const fromStation = stationMap.get(conn.from);
            const toStation = stationMap.get(conn.to);
            if (!fromStation || !toStation) return null;

            return (
              <Polyline
                key={conn.id}
                positions={offsetSegment(fromStation, toStation, conn.lineId)}
                pathOptions={{ color: getLineColour(conn.lineId), weight: LINE_WEIGHT }}
              />
            );
          })}

          {stations.map((station) => (
            <CircleMarker
              key={station.id}
              center={[station.lat, station.lng]}
              radius={4}
              pathOptions={{
                color: getLineColour(station.lineIds[0]),
                fillColor: "#ffffff",
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Tooltip className="station-tooltip" direction="top" offset={[0, -6]}>
                <div className="station-tooltip-name">{station.name}</div>
                {station.lineIds.map((lineId) => (
                  <div
                    key={lineId}
                    className="station-tooltip-line"
                    style={{ background: getLineColour(lineId) }}
                  >
                    {lineNameById.get(lineId) || lineId}
                  </div>
                ))}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        {loading && (
          <div className="map-status">Loading Tube stations…</div>
        )}
        {error && <div className="map-status map-status-error">Error: {error}</div>}
      </div>

      <div className="map-description">
        <h2>What this map does</h2>
        <p>
          This is a real, interactive slippy map (powered by Leaflet and
          OpenStreetMap) rather than a fixed image — drag to pan around
          London and use your scroll wheel, the +/&minus; buttons, or a pinch
          gesture to zoom in and out. On top of it sits the live Underground
          network from TfL's API: every station is plotted at its real
          coordinates, and each line is drawn by connecting its stations in
          the order trains actually travel between them, branch by branch.
          Each line is drawn in its real TfL brand colour (Central red,
          Piccadilly blue, Circle yellow, and so on). Where two or more
          lines share the exact same track — the Circle, District and
          Hammersmith &amp; City around Paddington, for example — each one
          is drawn as its own parallel strand rather than one colour
          hiding the rest, so a shared stretch reads as roughly double the
          width of a normal line. Interchange stations are outlined in
          whichever of their lines' data happened to be processed first.
        </p>
      </div>
    </div>
  );
}

export default TubeMap;
