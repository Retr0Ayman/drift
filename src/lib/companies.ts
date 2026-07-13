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
  capcom: "capcom.co.jp",
  "bandai namco entertainment": "bandainamcoent.com",
  "bandai namco studios": "bandainamcoent.com",
  "warner bros. games": "wbgames.com",
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
   standalone entry, not mis-grouped. Keys are normalized titles. */
const FRANCHISE_MAP: Record<string, string> = {
  "watch dogs": "Watch Dogs",
  "watch dogs 2": "Watch Dogs",
  "watch dogs: legion": "Watch Dogs",
  "watch dogs legion": "Watch Dogs",
  "resident evil 4": "Resident Evil",
  "resident evil village": "Resident Evil",
  "resident evil requiem": "Resident Evil",
  "resident evil 2": "Resident Evil",
  "resident evil 3": "Resident Evil",
  "assassin's creed black flag resynced": "Assassin's Creed",
  "assassin's creed shadows": "Assassin's Creed",
  "assassin's creed valhalla": "Assassin's Creed",
  "assassin's creed mirage": "Assassin's Creed",
  "dragon's dogma 2": "Dragon's Dogma",
  "dragon's dogma": "Dragon's Dogma",
  "mortal kombat 1": "Mortal Kombat",
  "mortal kombat 11": "Mortal Kombat",
  "star wars jedi: survivor": "Star Wars Jedi",
  "star wars jedi: fallen order": "Star Wars Jedi",
  "star wars jedi survivor": "Star Wars Jedi",
  "hogwarts legacy": "Wizarding World",
  "007 first light": "James Bond",
  "lego batman: legacy of the dark knight": "LEGO Batman",
  "mafia: the old country": "Mafia",
  "tekken 8": "Tekken",
  "tekken 7": "Tekken",
};

const normalizeTitle = (s: string): string =>
  (s || "")
    .replace(/[™®©]/g, "")
    .trim()
    .toLowerCase();

export function franchiseFor(title: string): string | null {
  return FRANCHISE_MAP[normalizeTitle(title)] || null;
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
