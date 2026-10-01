// Contract tests: these hit the REAL TfL Unified API over the network,
// using the same app_key every page in this app uses (import.meta.env is
// wired up by vite/vitest exactly as it is for `npm run dev`, so this is
// reading the same .env file, not a separate test credential).
//
// Unlike every other test in this project, these are not hermetic — they
// depend on TfL's API being reachable and behaving the way the rest of the
// codebase assumes it does. That's deliberate: this file's whole job is to
// catch TfL changing a field name, a mode string, or a response shape out
// from under us — the "does the site actually still work against the real
// world" check the other suites can't do, since everything else here runs
// against mocked fetch data.
//
// Where a real answer can vary run to run (how many journeys exist between
// two stations right now, whether a line currently has live arrivals),
// these assert the response's *shape* rather than its exact contents —
// the thing that would actually break the app if TfL changed it.
import { describe, it, expect } from "vitest";

const API_KEY = import.meta.env.VITE_TFL_API_KEY;

async function getJson(path) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://api.tfl.gov.uk${path}${separator}app_key=${API_KEY}`);
  expect(response.ok, `${path} responded ${response.status}`).toBe(true);
  return response.json();
}

describe("TfL API — line data (used by TubeMap.jsx / LineStatus.jsx)", () => {
  it("Line/Meta/Modes still lists 'overground' as a mode string", async () => {
    // Regression guard for a real bug hit earlier in this project:
    // "london-overground" looked like the obvious mode name and TfL
    // rejected it with a 400 — the real value is just "overground".
    const modes = await getJson("/Line/Meta/Modes");
    const modeNames = modes.map((mode) => mode.modeName);

    expect(modeNames).toContain("overground");
    expect(modeNames).toContain("tube");
    expect(modeNames).toContain("dlr");
    expect(modeNames).toContain("elizabeth-line");
  });

  it("Line/Mode/tube returns every tube line with the fields the map/status pages read", async () => {
    const lines = await getJson("/Line/Mode/tube");

    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(11); // the 11 Underground lines

    const central = lines.find((line) => line.id === "central");
    expect(central).toBeDefined();
    expect(central).toMatchObject({ name: "Central", modeName: "tube" });
  });

  it("Line/Mode/overground returns the six 2024-rebrand line ids lineColours.js expects", async () => {
    const lines = await getJson("/Line/Mode/overground");
    const ids = lines.map((line) => line.id).sort();

    expect(ids).toEqual(
      ["liberty", "lioness", "mildmay", "suffragette", "weaver", "windrush"].sort(),
    );
  });

  it("Line/central/StopPoints returns stations with the fields TubeMap.jsx relies on", async () => {
    const stops = await getJson("/Line/central/StopPoints");

    expect(Array.isArray(stops)).toBe(true);
    expect(stops.length).toBeGreaterThan(20);

    for (const stop of stops) {
      expect(typeof stop.naptanId).toBe("string");
      expect(typeof stop.commonName).toBe("string");
      expect(typeof stop.lat).toBe("number");
      expect(typeof stop.lon).toBe("number");
    }
  });

  it("Line/central/Route/Sequence/outbound has the branch-ordered station ids the map draws connections from", async () => {
    const sequence = await getJson("/Line/central/Route/Sequence/outbound");

    expect(Array.isArray(sequence.orderedLineRoutes)).toBe(true);
    expect(sequence.orderedLineRoutes.length).toBeGreaterThan(0);

    for (const route of sequence.orderedLineRoutes) {
      expect(Array.isArray(route.naptanIds)).toBe(true);
      expect(route.naptanIds.length).toBeGreaterThan(1);
    }
  });

  it("Line/{ids}/Status (the combined call LineStatus.jsx actually makes) returns every requested mode", async () => {
    const lines = await getJson("/Line/Mode/tube,overground,dlr,elizabeth-line,tram/Status");
    const modeNames = new Set(lines.map((line) => line.modeName));

    expect(Array.isArray(lines)).toBe(true);
    expect(modeNames.has("tube")).toBe(true);
    expect(modeNames.has("overground")).toBe(true);

    for (const line of lines) {
      expect(typeof line.id).toBe("string");
      expect(typeof line.name).toBe("string");
      expect(Array.isArray(line.lineStatuses)).toBe(true);
      expect(typeof line.lineStatuses[0]?.statusSeverityDescription).toBe("string");
    }
  });

  it("Line/thameslink/Status (the National Rail extra) still responds with the same shape", async () => {
    const lines = await getJson("/Line/thameslink/Status");

    expect(Array.isArray(lines)).toBe(true);
    expect(lines[0]).toMatchObject({ id: "thameslink", modeName: "national-rail" });
  });

  it("Line/central/Arrivals returns an array shaped the way the train-animation poll expects", async () => {
    const arrivals = await getJson("/Line/central/Arrivals");

    expect(Array.isArray(arrivals)).toBe(true);
    // Arrival counts genuinely vary run to run (time of day, night closures)
    // — assert the shape of whatever came back rather than a fixed count.
    for (const arrival of arrivals) {
      expect(typeof arrival.vehicleId).toBe("string");
      expect(typeof arrival.lineId).toBe("string");
      expect(typeof arrival.naptanId).toBe("string");
      expect(typeof arrival.timeToStation).toBe("number");
    }
  });
});

describe("TfL API — stations & journeys (used by Stations.jsx / TripPlanner.jsx)", () => {
  it("StopPoint/Search finds King's Cross and returns fields the search box reads", async () => {
    const result = await getJson("/StopPoint/Search/Kings%20Cross?modes=tube,overground,dlr,elizabeth-line,tram");

    expect(Array.isArray(result.matches)).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);

    const [match] = result.matches;
    expect(typeof match.id).toBe("string");
    expect(typeof match.name).toBe("string");
  });

  it("StopPoint/{id} resolves a real station id with lat/lon and (for a hub) child stops", async () => {
    const searchResult = await getJson(
      "/StopPoint/Search/Kings%20Cross?modes=tube,overground,dlr,elizabeth-line,tram",
    );
    const stationId = searchResult.matches[0].id;

    const stop = await getJson(`/StopPoint/${stationId}`);

    expect(typeof stop.commonName).toBe("string");
    expect(typeof stop.lat).toBe("number");
    expect(typeof stop.lon).toBe("number");
    // Only a hub id (e.g. "HUB...") is expected to carry child stops —
    // resolveStopId() in TripPlanner.jsx only reads .children on those.
    if (stationId.startsWith("HUB")) {
      expect(Array.isArray(stop.children)).toBe(true);
    }
  });

  it("Journey/JourneyResults finds at least one route between two well-connected stations", async () => {
    // King's Cross and Oxford Circus are both major interchanges served
    // by multiple lines around the clock — if TfL can't find a journey
    // between these two, either the endpoint's contract changed or the
    // service is having a very bad day; either way this test should tell
    // us before a user notices Trip Planner is broken.
    const kingsCross = "940GZZLUKSX";
    const oxfordCircus = "940GZZLUOXC";

    const data = await getJson(`/Journey/JourneyResults/${kingsCross}/to/${oxfordCircus}`);

    expect(Array.isArray(data.journeys)).toBe(true);
    expect(data.journeys.length).toBeGreaterThan(0);

    const [journey] = data.journeys;
    expect(typeof journey.duration).toBe("number");
    expect(Array.isArray(journey.legs)).toBe(true);
    expect(journey.legs.length).toBeGreaterThan(0);
  });
});
