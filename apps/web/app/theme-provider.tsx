"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type Theme = "dark" | "light";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "dark",
  toggleTheme: () => {},
});

const THEME_KEY = "app-theme";

/**
 * The `<html data-theme>` attribute is the single source of truth — the no-FOUC
 * script in layout.tsx sets it pre-paint, and the toggle writes it directly.
 * We read it through useSyncExternalStore so no effect/setState dance is needed.
 */
function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return getTheme();
}

/** SSR + first client render: dark-first, matches the server-rendered markup. */
function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = useCallback(() => {
    const next: Theme = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
