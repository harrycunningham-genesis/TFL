const MAX_RECENTS = 5;

export function getRecentStations(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentStation(key, station) {
  try {
    const withoutDuplicate = getRecentStations(key).filter((s) => s.id !== station.id);
    const updated = [station, ...withoutDuplicate].slice(0, MAX_RECENTS);

    localStorage.setItem(key, JSON.stringify(updated));

    return updated;
  } catch {
    return getRecentStations(key);
  }
}
