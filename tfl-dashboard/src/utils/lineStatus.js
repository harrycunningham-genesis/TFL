// TfL uses many statusSeverityDescription values beyond "Good Service" /
// "Minor Delays" / "Severe Delays" (e.g. "Part Suspended", "Planned Closure",
// "Special Service") — anything outside those three known states falls back
// to its own distinct "other" styling rather than being lumped in with
// minor delays.
export function getStatusClass(description) {
  if (!description) return "unknown";

  const normalized = description.trim().toLowerCase();

  if (normalized === "good service") return "good";
  if (normalized === "minor delays") return "minor";
  if (normalized === "severe delays") return "severe";

  return "other";
}
