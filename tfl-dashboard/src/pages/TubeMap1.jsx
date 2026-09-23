import { useState, useEffect } from "react";
import { getLineColour } from "../constants/lineColours";

function TubeMap() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Unused while train tracking is paused below — restore this along
  // with the commented-out effect/render block to bring trains back.
  // eslint-disable-next-line no-unused-vars
  const [trains, setTrains] = useState([]);

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

  // Roughly how long (in seconds) a train takes to travel between two
  // adjacent stations. The Arrivals API only gives a countdown to the next
  // station, not a total segment duration, so this is an assumption used to
  // turn "45 seconds left" into "70% of the way along this segment" — TfL
  // doesn't give us anything more precise than this to work with. Tune this
  // single number if trains look like they're gliding too fast/slow.
  // eslint-disable-next-line no-unused-vars
  const ASSUMED_SEGMENT_SECONDS = 90;

  // PAUSED FOR NOW — live train tracking is switched off while the map
  // layout/spacing is being worked on, so trains never render and this
  // never fetches. To bring it back, uncomment this whole effect (and the
  // matching trains-render block in the JSX below).
  /*
  // Live train positions are ESTIMATED, not real GPS — TfL's API doesn't
  // expose live train coordinates for the Underground at all. This works
  // out, for every train the Arrivals feed currently knows about, which
  // station it's heading to and (by looking that station up in the ordered
  // route data we already fetched) which station it must have just left,
  // then linearly interpolates a position between those two using the
  // countdown above. It only updates once every 10 seconds, in a single
  // combined API call for all 11 lines, to stay well inside the rate limit.
  useEffect(() => {
    // Wait until the initial line/station/route fetch above has completed —
    // we need orderedLineRoutes and station coordinates before this is
    // useful, both of which live on `lines`.
    if (lines.length === 0) return undefined;

    const apiKey = import.meta.env.VITE_TFL_API_KEY;

    // naptanId -> {lat, lng} lookup, and line.id -> line object, both built
    // once per `lines` update rather than refetched every 10-second tick.
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

        console.log(
          "[TubeMap] arrivals response status:",
          response.status,
          response.ok,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch train arrivals");
        }

        const predictions = await response.json();

        console.log("[TubeMap] arrivals predictions:", predictions);

        // Key by vehicleId so the same physical train (which can appear
        // more than once if the feed has predictions for it at several
        // upcoming stops) only produces one dot — keeping whichever
        // prediction has the smallest timeToStation, i.e. the most current.
        const trainsByVehicleId = new Map();

        predictions.forEach((prediction) => {
          const line = lineById.get(prediction.lineId);
          if (!line) return;

          const existing = trainsByVehicleId.get(prediction.vehicleId);
          if (existing && existing.timeToStation <= prediction.timeToStation) {
            return;
          }

          // Find which branch of this line's route the destination station
          // sits on, and its position within that branch's ordered list.
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

          // We only fetched the "outbound" ordering, so an inbound train is
          // moving through that list backwards — its previous station is
          // the NEXT entry in our array, not the one before it.
          const previousIndex =
            prediction.direction === "inbound" ? toIndex + 1 : toIndex - 1;
          if (previousIndex < 0 || previousIndex >= routeIds.length) return;

          const fromId = routeIds[previousIndex];
          const toId = prediction.naptanId;
          const fromCoords = stationCoordsById.get(fromId);
          const toCoords = stationCoordsById.get(toId);
          if (!fromCoords || !toCoords) return;

          const progress = Math.min(
            1,
            Math.max(0, 1 - prediction.timeToStation / ASSUMED_SEGMENT_SECONDS),
          );

          trainsByVehicleId.set(prediction.vehicleId, {
            id: prediction.vehicleId,
            lineId: prediction.lineId,
            timeToStation: prediction.timeToStation,
            lat: fromCoords.lat + (toCoords.lat - fromCoords.lat) * progress,
            lng: fromCoords.lng + (toCoords.lng - fromCoords.lng) * progress,
          });
        });

        const nextTrains = Array.from(trainsByVehicleId.values());
        console.log("[TubeMap] computed train positions:", nextTrains);
        setTrains(nextTrains);
      } catch (err) {
        console.error("[TubeMap] fetchTrainPositions failed:", err);
      }
    }

    fetchTrainPositions();
    const intervalId = setInterval(fetchTrainPositions, 10000);
    return () => clearInterval(intervalId);
  }, [lines]);
  */

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
  const paddingRight = padding + 30;
  const paddingTop = padding;
  const paddingBottom = padding + 120;

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

  // 4. Radial "fisheye" distortion: zone 1 (the centre) has by far the most
  // stations packed into the smallest area, so a plain geographic
  // projection squashes them into an unreadable clump while the outer
  // suburbs sit in lots of empty space. This pushes stations further apart
  // the closer they are to the centre of the map, and pulls the outer
  // stations back in to compensate, so the total canvas size is unchanged —
  // only the spacing *within* it is redistributed.
  //
  // How it works: every projected point is described as an angle + a
  // distance (radius) from the centre of the map. We leave the angle alone
  // (so nothing changes side) and remap only the radius, using
  // radius' = maxRadius * (radius / maxRadius) ^ WARP_POWER. Because
  // WARP_POWER is less than 1, that curve is steep near radius = 0 (small
  // radii get pushed outward a lot — this is the "spread out the centre"
  // effect) and flattens out towards radius = maxRadius, where it barely
  // changes anything (the "leave the outskirts alone" effect). At
  // radius = 0 and radius = maxRadius the formula leaves the point exactly
  // where it was, so nothing at the very centre point or the outer edge
  // moves — only the stations in between get redistributed.
  //
  // WARP_POWER is the one number to tune this: 1 = no distortion at all
  // (back to a plain map). Lower it (e.g. 0.6) for a stronger effect —
  // more central spreading, more edge compression. Raise it back towards 1
  // (e.g. 0.85) for a gentler, more subtle version.
  const WARP_POWER = 0.65;
  const warpCenterX = canvasWidth / 2;
  const warpCenterY = canvasHeight / 2;
  // Half the content box's diagonal — the largest radius any station can
  // actually have — used to normalise radius/maxRadius into a 0..1 range.
  const maxWarpRadius = Math.hypot(contentWidth / 2, contentHeight / 2);

  const applyRadialWarp = (x, y) => {
    const dx = x - warpCenterX;
    const dy = y - warpCenterY;
    const radius = Math.hypot(dx, dy);
    if (radius === 0 || maxWarpRadius === 0) {
      return { x, y };
    }
    const warpedRadius =
      maxWarpRadius * Math.pow(radius / maxWarpRadius, WARP_POWER);
    const scale = warpedRadius / radius;
    return {
      x: warpCenterX + dx * scale,
      y: warpCenterY + dy * scale,
    };
  };

  const project = (lat, lng) => {
    const x = paddingLeft + ((lng - minLng) / (maxLng - minLng)) * contentWidth;
    const y = paddingTop + ((maxLat - lat) / latSpan) * contentHeight;
    return applyRadialWarp(x, y);
  };

  return (
    <div className="tube-map-page">

      <div className="tube-map-wrapper">
        <svg
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          style={{
            // Fill the width of the page and let height follow the
            // viewBox's real aspect ratio ("auto" == scale proportionally),
            // instead of capping either dimension. With no max-height, the
            // map is drawn at full size (however tall that is) and the page
            // itself scrolls to show the rest, rather than the map being
            // squeezed to fit one screen.
            width: "100%",
            height: "auto",
            display: "block",
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

        {/* PAUSED FOR NOW — trains stopped moving while the station
            spacing/layout is being worked on. Uncomment to bring the
            gliding white train dots back (see the matching effect above).
        {trains.map((train) => {
          const { x, y } = project(train.lat, train.lng);

          return (
            <circle
              key={train.id}
              cx={0}
              cy={0}
              r="6"
              fill="white"
              stroke="black"
              strokeWidth="1"
              style={{
                transform: `translate(${x}px, ${y}px)`,
                transition: "transform 9.5s linear",
              }}
            />
          );
        })}
        */}
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
