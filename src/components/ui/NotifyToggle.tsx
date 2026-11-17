import { useEffect, useState } from "react";
import { useWatchlist } from "../../hooks/useWatchlist";
import { disablePush, enablePush, onPushChange, pushEnabledFlag, pushSupported } from "../../lib/push";
import "./NotifyToggle.css";

interface Props {
  /** On a game page: turning notifications on also watches this game. */
  gameId?: string;
  className?: string;
}

/* Quiet opt-in. The browser permission prompt only ever appears from the
   click below, and "Notifications on" is its own opt-out. */
export default function NotifyToggle({ gameId, className = "" }: Props) {
  const { watched, toggle } = useWatchlist();
  const [on, setOn] = useState(pushEnabledFlag());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onPushChange(() => setOn(pushEnabledFlag())), []);
  if (!pushSupported()) return null;

  async function turnOn() {
    setBusy(true);
    setError(null);
    const ids = gameId && !watched.includes(gameId) ? [...watched, gameId] : watched;
    const res = await enablePush(ids);
    if (res.ok && gameId && !watched.includes(gameId)) toggle(gameId);
    if (!res.ok) setError(res.error || "Couldn't turn notifications on.");
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true);
    await disablePush();
    setBusy(false);
  }

  return (
    <div className={`notify-toggle${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className={`notify-toggle-btn${on ? " notify-toggle-btn--on" : ""}`}
        aria-pressed={on}
        disabled={busy}
        onClick={on ? turnOff : turnOn}
        title={on ? "Stop notifications on this browser" : "Get a notification when a watched game is cracked or drops Denuvo"}
      >
        <span className="notify-toggle-dot" aria-hidden="true" />
        {on ? "Notifications on" : "Notify me"}
      </button>
      {on ? <span className="notify-toggle-hint">Tap to turn off</span> : null}
      {error ? (
        <span className="notify-toggle-error" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
