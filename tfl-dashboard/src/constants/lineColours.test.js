import { describe, it, expect } from "vitest";

import {
  LINE_COLOURS,
  DEFAULT_LINE_COLOUR,
  getLineColour,
  getReadableTextColour,
} from "./lineColours";

describe("getLineColour", () => {
  it("returns TfL's real brand colour for known lines", () => {
    expect(getLineColour("central")).toBe("#E32017");
    expect(getLineColour("circle")).toBe("#FFD300");
    // "elizabeth" (the line's actual TfL id), not "elizabeth-line" (the
    // *mode* name) — see the long comment in lineColours.js about this
    // exact distinction; a regression here would silently grey out the
    // Elizabeth line everywhere it's drawn.
    expect(getLineColour("elizabeth")).toBe("#6950A1");
  });

  it("falls back to the default colour for an id it doesn't recognise", () => {
    expect(getLineColour("not-a-real-line")).toBe(DEFAULT_LINE_COLOUR);
    expect(getLineColour(undefined)).toBe(DEFAULT_LINE_COLOUR);
  });

  it("every entry is a valid 6-digit hex colour", () => {
    for (const [id, colour] of Object.entries(LINE_COLOURS)) {
      expect(colour, `${id}'s colour "${colour}" isn't a valid hex code`).toMatch(
        /^#[0-9A-Fa-f]{6}$/,
      );
    }
  });
});

describe("getReadableTextColour", () => {
  it("picks dark text against a light background (Circle line yellow)", () => {
    expect(getReadableTextColour("#FFD300")).toBe("#111827");
  });

  it("picks white text against a dark background (Northern line black)", () => {
    expect(getReadableTextColour("#000000")).toBe("#ffffff");
  });

  it("picks white text against another dark brand colour (District line green)", () => {
    expect(getReadableTextColour("#00782A")).toBe("#ffffff");
  });
});
