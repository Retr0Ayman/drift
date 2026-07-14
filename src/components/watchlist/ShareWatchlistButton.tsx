import { useState } from "react";

export default function ShareWatchlistButton({ watched }: { watched: string[] }) {
  const [copied, setCopied] = useState(false);

  if (!watched.length) return null;

  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}#/watchlist?share=${watched.join(",")}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button className="watchlist-share-btn" onClick={handleShare}>
      {copied ? "Link copied ✓" : `Share watchlist (${watched.length})`}
    </button>
  );
}
