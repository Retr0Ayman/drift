/* Config list of starred groups (slugified) -- star badge, sorted to top of
   the Groups grid, distinct card treatment. Start with voices38 and
   DenuvOwO per the P2P-groups fix (see worker/routes/xrel/group.ts): these
   two never show up via the main Windows browse feed at all, only through
   the targeted per-group lookup, so they're the groups most worth pinning. */
export const STARRED_GROUPS = ["voices38", "denuvowo"];

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

/* Curated, well-documented repack groups -- these take an existing crack
   (someone else's DRM bypass) and rebundle the whole game into a compressed
   installer, they don't do the bypass themselves. Confirmed live example:
   AC Black Flag Resynced's xREL entries include a genuine 8MB DenuvOwO
   bypass release, then 40-65GB "releases" from P2P/ElAmigos/RIDDICK that
   are really just repacks of that same bypass. Crediting a repack group as
   if it cracked the game is a real, verifiable mislabel -- this list is
   only groups whose repack-only identity is public/well-known, same
   honesty bar as everywhere else in this file: extend it, never guess at
   it. group_name "P2P" itself is xREL's own placeholder for an anonymous/
   unattributed upload, not an actual group -- treated the same way (no
   crack credit implied) via isAnonymousUpload below. */
const REPACK_GROUPS = new Set(
  ["ElAmigos", "FitGirl", "DODI", "x.X.RIDDICK.X.x", "RIDDICK", "KaOsKrew"].map(normGroup),
);

export const isRepackGroup = (g: string): boolean => REPACK_GROUPS.has(normGroup(g));

export const isAnonymousUpload = (g: string): boolean => normGroup(g) === "p2p";

/* PLAYMAGiC is not a release group at all -- confirmed live: it's a
   trainer-making outfit (game trainers/mods, e.g. "THIEF.Definitive.
   Edition.Plus.6.Trainer-PLAYMAGiC"), not a crack/repack group, yet xREL
   files these under ext_info.type "master_game" just like a real crack.
   Mirrors worker/shared/constants.ts's own copy -- see that file's comment
   for the full confirmed-live investigation (5 real games in production D1
   had a PLAYMAGiC row before migrations/0007 removed them). */
export const isTrainerGroup = (g: string): boolean => normGroup(g) === "playmagic";

/* P2P/non-scene classification for the Groups page's P2P-vs-Scene filter --
   mirrors worker/shared/constants.ts's own P2P_GROUPS; see that file's
   comment for the full confirmed-live investigation (which candidates were
   verified real via xREL's own scene-vs-p2p_results split, and which ones
   -- GOG, Black_Box, 3DM, FCKDRM -- were checked and dropped for not
   holding up against real data). Deliberately separate from STARRED_GROUPS
   above: starring is about polling groups xREL's browse feed can't reach,
   this is about which already-tracked groups' badge should say P2P. */
const P2P_GROUPS = new Set([...REPACK_GROUPS, ...["ShadowEagle", "ALI213", "RVTFiX", "EMPRESS"].map(normGroup)]);

export const isP2PGroup = (g: string): boolean =>
  P2P_GROUPS.has(normGroup(g)) || STARRED_GROUPS.map(normGroup).includes(normGroup(g));

/* This is a Windows/Steam-build tracker specifically -- a release tagged
   for another platform has nothing to do with the Steam Windows build being
   compared against, and showing one as if it were a PC crack is actively
   misleading. Confirmed live: Civilization VII's search-driven detail page
   was showing a VENOM release as its only "crack option", credited as a
   Traditional Windows crack -- the dirname was
   "...Update.v1.4.1.1_NSW-VENOM", NSW meaning Nintendo Switch. Scene naming
   convention always tags a non-Windows platform explicitly (NSW, PS4, PS5,
   XBOX, Linux, MacOS/OSX); a release with none of those tags is the
   default-assumed Windows/PC case, so this only ever excludes, never
   requires, a "Windows" tag to be present.

   NOT \b-delimited: scene dirnames separate tokens with underscores
   ("..._NSW-VENOM") and JS regex treats "_" as a word character, so a
   naive \bnsw\b never matched "_NSW-" at all -- confirmed live, this exact
   miss let both a VENOM NSW release and two Linux releases (RazorDOX,
   Razor1911) straight through the first version of this filter for the
   same Civilization VII case above. Matches on the real scene separators
   (., _, -, or string start/end) instead. */
/* FIX (confirmed live, QA sweep): some P2P groups (e.g. golemnight) dump
   console games under Sony's own internal content-ID prefixes instead of
   a literal platform name -- "The.Witcher.3.Wild.Hunt.GOTY.Multi.
   CUSA05573-Golemnight" (PS4/PS5) and "Grand.Theft.Auto.V.Multi.
   BLES01807.341.355.4XX.CFW-golemnight" (PS3, plus the "CFW" custom-
   firmware marker) both matched none of the tokens above and were slipping
   through as tracked Windows crack releases across 17 different games from
   this one group alone. cusa/ppsa (PS4/PS5) and bces/bcus/bles/blus/bcjs
   (PS3) are Sony's real, stable content-ID prefixes, not a guess -- always
   followed by digits in practice, matched as one token including the
   digits since they aren't in the delimiter set.

   FIX (confirmed live, follow-up sweep): the same class of miss existed for
   older Nintendo consoles too -- "Batman.Arkham.Origins.Blackgate.EUR.
   3DS-CONTRAST" and "Call.of.Duty.Black.Ops.2.USA.WiiU-FAKE" (that group's
   real name) were both tracked as Windows releases. Added the full set of
   legacy Nintendo/Sony disc-scene platform tokens this same P2P scene is
   evidently willing to dump -- a scene dumping PS3/PS4/PS5/3DS/WiiU under
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
   "xbox" prefix at a real token boundary but no longer cares what
   follows before the next delimiter. */
const NON_WINDOWS_PLATFORM =
  /(^|[._-])(nsw|switch|ps[2-5]|psvita|xbox\w*|linux|mac[._-]?os|osx|cusa\d+|ppsa\d+|b[lc][eu]s\d+|bcjs\d+|cfw|wiiu|wii|3ds|n64|snes|nes|gba|gbc|nds|dsi|psx|ps1)([._-]|$)/i;

export const isWindowsRelease = (dirname: string): boolean => !NON_WINDOWS_PLATFORM.test(dirname || "");
