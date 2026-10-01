import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { initTheme } from "./utils/theme";

// Applied before the first render so the page never flashes light before
// switching to a previously-chosen (or system-preferred) dark theme.
initTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);