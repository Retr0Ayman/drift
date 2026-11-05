import { describe, expect, it } from "vitest";
import { DENUVO_TAG, decideDenuvo, planRowUpdate, type StoredRow } from "./denuvoDecision";
import type { PcgwOutcome } from "./pcgamingwiki";
import type { SteamNotice } from "./steamDrm";

const NOW = Date.UTC(2026, 10, 5);
const AUG3 = Date.UTC(2026, 7, 3);

const row = (over: Partial<StoredRow> = {}): StoredRow => ({
  tags: JSON.stringify([DENUVO_TAG, "Steam DRM"]),
  former_tags: "[]",
  steam_drm_notice: null,
  pcgw_page: null,
  denuvo_watch: 1,
  denuvo_removed_at: null,
  denuvo_removed_kind: null,
  ...over,
});

const pcgwMatch = (o: { uses?: boolean; removed?: { hasRef: boolean; dateMs: number | null; url: string | null } | null; tags?: string[]; complete?: boolean }): PcgwOutcome => ({
  status: "match",
  page: "P",
  parsed: { appids: [1], usesDenuvo: !!o.uses, removedDenuvo: o.removed ?? null, tags: o.tags ?? [], formerTags: [], complete: !!o.complete },
});
const steamOk = (notice: string | null): SteamNotice => ({ status: "ok", notice });
const failedPcgw: PcgwOutcome = { status: "failed", httpStatus: 200, reason: "api_permissiondenied" };
const failedSteam: SteamNotice = { status: "failed", httpStatus: 429, reason: "http_429" };

describe("planRowUpdate: failed lookups never stamp", () => {
  it("both sources failed -> null: no write, no drm_checked_at (the original silent-outage bug)", () => {
    expect(planRowUpdate(row(), failedPcgw, failedSteam, NOW)).toBeNull();
  });
  it("nothing returned at all -> null", () => {
    expect(planRowUpdate(row(), undefined, undefined, NOW)).toBeNull();
  });
  it("'no PCGamingWiki page' is a real answer and does stamp, without touching tags", () => {
    const p = planRowUpdate(row(), { status: "nomatch", reason: "no_page" }, failedSteam, NOW)!;
    expect(p.sets.drm_checked_at).toBe(NOW);
    expect(p.sets.tags).toBeUndefined();
    expect(p.decision.state).toBe("unknown");
  });
  it("one source failing while the other answers still stamps, but never records the failed source's check", () => {
    const p = planRowUpdate(row(), failedPcgw, steamOk("Denuvo Anti-tamper"), NOW)!;
    expect(p.sets.drm_checked_at).toBe(NOW);
    expect(p.sets.steam_drm_checked_at).toBe(NOW);
    expect(p.sets.pcgw_page).toBeUndefined();
  });
});

