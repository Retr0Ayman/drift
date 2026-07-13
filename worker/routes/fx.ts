import type { Handler } from "../shared/types";
import { json } from "../shared/http";

/* frankfurter.app -- free, keyless, ECB reference rates, updated once daily
   on ECB business days. Edge-cached for a full day (86400s) since these
   rates only change once a day anyway; the client additionally caches this
   in localStorage by date (see src/lib/fx.ts) so a session doesn't even hit
   this route more than once per day per browser. */
const CURRENCIES = "EUR,GBP,JPY,CAD,AUD";

export const handleFx: Handler = async () => {
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${CURRENCIES}`);
    if (!r.ok) return json({ error: `frankfurter.app returned ${r.status}`, rates: null }, 300, 502);
    const data = (await r.json()) as { date?: string; rates?: Record<string, number> };
    if (!data.rates) return json({ error: "no rates in frankfurter.app response", rates: null }, 300, 502);
    return json({ base: "USD", date: data.date, rates: data.rates }, 86400);
  } catch (e) {
    return json({ error: `frankfurter.app request failed: ${e instanceof Error ? e.message : String(e)}`, rates: null }, 300, 502);
  }
};
