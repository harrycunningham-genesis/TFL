// Official TfL Underground line brand colours.
//
// The TfL Unified API does not expose these anywhere — none of the Line,
// StopPoint, or Route/Sequence responses include a colour field. TfL treats
// these as a static brand asset rather than API data, so this is a
// hardcoded lookup keyed by each line's `id`, the same id returned by
// GET /Line/Mode/tube (e.g. line.id === "bakerloo").
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
};

// Fallback colour for any line id not found above — e.g. if this ever gets
// reused for a line/mode outside the 11 keys hardcoded here.
export const DEFAULT_LINE_COLOUR = "#666666";

export function getLineColour(lineId) {
  return LINE_COLOURS[lineId] || DEFAULT_LINE_COLOUR;
}

export default LINE_COLOURS;
