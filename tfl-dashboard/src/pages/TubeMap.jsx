import { useState, useEffect } from "react";

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
          const response = await fetch(
            `https://api.tfl.gov.uk/Line/${line.id}/StopPoints?app_key=${apiKey}`,
          );

          console.log(
            "[TubeMap] stopPoints response for",
            line.id,
            "status:",
            response.status,
            response.ok,
          );

          if (!response.ok) {
            throw new Error("Failed to fetch Tube lines");
          }

          const stations = await response.json();

          console.log("[TubeMap] stations for", line.id, ":", stations);

          return {
            ...line,
            stations,
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

  // Example tube station data with geographic coordinates
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

  // 1. Derive the geographic bounding box FROM the actual station data,
  // instead of hardcoding it — so it stays correct if the stations change.
  const lats = stations.map((s) => s.lat);
  const lngs = stations.map((s) => s.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Padding around the plotted content. The right side gets extra room
  // because station labels are drawn to the right of each dot (x + 12) and
  // need somewhere to go without being clipped by the SVG's edge — this is
  // separate from the geographic math below and doesn't skew the real-world
  // proportions of the data itself.
  const paddingLeft = 50;
  const paddingRight = 170;
  const paddingTop = 50;
  const paddingBottom = 50;

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
  const REFERENCE_SIZE = 700;
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
    <div className="page">
      <h1>Live Tube Map</h1>

      <div className="tube-map-wrapper">
        <svg
          // Internal coordinate system now reflects the true geographic ratio
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          style={{
            width: "80%",
            maxWidth: `${canvasWidth}px`,
            height: "auto",
            border: "1px solid #ccc",
            background: "#fff",
          }}
        >
        {/* Render Connection Lines (Tracks) */}
        {connections.map((conn, index) => {
          const fromStation = stations.find((s) => s.id === conn.from);
          const toStation = stations.find((s) => s.id === conn.to);
          if (!fromStation || !toStation) return null;

          const p1 = project(fromStation.lat, fromStation.lng);
          const p2 = project(toStation.lat, toStation.lng);

          return (
            <line
              key={`line-${index}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={conn.color || "#333"}
              strokeWidth="5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Render Stations (Dots) and Labels */}
        {stations.map((station) => {
          const { x, y } = project(station.lat, station.lng);

          return (
            <g key={station.id}>
              {/* Outer circle for the "interchange" look */}
              <circle
                cx={x}
                cy={y}
                r="8"
                fill="#fff"
                stroke="#000"
                strokeWidth="2"
              />
              {/* Inner dot representing the station center */}
              <circle cx={x} cy={y} r="4" fill={station.color} />

              {/* Station Label Text */}
              <text
                x={x + 12}
                y={y + 4}
                fontSize="12"
                fontWeight="bold"
                fill="#333"
              >
                {station.name}
              </text>
            </g>
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
