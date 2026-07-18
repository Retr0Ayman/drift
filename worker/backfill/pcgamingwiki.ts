/* Real per-game DRM/protection lookup against PCGamingWiki's Cargo query
   API -- replaces the hardcoded ["Denuvo"] every game used to get (see
   db.ts's own fix). Schema confirmed live against the real API, not
   assumed: `cargotables`/`cargofields` were queried directly to find where
   DRM data actually lives (it's NOT a single obvious field -- Middleware's
   "Anticheat" field covers EAC/BattlEye but was null for known-Denuvo
   titles; the real field is Availability.Uses_DRM, joined off
   Infobox_game).

   Matching by title was tried first and rejected: PCGamingWiki's own page
   titles don't reliably match Steam's (confirmed live -- "Dragon's Dogma
   2" on Steam is titled "Dragon's Dogma II" here, a roman-numeral
   mismatch that would silently no-match a naive title lookup). Matching
   by Steam AppID via Infobox_game.Steam_AppID instead sidesteps every
   title-formatting difference -- every game this site tracks already has
   a real resolved appid by the time this runs. */

const CARGO_URL = "https://www.pcgamingwiki.com/w/api.php";

// Confirmed live via a 500-row group_by=Uses_DRM sample of the real
// Availability table: this field mixes genuine anti-tamper/protection
// schemes (Denuvo Anti-Tamper, VMProtect, StarForce, ...) in with plain
// storefront/launcher names. "Steam" specifically is ambiguous HERE
// (confirmed live: Stardew Valley and Baba Is You -- both genuinely
// DRM-free on Steam -- still list "Steam" once in this field, because
// Uses_DRM rolls every storefront's own Availability row into one
// comma list; a game on N storefronts gets N entries, and the Steam
// row's entry doesn't distinguish "has real Steam DRM" from "this row
// is just the Steam listing"). That ambiguity is why "Steam" stays
// filtered out of Uses_DRM's own real-tag list below -- but it's NOT why
// every Steam game shows "None confirmed" for Steam's own DRM: see
// Availability.Steam_DRM below, a separate dedicated field that resolves
// this precisely. Everything else in this set is genuine noise
// (storefront/launcher names, non-blocking markers) to filter out.
const STOREFRONT_NOISE = new Set([
  "Steam",
  "GOG.com",
  "GOG Galaxy",
  "Epic Games Launcher",
  "Epic Online Services",
  "Microsoft Store",
  "EA app",
  "Battle.net",
  "Bethesda.net",
  "Discord",
  "Twitch",
  "Twitch Desktop App",
  "Meta Store",
  "Mac App Store",
  "Ubisoft Connect",
  "Rockstar Games Launcher",
  "Games for Windows - LIVE",
  "Playfire Client",
  "Amazon",
  "Green Man Gaming",
  "Gamesplanet",
  "GamersGate",
  "Zoom Platform",
  "Viveport",
  "Humble Store",
  "itch.io",
  "DRM-free",
  "Physical",
  "Unknown",
  "Account",
  "CD key",
  "Online activation",
  "Activation limit",
  "Disc check",
  "Floppy check",
  "Dongle",
  "PCjr cartridge",
]);

function splitList(v: string | null | undefined): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* Uses_DRM is PCGamingWiki's current-state field, but "current" there means
   "as of whenever the page was last edited" -- it can still list a scheme
   that was later removed (confirmed live: Resident Evil Village's Denuvo
   shows up in Removed_DRM, not Uses_DRM, since Capcom patched it out --
   but the reverse ordering isn't guaranteed for every page, so anything
   present in Removed_DRM is excluded here regardless of which list it also
   appears in). Anticheat (Middleware table) is a separate concern from DRM
   entirely (EAC/BattlEye govern online play, not the executable's own
   anti-tamper) but is exactly the kind of "protection" info this site's
   field is for, so it's folded in too.

   steamDrm is Availability.Steam_DRM -- PCGamingWiki's dedicated field for
   the Steam release specifically, not the general storefront-rolled-up
   Uses_DRM above. Confirmed live against real pairs: Portal 2, Braid,
   Celeste, and Resident Evil Village (Denuvo already removed, per above)
   all show Steam_DRM: "Steam", a real Steamworks CEG wrapper; Stardew
   Valley, Baba Is You, and Hollow Knight -- all genuinely DRM-free even on
   Steam -- show Steam_DRM: "DRM-free". This is the actual signal Uses_DRM
   can't give reliably for "Steam" specifically (see this file's own
   STOREFRONT_NOISE comment), so it's trusted directly rather than inferred
   from the noisy aggregate. */
