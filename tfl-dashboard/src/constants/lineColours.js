// Official TfL line brand colours — the Underground's 11, the Elizabeth
// line, the DLR, and the six London Overground lines (Liberty, Lioness,
// Mildmay, Suffragette, Weaver, Windrush) introduced in the 2024 Overground
// rebrand. Buses aren't in here — TfL doesn't brand individual routes with
// their own colours the way it does rail lines (every route is the same
// standard "bus red"), and buses aren't on the map at all right now.
//
// The TfL Unified API does not expose these anywhere — none of the Line,
// StopPoint, or Route/Sequence responses include a colour field. TfL treats
// these as a static brand asset rather than API data, so this is a
// hardcoded lookup keyed by each line's `id`, the same id returned by
// GET /Line/Mode/{mode} (e.g. line.id === "bakerloo", "dlr", "elizabeth",
// or "lioness"). Values are taken from TfL's own published colour standard
// (RGB, converted to hex): https://content.tfl.gov.uk/tfl-colour-standard.pdf
export const LINE_COLOURS = {
  bakerloo: "#B36305",
  central: "#E32017",
  circle: "#FFD300",
  district: "#00782A",
  "hammersmith-city": "#F3A9BB",
  jubilee: "#A0A5A9",
  metropolitan: "#9B0056",
  northern: "#000000",
  piccadilly: "#003688",
  victoria: "#0098D4",
  "waterloo-city": "#95CDBA",
  elizabeth: "#6950A1",
  dlr: "#00A4A5",
  // London Overground's six named lines.
  liberty: "#5D6061",
  lioness: "#FAA61A",
  mildmay: "#0077AD",
  suffragette: "#5BBD72",
  weaver: "#823A62",
  windrush: "#ED1B00",
  // Used by the Line Status page, not the map.
  tram: "#5FB526",
  // Thameslink is a National Rail operator, not run by TfL, so it isn't in
  // TfL's own colour standard — this is Thameslink's own brand pink.
  thameslink: "#FF5AA4",
};

// Fallback colour for any line id not found above — e.g. if this ever gets
// reused for a line/mode outside the keys hardcoded here.
export const DEFAULT_LINE_COLOUR = "#666666";


export function getLineColour(lineId) {
  return LINE_COLOURS[lineId] || DEFAULT_LINE_COLOUR;
}

// Given one of the hex colours above (or any hex colour), returns whichever
// of near-black/near-white reads more clearly on top of it — e.g. white
// text on Central line red, but dark text on Circle line yellow. Uses the
// standard YIQ perceived-brightness formula rather than a hand-picked list
// of which lines need dark text, so it stays correct automatically as
// lines are added above.
export function getReadableTextColour(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#111827" : "#ffffff";
}

export default LINE_COLOURS;
