"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Two ways to use the studio:
 *  - designer: plain-language, task-focused, hides ops/technical surfaces.
 *  - developer: the full studio pipeline (analytics, audit, CRM, agents, billing).
 */
export type ViewMode = "designer" | "developer";

const STORAGE_KEY = "robloxops_view_mode";

interface ViewModeContextType {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggleMode: () => void;
}

const ViewModeContext = createContext<ViewModeContextType>({
  mode: "designer",
  setMode: () => {},
  toggleMode: () => {},
});

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("designer");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "designer" || saved === "developer") {
        setModeState(saved);
      }
    } catch {
      // Storage unavailable — keep the default.
    }
  }, []);

  const setMode = (newMode: ViewMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // Ignore storage errors.
    }
  };

  const toggleMode = () => {
    setMode(mode === "designer" ? "developer" : "designer");
  };

  return (
    <ViewModeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
