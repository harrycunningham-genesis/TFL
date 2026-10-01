import { useState } from "react";
import { NavLink } from "react-router-dom";

import { getStoredTheme, setTheme } from "../utils/theme";

function Navbar() {
  const [theme, setThemeState] = useState(
    () => getStoredTheme() || document.documentElement.dataset.theme || "light",
  );

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  return (
    <nav className="navbar">
      <div className="nav-container">

        <NavLink to="/" className="logo">
          🚇 TFL Dashboard
        </NavLink>

        <div className="nav-links">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/map">Live Map</NavLink>
          <NavLink to="/status">Line Status</NavLink>
          <NavLink to="/stations">Stations</NavLink>
          <NavLink to="/plan">Plan a Trip</NavLink>
          <NavLink to="/about">About</NavLink>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

      </div>
    </nav>
  );
}

export default Navbar;