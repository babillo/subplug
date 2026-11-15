// Loads data from the API when a screen comes into view, with pull-to-refresh.
// Optional `pollMs`: while the screen is in view, re-check on that interval, and right away
// whenever the app comes back to the foreground (e.g. after paying in a bank app).
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

import { api, ApiError } from "./api";

export function useApi<T>(path: string, options: { pollMs?: number } = {}) {
  const { pollMs } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api<T>(path);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, {}));
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (!pollMs) return;
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void load();
      }, pollMs);
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [load, pollMs]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, refresh, reload: load };
}

/** How often money screens re-check the balance while open. */
export const BALANCE_POLL_MS = 20_000;
