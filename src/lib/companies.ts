import type { Game } from "../types/game";
import { slugify } from "./format";

/* Curated publisher -> domain map for real company icons. Steam's storefront
   API doesn't expose publisher/developer logos directly, so this is the
   only honest option: a real icon for names we've actually mapped to a
   real domain, and a generated initials badge (same pattern as group
   avatars) for anything not in this list -- never a guessed/scraped image.
   Keys are normalized (lowercase, trimmed) publisher strings as they
   actually appear in Steam data; extend as new publishers show up.

   NOTE: originally wired to Clearbit's public logo API
   (logo.clearbit.com/{domain}) as specified, but that domain no longer
   resolves at all (confirmed via direct DNS lookup -- not a sandbox
   restriction, since other domains resolved fine in the same test).
   Clearbit's free anonymous logo endpoint appears to have been discontinued.
   Swapped to Google's public favicon service instead
   (google.com/s2/favicons -> gstatic.com/faviconV2), verified live to
   return real PNG icons for the exact domains below, also no key needed.
   It's a favicon, not a dedicated brand-logo asset, so quality is lower
   fidelity than Clearbit would have been -- worth real logo assets from
   Ayman later if that matters more than this note suggests. */
const PUBLISHER_DOMAINS: Record<string, string> = {
  ubisoft: "ubisoft.com",
  "electronic arts": "ea.com",
  "ea sports": "ea.com",
  capcom: "www.capcom.co.jp",
  "bandai namco entertainment": "bandainamcoent.com",
  "bandai namco studios": "bandainamcoent.com",
  "warner bros. games": "warnerbros.com",
  "2k": "2k.com",
  "take-two interactive": "take2games.com",
  "bethesda softworks": "bethesda.net",
  "square enix": "square-enix.com",
  "cd projekt red": "cdprojektred.com",
  krafton: "krafton.com",
  sega: "sega.com",
  activision: "activision.com",
  "rockstar games": "rockstargames.com",
  "focus entertainment": "focus-entmt.com",
  "devolver digital": "devolverdigital.com",
  "team17": "team17.com",
  "paradox interactive": "paradoxinteractive.com",
  "annapurna interactive": "annapurna.pictures",
  "private division": "privatedivision.com",
  "thq nordic": "thqnordic.com",
  "koei tecmo": "koeitecmoamerica.com",
  nintendo: "nintendo.com",
  "sony interactive entertainment": "playstation.com",
  "playstation studios": "playstation.com",
  microsoft: "xbox.com",
  "xbox game studios": "xbox.com",
  konami: "konami.com",
  "marvelous inc.": "marvelous-games.com",
  "spike chunsoft": "spike-chunsoft.com",
  "nis america": "nisamerica.com",
  "arc system works": "arcsystemworks.com",
  snk: "snk-corp.co.jp",
  "level-5": "level5.co.jp",
  atlus: "atlus.com",
  "kadokawa games": "kadokawa.co.jp",
  netmarble: "netmarble.com",
  ncsoft: "ncsoft.com",
  "pearl abyss": "pearlabyss.com",
  smilegate: "smilegate.com",
  hoyoverse: "hoyoverse.com",
  mihoyo: "hoyoverse.com",
  "netease games": "neteasegames.com",
  "tencent games": "tencent.com",
  perfectworld: "perfectworld.com",
  gameloft: "gameloft.com",
  "amazon games": "amazongames.com",
  "riot games": "riotgames.com",
  "epic games": "epicgames.com",
  valve: "valvesoftware.com",
  "blizzard entertainment": "blizzard.com",
  "deep silver": "deepsilver.com",
  plaion: "plaion.com",
  "coffee stain publishing": "coffeestainstudios.com",
  "raw fury": "rawfury.com",
  "11 bit studios": "11bitstudios.com",
  "ci games": "cigames.com",
  "techland publishing": "techland.net",
  "frontier foundry": "frontier.co.uk",
  rebellion: "rebellion.co.uk",
  "sold out": "soldoutsales.com",
  "curve games": "curve-games.com",
  kwalee: "kwalee.com",
  tinybuild: "tinybuild.com",
  "daedalic entertainment": "daedalic.com",
  "kalypso media": "kalypsomedia.com",
  "headup games": "headupgames.com",
  "merge games": "mergegames.com",
  "maximum games": "maximumgames.com",
  "gearbox publishing": "gearboxpublishing.com",
  "505 games": "505games.com",
  "nacon": "nacon.com",
  microids: "microids.com",
  "bigben interactive": "bigben.eu",
  "wired productions": "wiredproductions.com",
  marvelous: "marvelous-games.com",
  "aksys games": "aksysgames.com",
  "xseed games": "xseedgames.com",
  pqube: "pqube.co.uk",
  natsume: "natsume.com",
  "nippon ichi software": "nisamerica.com",
  "d3 publisher": "d3p.us",
  playism: "playism.com",
  "fellow traveller": "fellowtraveller.games",
  "chucklefish": "chucklefish.org",
  "no more robots": "nomorerobots.co.uk",
  "modus games": "modus.games",
  "kepler interactive": "kepler-interactive.com",
};

