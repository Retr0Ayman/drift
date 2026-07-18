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
