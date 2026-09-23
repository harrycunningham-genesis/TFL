import { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { DomEvent } from "leaflet";
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

// One combined Arrivals call (covering every line at once) every 12
// seconds — comfortably inside TfL's rate limit. Smooth motion comes from
// the animation loop below continuously extrapolating between polls based
// on elapsed time, not from polling fast.
const ARRIVALS_POLL_MS = 12000;

// The Arrivals API only gives a countdown to a train's NEXT station, never
// how long a whole segment takes — so this is an assumption used to turn
// "45 seconds left" into "roughly 50% of the way along this segment".
// Tune this single number if trains look like they're gliding too
// fast/slow.
const ASSUMED_SEGMENT_SECONDS = 90;

const TRAIN_RADIUS = 5;

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const delta = max - min;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// A selected line's real TfL colour is pushed towards full saturation and a
// punchy mid lightness, so it reads as unmistakably "lit up" against the
// greyed-out map and the dimmed, unselected lines around it.
function vibrantColour(hex) {
  const { h, s, l } = hexToHsl(hex);
  const boostedSaturation = Math.min(1, s * 1.4 + 0.2);
  const boostedLightness = Math.min(0.62, Math.max(0.42, l));
  return hslToHex(h, boostedSaturation, boostedLightness);
}

// Renders nothing — just listens for clicks on the map itself (as opposed
// to a line or station, which stop their own click from reaching here) so
// clicking empty space clears whatever's currently selected.
function ClearSelectionOnMapClick({ onClear }) {
  useMapEvents({ click: onClear });
  return null;
}

function TubeMap() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Line ids currently highlighted — set by clicking a line (just that one
  // line) or a station (every line that stops there). Empty means nothing
  // is selected and the map is shown normally.
  const [selectedLineIds, setSelectedLineIds] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const hasSelection = selectedLineIds.length > 0;

  // One {id, initialLatLng} snapshot per currently-visible train — React
  // only needs this to mount/unmount train markers when trains
  // appear/disappear, and to give a newly-mounted marker a starting
  // position. A train's position after that lives entirely outside React
  // state (see trainsRef/markerRefs below), read only inside effects/event
  // handlers, never during render, so a moving train never re-renders.
  const [trainSnapshots, setTrainSnapshots] = useState([]);
  // vehicleId -> { lineId, fromLatLng, toLatLng, durationMs, segmentStartedAt }
  // — each train's trajectory, read every animation frame to work out
  // where it should be *right now*, not just at the last poll.
  const trainsRef = useRef(new Map());
  // vehicleId -> the mounted Leaflet CircleMarker instance for that train,
  // so the animation loop can call .setLatLng() on it directly instead of
  // going through React.
  const markerRefs = useRef(new Map());

  function clearSelection() {
    setSelectedLineIds([]);
    setSelectedStationId(null);
  }

  function handleLineClick(lineId, event) {
    DomEvent.stopPropagation(event);
    const alreadySelected =
      selectedStationId === null &&
      selectedLineIds.length === 1 &&
      selectedLineIds[0] === lineId;

    if (alreadySelected) {
      clearSelection();
    } else {
      setSelectedLineIds([lineId]);
      setSelectedStationId(null);
    }
  }

  function handleStationClick(station, event) {
    DomEvent.stopPropagation(event);
    if (selectedStationId === station.id) {
      clearSelection();
    } else {
      setSelectedLineIds(station.lineIds);
      setSelectedStationId(station.id);
    }
  }

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

  // Runs continuously (independent of how often fresh data arrives) and,
  // every frame, moves each train marker directly via Leaflet's own
  // setLatLng — bypassing React state/re-renders entirely, since doing a
  // setState per train at 60fps would jank badly once there are 100+
  // trains running across the network at once.
  useEffect(() => {
    let frameId;

    function tick() {
      const now = performance.now();

      trainsRef.current.forEach((train, vehicleId) => {
        const marker = markerRefs.current.get(vehicleId);
        if (!marker) return;

        const progress = Math.min(
          1,
          Math.max(0, (now - train.segmentStartedAt) / train.durationMs),
        );
        const lat =
          train.fromLatLng[0] +
          (train.toLatLng[0] - train.fromLatLng[0]) * progress;
        const lng =
          train.fromLatLng[1] +
          (train.toLatLng[1] - train.fromLatLng[1]) * progress;

        marker.setLatLng([lat, lng]);
      });

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Polls live train predictions and turns them into trajectories. Waits
  // until the line/station/route fetch above has completed — we need
  // orderedLineRoutes and station coordinates before this is useful, both
  // of which live on `lines`.
  useEffect(() => {
    if (lines.length === 0) return undefined;

    const apiKey = import.meta.env.VITE_TFL_API_KEY;

    // naptanId -> {lat,lng} and line.id -> line, built once per `lines`
    // update rather than refetched every poll.
    const stationCoordsById = new Map();
    const lineById = new Map();
    lines.forEach((line) => {
      lineById.set(line.id, line);
      line.stations.forEach((s) => {
        if (!stationCoordsById.has(s.naptanId)) {
          stationCoordsById.set(s.naptanId, { lat: s.lat, lng: s.lon });
        }
      });
    });

    async function fetchTrainPositions() {
      try {
        // One combined call for every tube line, instead of 11 separate
        // ones — /Line/{ids}/Arrivals accepts a comma-separated id list.
        const lineIdsCsv = lines.map((line) => line.id).join(",");
        const response = await fetch(
          `https://api.tfl.gov.uk/Line/${lineIdsCsv}/Arrivals?app_key=${apiKey}`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch train arrivals");
        }
        const predictions = await response.json();

        // Key by vehicleId so the same physical train (which can appear
        // more than once if the feed has predictions for it at several
        // upcoming stops) only produces one dot — keeping whichever
        // prediction has the smallest timeToStation, i.e. the most current.
        const nextTrains = new Map();
        const now = performance.now();

        predictions.forEach((prediction) => {
          const line = lineById.get(prediction.lineId);
          if (!line) return;

          const existing = nextTrains.get(prediction.vehicleId);
          if (existing && existing.timeToStation <= prediction.timeToStation) {
            return;
          }

          // Find which branch of this line's route the destination
          // station sits on, and its position within that branch's
          // ordered list.
          let toIndex = -1;
          let routeIds = null;
          (line.orderedLineRoutes || []).some((route) => {
            const ids = route.naptanIds || [];
            const index = ids.indexOf(prediction.naptanId);
            if (index !== -1) {
              toIndex = index;
              routeIds = ids;
              return true;
            }
            return false;
          });
          if (toIndex === -1) return;

          // We only fetched the "outbound" ordering, so an inbound train
          // is moving through that list backwards — its previous station
          // is the NEXT entry in our array, not the one before it.
          const previousIndex =
            prediction.direction === "inbound" ? toIndex + 1 : toIndex - 1;
          if (previousIndex < 0 || previousIndex >= routeIds.length) return;

          const fromCoords = stationCoordsById.get(routeIds[previousIndex]);
          const toCoords = stationCoordsById.get(prediction.naptanId);
          if (!fromCoords || !toCoords) return;

          const durationMs = ASSUMED_SEGMENT_SECONDS * 1000;
          const progressNow = Math.min(
            1,
            Math.max(0, 1 - prediction.timeToStation / ASSUMED_SEGMENT_SECONDS),
          );

          nextTrains.set(prediction.vehicleId, {
            lineId: prediction.lineId,
            timeToStation: prediction.timeToStation,
            fromLatLng: [fromCoords.lat, fromCoords.lng],
            toLatLng: [toCoords.lat, toCoords.lng],
            durationMs,
            // Back-dated so (now - segmentStartedAt) / durationMs lands
            // exactly on progressNow right now — the animation loop then
            // keeps advancing it every frame from here until the next
            // poll reseeds this trajectory.
            segmentStartedAt: now - progressNow * durationMs,
            // Only used to give a *newly mounted* marker a sensible
            // starting point (see trainSnapshots below) — the animation
            // loop takes over every frame after that.
            initialLatLng: [
              fromCoords.lat + (toCoords.lat - fromCoords.lat) * progressNow,
              fromCoords.lng + (toCoords.lng - fromCoords.lng) * progressNow,
            ],
          });
        });

        trainsRef.current = nextTrains;

        // Only trigger a React re-render (to mount/unmount train markers)
        // when the actual set of trains has changed — an in-place
        // trajectory update for a train already on screen is handled by
        // the animation loop above, not by React.
        setTrainSnapshots((current) => {
          const currentIds = current.map((snapshot) => snapshot.id);
          const sameSize = currentIds.length === nextTrains.size;
          const unchanged =
            sameSize && currentIds.every((id) => nextTrains.has(id));
          if (unchanged) return current;

          return Array.from(nextTrains, ([id, train]) => ({
            id,
            lineId: train.lineId,
            initialLatLng: train.initialLatLng,
          }));
        });
      } catch (err) {
        console.error("[TubeMap] fetchTrainPositions failed:", err);
      }
    }

    fetchTrainPositions();
    const intervalId = setInterval(fetchTrainPositions, ARRIVALS_POLL_MS);
    return () => clearInterval(intervalId);
  }, [lines]);

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
          className={
            hasSelection
              ? "leaflet-container-fixed map-focused"
              : "leaflet-container-fixed"
          }
          scrollWheelZoom
        >
          <ClearSelectionOnMapClick onClear={clearSelection} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {connections.map((conn) => {
            const fromStation = stationMap.get(conn.from);
            const toStation = stationMap.get(conn.to);
            if (!fromStation || !toStation) return null;

            const isSelected = selectedLineIds.includes(conn.lineId);
            const baseColour = getLineColour(conn.lineId);

            return (
              <Polyline
                key={conn.id}
                positions={offsetSegment(fromStation, toStation, conn.lineId)}
                pathOptions={{
                  color: isSelected ? vibrantColour(baseColour) : baseColour,
                  weight: isSelected ? LINE_WEIGHT + 2 : LINE_WEIGHT,
                  opacity: hasSelection && !isSelected ? 0.25 : 1,
                }}
                eventHandlers={{
                  click: (event) => handleLineClick(conn.lineId, event),
                }}
              />
            );
          })}

          {stations.map((station) => {
            const isSelected = station.id === selectedStationId;
            const onSelectedLine =
              !hasSelection ||
              station.lineIds.some((lineId) => selectedLineIds.includes(lineId));

            return (
              <CircleMarker
                key={station.id}
                center={[station.lat, station.lng]}
                radius={isSelected ? 6 : 4}
                pathOptions={{
                  color: getLineColour(station.lineIds[0]),
                  fillColor: "#ffffff",
                  fillOpacity: onSelectedLine ? 1 : 0.25,
                  opacity: onSelectedLine ? 1 : 0.25,
                  weight: isSelected ? 3 : 2,
                }}
                eventHandlers={{
                  click: (event) => handleStationClick(station, event),
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
            );
          })}

          {trainSnapshots.map(({ id, lineId, initialLatLng }) => (
            <CircleMarker
              key={id}
              ref={(instance) => {
                if (instance) {
                  markerRefs.current.set(id, instance);
                } else {
                  markerRefs.current.delete(id);
                }
              }}
              center={initialLatLng}
              radius={TRAIN_RADIUS}
              interactive={false}
              pathOptions={{
                color: "#111827",
                weight: 2,
                fillColor: getLineColour(lineId),
                fillOpacity: 1,
              }}
            />
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
          Click a line to make it — and only it — pop against a greyed-out
          map; click a station instead to highlight every line that stops
          there. Click the highlighted line/station again, or click any
          empty part of the map, to go back to normal. The small white
          dots gliding along the lines are live trains: TfL only gives a
          countdown to each train's next station rather than a real
          position, so this estimates one from that countdown and the
          route order, then animates it continuously — a single combined
          request for live predictions runs every 12 seconds, well inside
          the API's rate limit, and the motion in between is calculated
          from elapsed time rather than from how often that request runs.
        </p>
      </div>
    </div>
  );
}

export default TubeMap;
