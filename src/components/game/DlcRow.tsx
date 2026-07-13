import { useEffect, useState } from "react";
import { fetchFxRates, formatConverted, FX_CURRENCIES, type FxRates } from "../../lib/fx";
import "./DlcRow.css";

interface DlcInfo {
  title: string;
  price: string | null;
  priceUsd: number | null;
  about: string;
  header?: string;
}

interface AppDetailsResponse {
  appid?: number;
  title?: string;
  desc?: string;
  about?: string;
  header?: string;
  price?: string | null;
  priceUsd?: number | null;
}

/* Module-scope cache so re-opening a game (or the same DLC showing up on
   another title, e.g. a season pass shared across editions) doesn't refetch. */
const DLC_CACHE = new Map<number, DlcInfo | null>();

/* One shared fx-rate fetch for every DlcRow on the page, not one per row. */
let fxPromise: Promise<FxRates | null> | null = null;
function sharedFxRates(): Promise<FxRates | null> {
  if (!fxPromise) fxPromise = fetchFxRates();
  return fxPromise;
}

/* Real DLC name/price/description via the same /api/appdetails route used
   for base games (a DLC has its own Steam appid, so it works generically).
   Always interactive regardless of whether the fetch actually returns rich
   details -- a real Steam store link is constructable from the appid alone. */
export default function DlcRow({ appid, fallbackName }: { appid: number; fallbackName: string }) {
  const [info, setInfo] = useState<DlcInfo | null>(DLC_CACHE.get(appid) ?? null);
  const [loading, setLoading] = useState(!DLC_CACHE.has(appid));
  const [open, setOpen] = useState(false);
  const [fx, setFx] = useState<FxRates | null>(null);

  useEffect(() => {
    if (DLC_CACHE.has(appid)) return;
    let cancelled = false;
    fetch(`/api/appdetails?appid=${appid}`)
      .then((r) => r.json())
      .then((d: AppDetailsResponse) => {
        if (cancelled) return;
        const parsed: DlcInfo | null = d.appid
          ? {
              title: d.title || fallbackName,
              price: d.price ?? null,
              priceUsd: d.priceUsd ?? null,
              about: d.about || d.desc || "",
              header: d.header,
            }
          : null;
        DLC_CACHE.set(appid, parsed);
        setInfo(parsed);
      })
      .catch(() => DLC_CACHE.set(appid, null))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appid, fallbackName]);

  // Only fetch fx rates once a row is actually expanded and has a real,
  // nonzero USD price to convert -- no point round-tripping for rows that
  // are free, priceless, or never opened.
  useEffect(() => {
    if (!open || !info?.priceUsd) return;
    let cancelled = false;
    sharedFxRates().then((rates) => {
      if (!cancelled) setFx(rates);
    });
    return () => {
      cancelled = true;
    };
  }, [open, info?.priceUsd]);

  const name = info?.title || fallbackName;

  return (
    <div className="dlc-row">
      <button className="dlc-row-top" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="dlc-row-name">{loading ? "Loading…" : name}</span>
        <span className="dlc-row-right">
          <span className="dlc-row-price">{info?.price ?? (loading ? "" : "—")}</span>
          <span className={`dlc-row-chev${open ? " dlc-row-chev--open" : ""}`}>›</span>
        </span>
      </button>
      {open ? (
        <div className="dlc-row-body">
          {info?.header ? (
            <img src={info.header} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : null}
          <p>{info?.about || "No extra details available for this edition yet."}</p>
          {info?.priceUsd ? (
            <div className="dlc-row-fx">
              {fx
                ? FX_CURRENCIES.map((c) =>
                    fx.rates[c] ? (
                      <span className="dlc-row-fx-chip" key={c}>
                        {formatConverted(info.priceUsd as number, c, fx.rates[c])}
                      </span>
                    ) : null,
                  )
                : <span className="dlc-row-fx-status">Converting…</span>}
            </div>
          ) : null}
          <a
            className="dlc-row-link"
            href={`https://store.steampowered.com/app/${appid}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Steam ↗
          </a>
        </div>
      ) : null}
    </div>
  );
}
