import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import SmoothScroll from "./components/layout/SmoothScroll";
import AmbientBackground from "./components/layout/AmbientBackground";
import "./styles/globals.css";

// Browsers restore a history entry's own recorded scroll position natively
// on back/forward navigation (history.scrollRestoration defaults to
// "auto") -- confirmed live as a real contributor to game pages loading
// mid-scroll: PageTransition's own scroll-reset effect owns this instead
// (see that file's own comment), and letting the browser's native
// restoration run too meant it could win the race and leave the page
// wherever it had been scrolled to on a previous visit to that same URL.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AmbientBackground />
    <HashRouter>
      <SmoothScroll>
        <App />
      </SmoothScroll>
    </HashRouter>
  </StrictMode>,
);
