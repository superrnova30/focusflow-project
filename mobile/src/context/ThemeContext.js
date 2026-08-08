import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors } from "../theme/theme";

const STORAGE_KEY = "focusflow_theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // "light" | "dark" | null
  const [scheme, setScheme] = useState("dark"); // "light" | "dark" | "system"
  const [ready, setReady] = useState(false);

  // Load persisted preference once on mount.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") {
          setScheme(stored);
        }
      } catch (e) {
        // fall back to default
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const changeScheme = async (next) => {
    setScheme(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      // non-fatal
    }
  };

  const isDark = scheme === "system" ? systemScheme !== "light" : scheme === "dark";
  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const value = useMemo(
    () => ({ scheme, setScheme: changeScheme, isDark, colors, ready }),
    [scheme, isDark, colors, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside a ThemeProvider");
  return ctx;
}
