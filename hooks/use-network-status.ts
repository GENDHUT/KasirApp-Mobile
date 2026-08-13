import { useCallback, useEffect, useState } from "react";
import * as Network from "expo-network";

export function useNetworkStatus(pollInterval = 5000) {
  const [isOnline, setIsOnline] = useState(true);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    } catch {
      setIsOnline(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, pollInterval);
    return () => clearInterval(interval);
  }, [check, pollInterval]);

  return { isOnline, checking, refresh: check };
}