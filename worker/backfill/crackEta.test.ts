import { describe, expect, it } from "vitest";
import { computeCrackEtaStats } from "./crackEta";

const secs = (s: string) => Date.parse(s) / 1000;
const row = (over: Partial<{ group_name: string; publisher: string | null; released: string | null; first_seen_ts: number }> = {}) => ({
  group_name: "RUNE",
  publisher: "Capcom" as string | null,
  released: "2026-01-01" as string | null,
  first_seen_ts: secs("2026-01-31"),
  ...over,
});

describe("computeCrackEtaStats", () => {
  it("measures days from Steam release to first crack, bucketed by publisher AND by group", () => {
    const { byPublisher, byGroup } = computeCrackEtaStats([row()]);
    expect(byPublisher.get("capcom")!.days).toEqual([30]);
    expect(byGroup.get("rune")!.days).toEqual([30]);
  });

  it("keeps day-zero and pre-release leaks within the plausible window", () => {
    const { byGroup } = computeCrackEtaStats([
      row({ first_seen_ts: secs("2026-01-01") }),
      row({ first_seen_ts: secs("2025-10-03") }), // -90 days: the floor
    ]);
    expect(byGroup.get("rune")!.days).toEqual([0, -90]);
  });

  it("drops values from a title/date mismatch (a remake reusing the original's appid)", () => {
    const { byGroup } = computeCrackEtaStats([
      row({ released: "2023-03-23", first_seen_ts: secs("2007-06-01") }), // ~ -5800 days
      row({ released: "2020-01-01", first_seen_ts: secs("2026-01-01") }), // > 3 years
    ]);
    expect(byGroup.size).toBe(0);
  });

  it("still counts the group when a game has no publisher, but not the publisher bucket", () => {
    const { byPublisher, byGroup } = computeCrackEtaStats([row({ publisher: null })]);
    expect(byPublisher.size).toBe(0);
    expect(byGroup.get("rune")!.days).toEqual([30]);
  });

  it("skips rows with a missing or unparseable release date", () => {
    expect(computeCrackEtaStats([row({ released: null }), row({ released: "Coming soon" })]).byGroup.size).toBe(0);
  });
});
