import type { Handler } from "../shared/types";
import { json } from "../shared/http";

interface Row {
  game_id: string;
  watchers: number;
}

const WINDOW_DAYS = 30;
const LIMIT = 20;
const MAXAGE = 300;

// Real, computed popularity only -- COUNT(DISTINCT client_id) of anonymous
// devices that toggled a watch on in the last WINDOW_DAYS, per
// migrations/0012's dedup. No AI/vibes score involved, same discipline as
// group-reliability and crack-eta. Computed live per request rather than on
// a cron tick: this app's five Cron Trigger slots are already fully spent
// (see worker/index.ts's own comment), and a GROUP BY over watch_events is
// cheap at this catalog's scale.
export const handleTrending: Handler = async ({ env }) => {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  try {
    const { results } = await env.orlaz_catalog
      .prepare(
        "SELECT game_id, COUNT(DISTINCT client_id) as watchers FROM watch_events WHERE day >= ? GROUP BY game_id ORDER BY watchers DESC LIMIT ?",
      )
      .bind(since, LIMIT)
      .all<Row>();
    return json({ games: results || [], windowDays: WINDOW_DAYS }, MAXAGE);
  } catch {
    // Migration not applied yet, or D1 genuinely unreachable -- honest empty
    // list, same "nothing here yet, not a 500" pattern group-reliability's
    // route already follows.
    return json({ games: [], windowDays: WINDOW_DAYS }, 5);
  }
};
