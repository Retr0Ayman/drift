import { normalizeTags, type PcgwOutcome } from "./pcgamingwiki";
import { noticeListsDenuvo, type SteamNotice } from "./steamDrm";

export const DENUVO_TAG = "Denuvo Anti-Tamper";

/* Decision rules (owner-approved 2026-11-05):

   REMOVED   = PCGamingWiki has an explicit {{Removed DRM|Denuvo...}} WITH a
               source ref, OR a Steam drm_notice that previously listed
               Denuvo no longer does (a directly observed transition).
   DATE      = the dated primary-source ref from PCGamingWiki when present
               (kind "sourced"); otherwise our own detection time (kind
               "detected"). Never guessed.
   CONFLICT  = PCGamingWiki says removed but Steam's page still lists
               Denuvo: shown as removed, flagged, and logged -- not hidden.
   PRESENT   = Steam's notice lists Denuvo, or (Steam silent) the
               appid-verified PCGamingWiki page lists it.
   NO SIGNAL = an empty Steam notice is NOT evidence of absence unless we
               previously stored that same notice listing Denuvo (that is a
               removal transition). Fixed 2026-11-05 after DRAGON BALL
               FighterZ fell out of "protected" on an empty notice alone.
   UNKNOWN   = no source gave usable evidence: change nothing.

   Nothing is ever moved to "former" without one of the two removal
   evidences above. */

export type DenuvoState = "present" | "removed" | "absent" | "unknown";

export interface PcgwEvidence {
  status: "match" | "nomatch" | "failed" | "skipped";
  usesDenuvo?: boolean;
  removed?: { hasRef: boolean; dateMs: number | null; url: string | null } | null;
}

export interface SteamEvidence {
  status: "ok" | "unavailable" | "failed" | "skipped";
  lists?: boolean;
}

export interface DecisionInput {
  /* Did the previously stored Steam notice list Denuvo? null = never fetched. */
  prevSteamListed: boolean | null;
  stored: { removedAt: number | null; kind: "sourced" | "detected" | null };
  pcgw: PcgwEvidence;
  steam: SteamEvidence;
  now: number;
}

export interface Decision {
  state: DenuvoState;
  conflict: boolean;
  removal?: { at: number; kind: "sourced" | "detected"; source: "pcgamingwiki" | "steam" | "both"; url: string | null };
  note: string;
}

export function decideDenuvo(i: DecisionInput): Decision {
  const pcgwInfo = i.pcgw.status === "match";
  const steamInfo = i.steam.status === "ok";
  if (!pcgwInfo && !steamInfo) return { state: "unknown", conflict: false, note: "no source gave a usable answer" };

  const pcgwRemoved = pcgwInfo && !!i.pcgw.removed && i.pcgw.removed.hasRef;
  const steamRemoved = steamInfo && i.prevSteamListed === true && !i.steam.lists;

  if (pcgwRemoved || steamRemoved) {
    const conflict = pcgwRemoved && steamInfo && !!i.steam.lists;
    const sourcedDate = pcgwRemoved ? i.pcgw.removed!.dateMs : null;
    const source: "pcgamingwiki" | "steam" | "both" = pcgwRemoved && steamRemoved ? "both" : pcgwRemoved ? "pcgamingwiki" : "steam";
    const url = pcgwRemoved ? i.pcgw.removed!.url : null;
    let at: number;
    let kind: "sourced" | "detected";
    if (sourcedDate != null) {
      at = sourcedDate;
      kind = "sourced";
    } else if (i.stored.removedAt != null) {
      // Keep the first detection; only a sourced date may replace it (below).
      at = i.stored.removedAt;
      kind = i.stored.kind === "sourced" ? "sourced" : "detected";
    } else {
      at = i.now;
      kind = "detected";
    }
    // A stored sourced date is never replaced by a later detection time.
    if (i.stored.removedAt != null && i.stored.kind === "sourced" && sourcedDate == null) {
      at = i.stored.removedAt;
      kind = "sourced";
    }
    return { state: "removed", conflict, removal: { at, kind, source, url }, note: conflict ? "pcgamingwiki says removed, steam notice still lists denuvo" : "removed" };
  }

  // Not removed. Steam listing Denuvo is direct evidence of protection.
  if (steamInfo && i.steam.lists) return { state: "present", conflict: false, note: "steam notice lists denuvo" };

  // An empty Steam notice with no earlier Denuvo listing is "no signal": the
  // appid-verified PCGamingWiki page decides, if we have one.
  if (pcgwInfo) {
    return i.pcgw.usesDenuvo
      ? { state: "present", conflict: false, note: "pcgamingwiki lists denuvo (steam notice is empty: no signal)" }
      : { state: "absent", conflict: false, note: "verified pcgamingwiki page does not list denuvo and no source reports a removal" };
  }
  return { state: "unknown", conflict: false, note: "steam notice is empty (no signal) and no verified pcgamingwiki page" };
}

