"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Mode = "professor" | "quant";

const ModeContext = createContext<{
  mode: Mode;
  toggleMode: () => void;
}>({
  mode: "professor",
  toggleMode: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from URL param synchronously to avoid setState-in-effect
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "professor";
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "quant" ? "quant" : "professor";
  });

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "professor" ? "quant" : "professor"));
  }, []);

  useEffect(() => {
    // Hidden activation: Ctrl+Shift+Q
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "Q") {
        e.preventDefault();
        toggleMode();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleMode]);

  return (
    <ModeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
