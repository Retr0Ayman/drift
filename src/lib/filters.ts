import type { Game } from "../types/game";
import { anyOutdated, driftDelta, gStatus } from "./format";
import { gTimestamp } from "./catalog";

export type StatusFilter = "all" | "outdated" | "hv" | "trad" | "uncracked" | "unreleased";
export type SortKey = "date-desc" | "date-asc" | "name" | "drift" | "survival";

export interface FilterState {
  status: StatusFilter;
  genre: string; // "all" or an exact genre string
  year: string; // "all" or an exact year as string
}

export function passesFilters(g: Game, f: FilterState): boolean {
  if (f.genre !== "all" && !(g.genres || []).includes(f.genre)) return false;
  if (f.year !== "all" && String(g.year || "") !== f.year) return false;
  const s = gStatus(g);
  switch (f.status) {
    case "all":
      return true;
    case "outdated":
      return anyOutdated(g);
    case "hv":
      return (g.releases || []).some((r) => r.method === "hv");
    case "trad":
      return (g.releases || []).some((r) => r.method === "trad");
    case "uncracked":
      return s === "uncracked";
    case "unreleased":
      return s === "unreleased";
    default:
      return true;
  }
}

export function sortGames(games: Game[], sort: SortKey): Game[] {
  const list = [...games];
  switch (sort) {
    case "date-desc":
      return list.sort((a, b) => gTimestamp(b) - gTimestamp(a) || a.title.localeCompare(b.title));
    case "date-asc":
      return list.sort((a, b) => gTimestamp(a) - gTimestamp(b) || a.title.localeCompare(b.title));
    case "name":
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case "drift":
      return list.sort((a, b) => driftDelta(b) - driftDelta(a));
    case "survival":
      return list.sort((a, b) => (a.survivalHrs ?? 1e9) - (b.survivalHrs ?? 1e9));
    default:
      return list;
  }
}

export function availableGenres(games: Game[]): string[] {
  return [...new Set(games.flatMap((g) => g.genres || []))].sort();
}

export function availableYears(games: Game[]): number[] {
  return [...new Set(games.map((g) => g.year).filter((y): y is number => !!y))].sort((a, b) => b - a);
}
