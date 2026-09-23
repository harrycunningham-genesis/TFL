// Official TfL line colours: https://tfl.gov.uk/campaign/line-colours
const LINE_COLORS = {
  bakerloo: { bg: "#B36305", text: "#ffffff" },
  central: { bg: "#E32017", text: "#ffffff" },
  circle: { bg: "#FFD300", text: "#000000" },
  district: { bg: "#00782A", text: "#ffffff" },
  "hammersmith & city": { bg: "#F3A9BB", text: "#000000" },
  jubilee: { bg: "#A0A5A9", text: "#000000" },
  metropolitan: { bg: "#9B0056", text: "#ffffff" },
  northern: { bg: "#000000", text: "#ffffff" },
  piccadilly: { bg: "#003688", text: "#ffffff" },
  victoria: { bg: "#0098D4", text: "#ffffff" },
  "waterloo & city": { bg: "#95CDBA", text: "#000000" },
  "elizabeth line": { bg: "#6950A1", text: "#ffffff" },
  dlr: { bg: "#00A4A7", text: "#ffffff" },
  tram: { bg: "#84B817", text: "#ffffff" },

  // The Overground was split into 6 named lines in Nov 2024. Kept as a
  // fallback in case older data still labels it as one line.
  "london overground": { bg: "#EE7C0E", text: "#ffffff" },
  overground: { bg: "#EE7C0E", text: "#ffffff" },
  liberty: { bg: "#606667", text: "#ffffff" },
  lioness: { bg: "#EF9600", text: "#ffffff" },
  mildmay: { bg: "#2774AE", text: "#ffffff" },
  suffragette: { bg: "#5BA763", text: "#ffffff" },
  weaver: { bg: "#893B67", text: "#ffffff" },
  windrush: { bg: "#D22730", text: "#ffffff" },

  // National Rail operator, not TfL-run, but calls at stations this app
  // already covers (e.g. Farringdon, St Pancras).
  thameslink: { bg: "#FF5AA4", text: "#000000" },
};

const DEFAULT_COLOR = { bg: "#64748b", text: "#ffffff" };

export function getLineColor(lineName) {
  if (!lineName) return DEFAULT_COLOR;

  return LINE_COLORS[lineName.trim().toLowerCase()] || DEFAULT_COLOR;
}
