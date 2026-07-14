import { useState } from "react";
import { useCatalog } from "../../hooks/useCatalog";
import { useWatchlist } from "../../hooks/useWatchlist";
import GlassPanel from "../ui/GlassPanel";
import "./WishlistImport.css";

function parseSteamInput(input: string): { steamid?: string; vanity?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const profileMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d+)/i);
  if (profileMatch) return { steamid: profileMatch[1] };
  const idMatch = trimmed.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (idMatch) return { vanity: idMatch[1] };
  if (/^\d{17}$/.test(trimmed)) return { steamid: trimmed };
  if (/^[a-z0-9_-]+$/i.test(trimmed)) return { vanity: trimmed };
  return null;
}

export default function WishlistImport() {
  const { games } = useCatalog();
  const { watched, toggle } = useWatchlist();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ id: string; title: string }[] | null>(null);

  async function handleImport() {
    const parsed = parseSteamInput(input);
    if (!parsed) {
      setError("Paste a Steam profile URL (steamcommunity.com/id/... or /profiles/...) or a numeric SteamID64.");
      setMatches(null);
      return;
    }
    setLoading(true);
    setError(null);
    setMatches(null);
    try {
      const params = parsed.steamid
        ? `steamid=${encodeURIComponent(parsed.steamid)}`
        : `vanity=${encodeURIComponent(parsed.vanity as string)}`;
      const r = await fetch(`/api/wishlist?${params}`);
      const data = (await r.json()) as { appids?: number[]; error?: string };
      if (!r.ok || data.error) {
        setError(data.error || "Could not load that wishlist.");
        return;
      }
      const appidSet = new Set(data.appids || []);
      const found = games.filter((g) => g.appid != null && appidSet.has(g.appid));
      setMatches(found.map((g) => ({ id: g.id, title: g.title })));
    } catch {
      setError("Could not reach the wishlist service.");
    } finally {
      setLoading(false);
    }
  }

  function addAll() {
    if (!matches) return;
    matches.forEach((m) => {
      if (!watched.includes(m.id)) toggle(m.id);
    });
  }

  const newCount = matches ? matches.filter((m) => !watched.includes(m.id)).length : 0;

  return (
    <GlassPanel className="wishlist-import">
      <div className="wishlist-import-h">Import from Steam wishlist</div>
      <div className="wishlist-import-row">
        <input
          placeholder="Steam profile URL or SteamID64"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
        />
        <button onClick={handleImport} disabled={loading}>
          {loading ? "Checking…" : "Check"}
        </button>
      </div>
      {error ? <p className="wishlist-import-error">{error}</p> : null}
      {matches ? (
        matches.length ? (
          <div className="wishlist-import-result">
            <p>
              {matches.length} wishlisted title{matches.length === 1 ? "" : "s"} found in the tracked catalogue
              {newCount ? `, ${newCount} not yet on your watchlist` : ""}.
            </p>
            {newCount ? (
              <button className="wishlist-import-add" onClick={addAll}>
                Add {newCount} to watchlist
              </button>
            ) : null}
          </div>
        ) : (
          <p className="wishlist-import-result">No wishlisted games matched the currently tracked catalogue.</p>
        )
      ) : null}
    </GlassPanel>
  );
}
