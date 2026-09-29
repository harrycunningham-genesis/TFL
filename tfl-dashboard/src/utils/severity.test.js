import { describe, it, expect } from "vitest";

import { getTier, TIER_META, SEVERITY_TIER_BY_DESCRIPTION } from "./severity";

// A minimal stand-in for the shape TfL's Line/.../Status endpoint returns —
// getTier only ever reads lineStatuses[0].statusSeverityDescription.
function lineWith(description) {
  return { lineStatuses: [{ statusSeverityDescription: description }] };
}

describe("getTier", () => {
  it("maps a healthy status to the good tier", () => {
    expect(getTier(lineWith("Good Service"))).toBe("good");
  });

  it("maps a full suspension to the severe tier", () => {
    expect(getTier(lineWith("Severe Delays"))).toBe("severe");
  });

  it("maps a partial closure to the moderate tier", () => {
    expect(getTier(lineWith("Part Closure"))).toBe("moderate");
  });

  it("maps a minor delay to the minor tier", () => {
    expect(getTier(lineWith("Minor Delays"))).toBe("minor");
  });

  it("falls back to unknown for a status TfL might add later", () => {
    expect(getTier(lineWith("Some Brand New Status"))).toBe("unknown");
  });

  it("falls back to unknown when lineStatuses is missing entirely", () => {
    expect(getTier({})).toBe("unknown");
  });

  it("maps every description in the lookup to a real TIER_META entry", () => {
    // Guards against a typo'd tier name in severity.js (e.g. "sever"
    // instead of "severe") silently falling through to "unknown" for real
    // TfL statuses rather than failing loudly.
    for (const [description, tier] of Object.entries(SEVERITY_TIER_BY_DESCRIPTION)) {
      expect(TIER_META[tier], `"${description}" maps to an unrecognised tier "${tier}"`).toBeDefined();
    }
  });

  it("ranks tiers worst-first (severe < moderate < minor < good)", () => {
    expect(TIER_META.severe.rank).toBeLessThan(TIER_META.moderate.rank);
    expect(TIER_META.moderate.rank).toBeLessThan(TIER_META.minor.rank);
    expect(TIER_META.minor.rank).toBeLessThan(TIER_META.good.rank);
  });
});
