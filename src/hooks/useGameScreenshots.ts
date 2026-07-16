import { useEffect, useState } from "react";

/* Module-scope cache so re-visiting a game page (or the same appid showing
   up again in a session) doesn't refetch. */
const CACHE = new Map<number, string[]>();

interface AppDetailsScreenshots {
  screenshots?: string[];
}

/* Real, full-resolution Steam screenshots (path_full, typically 1920x1080)
   for the game detail carousel's hero display -- guessed CDN paths
   (library_hero.jpg, capsule_616x353.jpg) turned out to be genuinely
   unreliable in practice (confirmed live: both 404 for real, current
   titles like EA Sports College Football 27, not just old/delisted ones),
   and coverImg()'s D1-backed header field is reliably present but always
   a small, fixed 460x215 store-thumbnail size regardless of which CDN
   domain it's hosted on -- neither guessing nor the reliable fallback
   alone can give a genuinely high-res carousel image. appdetails.ts
   already fetches this array for DLC/appdetails lookups elsewhere; this
   just also asks for it, live, for the currently-viewed game itself. */
export function useGameScreenshots(appid: number | null | undefined): string[] {
  const [screenshots, setScreenshots] = useState<string[]>(() => (appid ? CACHE.get(appid) || [] : []));

  useEffect(() => {
    if (!appid) {
      setScreenshots([]);
      return;
    }
    const cached = CACHE.get(appid);
    if (cached) {
      setScreenshots(cached);
      return;
    }
    let cancelled = false;
    fetch(`/api/appdetails?appid=${appid}`)
      .then((r) => r.json())
      .then((d: AppDetailsScreenshots) => {
        const shots = d.screenshots || [];
        CACHE.set(appid, shots);
        if (!cancelled) setScreenshots(shots);
      })
      .catch(() => {
        CACHE.set(appid, []);
      });
    return () => {
      cancelled = true;
    };
  }, [appid]);

  return screenshots;
}
