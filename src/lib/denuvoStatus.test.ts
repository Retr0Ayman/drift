import { describe, expect, it } from "vitest";
import { describeSources } from "./denuvoStatus";
import type { SourceHealth } from "../hooks/useDenuvoStatus";

const NOW = Date.UTC(2026, 10, 5, 12);
const h = (over: Partial<SourceHealth>): SourceHealth => ({ lastAttemptAt: NOW, lastSuccessAt: null, failingSince: null, consecutiveFailures: 0, lastStatus: null, lastError: null, ...over });

describe("describeSources", () => {
  it("null without health data (page says nothing rather than claiming health)", () => {
    expect(describeSources(null)).toBeNull();
    expect(describeSources({ now: NOW, sources: {} })).toBeNull();
  });
  it("one source fine, one failing: names both honestly", () => {
    const l = describeSources({ now: NOW, sources: { steam: h({ lastSuccessAt: NOW - 3 * 3600e3 }), pcgamingwiki: h({ failingSince: Date.UTC(2026, 9, 1), consecutiveFailures: 9 }) } })!;
    expect(l.text).toBe("DRM data last refreshed 3h ago (Steam) · PCGamingWiki unavailable since Oct 1, 2026");
    expect(l.allFailing).toBe(false);
  });
  it("all sources failing is called out as stale", () => {
    const l = describeSources({ now: NOW, sources: { steam: h({ failingSince: NOW - 1e6 }), pcgamingwiki: h({ failingSince: NOW - 1e6 }) } })!;
    expect(l.allFailing).toBe(true);
    expect(l.text).toContain("No DRM source is answering");
  });
  it("never attempted yet", () => {
    expect(describeSources({ now: NOW, sources: { steam: h({ lastAttemptAt: null }) } })!.text).toBe("DRM data not refreshed yet");
  });
});