export function classifyDrm(usesDrm: string | null, removedDrm: string | null, anticheat: string | null, steamDrm: string | null): string[] {
  const removed = new Set(splitList(removedDrm));
  const real = splitList(usesDrm).filter((v) => !STOREFRONT_NOISE.has(v) && !removed.has(v));
  const ac = splitList(anticheat);
  const steamHasDrm = splitList(steamDrm).includes("Steam") && !removed.has("Steam");
  return [...new Set([...real, ...ac, ...(steamHasDrm ? ["Steam DRM"] : [])])];
}

interface CargoRow {
  title: {
    AppID?: string | null;
    "Uses DRM"?: string | null;
    "Removed DRM"?: string | null;
    Anticheat?: string | null;
    "Steam DRM"?: string | null;
  };
}

interface CargoResponse {
  cargoquery?: CargoRow[];
  error?: { info?: string };
}

// Conservative batch size -- PCGamingWiki is a community wiki with no
// documented rate-limit contract, not a dedicated API service. Each OR
// clause is short (~40 chars), so even a much larger batch would stay well
// under any URL/body limit; this is about being a considerate caller, not
// a technical ceiling.
const BATCH_SIZE = 25;

/* Looks up real DRM/protection tags for a batch of Steam appids in as few
   Cargo queries as possible (one query per BATCH_SIZE appids via chained
   OR HOLDS clauses -- Cargo's own "HOLDS ONE OF (...)" syntax doesn't
   exist, confirmed live it 500s with an "OF() not allowed" error).
   Appids with no PCGamingWiki page, or where the query itself fails, are
   simply absent from the returned map -- same honesty rule as the rest of
   this codebase: no match or a failed call means the caller gets nothing
   back for that appid, never a fabricated guess. */
export async function lookupDrmForAppids(appids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  for (let i = 0; i < appids.length; i += BATCH_SIZE) {
    const chunk = appids.slice(i, i + BATCH_SIZE);
    const where = chunk.map((id) => `Infobox_game.Steam_AppID HOLDS "${id}"`).join(" OR ");
    try {
      const r = await fetch(CARGO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "cargoquery",
          tables: "Infobox_game,Availability,Middleware",
          join_on: "Infobox_game._pageName=Availability._pageName,Infobox_game._pageName=Middleware._pageName",
          fields: "Infobox_game.Steam_AppID=AppID,Availability.Uses_DRM,Availability.Removed_DRM,Middleware.Anticheat,Availability.Steam_DRM",
          where,
          limit: String(BATCH_SIZE * 2), // a page can legitimately list >1 appid (bundles/demos), headroom not a hard cap assumption
          format: "json",
        }),
      });
      if (!r.ok) continue;
      const data = (await r.json()) as CargoResponse;
      if (data.error) continue;
      for (const row of data.cargoquery || []) {
        const tags = classifyDrm(row.title["Uses DRM"] ?? null, row.title["Removed DRM"] ?? null, row.title.Anticheat ?? null, row.title["Steam DRM"] ?? null);
        for (const idStr of splitList(row.title.AppID)) {
          const id = Number(idStr);
          if (chunk.includes(id)) out.set(id, tags);
        }
      }
    } catch {
      // one chunk failing (network blip, malformed response) must not lose
      // appids already resolved from earlier chunks in this same call
    }
  }
  return out;
}
