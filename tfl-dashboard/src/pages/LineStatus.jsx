import { useState, useEffect } from "react";

import { getLineColor } from "../utils/lineColors";
import { getStatusClass } from "../utils/lineStatus";

const MODE_ORDER = ["tube", "overground", "dlr", "elizabeth-line", "tram", "national-rail"];
const MODE_LABELS = {
  tube: "Underground",
  overground: "Overground",
  dlr: "DLR",
  "elizabeth-line": "Elizabeth line",
  tram: "Trams",
  "national-rail": "National Rail",
};

// TfL's live Arrivals API has no real-time predictions for National Rail
// operators (they run their own separate systems) — but it does track
// service-level status for some of them. Thameslink calls at several
// stations this app already covers (Farringdon, St Pancras), so it's
// listed here even though it isn't part of the tube/overground/etc modes
// above. Add more national-rail line ids here if useful later.
const NATIONAL_RAIL_LINES = ["thameslink"];

function LineStatus() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchTubeStatus() {
    try {
      setLoading(true);

      const apiKey = import.meta.env.VITE_TFL_API_KEY;

      const [tflResponse, nationalRailResponse] = await Promise.all([
        fetch(
          `https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr,elizabeth-line,tram/Status?app_key=${apiKey}`,
        ),
        fetch(
          `https://api.tfl.gov.uk/Line/${NATIONAL_RAIL_LINES.join(",")}/Status?app_key=${apiKey}`,
        ),
      ]);

      if (!tflResponse.ok) {
        throw new Error("Failed to fetch line status");
      }

      const tflLines = await tflResponse.json();
      const nationalRailLines = nationalRailResponse.ok ? await nationalRailResponse.json() : [];

      setLines([...tflLines, ...nationalRailLines]);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTubeStatus();

    // Refresh every 60 seconds
    const interval = setInterval(fetchTubeStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page">
      <h1>Line Status</h1>
      <p>Live service information for the Tube, Overground, DLR, Elizabeth line and Trams</p>

      <button onClick={fetchTubeStatus}>Refresh</button>

      {loading && <p>Loading line status...</p>}

      {error && <p className="error">{error}</p>}

      {MODE_ORDER.map((mode) => {
        const modeLines = lines.filter((line) => line.modeName === mode);

        if (modeLines.length === 0) return null;

        return (
          <section className="mode-section" key={mode}>
            <h2 className="mode-section-title">{MODE_LABELS[mode]}</h2>

            <div className="line-grid">
              {modeLines.map((line) => {
                const status = line.lineStatuses?.[0];
                const color = getLineColor(line.name);

                return (
                  <div
                    className="line-card"
                    key={line.id}
                    style={{ borderLeft: `6px solid ${color.bg}` }}
                  >
                    <div className="line-header">
                      <h3>
                        <span className="line-swatch" style={{ backgroundColor: color.bg }} />
                        {line.name}
                      </h3>

                      <span
                        className={`status ${getStatusClass(status?.statusSeverityDescription)}`}
                      >
                        {status?.statusSeverityDescription || "Unknown"}
                      </span>
                    </div>

                    {status?.reason && <p className="reason">{status.reason}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <footer>Data provided by Transport for London</footer>
    </div>
  );
}

export default LineStatus;
