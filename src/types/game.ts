export type CrackMethod = "hv" | "trad";

export interface Release {
  method: CrackMethod;
  label: string;
  group: string;
  build: number | null;
  version: string;
  date: string;
  note?: string;
  ts?: number;
  xrelId?: string;
  /* Real xREL page for this specific release (its own .../nfo.html), when
     known -- only present for live-tracked releases with a real xrelId,
     never fabricated for hand-authored seed entries. */
  link_href?: string;
  /* True when `group` is a known repack-only outfit (ElAmigos, RIDDICK,
     etc.) -- these rebundle someone else's DRM bypass, they didn't perform
     it, so display must credit them as "Repack by", never as the crack. */
  isRepack?: boolean;
  /* True when `group` is xREL's own "P2P" placeholder for an anonymous,
     unattributed upload -- not a real group name. */
  isAnonymous?: boolean;
  /* How many raw xREL rows (same group, same game) collapsed into this one
     entry -- e.g. a group's "Update v1.4", "Update v1.4.1" etc. all fold
     into the single latest release instead of piling up as separate cards.
     1 when there was only ever one release from this group. */
  updateCount?: number;
}

export interface Dlc {
  n: string;
  p: string;
  appid?: number;
}

export interface Game {
  id: string;
  title: string;
  appid: number | null;
  year: number | null;
  released: string;
  developer?: string;
  publisher?: string;
  genres?: string[];
  tags?: string[];
  currentBuild: number;
  survivalHrs: number | null;
  releases: Release[];
  desc?: string;
  fact?: string;
  dlc?: Dlc[];
  source: { name: string; url: string };
  reviewPct?: number;
  metacritic?: number;
  xrelKey?: string;
  xrelTime?: number;
}
