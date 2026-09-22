import { NavLink } from "react-router-dom";

function Navbar() {
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
          <NavLink to="/about">About</NavLink>
        </div>

      </div>
    </nav>
  );
}

export default Navbar;