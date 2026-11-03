import { describe, expect, it } from "vitest";
import { computeDenuvoRemovalStats } from "./denuvoRemoval";

const d = (s: string) => Date.parse(s);

describe("computeDenuvoRemovalStats", () => {
  it("computes whole days from launch to the observed removal", () => {
    const out = computeDenuvoRemovalStats([{ publisher: "Capcom", released: "2026-01-01", denuvo_removed_at: d("2026-01-31") }]);
    expect(out.get("capcom")!.days).toEqual([30]);
  });

  it("groups publishers by slug, so spelling/case variants merge", () => {
    const out = computeDenuvoRemovalStats([
      { publisher: "Square Enix", released: "2026-01-01", denuvo_removed_at: d("2026-01-11") },
      { publisher: "SQUARE ENIX", released: "2026-02-01", denuvo_removed_at: d("2026-02-21") },
    ]);
    expect(out.size).toBe(1);
    expect(out.get("square-enix")!.days).toEqual([10, 20]);
  });

  it("drops negative durations: a removal can't predate its own launch, so the date is wrong", () => {
    const out = computeDenuvoRemovalStats([{ publisher: "X", released: "2026-06-01", denuvo_removed_at: d("2026-01-01") }]);
    expect(out.size).toBe(0);
  });

  it("drops implausibly long durations (appid reused by a remaster) but keeps the boundary", () => {
    const bad = computeDenuvoRemovalStats([{ publisher: "X", released: "2000-01-01", denuvo_removed_at: d("2026-01-01") }]);
    expect(bad.size).toBe(0);
    const edge = computeDenuvoRemovalStats([{ publisher: "X", released: "2016-01-01", denuvo_removed_at: d("2016-01-01") + 3650 * 86400000 }]);
    expect(edge.get("x")!.days).toEqual([3650]);
  });

  it("skips rows missing a publisher, release date or removal time, and unparseable dates", () => {
    const out = computeDenuvoRemovalStats([
      { publisher: null, released: "2026-01-01", denuvo_removed_at: d("2026-02-01") },
      { publisher: "X", released: null, denuvo_removed_at: d("2026-02-01") },
      { publisher: "X", released: "2026-01-01", denuvo_removed_at: 0 },
      { publisher: "X", released: "TBA", denuvo_removed_at: d("2026-02-01") },
    ]);
    expect(out.size).toBe(0);
  });
});
