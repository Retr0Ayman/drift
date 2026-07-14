import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "orlaz:theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  // "system" leaves data-theme unset -- tokens.css's own
  // @media (prefers-color-scheme: dark) block governs from there, reacting
  // to OS-level changes with no JS involved. Only an explicit choice sets
  // the attribute, which tokens.css's [data-theme] rules override the
  // media query with (attribute selectors are more specific than plain
  // :root, so this wins regardless of source order).
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

/* Defaults to prefers-color-scheme on first visit -- no stored preference
   means "system", which keeps following the OS live (see the matchMedia
   listener below) until the user makes an explicit choice via toggle(),
   which persists to localStorage and pins the theme from then on. */
export function useTheme(): { resolved: "light" | "dark"; toggle: () => void } {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  const resolved: "light" | "dark" = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  const toggle = useCallback(() => {
    setPreference((prev) => {
      const current = prev === "system" ? (systemPrefersDark() ? "dark" : "light") : prev;
      const next: ThemePreference = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage unavailable -- theme still applies for this session via data-theme, just won't persist
      }
      return next;
    });
  }, []);

  return { resolved, toggle };
}
