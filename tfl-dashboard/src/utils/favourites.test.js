import { describe, it, expect, beforeEach } from "vitest";

import {
  getFavouriteTrips,
  isFavouriteTrip,
  addFavouriteTrip,
  removeFavouriteTrip,
  toggleFavouriteTrip,
  getFavouriteLineIds,
  isFavouriteLine,
  toggleFavouriteLine,
} from "./favourites";

const kingsCross = { id: "940GZZLUKSX", name: "King's Cross St. Pancras" };
const bank = { id: "940GZZLUBNK", name: "Bank" };

// Favourites persist in the browser's real localStorage — jsdom provides a
// working implementation, but it isn't reset between tests automatically,
// so every test here starts from a clean slate itself.
beforeEach(() => {
  localStorage.clear();
});

describe("favourite trips", () => {
  it("starts empty", () => {
    expect(getFavouriteTrips()).toEqual([]);
    expect(isFavouriteTrip(kingsCross, bank)).toBe(false);
  });

  it("adds a trip and persists just the id/name TripPlanner needs", () => {
    addFavouriteTrip(kingsCross, bank);

    expect(isFavouriteTrip(kingsCross, bank)).toBe(true);
    expect(getFavouriteTrips()).toEqual([
      {
        id: "940GZZLUKSX::940GZZLUBNK",
        from: { id: kingsCross.id, name: kingsCross.name },
        to: { id: bank.id, name: bank.name },
      },
    ]);
  });

  it("does not add the same trip twice", () => {
    addFavouriteTrip(kingsCross, bank);
    addFavouriteTrip(kingsCross, bank);

    expect(getFavouriteTrips()).toHaveLength(1);
  });

  it("removes a trip", () => {
    addFavouriteTrip(kingsCross, bank);
    removeFavouriteTrip(kingsCross, bank);

    expect(isFavouriteTrip(kingsCross, bank)).toBe(false);
    expect(getFavouriteTrips()).toEqual([]);
  });

  it("toggles a trip on, then back off", () => {
    toggleFavouriteTrip(kingsCross, bank);
    expect(isFavouriteTrip(kingsCross, bank)).toBe(true);

    toggleFavouriteTrip(kingsCross, bank);
    expect(isFavouriteTrip(kingsCross, bank)).toBe(false);
  });

  it("treats A→B and B→A as different trips", () => {
    addFavouriteTrip(kingsCross, bank);

    expect(isFavouriteTrip(bank, kingsCross)).toBe(false);
  });

  it("never throws even if localStorage.setItem fails", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("storage disabled");
    };

    try {
      expect(() => addFavouriteTrip(kingsCross, bank)).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe("favourite lines", () => {
  it("starts empty", () => {
    expect(getFavouriteLineIds()).toEqual([]);
    expect(isFavouriteLine("central")).toBe(false);
  });

  it("toggles a line id on, then back off", () => {
    toggleFavouriteLine("central");
    expect(isFavouriteLine("central")).toBe(true);
    expect(getFavouriteLineIds()).toEqual(["central"]);

    toggleFavouriteLine("central");
    expect(isFavouriteLine("central")).toBe(false);
    expect(getFavouriteLineIds()).toEqual([]);
  });

  it("keeps multiple favourited lines independent of each other", () => {
    toggleFavouriteLine("central");
    toggleFavouriteLine("victoria");

    expect(getFavouriteLineIds().sort()).toEqual(["central", "victoria"]);

    toggleFavouriteLine("central");
    expect(getFavouriteLineIds()).toEqual(["victoria"]);
  });
});
