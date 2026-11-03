import { describe, expect, it } from "vitest";
import { computeGroupReliability } from "./groupReliability";

const DAY = 86400;
let n = 0;
const row = (over: Partial<{ game_id: string; group_name: string; note: string | null; first_seen_ts: number | null; update_count: number }> = {}) => ({
  game_id: `g${n++}`,
  group_name: "RUNE",
  note: null as string | null,
  first_seen_ts: 1_000_000 as number | null,
  update_count: 1,
  ...over,
});
const many = (k: number, over = {}) => Array.from({ length: k }, () => row(over));

describe("computeGroupReliability", () => {
  it("withholds stars below the minimum sample instead of showing a confident rating", () => {
    const out = computeGroupReliability(many(4)).get("rune")!;
    expect(out.genuine).toBe(4);
    expect(out.stars).toBeNull();
  });

  it("gives 5 stars to a clean group at the minimum sample", () => {
    expect(computeGroupReliability(many(5)).get("rune")!.stars).toBe(5);
  });

  it("treats group names case-insensitively as one group", () => {
    const out = computeGroupReliability([row({ group_name: "RUNE" }), row({ group_name: "rune" }), row({ group_name: "Rune" })]);
    expect(out.size).toBe(1);
    expect(out.get("rune")!.genuine).toBe(3);
  });

  it("counts a self-correction (updated row carrying a PROPER/CRACKFIX tag) once per game", () => {
    const rows = [...many(9), row({ game_id: "fixed", update_count: 3, note: "PROPER fix" })];
    const out = computeGroupReliability(rows).get("rune")!;
    expect(out.corrected.size).toBe(1);
    expect(out.corrected.has("fixed")).toBe(true);
    expect(out.stars).toBe(4); // 1 - 1/10 = 0.9 -> 4 stars
  });

  it("does not count a correction tag on a row that was never updated", () => {
    const rows = [...many(9), row({ update_count: 1, note: "PROPER" })];
    expect(computeGroupReliability(rows).get("rune")!.corrected.size).toBe(0);
  });

  it("ignores bare 'fix'/'update' notes -- only real scene correction tags count", () => {
    const rows = [row({ update_count: 2, note: "fix" }), row({ update_count: 2, note: "update" }), row({ update_count: 2, note: "repack" })];
    expect(computeGroupReliability(rows).get("rune")!.corrected.size).toBe(0);
  });

  it("credits the nearest earlier release from a DIFFERENT group when a later one is a PROPER", () => {
    const rows = [
      row({ game_id: "x", group_name: "AAA", first_seen_ts: 1_000_000 }),
      row({ game_id: "x", group_name: "BBB", first_seen_ts: 1_000_000 + 2 * DAY, note: "PROPER" }),
    ];
    const out = computeGroupReliability(rows);
    expect(out.get("aaa")!.corrected.has("x")).toBe(true);
    expect(out.get("aaa")!.avgFixDays).toBe(2);
    expect(out.get("bbb")!.corrected.size).toBe(0); // the fixer isn't penalised
  });

  it("never credits a group's own earlier release as the thing being corrected", () => {
    const rows = [
      row({ game_id: "x", group_name: "AAA", first_seen_ts: 1_000_000 }),
      row({ game_id: "x", group_name: "AAA", first_seen_ts: 1_000_000 + DAY, note: "PROPER" }),
    ];
    expect(computeGroupReliability(rows).get("aaa")!.corrected.size).toBe(0);
  });

  it("skips releases with no first-seen timestamp when ordering corrections", () => {
    const rows = [
      row({ game_id: "x", group_name: "AAA", first_seen_ts: null }),
      row({ game_id: "x", group_name: "BBB", first_seen_ts: 1_000_000, note: "PROPER" }),
    ];
    expect(computeGroupReliability(rows).get("aaa")!.corrected.size).toBe(0);
  });

  // 100 genuine releases, values chosen away from the thresholds so float
  // rounding at an exact boundary can't make this flaky.
  it.each([
    [0, 5], [2, 5], [5, 4.5], [10, 4], [20, 3.5], [30, 3], [50, 2], [70, 1],
  ])("maps %i corrections out of 100 releases to %s stars", (corrections, stars) => {
    const rows = [
      ...many(100 - corrections),
      ...Array.from({ length: corrections }, (_, i) => row({ game_id: `c${i}`, update_count: 2, note: "CRACKFIX" })),
    ];
    const out = computeGroupReliability(rows).get("rune")!;
    expect(out.genuine).toBe(100);
    expect(out.stars).toBe(stars);
  });
});