const normalize = (s: string): string => (s || "").trim().toLowerCase();

export function publisherDomain(publisher: string): string | null {
  return PUBLISHER_DOMAINS[normalize(publisher)] || null;
}

/* Curated AAA tier -- extendable, same honesty rule as everywhere else in
   this file: only publishers we can confidently name as AAA go here,
   everything else is "indie/other" rather than guessed. */
const AAA_PUBLISHERS = new Set<string>([
  "ubisoft",
  "electronic arts",
  "ea sports",
  "capcom",
  "bandai namco entertainment",
  "bandai namco studios",
  "warner bros. games",
  "2k",
  "take-two interactive",
  "bethesda softworks",
  "square enix",
  "cd projekt red",
  "krafton",
  "sega",
  "activision",
  "rockstar games",
  "nintendo",
  "sony interactive entertainment",
  "playstation studios",
  "microsoft",
  "xbox game studios",
  "konami",
  "netease games",
  "tencent games",
  "hoyoverse",
  "mihoyo",
  "epic games",
  "blizzard entertainment",
  "riot games",
  "ncsoft",
  "netmarble",
  "amazon games",
  "valve",
]);

export function isAaaPublisher(publisher: string): boolean {
  return AAA_PUBLISHERS.has(normalize(publisher));
}

/* Curated publisher -> HQ country, matching the exact Natural Earth country
   names used by the world-atlas TopoJSON (countries-110m.json's
   properties.name) so the world map's click-to-filter can match directly.
   No API gives us this -- same rule as the franchise map: only tag what's
   actually known, everything else stays "unknown region" rather than a
   guess. Extend as new publishers show up. */
const PUBLISHER_COUNTRY: Record<string, string> = {
  ubisoft: "France",
  "electronic arts": "United States of America",
  "ea sports": "United States of America",
  capcom: "Japan",
  "bandai namco entertainment": "Japan",
  "bandai namco studios": "Japan",
  "warner bros. games": "United States of America",
  "2k": "United States of America",
  "take-two interactive": "United States of America",
  "bethesda softworks": "United States of America",
  "square enix": "Japan",
  "cd projekt red": "Poland",
  krafton: "South Korea",
  sega: "Japan",
  activision: "United States of America",
  "rockstar games": "United States of America",
  "focus entertainment": "France",
  "devolver digital": "United States of America",
  team17: "United Kingdom",
  "paradox interactive": "Sweden",
  "annapurna interactive": "United States of America",
  "private division": "United States of America",
  "thq nordic": "Austria",
  "koei tecmo": "Japan",
  nintendo: "Japan",
  "sony interactive entertainment": "Japan",
  "playstation studios": "Japan",
  microsoft: "United States of America",
  "xbox game studios": "United States of America",
  konami: "Japan",
  "marvelous inc.": "Japan",
  "spike chunsoft": "Japan",
  "nis america": "United States of America",
  "arc system works": "Japan",
  snk: "Japan",
  "level-5": "Japan",
  atlus: "Japan",
  "kadokawa games": "Japan",
  netmarble: "South Korea",
  ncsoft: "South Korea",
  "pearl abyss": "South Korea",
  smilegate: "South Korea",
  hoyoverse: "China",
  mihoyo: "China",
  "netease games": "China",
  "tencent games": "China",
  perfectworld: "China",
  gameloft: "France",
  "amazon games": "United States of America",
  "riot games": "United States of America",
  "epic games": "United States of America",
  valve: "United States of America",
  "blizzard entertainment": "United States of America",
  "deep silver": "Austria",
  plaion: "Austria",
  "coffee stain publishing": "Sweden",
  "raw fury": "Sweden",
  "11 bit studios": "Poland",
  "ci games": "Poland",
  "techland publishing": "Poland",
  "frontier foundry": "United Kingdom",
  rebellion: "United Kingdom",
  "sold out": "United Kingdom",
  "curve games": "United Kingdom",
  kwalee: "United Kingdom",
  tinybuild: "United States of America",
  "daedalic entertainment": "Germany",
  "kalypso media": "Germany",
  "headup games": "Germany",
  "merge games": "United Kingdom",
  "maximum games": "United States of America",
  "gearbox publishing": "United States of America",
  "505 games": "Italy",
  nacon: "France",
  microids: "France",
  "bigben interactive": "France",
  "wired productions": "United Kingdom",
  marvelous: "Japan",
  "aksys games": "United States of America",
  "xseed games": "United States of America",
  pqube: "United Kingdom",
  natsume: "United States of America",
  "nippon ichi software": "Japan",
  "d3 publisher": "Japan",
  playism: "Japan",
  "fellow traveller": "Australia",
  chucklefish: "United Kingdom",
  "no more robots": "United Kingdom",
  "modus games": "United States of America",
  "kepler interactive": "United Kingdom",
};

