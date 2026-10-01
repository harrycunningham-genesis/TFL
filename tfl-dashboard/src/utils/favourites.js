// Favourite trips (from/to station pairs) and favourite lines, stored in
// localStorage — the same lightweight per-browser storage this app already
// uses for "recent stations" in TripPlanner (see recentStations.js).
//
// This is a deliberately different choice to the IndexedDB layer in
// db/statusHistory.js: that one is a genuine time-series log (a new row
// every 60 seconds, queried by date range), which is what IndexedDB is
// for. Favourites are just a small, user-edited list — a handful of trips
// and lines someone has explicitly starred — so a single JSON blob read
// and written with localStorage is simpler and is enough.

const FAVOURITE_TRIPS_KEY = "tfl_favourite_trips";
const FAVOURITE_LINES_KEY = "tfl_favourite_lines";

// A generous cap, not a real expected count — just there so someone
// star-happy over years of use doesn't grow this without bound.
const MAX_FAVOURITE_TRIPS = 30;

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage can fail (private browsing, quota, disabled entirely) —
    // favouriting just silently doesn't persist rather than crashing the
    // page over something this non-essential.
  }
  return list;
}

// ---- Favourite trips ----

function tripId(from, to) {
  return `${from.id}::${to.id}`;
}

export function getFavouriteTrips() {
  return readList(FAVOURITE_TRIPS_KEY);
}

export function isFavouriteTrip(from, to) {
  if (!from || !to) return false;
  const id = tripId(from, to);
  return getFavouriteTrips().some((trip) => trip.id === id);
}

export function addFavouriteTrip(from, to) {
  const id = tripId(from, to);
  const withoutDuplicate = getFavouriteTrips().filter((trip) => trip.id !== id);
  const updated = [
    {
      id,
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
    },
    ...withoutDuplicate,
  ].slice(0, MAX_FAVOURITE_TRIPS);

  return writeList(FAVOURITE_TRIPS_KEY, updated);
}

export function removeFavouriteTrip(from, to) {
  const id = tripId(from, to);
  const updated = getFavouriteTrips().filter((trip) => trip.id !== id);
  return writeList(FAVOURITE_TRIPS_KEY, updated);
}

export function toggleFavouriteTrip(from, to) {
  return isFavouriteTrip(from, to)
    ? removeFavouriteTrip(from, to)
    : addFavouriteTrip(from, to);
}

// ---- Favourite lines ----

export function getFavouriteLineIds() {
  return readList(FAVOURITE_LINES_KEY);
}

export function isFavouriteLine(lineId) {
  return getFavouriteLineIds().includes(lineId);
}

export function toggleFavouriteLine(lineId) {
  const current = getFavouriteLineIds();
  const updated = current.includes(lineId)
    ? current.filter((id) => id !== lineId)
    : [...current, lineId];

  return writeList(FAVOURITE_LINES_KEY, updated);
}
