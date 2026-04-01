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
  const [mode, setMode] = useState<Mode>("professor");

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "professor" ? "quant" : "professor"));
  }, []);

  useEffect(() => {
    // Hidden activation: Ctrl+Shift+Q or ?mode=quant in URL
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "Q") {
        e.preventDefault();
        toggleMode();
      }
    }
    window.addEventListener("keydown", handleKeyDown);

    // Check URL param on mount
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "quant") {
      setMode("quant");
    }

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
