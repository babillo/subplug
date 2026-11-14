// Loads data from the API when a screen comes into view, with pull-to-refresh.
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { api, ApiError } from "./api";

export function useApi<T>(path: string) {
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
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, refresh, reload: load };
}
