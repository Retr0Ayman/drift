import "./RouteFallback.css";

// Suspense fallback for lazy-loaded routes (App.tsx) -- the chunk itself is
// usually a fast same-origin fetch, so this is deliberately minimal, not a
// full skeleton layout: three pulsing dots, same visual language the
// search bar's own "Thinking…" state already uses (SearchBar.css).
export default function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-label="Loading">
      <span className="route-fallback-dot" />
      <span className="route-fallback-dot" />
      <span className="route-fallback-dot" />
    </div>
  );
}