describe("removal rules", () => {
  it("Atomic Heart: PCGamingWiki sourced removal -> removed on the sourced date, Steam notice empty", () => {
    const p = planRowUpdate(
      row({ steam_drm_notice: null }),
      pcgwMatch({ removed: { hasRef: true, dateMs: AUG3, url: "https://steamdb.info/patchnotes/24534183/" } }),
      steamOk(null),
      NOW,
    )!;
    expect(p.decision.state).toBe("removed");
    expect(p.sets.denuvo_removed_at).toBe(AUG3);
    expect(p.sets.denuvo_removed_kind).toBe("sourced");
    expect(p.sets.denuvo_removed_source).toBe("pcgamingwiki");
    expect(JSON.parse(p.sets.tags as string)).toEqual(["Steam DRM"]);
    expect(JSON.parse(p.sets.former_tags as string)).toEqual([DENUVO_TAG]);
    expect(p.sets.denuvo_conflict).toBe(0);
  });

  it("a removal with no source ref is not a removal", () => {
    const d = decideDenuvo({ prevSteamListed: null, stored: { removedAt: null, kind: null }, pcgw: { status: "match", removed: { hasRef: false, dateMs: AUG3, url: null } }, steam: { status: "ok", lists: true }, now: NOW });
    expect(d.state).toBe("present");
  });

  it("Steam transition: notice previously listed Denuvo, now doesn't -> removed, 'detected' now", () => {
    const p = planRowUpdate(row({ steam_drm_notice: "Denuvo Anti-tamper" }), { status: "nomatch", reason: "no_page" }, steamOk(null), NOW)!;
    expect(p.decision.state).toBe("removed");
    expect(p.sets.denuvo_removed_at).toBe(NOW);
    expect(p.sets.denuvo_removed_kind).toBe("detected");
    expect(p.sets.denuvo_removed_source).toBe("steam");
    expect(p.sets.steam_drm_notice).toBe("");
  });

  it("an empty notice we have never seen listing Denuvo is NOT a removal (no previous observation)", () => {
    const p = planRowUpdate(row({ steam_drm_notice: null }), undefined, steamOk(null), NOW)!;
    expect(p.decision.state).toBe("unknown"); // no signal either way: stored tags untouched
    expect(p.sets.denuvo_removed_at).toBeUndefined();
    expect(p.sets.former_tags).toBeUndefined();
  });

  it("conflict: PCGamingWiki says removed, Steam still lists Denuvo -> removed + conflict flag, not hidden", () => {
    const p = planRowUpdate(row({ steam_drm_notice: "Denuvo Anti-tamper" }), pcgwMatch({ removed: { hasRef: true, dateMs: AUG3, url: null } }), steamOk("Denuvo Anti-tamper"), NOW)!;
    expect(p.decision.state).toBe("removed");
    expect(p.decision.conflict).toBe(true);
    expect(p.sets.denuvo_conflict).toBe(1);
  });

  it("a detected date is upgraded by a later sourced one, but a sourced date is never replaced by detection", () => {
    const up = planRowUpdate(
      row({ tags: "[]", former_tags: JSON.stringify([DENUVO_TAG]), denuvo_removed_at: NOW, denuvo_removed_kind: "detected" }),
      pcgwMatch({ removed: { hasRef: true, dateMs: AUG3, url: null } }),
      steamOk(null),
      NOW + 1e9,
    )!;
    expect(up.sets.denuvo_removed_at).toBe(AUG3);
    expect(up.sets.denuvo_removed_kind).toBe("sourced");
    const keep = planRowUpdate(
      row({ tags: "[]", former_tags: JSON.stringify([DENUVO_TAG]), denuvo_removed_at: AUG3, denuvo_removed_kind: "sourced", steam_drm_notice: "Denuvo" }),
      { status: "nomatch", reason: "no_page" },
      steamOk(null),
      NOW + 1e9,
    )!;
    expect(keep.sets.denuvo_removed_at).toBe(AUG3);
    expect(keep.sets.denuvo_removed_kind).toBe("sourced");
  });
});

