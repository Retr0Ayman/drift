/* Mirrors src/lib/constants.ts -- the worker and frontend bundle
   independently (wrangler vs. Vite, see the note atop worker/shared/types.ts),
   so this is a deliberate, small, hand-synced copy of just what
   worker/scheduled.ts needs (which starred P2P groups to poll, and how to
   classify a release the same honest way the frontend does) rather than a
   cross-directory import that would couple the two build boundaries. Keep
   both files in sync by hand if either list ever changes. */
export const STARRED_GROUPS = ["voices38", "DenuvOwO"];

const normGroup = (g: string): string => (g || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const GROUP_METHOD: Record<string, "hv" | "trad"> = {
  denuvowo: "hv",
  "0xzeon": "hv",
  "0xze0n": "hv",
  voices38: "trad",
  rune: "trad",
  empress: "trad",
  cpy: "trad",
  codex: "trad",
  flt: "trad",
  tenoke: "trad",
  skidrow: "trad",
};

export const methodForGroup = (g: string): "hv" | "trad" => GROUP_METHOD[normGroup(g)] || "trad";

const REPACK_GROUPS = new Set(
  ["ElAmigos", "FitGirl", "DODI", "x.X.RIDDICK.X.x", "RIDDICK", "KaOsKrew"].map(normGroup),
);

export const isRepackGroup = (g: string): boolean => REPACK_GROUPS.has(normGroup(g));

export const isAnonymousUpload = (g: string): boolean => normGroup(g) === "p2p";

/* PLAYMAGiC is not a release group at all -- confirmed live (real friend-
   reported tip, then verified against production D1 via /api/catalog):
   it's a trainer-making outfit (game trainers/mods, e.g. "THIEF.Definitive.
   Edition.Plus.6.Trainer-PLAYMAGiC"), yet xREL itself files these under
   ext_info.type "master_game" just like a real crack, so they were passing
   groupRowsByTitle's "real Windows master_game" filter and landing in D1
   crediting PLAYMAGiC as if it had cracked Thief, Tales of Xillia
   Remastered, Dragon Age: The Veilguard, Need for Speed Rivals, and Max
   Payne 3 (all 5 confirmed live before migrations/0007 removed the already-
   polluted rows). This is a data-quality exclusion, not a category like
   is_repack/isAnonymousUpload -- a trainer isn't a crack OR a repack of
   one, it has no business being tracked as a release at all. */
export const isTrainerGroup = (g: string): boolean => normGroup(g) === "playmagic";

/* P2P/non-scene classification for the Groups page's P2P-vs-Scene filter --
   deliberately separate from STARRED_GROUPS above, which exists only to
   decide "does this group need direct/individual xREL polling because it's
   invisible to the main browse feed" (a data-completeness concern). This
   list answers a different question -- "is this group's distribution
   channel genuinely P2P/non-scene, so the badge on its card should say
   P2P, not Scene" -- for groups that already have real presence in D1 via
   the deep/archive backfills (title-search-driven, so P2P repacks/cracks
   of already-known titles get swept in) without needing to be starred.
   Every name here is confirmed-live, same "extend it, never guess at it"
   bar REPACK_GROUPS already holds itself to -- verified two ways: (a)
   real, exact-group-name release rows exist in xREL's search API, and
   (b) those rows come back in xREL's own `p2p_results` bucket, not
   `results` (scene), which is xREL's own real classification, not a
   guess layered on top of it. GOG/Black_Box/3DM/FCKDRM were checked the
   same way and dropped: GOG and Black_Box never turned up as a real
   group_name at all (only as an unrelated installer tag / TV show), 3DM's
   matches were all a different "3DMax"/"3DMark" group/software, and
   FCKDRM's real releases come back overwhelmingly in xREL's own `results`
   (scene) bucket, not `p2p_results` -- so FCKDRM is genuinely scene, not
   P2P, and stays unclassified (defaults to Scene) rather than being
   force-fit onto this list. EMPRESS is the one surprise from that same
   live check: assumed scene going in, but its real releases come back
   entirely under `p2p_results` too -- EMPRESS is independent/P2P-
   distributed by xREL's own data, not scene, even though its crack
   METHOD (methodForGroup below) is still correctly "trad". */
const P2P_GROUPS = new Set([...REPACK_GROUPS, ...["ShadowEagle", "ALI213", "RVTFiX", "EMPRESS"].map(normGroup)]);

export const isP2PGroup = (g: string): boolean => P2P_GROUPS.has(normGroup(g)) || STARRED_GROUPS.map(normGroup).includes(normGroup(g));

/* Confirmed live: some P2P groups (e.g. golemnight) dump console games
   under Sony's own internal content-ID prefixes instead of writing a
   literal platform name in the dirname -- "The.Witcher.3.Wild.Hunt.GOTY.
   Multi.CUSA05573-Golemnight" (PS4/PS5) and "Grand.Theft.Auto.V.Multi.
   BLES01807.341.355.4XX.CFW-golemnight" (PS3, plus the "CFW" custom-
   firmware marker) both matched none of the platform-name tokens below and
   were showing up as tracked Windows crack releases across 17 different
   games from this one group alone. cusa/ppsa (PS4/PS5) and bces/bcus/
   bles/blus/bcjs (PS3) are Sony's real, stable content-ID prefixes, not a
   guess -- always followed by digits in practice, so matched as one token
   with the digits included (the digits themselves aren't in the
   delimiter set, so a plain "cusa" alternative wouldn't reach the closing
   boundary).

   FIX (confirmed live, follow-up sweep after the above): the same class of
   miss existed for older Nintendo consoles too -- "Batman.Arkham.Origins.
   Blackgate.EUR.3DS-CONTRAST" and "Call.of.Duty.Black.Ops.2.USA.WiiU-FAKE"
   (that group's real name, not a description) were both tracked as Windows
   releases. Rather than wait for the next one-off report, added the full
   set of legacy Nintendo/Sony disc-scene platform tokens this same P2P
   scene is evidently willing to dump -- wii/wiiu/3ds/n64/snes/nes/gba/gbc/
   nds/dsi/psx/ps1 -- since a scene that dumps PS3/PS4/PS5/3DS/WiiU under
   one game's history is not going to stop at exactly those five.

   FIX (confirmed live, Forza franchise-completeness sweep): `xbox(?:360|
   one|series)?` only matched the bare word or those three exact suffixes
   followed by a real delimiter -- original-Xbox disc dumps tag the token
   as "XBOXDVD" with no delimiter in between ("Forza_Motorsport_USA_
   XBOXDVD-CDZ", also seen on Splinter Cell: Double Agent and Need for
   Speed: Most Wanted releases), so the required trailing `([._-]|$)`
   never matched and these slipped through as "Windows" releases -- one
   of them a 2005 original-Xbox dump wrongly attached to the 2023 Forza
   Motorsport reboot's Steam listing. Changed to `xbox\w*` (any suffix,
   not just the three known modern-console ones) so it still requires the
   "xbox" prefix at a real token boundary but no longer cares what follows
   before the next delimiter. Mirrors the same fix in src/lib/constants.ts. */
const NON_WINDOWS_PLATFORM =
  /(^|[._-])(nsw|switch|ps[2-5]|psvita|xbox\w*|linux|mac[._-]?os|osx|cusa\d+|ppsa\d+|b[lc][eu]s\d+|bcjs\d+|cfw|wiiu|wii|3ds|n64|snes|nes|gba|gbc|nds|dsi|psx|ps1)([._-]|$)/i;

export const isWindowsRelease = (dirname: string): boolean => !NON_WINDOWS_PLATFORM.test(dirname || "");
