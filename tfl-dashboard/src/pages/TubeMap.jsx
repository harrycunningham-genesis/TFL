import { useState, useEffect } from "react";
import { getLineColour } from "../constants/lineColours";

function TubeMap() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchTubeLocations() {
    try {
      setLoading(true);

      const apiKey = import.meta.env.VITE_TFL_API_KEY;
      console.log(
        "[TubeMap] apiKey present?",
        Boolean(apiKey),
        "length:",
        apiKey?.length,
      );

      const linesResponse = await fetch(
        `https://api.tfl.gov.uk/Line/Mode/tube?app_key=${apiKey}`,
      );

      console.log(
        "[TubeMap] lines response status:",
        linesResponse.status,
        linesResponse.ok,
      );

      if (!linesResponse.ok) {
        throw new Error("Failed to fetch Tube lines");
      }

      const tubeLines = await linesResponse.json();

      console.log("[TubeMap] tubeLines:", tubeLines);

      const lineWithStations = await Promise.all(
        tubeLines.map(async (line) => {
          // Fetch both in parallel: StopPoints gives us every station (with
          // lat/lon) but in no particular order, while Route/Sequence gives
          // us the correct end-to-end order per branch.
          const [stopPointsResponse, routeSequenceResponse] = await Promise.all([
            fetch(
              `https://api.tfl.gov.uk/Line/${line.id}/StopPoints?app_key=${apiKey}`,
            ),
            fetch(
              `https://api.tfl.gov.uk/Line/${line.id}/Route/Sequence/outbound?app_key=${apiKey}`,
            ),
          ]);

          console.log(
            "[TubeMap] stopPoints response for",
            line.id,
            "status:",
            stopPointsResponse.status,
            stopPointsResponse.ok,
          );
          console.log(
            "[TubeMap] route sequence response for",
            line.id,
            "status:",
            routeSequenceResponse.status,
            routeSequenceResponse.ok,
          );

          if (!stopPointsResponse.ok) {
            throw new Error("Failed to fetch Tube lines");
          }
          if (!routeSequenceResponse.ok) {
            throw new Error("Failed to fetch Tube line route sequence");
          }

          const stations = await stopPointsResponse.json();
          const routeSequence = await routeSequenceResponse.json();

          console.log("[TubeMap] stations for", line.id, ":", stations);
          console.log(
            "[TubeMap] orderedLineRoutes for",
            line.id,
            ":",
            routeSequence.orderedLineRoutes,
          );

          return {
            ...line,
            stations,
            orderedLineRoutes: routeSequence.orderedLineRoutes,
          };
        }),
      );

      console.log("[TubeMap] lineWithStations (final data):", lineWithStations);

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
    console.log("[TubeMap] mounted, kicking off fetch");
    fetchTubeLocations();
  }, []);

  console.log(
    "[TubeMap] render — loading:",
    loading,
    "error:",
    error,
    "lines:",
    lines,
  );

  if (loading) {
    return (
      <div className="page">
        <h1>Live Tube Map</h1>
        <p>Loading Tube Stations ...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Live Tube Map</h1>
        <p>Error: {error}</p>
      </div>
    );
  }

  /*

  const stations = [
    {
      id: "1",
      name: "King's Cross",
      lat: 51.5307,
      lng: -0.1238,
      color: "#F3A346",
    },
    { id: "2", name: "Euston", lat: 51.5281, lng: -0.1337, color: "#00A4A6" },
    {
      id: "3",
      name: "Warren Street",
      lat: 51.5249,
      lng: -0.1383,
      color: "#00A4A6",
    },
    {
      id: "4",
      name: "Oxford Circus",
      lat: 51.5152,
      lng: -0.1415,
      color: "#E32017",
    },
    {
      id: "5",
      name: "Tottenham Court Road",
      lat: 51.5165,
      lng: -0.1306,
      color: "#E32017",
    },
  ];

  // Example connections between stations to draw the "tracks"
  const connections = [
    { from: "1", to: "2", color: "#007828" },
    { from: "2", to: "3", color: "#00A4A6" },
    { from: "3", to: "4", color: "#00A4A6" },
    { from: "4", to: "5", color: "#E32017" },
  ];
  */

  const stationMap = new Map();
  lines.forEach((line) => {
    line.stations.forEach((s) => {
      if (!stationMap.has(s.naptanId)) {
        stationMap.set(s.naptanId, {
          id: s.naptanId,
          name: s.commonName,
          lat: s.lat,
          lng: s.lon, // the TfL API calls it "lon", not "lng"
          // Interchange stations (e.g. Oxford Circus) sit on several lines,
          // but a dot can only show one colour — it just takes whichever
          // line's stop data we happened to process first.
          lineId: line.id,
        });
      }
    });
  });
  const stations = Array.from(stationMap.values());

  const connections = [];
  lines.forEach((line) => {
    (line.orderedLineRoutes || []).forEach((route) => {
      const ids = route.naptanIds || [];
      for (let i = 0; i < ids.length - 1; i++) {
        connections.push({ from: ids[i], to: ids[i + 1], lineId: line.id });
      }
    });
  });

  // Several lines share the exact same physical track for long stretches
  // (Circle/District/Hammersmith & City especially) — group connections by
  // the station pair they connect (regardless of direction) so we know how
  // many distinct lines are drawn on top of each other for that stretch.
  // Rendering below uses this to nudge each line sideways into its own
  // parallel strand instead of one colour hiding the others.
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

  // Gap between parallel strands when lines share a track — keep this
  // bigger than the strokeWidth set on the <line> below (currently 4),
  // otherwise thick strands touch/overlap instead of showing a visible
  // gap. Adjust this single number to tighten or loosen the spacing.
  const PARALLEL_LINE_SPACING = 6;

  // 1. Derive the geographic bounding box FROM the actual station data,
  // instead of hardcoding it — so it stays correct as the data changes.
  const lats = stations.map((s) => s.lat);
  const lngs = stations.map((s) => s.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // We're no longer drawing on-canvas text labels (with ~270 stations that
  // would just be an unreadable black smear), so a single uniform padding
  // is enough — no need for extra label breathing room on the right.
  const padding = 50;
  const paddingLeft = padding;
  const paddingRight = padding;
  const paddingTop = padding;
  const paddingBottom = padding;

  // 2. Correct for the fact that a degree of longitude covers less real-world
  // distance than a degree of latitude, the further you are from the equator.
  // At this latitude (~51.5°N) a degree of longitude is only ~62% as long as
  // a degree of latitude, so we scale it down using cos(latitude).
  const refLat = (minLat + maxLat) / 2;
  const lngCorrection = Math.cos((refLat * Math.PI) / 180);

  const latSpan = maxLat - minLat;
  const lngSpanCorrected = (maxLng - minLng) * lngCorrection;

  // 3. Pick the SVG's content dimensions so their ratio matches the
  // corrected real-world ratio (whichever axis covers more ground gets the
  // larger pixel dimension), instead of a fixed, arbitrary 800x600.
  const REFERENCE_SIZE = 1800; 
  const realWorldAspect = lngSpanCorrected / latSpan; // width : height

  let contentWidth;
  let contentHeight;

  if (realWorldAspect >= 1) {
    contentWidth = REFERENCE_SIZE;
    contentHeight = REFERENCE_SIZE / realWorldAspect;
  } else {
    contentHeight = REFERENCE_SIZE;
    contentWidth = REFERENCE_SIZE * realWorldAspect;
  }

  const canvasWidth = contentWidth + paddingLeft + paddingRight;
  const canvasHeight = contentHeight + paddingTop + paddingBottom;

  const project = (lat, lng) => {
    const x = paddingLeft + ((lng - minLng) / (maxLng - minLng)) * contentWidth;
    const y = paddingTop + ((maxLat - lat) / latSpan) * contentHeight;
    return { x, y };
  };

  return (
    <div className="tube-map-page">
      <h1 className="tube-title">Live Tube Map</h1>

      <div className="tube-map-wrapper">
        <svg
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          style={{
            width: "auto",
            height: "auto",
            maxWidth: "100%",
            maxHeight: "calc(100vh - 190px)",
            border: "1px solid #ccc",
            background: "#fff",
          }}
        >
        {connections.map((conn, index) => {
          const fromStation = stations.find((s) => s.id === conn.from);
          const toStation = stations.find((s) => s.id === conn.to);
          if (!fromStation || !toStation) return null;

          const p1 = project(fromStation.lat, fromStation.lng);
          const p2 = project(toStation.lat, toStation.lng);

          // Where this line sits within the group of lines sharing this
          // exact edge — centred on 0, so a single line on its own gets no
          // offset at all, and a shared edge spreads its lines evenly
          // either side of the true geographic position.
          const [a, b] = [conn.from, conn.to].sort();
          const group = edgeLineGroups.get(`${a}|${b}`) || [conn.lineId];
          const offsetIndex = group.indexOf(conn.lineId) - (group.length - 1) / 2;

          // Measure direction canonically as "a -> b" (flipping sign if this
          // connection actually runs b -> a), so lines sharing this edge
          // but recorded in opposite directions by their own route still
          // offset the same way, instead of being pushed onto opposite
          // sides and crossing each other.
          const directionSign = conn.from === a ? 1 : -1;
          const dx = (p2.x - p1.x) * directionSign;
          const dy = (p2.y - p1.y) * directionSign;
          const segmentLength = Math.hypot(dx, dy) || 1;
          const offsetX = (-dy / segmentLength) * offsetIndex * PARALLEL_LINE_SPACING;
          const offsetY = (dx / segmentLength) * offsetIndex * PARALLEL_LINE_SPACING;

          return (
            <line
              key={`line-${index}`}
              x1={p1.x + offsetX}
              y1={p1.y + offsetY}
              x2={p2.x + offsetX}
              y2={p2.y + offsetY}
              stroke={getLineColour(conn.lineId)}
              strokeWidth="4"
              strokeLinecap="round"
            />
          );
        })}

        {stations.map((station) => {
          const { x, y } = project(station.lat, station.lng);

          return (
            <circle
              key={station.id}
              cx={x}
              cy={y}
              r="5"
              fill={getLineColour(station.lineId)}
            >
              <title>{station.name}</title>
            </circle>
          );
        })}
        </svg>
      </div>

      {/* 

      Prints all Lines, all stations and their long + lat 

      {lines.map((line) => (
        <section key={line.id}>
          <h2>{line.name}</h2>

          <ul>
            {line.stations.map((stations) => (
              <li key={stations.id}>
                <strong>{stations.commonName}</strong>
                <br />
                Latitude: {stations.lat}
                <br />
                Longitude: {stations.lon}
              </li>
            ))}
          </ul>
        </section>
      ))}
        */}
    </div>
  );
}

export default TubeMap;
