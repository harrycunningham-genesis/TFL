import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="home-page">

      <section className="hero">

        <p className="eyebrow">
          LONDON UNDERGROUND
        </p>

        <h1>
          London Tube
          <br />
          Dashboard
        </h1>

        <p className="hero-description">
          Explore live Tube services, stations and the London
          Underground network in one place.
        </p>

        <div className="hero-buttons">
          <Link to="/map" className="primary-button">
            View Live Map
          </Link>

          <Link to="/status" className="secondary-button">
            Check Line Status
          </Link>
        </div>

      </section>

      <section className="features">

        <Link to="/map" className="feature-card">
          <span className="feature-icon">🗺️</span>

          <h2>Live Tube Map</h2>

          <p>
            Explore the Underground network and
            see stations and routes.
          </p>
        </Link>

        <Link to="/status" className="feature-card">
          <span className="feature-icon">📊</span>

          <h2>Line Status</h2>

          <p>
            Check the current status of every
            London Underground line.
          </p>
        </Link>

        <Link to="/stations" className="feature-card">
          <span className="feature-icon">🚉</span>

          <h2>Stations</h2>

          <p>
            Search for stations and explore
            available services.
          </p>
        </Link>

      </section>

    </div>
  );
}

export default Home;