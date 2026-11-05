/* Steam's own store-page DRM disclosure: appdetails' `drm_notice` (e.g.
   "Denuvo Anti-tamper<br>5 different PC within a day machine activation
   limit"). It's the publisher's own storefront disclosure, keyed by appid,
   and changes when Denuvo is patched out -- but publishers can leave it
   stale, so it's one signal, not proof (see denuvoDecision.ts). Field name
   and format verified live on 2026-11-05 against Far Cry Primal, Total War:
   WARHAMMER (both list Denuvo) and Atomic Heart / 007 First Light (empty). */

import { fetchWithRetry } from "../shared/fetchRetry";
import { isBudgetExceeded } from "../shared/subrequestBudget";

export type SteamNotice =
  | { status: "ok"; notice: string | null }
  /* Steam answered but has no data for this app (delisted / region-locked):
     a real answer, but says nothing about DRM. */
  | { status: "unavailable" }
  | { status: "failed"; httpStatus: number | null; reason: string }
  /* The invocation's subrequest budget ran out before this fetch: neither an
     answer nor a source failure; the row is simply retried next tick. */
  | { status: "deferred" };

export function interpretSteamReply(appid: number, status: number, text: string): SteamNotice {
  if (status !== 200) return { status: "failed", httpStatus: status, reason: `http_${status}` };
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "failed", httpStatus: status, reason: "parse_error" };
  }
  const entry = json && typeof json === "object" ? json[String(appid)] : null;
  if (!entry || typeof entry !== "object") return { status: "failed", httpStatus: status, reason: "bad_shape" };
  if (!entry.success || !entry.data) return { status: "unavailable" };
  const n = entry.data.drm_notice;
  return { status: "ok", notice: typeof n === "string" && n.trim() ? n : null };
}

export async function fetchSteamNotice(appid: number): Promise<SteamNotice> {
  try {
    const r = await fetchWithRetry(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en&filters=basic`);
    return interpretSteamReply(appid, r.status, await r.text());
  } catch (e) {
    if (isBudgetExceeded(e)) return { status: "deferred" };
    return { status: "failed", httpStatus: null, reason: e instanceof Error ? e.message : "network_error" };
  }
}

export const noticeListsDenuvo = (notice: string | null | undefined): boolean => !!notice && /denuvo/i.test(notice);
