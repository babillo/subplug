// Loads and saves the Appearance choice (System / Light / Dark) on this phone. On phones it also
// tells the system, so the keyboard and system pop-ups match the app.
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Appearance, Platform } from "react-native";

import { ThemeContext, type ThemePreference } from "./theme";
import { readSecure, writeSecure } from "./token-store";

const KEY = "theme";

function applyToSystem(preference: ThemePreference) {
  if (Platform.OS === "web") return; // The browser preview has no system theme to set.
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    readSecure(KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark") {
          setPreferenceState(saved);
          applyToSystem(saved);
        }
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      setPreference: (next: ThemePreference) => {
        setPreferenceState(next);
        applyToSystem(next);
        void writeSecure(KEY, next).catch(() => undefined);
      },
    }),
    [preference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
