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
