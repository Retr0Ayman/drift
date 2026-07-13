const CACHE_KEY = "drift.fx.rates";

export interface FxRates {
  date: string;
  rates: Record<string, number>; // USD -> currency
}

interface FxResponse {
  date?: string;
  rates?: Record<string, number>;
  error?: string;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
};

/* Cached by calendar date in localStorage, on top of the worker's own 24h
   edge cache -- frankfurter.app's ECB rates only update once a day, so
   there's never a reason to ask twice in the same day from the same
   browser. Returns null on failure rather than a fabricated/stale-looking
   rate set. */
export async function fetchFxRates(): Promise<FxRates | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as FxRates;
      if (parsed.date === today && parsed.rates) return parsed;
    } catch {
      // fall through to a fresh fetch
    }
  }

  try {
    const r = await fetch("/api/fx");
    const data = (await r.json()) as FxResponse;
    if (!r.ok || !data.rates) return null;
    const result: FxRates = { date: data.date || today, rates: data.rates };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(result));
    } catch {
      // storage full/unavailable -- still return the freshly fetched rates
    }
    return result;
  } catch {
    return null;
  }
}

export function formatConverted(usd: number, currency: string, rate: number): string {
  const symbol = CURRENCY_SYMBOL[currency] || currency + " ";
  const converted = usd * rate;
  const decimals = currency === "JPY" ? 0 : 2;
  return `${symbol}${converted.toFixed(decimals)}`;
}

export const FX_CURRENCIES = ["EUR", "GBP", "JPY", "CAD", "AUD"];