export function publisherCountry(publisher: string): string | null {
  return PUBLISHER_COUNTRY[normalize(publisher)] || null;
}

export function companyIcon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/* Curated title -> franchise map, same pattern as methodForGroup: never
   auto-detect this by fuzzy title matching (same reasoning as never
   fabricating an appid match elsewhere in this project) -- a small,
   explicit, extensible list instead. Anything not in here renders as a
   standalone entry, not mis-grouped. Keys are normalized titles (trademark
   symbols stripped, trimmed, lowercased -- see normalizeTitle below).

   Organized by parent publisher in comments only (the map itself stays
   flat title->franchise, since grouping already happens per-publisher on
   PublisherProfile) so it reads as the real catalogue hierarchy it
   represents -- e.g. Ubisoft -> Assassin's Creed / Watch Dogs / Far Cry,
   each with the real entries in that sub-series, not just the newest one. */
const FRANCHISE_MAP: Record<string, string> = {
  // ---- Ubisoft ----
  "assassin's creed black flag resynced": "Assassin's Creed",
  "assassin's creed shadows": "Assassin's Creed",
  "assassin's creed valhalla": "Assassin's Creed",
  "assassin's creed mirage": "Assassin's Creed",
  "assassin's creed odyssey": "Assassin's Creed",
  "assassin's creed origins": "Assassin's Creed",
  "assassin's creed syndicate": "Assassin's Creed",
  "assassin's creed unity": "Assassin's Creed",
  "assassin's creed rogue": "Assassin's Creed",
  "assassin's creed 4 black flag": "Assassin's Creed",
  "assassin's creed iii": "Assassin's Creed",
  "assassin's creed iii: remastered": "Assassin's Creed",
  "assassin's creed brotherhood": "Assassin's Creed",
  "assassin's creed revelations": "Assassin's Creed",
  "assassin's creed ii": "Assassin's Creed",
  "assassin's creed": "Assassin's Creed",
  "assassin's creed: liberation hd": "Assassin's Creed",
  "watch dogs": "Watch Dogs",
  "watch dogs 2": "Watch Dogs",
  "watch dogs: legion": "Watch Dogs",
  "watch dogs legion": "Watch Dogs",
  "far cry 6": "Far Cry",
  "far cry 5": "Far Cry",
  "far cry 4": "Far Cry",
  "far cry 3": "Far Cry",
  "far cry 3: blood dragon": "Far Cry",
  "far cry primal": "Far Cry",
  "far cry new dawn": "Far Cry",
  "far cry 2": "Far Cry",
  "far cry": "Far Cry",
  "tom clancy's rainbow six siege": "Rainbow Six",
  "tom clancy's rainbow six siege x": "Rainbow Six",
  "tom clancy's rainbow six extraction": "Rainbow Six",
  "tom clancy's rainbow six vegas": "Rainbow Six",
  "tom clancy's rainbow six vegas 2": "Rainbow Six",
  "tom clancy's the division": "The Division",
  "tom clancy's the division 2": "The Division",
  "tom clancy's ghost recon breakpoint": "Ghost Recon",
  "tom clancy's ghost recon wildlands": "Ghost Recon",
  "tom clancy's ghost recon future soldier": "Ghost Recon",
  "tom clancy's splinter cell": "Splinter Cell",
  "splinter cell": "Splinter Cell",
  "tom clancy's splinter cell: chaos theory": "Splinter Cell",
  "tom clancy's splinter cell: blacklist": "Splinter Cell",
  "tom clancy's splinter cell: conviction": "Splinter Cell",
  "prince of persia: the lost crown": "Prince of Persia",
  "prince of persia: the sands of time remake": "Prince of Persia",
  "prince of persia: the sands of time": "Prince of Persia",
  "prince of persia: warrior within": "Prince of Persia",
  "prince of persia: the two thrones": "Prince of Persia",
  "prince of persia": "Prince of Persia",
  "star wars outlaws": "Star Wars (Ubisoft)",
  "just dance 2026": "Just Dance",
  "just dance 2025": "Just Dance",
  "for honor": "For Honor",
  "the crew motorfest": "The Crew",
  "the crew 2": "The Crew",
  "the crew": "The Crew",
  "anno 1800": "Anno",
  "anno 117: pax romana": "Anno",
  "trials rising": "Trials",
  "trials fusion": "Trials",
  "riders republic": "Riders Republic",

  // ---- EA ----
  "battlefield 6": "Battlefield",
  "battlefield 2042": "Battlefield",
  "battlefield v": "Battlefield",
  "battlefield 1": "Battlefield",
  "battlefield 4": "Battlefield",
  "battlefield 3": "Battlefield",
  "battlefield hardline": "Battlefield",
  "battlefield: bad company 2": "Battlefield",
  "need for speed unbound": "Need for Speed",
  "need for speed heat": "Need for Speed",
  "need for speed rivals": "Need for Speed",
  "need for speed payback": "Need for Speed",
  "need for speed most wanted": "Need for Speed",
  "the sims 4": "The Sims",
  "the sims 3": "The Sims",
  "the sims 2": "The Sims",
  "dead space": "Dead Space",
  "dead space (2023)": "Dead Space",
  "dead space 2": "Dead Space",
  "dead space 3": "Dead Space",
  "mass effect legendary edition": "Mass Effect",
  "mass effect: andromeda": "Mass Effect",
  "dragon age: the veilguard": "Dragon Age",
  "dragon age inquisition": "Dragon Age",
  "dragon age ii": "Dragon Age",
  "dragon age: origins": "Dragon Age",
  "star wars jedi: survivor": "Star Wars Jedi",
  "star wars jedi: fallen order": "Star Wars Jedi",
  "star wars jedi survivor": "Star Wars Jedi",
  "star wars battlefront ii": "Star Wars Battlefront",
  "star wars battlefront": "Star Wars Battlefront",
  "ea sports fc 26": "EA Sports FC",
  "ea sports fc 25": "EA Sports FC",
  "ea sports fc 24": "EA Sports FC",
  "fifa 23": "EA Sports FC",
  "fifa 22": "EA Sports FC",
  "fifa 21": "EA Sports FC",
  "fifa 20": "EA Sports FC",
  "fifa 19": "EA Sports FC",
  "fifa 18": "EA Sports FC",
  "fifa 17": "EA Sports FC",
  "fifa 16": "EA Sports FC",
  "fifa 15": "EA Sports FC",
  "madden nfl 26": "Madden NFL",
  "madden nfl 25": "Madden NFL",
  "madden nfl 24": "Madden NFL",
  "madden nfl 23": "Madden NFL",
  "madden nfl 22": "Madden NFL",
  "madden nfl 21": "Madden NFL",
  "madden nfl 20": "Madden NFL",
  "ea sports college football 27": "EA Sports College Football",
  "ea sports college football 26": "EA Sports College Football",
  "ea sports college football 25": "EA Sports College Football",
  "ncaa football 14": "EA Sports College Football",
  "ncaa football 13": "EA Sports College Football",
  "ncaa football 12": "EA Sports College Football",
  "ncaa football 11": "EA Sports College Football",
  "ncaa football 10": "EA Sports College Football",
  "nhl 26": "NHL",
  "nhl 25": "NHL",
  "apex legends": "Apex Legends / Titanfall",
  "titanfall 2": "Apex Legends / Titanfall",
  "titanfall": "Apex Legends / Titanfall",
  "it takes two": "EA Originals",
  "split fiction": "EA Originals",
  "a way out": "EA Originals",
  "unravel two": "EA Originals",
  "unravel": "EA Originals",
  "plants vs. zombies: garden warfare 2": "Plants vs. Zombies",
  "plants vs. zombies: garden warfare": "Plants vs. Zombies",
  "plants vs. zombies": "Plants vs. Zombies",
  "command & conquer remastered collection": "Command & Conquer",

  // ---- Activision Blizzard / Microsoft ----
  "call of duty: modern warfare 4": "Call of Duty",
  "call of duty: black ops 7": "Call of Duty",
  "call of duty: black ops 6": "Call of Duty",
  "call of duty: modern warfare iii": "Call of Duty",
  "call of duty: modern warfare ii": "Call of Duty",
  "call of duty: warzone": "Call of Duty",
  "call of duty: black ops cold war": "Call of Duty",
  "call of duty: modern warfare": "Call of Duty",
  "call of duty: black ops 4": "Call of Duty",
  "call of duty: vanguard": "Call of Duty",
  "call of duty: wwii": "Call of Duty",
  "diablo iv": "Diablo",
  "diablo immortal": "Diablo",
  "diablo iii": "Diablo",
  "diablo ii: resurrected": "Diablo",
  "overwatch 2": "Overwatch",
  "overwatch": "Overwatch",
  "crash bandicoot 4: it's about time": "Crash Bandicoot",
  "crash bandicoot n. sane trilogy": "Crash Bandicoot",
  "spyro reignited trilogy": "Spyro",
  "world of warcraft": "World of Warcraft",
  "starcraft ii": "StarCraft",
  "starcraft: remastered": "StarCraft",
  "hearthstone": "Hearthstone",
  "guitar hero live": "Guitar Hero",
  "tony hawk's pro skater 1 + 2": "Tony Hawk's Pro Skater",
  "halo: the master chief collection": "Halo",
  "halo infinite": "Halo",
  "gears 5": "Gears of War",
  "gears of war: e-day": "Gears of War",
  "gears of war: reloaded": "Gears of War",
  "forza motorsport": "Forza",
  "forza horizon 5": "Forza",
  "forza horizon 6": "Forza",
  "age of empires iv": "Age of Empires",
  "age of empires ii: definitive edition": "Age of Empires",
  "sea of thieves": "Sea of Thieves",
  "minecraft": "Minecraft",

  // ---- Take-Two / Rockstar / 2K ----
  "grand theft auto v": "Grand Theft Auto",
  "grand theft auto vi": "Grand Theft Auto",
  "grand theft auto: the trilogy": "Grand Theft Auto",
  "grand theft auto iv": "Grand Theft Auto",
  "red dead redemption 2": "Red Dead Redemption",
  "red dead redemption": "Red Dead Redemption",
  "l.a. noire": "L.A. Noire",
  "max payne 3": "Max Payne",
  "max payne": "Max Payne",
  "bioshock: the collection": "BioShock",
  "bioshock infinite": "BioShock",
  "borderlands 4": "Borderlands",
  "borderlands 3": "Borderlands",
  "borderlands 2": "Borderlands",
  "borderlands: the pre-sequel": "Borderlands",
  "borderlands: game of the year edition": "Borderlands",
  "mafia: the old country": "Mafia",
  "mafia iii: definitive edition": "Mafia",
  "mafia: definitive edition": "Mafia",
  "mafia ii: definitive edition": "Mafia",
  "nba 2k26": "NBA 2K",
  "nba 2k25": "NBA 2K",
  "nba 2k24": "NBA 2K",
  "nba 2k23": "NBA 2K",
  "nba 2k22": "NBA 2K",
  "wwe 2k26": "WWE 2K",
  "wwe 2k25": "WWE 2K",
  "wwe 2k24": "WWE 2K",
  "wwe 2k23": "WWE 2K",
  "sid meier's civilization vii": "Civilization",
  "sid meier's civilization vi": "Civilization",
  "sid meier's civilization v": "Civilization",
  "xcom 2": "XCOM",
  "xcom: enemy unknown": "XCOM",
  "kerbal space program 2": "Kerbal Space Program",
  "kerbal space program": "Kerbal Space Program",

  // ---- Square Enix ----
  "final fantasy vii rebirth": "Final Fantasy",
  "final fantasy xvi": "Final Fantasy",
  "final fantasy xiv online": "Final Fantasy",
  "final fantasy vii remake intergrade": "Final Fantasy",
  "final fantasy xv": "Final Fantasy",
  "final fantasy vii": "Final Fantasy",
  "kingdom hearts iii": "Kingdom Hearts",
  "kingdom hearts hd 1.5 + 2.5 remix": "Kingdom Hearts",
  "tomb raider": "Tomb Raider",
  "shadow of the tomb raider": "Tomb Raider",
  "rise of the tomb raider": "Tomb Raider",
  "deus ex: mankind divided": "Deus Ex",
  "deus ex: human revolution": "Deus Ex",
  "dragon quest xi s": "Dragon Quest",
  "dragon quest builders 2": "Dragon Quest",
  "nier: automata": "NieR",
  "nier replicant ver.1.22474487139...": "NieR",
  "just cause 4": "Just Cause",
  "just cause 3": "Just Cause",
  "life is strange 2": "Life is Strange",
  "life is strange: true colors": "Life is Strange",
  "life is strange": "Life is Strange",
  "outriders": "Outriders",

  // ---- Capcom ----
  "resident evil 4": "Resident Evil",
  "resident evil village": "Resident Evil",
  "resident evil requiem": "Resident Evil",
  "resident evil 2": "Resident Evil",
  "resident evil 3": "Resident Evil",
  "resident evil 7 biohazard": "Resident Evil",
  "resident evil 5": "Resident Evil",
  "resident evil 6": "Resident Evil",
  "resident evil 0": "Resident Evil",
  "resident evil: revelations": "Resident Evil",
  "resident evil: revelations 2": "Resident Evil",
  "monster hunter wilds": "Monster Hunter",
  "monster hunter rise": "Monster Hunter",
  "monster hunter: world": "Monster Hunter",
  "street fighter 6": "Street Fighter",
  "street fighter v": "Street Fighter",
  "devil may cry 5": "Devil May Cry",
  "devil may cry 4 special edition": "Devil May Cry",
  "dmc: devil may cry": "Devil May Cry",
  "devil may cry hd collection": "Devil May Cry",
  "mega man 11": "Mega Man",
  "mega man legacy collection": "Mega Man",
  "mega man x legacy collection": "Mega Man",
  "mega man x legacy collection 2": "Mega Man",
  "mega man zero/zx legacy collection": "Mega Man",
  "dragon's dogma 2": "Dragon's Dogma",
  "dragon's dogma: dark arisen": "Dragon's Dogma",
  "phoenix wright: ace attorney trilogy": "Ace Attorney",
  "the great ace attorney chronicles": "Ace Attorney",
  // Confirmed live: xREL's own ext_info.title for both tracked Onimusha
  // releases is real English, no alias needed -- a genuine total-absence
  // gap (like Forza's), not a title-matching one.
  "onimusha: warlords": "Onimusha",
  "onimusha 2: samurai's destiny": "Onimusha",

  // ---- Bandai Namco ----
  "tekken 8": "Tekken",
  "tekken 7": "Tekken",
  "elden ring": "Elden Ring / Dark Souls",
  "elden ring nightreign": "Elden Ring / Dark Souls",
  "dark souls iii": "Elden Ring / Dark Souls",
  "dark souls remastered": "Elden Ring / Dark Souls",
  "dark souls ii": "Elden Ring / Dark Souls",
  "dragon ball: sparking! zero": "Dragon Ball",
  "dragon ball fighterz": "Dragon Ball",
  "dragon ball xenoverse 2": "Dragon Ball",
  "ace combat 7: skies unknown": "Ace Combat",
  "soulcalibur vi": "Soulcalibur",
  "little nightmares ii": "Little Nightmares",
  "little nightmares": "Little Nightmares",
  "code vein": "Code Vein",
  "the dark pictures anthology: house of ashes": "The Dark Pictures Anthology",

  // ---- Bethesda / Microsoft ----
  "the elder scrolls v: skyrim": "The Elder Scrolls",
  "the elder scrolls online": "The Elder Scrolls",
  "the elder scrolls iv: oblivion": "The Elder Scrolls",
  "the elder scrolls iii: morrowind": "The Elder Scrolls",
  "fallout 4": "Fallout",
  "fallout 76": "Fallout",
  "fallout: london": "Fallout",
  "fallout: new vegas": "Fallout",
  "fallout 3": "Fallout",
  "doom: the dark ages": "Doom",
  "doom eternal": "Doom",
  "doom (2016)": "Doom",
  "wolfenstein: the new colossus": "Wolfenstein",
  "wolfenstein: the old blood": "Wolfenstein",
  "wolfenstein: youngblood": "Wolfenstein",
  "dishonored 2": "Dishonored",
  "dishonored": "Dishonored",
  "dishonored: death of the outsider": "Dishonored",
  "starfield": "Starfield",

  // ---- CD Projekt ----
  "the witcher 3: wild hunt": "The Witcher",
  "the witcher 4": "The Witcher",
  "the witcher 2: assassins of kings": "The Witcher",
  "cyberpunk 2077": "Cyberpunk",
  "cyberpunk 2077: phantom liberty": "Cyberpunk",

  // ---- Sega ----
  "sonic x shadow generations": "Sonic the Hedgehog",
  "sonic frontiers": "Sonic the Hedgehog",
  "sonic generations": "Sonic the Hedgehog",
  "sonic mania": "Sonic the Hedgehog",
  "like a dragon: infinite wealth": "Like a Dragon / Yakuza",
  "yakuza 0": "Like a Dragon / Yakuza",
  "yakuza: like a dragon": "Like a Dragon / Yakuza",
  "yakuza kiwami": "Like a Dragon / Yakuza",
  "yakuza kiwami 2": "Like a Dragon / Yakuza",
  "judgment": "Like a Dragon / Yakuza",
  "total war: warhammer iii": "Total War",
  "total war: pharaoh": "Total War",
  "total war: warhammer ii": "Total War",
  "total war: three kingdoms": "Total War",
  "total war: rome ii": "Total War",
  "football manager 26": "Football Manager",
  "football manager 25": "Football Manager",
  "football manager 24": "Football Manager",
  "persona 5 royal": "Persona",
  "persona 3 reload": "Persona",
  "persona 4 golden": "Persona",

  // ---- Warner Bros. Games ----
  "batman: arkham knight": "Batman: Arkham",
  "batman: arkham city": "Batman: Arkham",
  "batman: arkham asylum": "Batman: Arkham",
  "batman: arkham origins": "Batman: Arkham",
  "mortal kombat 1": "Mortal Kombat",
  "mortal kombat 11": "Mortal Kombat",
  // Unified under one real "LEGO" franchise rather than each isolated as
  // its own single-entry micro-franchise (LEGO Batman/LEGO Marvel/LEGO
  // Star Wars) -- a franchise page should show every tracked LEGO game
  // together, not fragment three of them into franchises of exactly one
  // game each. "Lego Harry Potter Collection" stays under Wizarding World
  // instead (grouped with Hogwarts Legacy) -- that's a deliberate existing
  // cross-IP grouping, not an oversight, and nothing here asked to unwind it.
  "lego batman: legacy of the dark knight": "LEGO",
  "lego star wars: the skywalker saga": "LEGO",
  "lego marvel super heroes": "LEGO",
  "lego marvel super heroes 2": "LEGO",
  "lego party!": "LEGO",
  "lego harry potter collection": "Wizarding World",
  "hogwarts legacy": "Wizarding World",
  "middle-earth: shadow of war": "Middle-earth",
  "middle-earth: shadow of mordor": "Middle-earth",

  // ---- Konami ----
  "metal gear solid delta: snake eater": "Metal Gear Solid",
  "metal gear solid v: the phantom pain": "Metal Gear Solid",
  "metal gear solid v: ground zeroes": "Metal Gear Solid",
  "metal gear solid: master collection vol. 1": "Metal Gear Solid",
  "silent hill 2": "Silent Hill",
  "silent hill f": "Silent Hill",
  "efootball 2026": "eFootball / PES",
  "pes 2021": "eFootball / PES",
  "pes 2020": "eFootball / PES",

  // ---- IO Interactive ----
  "007 first light": "James Bond",
  "hitman: world of assassination": "Hitman",
  "hitman 3": "Hitman",
  "hitman 2": "Hitman",
  "hitman (2016)": "Hitman",

  // ---- Krafton ----
  "pubg: battlegrounds": "PUBG",

  // ---- Paradox Interactive ----
  "cities: skylines ii": "Cities: Skylines",
  "cities: skylines": "Cities: Skylines",
  "crusader kings iii": "Crusader Kings",
  "europa universalis v": "Europa Universalis",
  "europa universalis iv": "Europa Universalis",
  "stellaris": "Stellaris",
  "hearts of iron iv": "Hearts of Iron",

  // ---- Focus Entertainment ----
  "a plague tale: requiem": "A Plague Tale",
  "a plague tale: innocence": "A Plague Tale",

  // ---- Deep Silver / Plaion ----
  "saints row": "Saints Row",
  "saints row iv": "Saints Row",
  "saints row: the third": "Saints Row",
  "dead island 2": "Dead Island",
  "dead island": "Dead Island",
  "metro exodus": "Metro",
  "metro: last light redux": "Metro",
  "metro 2033 redux": "Metro",
};

