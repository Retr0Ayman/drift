import { describe, expect, it } from "vitest";
import { seedTargetMissed } from "./deepRun";

const none = new Set<string>();

describe("seedTargetMissed", () => {
  it("is false when xREL returned nothing for the seed -- a clean 'nothing to find'", () => {
    expect(seedTargetMissed("monster hunter wilds", [], none)).toBe(false);
  });

  it("is false when the seed's own group resolved", () => {
    expect(seedTargetMissed("battlefield 3", ["Battlefield 3"], new Set(["Battlefield 3"]))).toBe(false);
  });

  it("is true when the seed's own group came back but never resolved against Steam", () => {
    expect(seedTargetMissed("monster hunter wilds", ["Monster Hunter Wilds"], none)).toBe(true);
  });

  it("catches an xREL year disambiguator ('(2026)') on the seed's own title", () => {
    expect(seedTargetMissed("call of duty: modern warfare 4", ["Call of Duty: Modern Warfare 4 (2026)"], none)).toBe(true);
  });

  it("ignores unresolved siblings from the same fuzzy search -- they say nothing about this seed", () => {
    const titles = ["Battlefield 3", "Battlefield 4", "Indie Spiele", "Medieval Battlefields"];
    // The seed itself resolved; the others didn't. Not a miss.
    expect(seedTargetMissed("battlefield 3", titles, new Set(["Battlefield 3"]))).toBe(false);
  });

  it("does not mistake a longer, different title for the seed", () => {
    // "battlefield 3" must not match "battlefield 3d-something" by a bare prefix.
    expect(seedTargetMissed("battlefield 3", ["Battlefield 3D Puzzle"], none)).toBe(false);
  });

  it("matches whichever side carries the dash-separated extension", () => {
    // xREL's title longer than the seed (a year or edition suffix)...
    expect(seedTargetMissed("total war: pharaoh", ["Total War: Pharaoh Dynasties"], none)).toBe(true);
    // ...or shorter than it (xREL files the base title under a longer seed).
    expect(seedTargetMissed("total war: pharaoh dynasties", ["Total War: Pharaoh"], none)).toBe(true);
  });

  it("does not match across an unrelated word boundary", () => {
    expect(seedTargetMissed("far cry", ["Far Crying Simulator"], none)).toBe(false);
  });
});
