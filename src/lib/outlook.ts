import type { Game } from "../types/game";
import { relStatus, driftDelta, crackTimingDays, sortReleasesByPriority } from "./format";

// v2: bumped -- worker/routes/outlook.ts picked up a DRM-name grounding
// backstop (48adf6b) after v1 entries were already cached, so a visitor who
// hit a game like Ground Branch before that fix was stuck with a fabricated
// "Denuvo" claim forever with no way to notice. A v1 entry is a dead key
// now, never read again.
const CACHE_PREFIX = "drift.outlook.v2.";

export interface OutlookResult {
  outlook: string | null;
  error: string | null;
}

/* Cached per game in localStorage -- same generate-once, honest-failure
   pattern as fetchFact/fetchFaq. The facts sent are derived client-side via
   lib/format.ts's own relStatus/driftDelta/crackTimingDays -- the same
   numbers already shown in the sidebar and release cards, just handed to
   the model instead of computed twice in two places. */
export async function fetchOutlook(game: Game): Promise<OutlookResult> {
  const cacheKey = CACHE_PREFIX + game.id;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return { outlook: cached, error: null };

  const releases = sortReleasesByPriority(game.releases || []);
  const lead = releases[0];

  const status = !lead ? "none" : relStatus(game, lead);
  const buildGap = status === "out" ? driftDelta(game) : undefined;
  const methods = [...new Set(releases.map((r) => r.label))];
  const timing = lead ? crackTimingDays(game, lead) : null;

  try {
    const r = await fetch("/api/outlook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: game.title,
        status: status === "out" ? "outdated" : status === "cur" ? "current" : status === "unv" ? "unverified" : "none",
        buildGap: buildGap != null && buildGap > 0 ? buildGap : undefined,
        methods: methods.length ? methods : undefined,
        isRepack: lead?.isRepack,
        crackTimingDays: timing,
        protection: game.tags,
        releaseCount: releases.length,
      }),
    });
    const data = (await r.json()) as { outlook?: string; error?: string };
    if (!r.ok || !data.outlook) {
      return { outlook: null, error: data.error || `Outlook generation failed (${r.status})` };
    }
    try {
      localStorage.setItem(cacheKey, data.outlook);
    } catch {
      // storage full/unavailable -- still return the freshly generated outlook, just won't be cached
    }
    return { outlook: data.outlook, error: null };
  } catch {
    return { outlook: null, error: "Could not reach the outlook service" };
  }
}
