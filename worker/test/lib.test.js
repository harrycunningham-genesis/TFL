import { test } from "node:test";
import assert from "node:assert/strict";

import { MINUTE_MS, MINUTE_SLOTS, minuteSlot, parseHistoryParams, toPoint } from "../src/lib.js";
import { getTier } from "../../tfl-dashboard/src/utils/severity.js";

test("minuteSlot wraps every 3 hours", () => {
  assert.equal(minuteSlot(0), 0);
  assert.equal(minuteSlot(5 * MINUTE_MS + 30_000), 5);
  assert.equal(minuteSlot(MINUTE_SLOTS * MINUTE_MS), 0);
});

test("toPoint totals tiers and computes goodPercent", () => {
  assert.deepEqual(toPoint(1000, { good: 3, minor: 1 }), {
    t: 1000, good: 3, minor: 1, moderate: 0, severe: 0, unknown: 0, total: 4, goodPercent: 75,
  });
  assert.equal(toPoint(0, {}).goodPercent, null);
});

test("parseHistoryParams validates and clamps", () => {
  const p = (q) => parseHistoryParams(new URLSearchParams(q));
  assert.ok(p("").error);
  assert.ok(p("line=central&bucket=week").error);
  assert.ok(p("line=central&days=abc").error);
  assert.deepEqual(p("line=Central"), { line: "central", bucket: "hour", days: 1 });
  assert.deepEqual(p("line=central&bucket=day"), { line: "central", bucket: "day", days: 30 });
  assert.equal(p("line=central&days=500").days, 90);
  assert.equal(p("line=central&days=0").days, 1);
});

test("worker uses the frontend's severity tiers", () => {
  assert.equal(getTier({ lineStatuses: [{ statusSeverityDescription: "Severe Delays" }] }), "severe");
  assert.equal(getTier({ lineStatuses: [] }), "unknown");
});
