const THEME_KEY = "tfl_theme";

export function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme just won't persist across visits — applying it to this page
    // load still works fine.
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

// Called once, as early as possible (before React renders), so the correct
// theme is set before the first paint rather than flashing light then
// switching to dark. Falls back to the system preference when nothing's
// been explicitly chosen yet.
export function initTheme() {
  const stored = getStoredTheme();
  const theme =
    stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  applyTheme(theme);
  return theme;
}

export function setTheme(theme) {
  applyTheme(theme);
  storeTheme(theme);
}
