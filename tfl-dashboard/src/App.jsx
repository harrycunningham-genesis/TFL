import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchTubeStatus() {
    try {
      setLoading(true);

      const apiKey = import.meta.env.VITE_TFL_API_KEY;

      const response = await fetch(
        `https://api.tfl.gov.uk/Line/Mode/tube/Status?app_key=${apiKey}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch Tube status");
      }

      const data = await response.json();

      setLines(data);
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
    <div className="dashboard">
      <header className="header">
        <div>
          <h1>London Tube Status</h1>
          <p>Live service information from Transport for London</p>
        </div>

        <button onClick={fetchTubeStatus}>Refresh</button>
      </header>

      {loading && <p>Loading Tube status...</p>}

      {error && <p className="error">{error}</p>}

      <main className="line-grid">
        {lines.map((line) => {
          const status = line.lineStatuses?.[0];

          return (
            <div className="line-card" key={line.id}>
              <div className="line-header">
                <h2>{line.name}</h2>

                <span
                  className={`status ${
                    status?.statusSeverityDescription === "Good Service"
                      ? "good"
                      : "warning"
                  }`}
                >
                  {status?.statusSeverityDescription || "Unknown"}
                </span>
              </div>

              {status?.reason && <p className="reason">{status.reason}</p>}
            </div>
          );
        })}
      </main>

      <footer>Data provided by Transport for London</footer>
    </div>
  );
}

export default App;
