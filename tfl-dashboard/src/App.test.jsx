import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// This is a *routing* smoke test: it doesn't care whether the live map
// actually draws stations correctly (that's react-leaflet's job, and
// jsdom has no real layout engine to draw a Leaflet map into) — only that
// navigating to each route renders that page's own content without
// crashing the whole app. Real Leaflet DOM behaviour is replaced with
// trivial stand-ins so TubeMap.jsx's own logic (imports, hooks, deep-link
// handling) still runs for real.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  Tooltip: ({ children }) => <div>{children}</div>,
  useMapEvents: () => null,
  useMap: () => ({ fitBounds: () => {} }),
}));

// Imported after the mock above so TubeMap.jsx picks up the stub, not the
// real react-leaflet.
const { default: App } = await import("./App");

function renderAtPath(path) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    // Every page that fetches on mount (Home, Line Status, the live map,
    // Stations, Trip Planner) gets a uniform empty-but-successful
    // response — this test only cares that each route renders its own
    // heading without throwing, not that live TfL data appears (the
    // contract tests in tfl.contract.test.js cover the real API).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the home page at /", async () => {
    renderAtPath("/");
    expect(await screen.findByRole("heading", { name: /london tube/i })).toBeInTheDocument();
  });

  it("renders the live map page at /map", async () => {
    renderAtPath("/map");
    expect(await screen.findByRole("heading", { name: /live tube map/i })).toBeInTheDocument();
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("renders the line status page at /status", async () => {
    renderAtPath("/status");
    expect(await screen.findByRole("heading", { name: /line status/i })).toBeInTheDocument();
  });

  it("renders the stations page at /stations", async () => {
    renderAtPath("/stations");
    expect(await screen.findByRole("heading", { name: /^stations$/i })).toBeInTheDocument();
  });

  it("renders the trip planner page at /plan", async () => {
    renderAtPath("/plan");
    expect(await screen.findByRole("heading", { name: /plan a trip/i })).toBeInTheDocument();
  });

  it("renders the about page at /about", async () => {
    renderAtPath("/about");
    expect(await screen.findByRole("heading", { name: /^about$/i })).toBeInTheDocument();
  });

  it("falls back gracefully for an unknown route rather than crashing", () => {
    // There's no catch-all <Route path="*">, so this documents the
    // current behaviour (nothing under <main> matches, app doesn't
    // crash) rather than asserting a 404 page that doesn't exist yet.
    expect(() => renderAtPath("/this-page-does-not-exist")).not.toThrow();
  });
});
