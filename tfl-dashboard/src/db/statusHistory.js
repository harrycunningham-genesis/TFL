// A small local database, stored by the browser itself via IndexedDB — no
// server, no Supabase project, nothing to configure. Every major browser
// persists IndexedDB to disk automatically (inside its own profile folder),
// and it survives page reloads, tab closes and full computer restarts. The
// data only goes away if this site's storage is explicitly cleared, or a
// private/incognito window is closed.
//
// Unlike localStorage (which only stores strings, one whole blob at a
// time), IndexedDB is a proper database: it stores structured JS objects in
// named "object stores" (think: tables), lets you create indexes on fields
// to query efficiently, and everything is transactional and asynchronous so
// it never blocks the UI thread.
//
// The raw browser API is callback-based and quite awkward to use directly,
// so this file uses `idb` — a tiny (~1KB) wrapper by the Chrome team that
// makes the exact same underlying storage feel like normal promise-based
// code. `idb` doesn't add a new storage mechanism; it's purely a nicer way
// to talk to IndexedDB.
//
// What's stored here: every time Line Status polls TfL, a snapshot of each
// line's severity tier is appended to a "statusSnapshots" store. That's the
// only thing IndexedDB gives us that TfL's own API never does — history.
// TfL's API only ever answers "what's the status right now"; every past
// answer is discarded the moment the next poll overwrites it in memory.
// Logging each snapshot here means we can later answer "how much of the
// last 7 days was the Central line disrupted", entirely offline, from data
// this app already collects.
import { openDB } from "idb";

const DB_NAME = "tfl-dashboard";
const DB_VERSION = 1;
const STORE_NAME = "statusSnapshots";

// How long a snapshot is kept before pruneOldSnapshots() removes it, so the
// database doesn't grow forever on a machine that's left running for
// months. 60s polling for 30 days is roughly 43,000 snapshots per line —
// trivial for IndexedDB, but there's no reason to keep it all forever.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// openDB() only actually does anything the very first time it's called (or
// when DB_VERSION goes up) — it opens a connection, and if the database
// doesn't exist yet in this browser, runs the `upgrade` callback once to
// create it. Every call after that just reuses the existing database, so
// this is cheap to call from anywhere that needs it.
let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // keyPath: "id", autoIncrement: true — IndexedDB itself hands out
        // a unique numeric id per record, the same idea as a SQL table's
        // auto-increment primary key.
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        // Indexes are what make querying fast: without one, answering
        // "every snapshot for the Central line" would mean IndexedDB
        // scanning every single row in the store. With this index, it can
        // jump straight to just the Central line's rows, the same way a
        // SQL index on a column works.
        store.createIndex("by-line", "lineId");
        store.createIndex("by-timestamp", "timestamp");
      },
    });
  }
  return dbPromise;
}

// Appends one snapshot per currently-fetched line, all in a single
// transaction (either all of them get written or none do, so a crash or
// error mid-write can never leave the store half-updated). Called once per
// 60-second poll from LineStatus.jsx, right after it gets fresh data from
// TfL — this file never fetches anything itself, it only stores what's
// already been fetched.
export async function recordStatusSnapshot(lines) {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const timestamp = Date.now();

  await Promise.all([
    ...lines.map((line) =>
      tx.store.add({
        lineId: line.lineId,
        tier: line.tier,
        timestamp,
      }),
    ),
    tx.done,
  ]);
}

// Every snapshot recorded for one line since `sinceTimestamp` (a plain
// epoch-ms number), oldest first. Uses the "by-line" index so this stays
// fast even with tens of thousands of rows across all lines.
export async function getLineHistory(lineId, sinceTimestamp) {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE_NAME, "by-line", lineId);
  return all
    .filter((record) => record.timestamp >= sinceTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Turns that raw history into the one number the UI actually wants to
// show: what fraction of polls in the window were "good" service. Returns
// null (rather than e.g. 100%) when there's no data yet for this line, so
// the UI can tell "just started tracking" apart from "genuinely perfect".
export async function getUptimeSummary(lineId, windowMs) {
  const since = Date.now() - windowMs;
  const history = await getLineHistory(lineId, since);

  if (history.length === 0) {
    return null;
  }

  const goodCount = history.filter((record) => record.tier === "good").length;
  return {
    goodPercent: Math.round((goodCount / history.length) * 100),
    sampleCount: history.length,
  };
}

// Deletes every snapshot older than RETENTION_MS. Safe to call often —
// it's just an index-ordered cursor walk that stops as soon as it reaches
// a record newer than the cutoff, so on most calls (once the store is
// already pruned) it does almost no work.
export async function pruneOldSnapshots() {
  const db = await getDb();
  const cutoff = Date.now() - RETENTION_MS;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const index = tx.store.index("by-timestamp");

  let cursor = await index.openCursor();
  while (cursor && cursor.value.timestamp < cutoff) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}