/* Steam's own API returns some titles with underscores standing in for
   spaces (confirmed live: appid 243470 is literally "Watch_Dogs™") --
   without folding those to spaces too, "Watch_Dogs™" and "Watch Dogs"
   normalize to different strings and every lookup keyed on this (franchise
   matching, P2P title matching) silently misses. */
export const normalizeTitle = (s: string): string =>
  (s || "")
    .replace(/[™®©]/g, "")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase();

export function franchiseFor(title: string): string | null {
  return FRANCHISE_MAP[normalizeTitle(title)] || null;
}

/* Deduped once at module load, not per-call -- both the /franchise/:slug
   route and search's franchise-suggestion row need the same closed set of
   real franchise names, never an AI-guessed one. */
const FRANCHISE_NAMES: string[] = [...new Set(Object.values(FRANCHISE_MAP))].sort((a, b) => a.localeCompare(b));
const FRANCHISE_SLUG_TO_NAME: Map<string, string> = new Map(FRANCHISE_NAMES.map((n) => [slugify(n), n]));

export function franchiseNameForSlug(slug: string): string | null {
  return FRANCHISE_SLUG_TO_NAME.get(slug) || null;
}

/* Same substring rule useAutocomplete uses for local game-title matches, so
   a franchise suggestion appears exactly when a game with that title would
   -- deterministic lookup against the curated map, never a guess. */
