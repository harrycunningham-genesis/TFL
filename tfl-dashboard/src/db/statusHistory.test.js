import { describe, it, expect, vi, afterEach } from "vitest";

import {
  recordStatusSnapshot,
  getLineHistory,
  getUptimeSummary,
  pruneOldSnapshots,
} from "./statusHistory";

// Every test uses its own randomised line id rather than clearing the
// store between tests — getLineHistory/getUptimeSummary are always scoped
// to one lineId (via the "by-line" index), so distinct ids are naturally
// isolated from each other in the same underlying database, exactly like
// two real lines' histories never mix.
function uniqueLineId(label) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("recordStatusSnapshot / getLineHistory", () => {
  it("records a snapshot and reads it back for that line", async () => {
    const lineId = uniqueLineId("record");

    await recordStatusSnapshot([{ lineId, tier: "good" }]);
    const history = await getLineHistory(lineId, 0);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ lineId, tier: "good" });
    expect(typeof history[0].timestamp).toBe("number");
  });

  it("keeps different lines' histories separate", async () => {
    const lineA = uniqueLineId("a");
    const lineB = uniqueLineId("b");

    await recordStatusSnapshot([
      { lineId: lineA, tier: "good" },
      { lineId: lineB, tier: "severe" },
    ]);

    expect(await getLineHistory(lineA, 0)).toHaveLength(1);
    expect(await getLineHistory(lineB, 0)).toHaveLength(1);
    expect((await getLineHistory(lineB, 0))[0].tier).toBe("severe");
  });

  it("only returns records at or after the requested timestamp", async () => {
    const lineId = uniqueLineId("since");

    await recordStatusSnapshot([{ lineId, tier: "good" }]);
    const future = Date.now() + 60_000;

    expect(await getLineHistory(lineId, future)).toEqual([]);
  });
});

describe("getUptimeSummary", () => {
  it("computes the percentage of polls that were good", async () => {
    const lineId = uniqueLineId("uptime");

    await recordStatusSnapshot([{ lineId, tier: "good" }]);
    await recordStatusSnapshot([{ lineId, tier: "good" }]);
    await recordStatusSnapshot([{ lineId, tier: "severe" }]);

    const summary = await getUptimeSummary(lineId, 24 * 60 * 60 * 1000);

    expect(summary.sampleCount).toBe(3);
    expect(summary.goodPercent).toBe(67); // 2 of 3, rounded
  });

  it("returns null for a line with no recorded history yet", async () => {
    const lineId = uniqueLineId("no-history");

    expect(await getUptimeSummary(lineId, 24 * 60 * 60 * 1000)).toBeNull();
  });
});

describe("pruneOldSnapshots", () => {
  it("deletes snapshots older than the retention window", async () => {
    // Only fake Date — fake-indexeddb's own internals rely on real
    // setTimeout/microtask scheduling to resolve transactions, so faking
    // timers wholesale (the vi.useFakeTimers() default) hangs every
    // IndexedDB call forever instead of running it.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));

    const lineId = uniqueLineId("prune");
    await recordStatusSnapshot([{ lineId, tier: "good" }]);

    // 31 days later — one day past the 30-day retention window.
    vi.setSystemTime(new Date("2020-02-01T00:00:00Z"));
    await pruneOldSnapshots();

    expect(await getLineHistory(lineId, 0)).toEqual([]);
  });

  it("leaves recent snapshots untouched", async () => {
    const lineId = uniqueLineId("keep");

    await recordStatusSnapshot([{ lineId, tier: "good" }]);
    await pruneOldSnapshots();

    expect(await getLineHistory(lineId, 0)).toHaveLength(1);
  });
});