export function evidenceFromPcgw(o: PcgwOutcome | undefined): PcgwEvidence {
  if (!o || o.status === "deferred") return { status: "skipped" };
  if (o.status === "match") return { status: "match", usesDenuvo: o.parsed.usesDenuvo, removed: o.parsed.removedDenuvo };
  return { status: o.status === "nomatch" ? "nomatch" : "failed" };
}

export function evidenceFromSteam(s: SteamNotice | undefined): SteamEvidence {
  if (!s || s.status === "deferred") return { status: "skipped" };
  if (s.status === "ok") return { status: "ok", lists: noticeListsDenuvo(s.notice) };
  return { status: s.status === "unavailable" ? "unavailable" : "failed" };
}

export interface StoredRow {
  tags: string | null;
  former_tags: string | null;
  steam_drm_notice: string | null;
  pcgw_page: string | null;
  denuvo_watch: number;
  denuvo_removed_at: number | null;
  denuvo_removed_kind: string | null;
}

const parseList = (raw: string | null): string[] => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/* The column updates for one recheck of one row, or null when NO source
   gave a real answer -- in which case nothing at all is written, and in
   particular drm_checked_at is NOT stamped, so a failed lookup can never
   masquerade as "checked, nothing changed". "No PCGamingWiki page" and
   "Steam has no data for this app" ARE real answers and do stamp. */
export function planRowUpdate(
  row: StoredRow,
  pcgw: PcgwOutcome | undefined,
  steam: SteamNotice | undefined,
  now: number,
): { sets: Record<string, string | number | null>; decision: Decision } | null {
  const pe = evidenceFromPcgw(pcgw);
  const se = evidenceFromSteam(steam);
  const pcgwReal = pe.status === "match" || pe.status === "nomatch";
  const steamReal = se.status === "ok" || se.status === "unavailable";
  if (!pcgwReal && !steamReal) return null;

  const decision = decideDenuvo({
    prevSteamListed: row.steam_drm_notice == null ? null : noticeListsDenuvo(row.steam_drm_notice),
    stored: { removedAt: row.denuvo_removed_at, kind: row.denuvo_removed_kind === "sourced" ? "sourced" : row.denuvo_removed_at != null ? "detected" : null },
    pcgw: pe,
    steam: se,
    now,
  });

  const sets: Record<string, string | number | null> = { drm_checked_at: now };
  if (steamReal) sets.steam_drm_checked_at = now;
  if (steam?.status === "ok") sets.steam_drm_notice = steam.notice ?? "";
  if (pcgw?.status === "match") sets.pcgw_page = pcgw.page;

  const tags = parseList(row.tags);
  const former = parseList(row.former_tags);

  // Non-Denuvo tags come from the same appid-verified wikitext (no extra
  // request). A stored tag drops only when a COMPLETE page parse (Availability
  // table + anticheat field both present) no longer lists it; otherwise the
  // page can only add. A failed / unmatched / deferred lookup never touches them.
  const storedOther = normalizeTags(tags.filter((t) => t !== DENUVO_TAG));
  let other = storedOther;
  let formerOther = former.filter((t) => t !== DENUVO_TAG);
  if (pcgw?.status === "match") {
    const pageOther = pcgw.parsed.tags.filter((t) => t !== DENUVO_TAG);
    other = pcgw.parsed.complete ? pageOther : [...new Set([...storedOther, ...pageOther])];
    formerOther = [...new Set([...formerOther, ...pcgw.parsed.formerTags.filter((t) => t !== DENUVO_TAG)])];
  }

  let denuvoNow = tags.includes(DENUVO_TAG);
  let denuvoFormer = former.includes(DENUVO_TAG);
  if (decision.state === "present") {
    denuvoNow = true;
    sets.denuvo_watch = 1;
    sets.denuvo_conflict = 0;
  } else if (decision.state === "removed" && decision.removal) {
    denuvoNow = false;
    denuvoFormer = true;
    sets.denuvo_watch = 1;
    sets.denuvo_conflict = decision.conflict ? 1 : 0;
    sets.denuvo_removed_at = decision.removal.at;
    sets.denuvo_removed_kind = decision.removal.kind;
    sets.denuvo_removed_source = decision.removal.source;
    sets.denuvo_removed_url = decision.removal.url;
  } else if (decision.state === "absent") {
    denuvoNow = false;
    sets.denuvo_conflict = 0;
  }

  const newTags = [...(denuvoNow ? [DENUVO_TAG] : []), ...other];
  const newFormer = [...(denuvoFormer ? [DENUVO_TAG] : []), ...formerOther];
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (!sameSet(newTags, tags)) sets.tags = JSON.stringify(newTags);
  if (!sameSet(newFormer, former)) sets.former_tags = JSON.stringify(newFormer);
  return { sets, decision };
}
