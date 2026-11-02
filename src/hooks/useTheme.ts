import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "drift.theme";

function readStored(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersLight(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;
}

// Only ever sets/clears the attribute -- tokens.css's cascade (explicit
// data-theme > prefers-color-scheme > dark default) does the actual
// theming, this hook just drives that one attribute and its persistence.
// index.html carries a tiny synchronous inline script that does the same
// read+apply before first paint, so an explicit choice that disagrees with
// the OS preference doesn't flash the wrong theme on load -- this effect
// re-applying it on mount is a no-op in that case, only meaningful when
// toggle() changes it during the session.
function apply(theme: Theme | null) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

export function useTheme() {
  const [stored, setStored] = useState<Theme | null>(readStored);
  const [systemLight, setSystemLight] = useState(systemPrefersLight);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemLight(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: Theme = stored ?? (systemLight ? "light" : "dark");

  const toggle = useCallback(() => {
    const next: Theme = resolved === "light" ? "dark" : "light";
    setStored(next);
    apply(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private browsing / storage disabled -- theme still applies for this page load, just won't persist */
    }
  }, [resolved]);

  return { theme: resolved, toggle };
}
