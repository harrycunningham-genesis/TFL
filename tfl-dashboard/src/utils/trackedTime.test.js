import { describe, expect, it } from "vitest";

import { describeTrackedPeriod } from "./trackedTime";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 1, 12);

describe("describeTrackedPeriod", () => {
  it("returns null with no start time", () => {
    expect(describeTrackedPeriod(null, NOW)).toBeNull();
    expect(describeTrackedPeriod("not a date", NOW)).toBeNull();
  });

  it("uses hours for the first two days", () => {
    expect(describeTrackedPeriod(NOW - 10 * 60 * 1000, NOW)).toBe("last hour");
    expect(describeTrackedPeriod(NOW - 5 * HOUR, NOW)).toBe("last 5 hours");
    expect(describeTrackedPeriod(NOW - 47 * HOUR, NOW)).toBe("last 47 hours");
  });

  it("switches to days, capped at 90", () => {
    expect(describeTrackedPeriod(NOW - 12 * DAY, NOW)).toBe("last 12 days");
    expect(describeTrackedPeriod(NOW - 400 * DAY, NOW)).toBe("last 90 days");
  });

  it("accepts ISO strings", () => {
    expect(describeTrackedPeriod(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe("last 3 days");
  });
});