export function matchFranchise(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  return FRANCHISE_NAMES.find((name) => name.toLowerCase().includes(q)) || null;
}

export interface PublisherEntry {
  key: string;
  name: string;
  count: number;
  domain: string | null;
  aaa: boolean;
  country: string | null;
}

export function publishersIndex(games: Game[]): PublisherEntry[] {
  const map: Record<string, PublisherEntry> = {};
  games.forEach((g) => {
    const name = g.publisher?.trim();
    if (!name) return;
    const key = slugify(name);
    if (!map[key]) {
      map[key] = {
        key,
        name,
        count: 0,
        domain: publisherDomain(name),
        aaa: isAaaPublisher(name),
        country: publisherCountry(name),
      };
    }
    map[key].count++;
  });
  return Object.values(map).sort((a, b) => {
    if (a.aaa !== b.aaa) return a.aaa ? -1 : 1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });
}

export interface FranchiseGroup {
  name: string;
  games: Game[];
}

/* Splits a publisher's games into curated franchise groups plus standalone
   entries (games with no franchise mapping) -- franchise groups first
   (alphabetical), then standalone titles. */
export function groupByFranchise(games: Game[]): { franchises: FranchiseGroup[]; standalone: Game[] } {
  const franchiseMap: Record<string, Game[]> = {};
  const standalone: Game[] = [];
  games.forEach((g) => {
    const franchise = franchiseFor(g.title);
    if (franchise) {
      (franchiseMap[franchise] ||= []).push(g);
    } else {
      standalone.push(g);
    }
  });
  const franchises = Object.entries(franchiseMap)
    .map(([name, gs]) => ({ name, games: gs }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { franchises, standalone };
}
