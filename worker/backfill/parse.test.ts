import { describe, expect, it } from "vitest";
import { parseBuildFromDirname, parseVersionFromDirname, slugify } from "./parse";

describe("parseVersionFromDirname", () => {
  it("keeps the dots in a real dotted version number", () => {
    expect(parseVersionFromDirname("Grand.Theft.Auto.V.v2675.1.0.0-RUNE")).toBe("V2675.1.0.0");
  });

  // Keyword + space + the number with its real dots ("Build.1436.28" ->
  // "Build 1436.28"); the old all-dots-to-spaces style ("1436 28") was a bug.
  it.each([
    ["Game.Update.1.0.3-GRP", "Update 1.0.3"],
    ["Game.Build.1436.28-GRP", "Build 1436.28"],
    ["Game.Hotfix.2-GRP", "Hotfix 2"],
    ["Game.Patch.1.17-GRP", "Patch 1.17"],
  ])("renders %s as %s", (dirname, expected) => {
    expect(parseVersionFromDirname(dirname)).toBe(expected);
  });

  it("handles the keyword with no separator and long dotted numbers", () => {
    expect(parseVersionFromDirname("Red.Dead.Redemption.2.Update1311.23-ElAmigos")).toBe("Update 1311.23");
    expect(parseVersionFromDirname("Game.Update.1.0.1491-GRP")).toBe("Update 1.0.1491");
  });

  it("does not drop the trailing part of a multi-part update number", () => {
    expect(parseVersionFromDirname("Game.UPDATE.1.17-CPY")).toBe("UPDATE 1.17");
  });

  it("returns empty for a dirname with no version, or no dirname", () => {
    expect(parseVersionFromDirname("Phantom.Blade.Zero.Crack.Only-ARTIFACT")).toBe("");
    expect(parseVersionFromDirname(undefined)).toBe("");
  });
});

describe("parseBuildFromDirname", () => {
  it("reads an explicit build number, with or without a separator", () => {
    expect(parseBuildFromDirname("Game.Build.12345678-GRP")).toBe(12345678);
    expect(parseBuildFromDirname("Game.Build12345678-GRP")).toBe(12345678);
  });

  it("reads the b12345678 shorthand", () => {
    expect(parseBuildFromDirname("Dragons.Dogma.2.b17891234-GRP")).toBe(17891234);
  });

  it("ignores digit runs too short to be a Steam build id", () => {
    expect(parseBuildFromDirname("Game.Build.1436-GRP")).toBeNull();
    expect(parseBuildFromDirname("Game.b123-GRP")).toBeNull();
  });

  it("returns null with no dirname", () => {
    expect(parseBuildFromDirname(undefined)).toBeNull();
  });
});

describe("slugify", () => {
  it("lowercases, collapses punctuation and trims dashes", () => {
    expect(slugify("Call of Duty: Modern Warfare 4")).toBe("call-of-duty-modern-warfare-4");
    expect(slugify("  --Hello, World!--  ")).toBe("hello-world");
  });
  it("caps at 60 chars", () => {
    expect(slugify("a".repeat(100)).length).toBe(60);
  });
  it("handles empty input", () => {
    expect(slugify("")).toBe("");
  });
});
