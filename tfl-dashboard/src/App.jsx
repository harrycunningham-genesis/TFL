import { BrowserRouter, Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import TubeMap from "./pages/TubeMap";
import LineStatus from "./pages/LineStatus";
import Stations from "./pages/Stations";
import TripPlanner from "./pages/TripPlanner";
import About from "./pages/About";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<TubeMap />} />
          <Route path="/status" element={<LineStatus />} />
          <Route path="/stations" element={<Stations />} />
          <Route path="/plan" element={<TripPlanner />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;