describe("currently protected", () => {
  it("Far Cry Primal: Steam still lists Denuvo -> stays protected, nothing moved to former", () => {
    const p = planRowUpdate(row(), { status: "nomatch", reason: "appid_mismatch" }, steamOk("Denuvo Anti-tamper<br>5 different PC within a day"), NOW)!;
    expect(p.decision.state).toBe("present");
    expect(p.sets.tags).toBeUndefined(); // already has it
    expect(p.sets.former_tags).toBeUndefined();
    expect(p.sets.steam_drm_notice).toContain("Denuvo");
  });

  it("a Steam-only sweep flags a newly Denuvo'd title", () => {
    const p = planRowUpdate(row({ tags: JSON.stringify(["Steam DRM"]), denuvo_watch: 0 }), undefined, steamOk("Denuvo Anti-tamper"), NOW)!;
    expect(JSON.parse(p.sets.tags as string)).toContain(DENUVO_TAG);
    expect(p.sets.denuvo_watch).toBe(1);
  });

  it("DRAGON BALL FighterZ: empty Steam notice with no prior Denuvo is NO SIGNAL; PCGamingWiki says it uses Denuvo -> stays protected", () => {
    const stored = row({ tags: JSON.stringify(["Easy Anti-Cheat", "Steam DRM"]), steam_drm_notice: null });
    const p = planRowUpdate(stored, pcgwMatch({ uses: true, tags: ["Denuvo Anti-Tamper", "Easy Anti-Cheat", "Steam DRM"], complete: true }), steamOk(null), NOW)!;
    expect(p.decision.state).toBe("present");
    expect(JSON.parse(p.sets.tags as string)).toEqual([DENUVO_TAG, "Easy Anti-Cheat", "Steam DRM"]);
    expect(p.sets.former_tags).toBeUndefined();
    expect(p.sets.denuvo_removed_at).toBeUndefined();
    expect(p.sets.steam_drm_notice).toBe(""); // stored as an observation, not as evidence
  });

  it("an empty notice we previously stored as EMPTY is still no signal (not a removal)", () => {
    const p = planRowUpdate(row({ steam_drm_notice: "" }), pcgwMatch({ uses: true }), steamOk(null), NOW)!;
    expect(p.decision.state).toBe("present");
  });

  it("empty Steam notice, no prior Denuvo, and no verified PCGamingWiki page -> unknown: nothing changes", () => {
    const p = planRowUpdate(row(), { status: "nomatch", reason: "no_page" }, steamOk(null), NOW)!;
    expect(p.decision.state).toBe("unknown");
    expect(p.sets.tags).toBeUndefined();
  });

  it("a verified PCGamingWiki page that no longer mentions Denuvo (and no removal) drops the tag, without calling it a removal", () => {
    const p = planRowUpdate(row(), pcgwMatch({ uses: false }), steamOk(null), NOW)!;
    expect(p.decision.state).toBe("absent");
    expect(JSON.parse(p.sets.tags as string)).toEqual(["Steam DRM"]);
    expect(p.sets.former_tags).toBeUndefined();
    expect(p.sets.denuvo_removed_at).toBeUndefined();
  });

  it("PCGamingWiki alone (Steam failed) can keep a title protected", () => {
    const p = planRowUpdate(row(), pcgwMatch({ uses: true }), failedSteam, NOW)!;
    expect(p.decision.state).toBe("present");
  });
});

describe("non-Denuvo tags from the same wikitext", () => {
  const base = row({ tags: JSON.stringify(["Always online", "BattlEye", "Steam DRM"]), denuvo_watch: 0 });

  it("a complete, matched page is authoritative: a tag it no longer lists drops, new ones are added", () => {
    const p = planRowUpdate(base, pcgwMatch({ tags: ["Steam DRM", "Easy Anti-Cheat"], complete: true }), steamOk(null), NOW)!;
    expect(JSON.parse(p.sets.tags as string).sort()).toEqual(["Easy Anti-Cheat", "Steam DRM"]);
  });

  it("an incomplete parse can only add, never drop", () => {
    const p = planRowUpdate(base, pcgwMatch({ tags: ["Easy Anti-Cheat"], complete: false }), steamOk(null), NOW)!;
    expect(JSON.parse(p.sets.tags as string).sort()).toEqual(["Always online", "BattlEye", "Easy Anti-Cheat", "Steam DRM"]);
  });

  it("a failed or unmatched lookup never overwrites tags", () => {
    expect(planRowUpdate(base, failedPcgw, failedSteam, NOW)).toBeNull();
    const p = planRowUpdate(base, { status: "nomatch", reason: "appid_mismatch" }, steamOk(null), NOW)!;
    expect(p.sets.tags).toBeUndefined();
  });

  it("a deferred (budget) lookup writes nothing", () => {
    expect(planRowUpdate(base, { status: "deferred" }, { status: "deferred" }, NOW)).toBeNull();
  });

  it("writes nothing when the page agrees with what is stored", () => {
    const p = planRowUpdate(base, pcgwMatch({ tags: ["Steam DRM", "Always online", "BattlEye"], complete: true }), steamOk(null), NOW)!;
    expect(p.sets.tags).toBeUndefined();
  });
});

describe("stored tag hygiene", () => {
  it("cleans stored junk even when the page parse is incomplete (names that were never protection schemes)", () => {
    const stored = row({ tags: JSON.stringify(["Origin", "MacApp", "Unknown", "8.13.0066", "Steam DRM", "Always online"]), denuvo_watch: 0 });
    const p = planRowUpdate(stored, pcgwMatch({ tags: [], complete: false }), steamOk(null), NOW)!;
    expect(JSON.parse(p.sets.tags as string).sort()).toEqual(["Always online", "EA app", "Steam DRM"]);
  });
});
