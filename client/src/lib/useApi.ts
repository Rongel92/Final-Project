import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Minimal data-fetching hook with loading/error state and manual refetch.
// When `pollMs` is set, the data is silently refreshed on that interval
// (without toggling the loading flag) so views can stay live.
export function useApi<T>(path: string | null, deps: unknown[] = [], pollMs?: number): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  // Silent background polling: refreshes data without showing the loading state.
  useEffect(() => {
    if (path === null || !pollMs) return;
    const id = setInterval(() => {
      api
        .get<T>(path)
        .then((res) => setData(res))
        .catch(() => {
          /* keep last good data on transient poll errors */
        });
    }, pollMs);
    return () => clearInterval(id);
  }, [path, pollMs]);

  return { data, loading, error, refetch };
}
