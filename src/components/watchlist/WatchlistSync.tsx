import { useState, type FormEvent } from "react";
import { useWatchlist } from "../../hooks/useWatchlist";
import "./WatchlistSync.css";

// No accounts -- a short code (worker/routes/watchlistSync.ts) is the whole
// mechanism, same unauthenticated-but-unguessable model
// ShareWatchlistButton already uses for one-off share links, just persisted
// server-side so a second device can pull it down on its own schedule.
export default function WatchlistSync() {
  const { syncCode, enableSync, loadFromCode } = useWatchlist();
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleEnable() {
    setBusy(true);
    const code = await enableSync();
    setBusy(false);
    setStatus(code ? { ok: true, msg: `Sync on — this device's code is ${code}` } : { ok: false, msg: "Couldn't start sync, try again" });
  }

  async function handleCopy() {
    if (!syncCode) return;
    try {
      await navigator.clipboard.writeText(syncCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this code:", syncCode);
    }
  }

  async function handleLoad(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    const res = await loadFromCode(input);
    setBusy(false);
    setStatus(res.ok ? { ok: true, msg: "Synced — this device now has everything from that code." } : { ok: false, msg: res.error || "Couldn't load that code" });
    if (res.ok) setInput("");
  }

  return (
    <div className="watchlist-sync">
      <h3 className="watchlist-sync-heading">Sync across devices</h3>
      <p className="watchlist-sync-hint">
        No account needed. Get a code on this device, then enter it on another device to pull this watchlist down there too.
      </p>
      <div className="watchlist-sync-row">
        {syncCode ? (
          <button className="watchlist-sync-btn" onClick={handleCopy} type="button">
            {copied ? "Copied ✓" : `This device's code: ${syncCode}`}
          </button>
        ) : (
          <button className="watchlist-sync-btn" onClick={handleEnable} disabled={busy} type="button">
            {busy ? "Starting…" : "Get a sync code"}
          </button>
        )}
        <form className="watchlist-sync-form" onSubmit={handleLoad}>
          <input
            className="watchlist-sync-input"
            placeholder="Enter a code from another device"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            maxLength={8}
          />
          <button className="watchlist-sync-submit" type="submit" disabled={busy || !input.trim()}>
            Load
          </button>
        </form>
      </div>
      {status ? <p className={`watchlist-sync-status${status.ok ? "" : " watchlist-sync-status--err"}`}>{status.msg}</p> : null}
    </div>
  );
}
