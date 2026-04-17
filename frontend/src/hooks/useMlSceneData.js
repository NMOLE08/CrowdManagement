import { useEffect, useMemo, useState } from 'react';
import { getHealth, getScene } from '../api/mlApi';

const SCENE_CACHE_KEY = 'crowdshield:last-scene';

const DEFAULT_SCENE = {
  city: 'Pune',
  metrics: {
    live_count: 124820,
    hotspot: 'Shivajinagar Hub - 84%',
    system: 'Online',
  },
  alerts: [
    { id: 'a1', message: 'Critical alert at Shivajinagar Hub - 9 min ago', severity: 'critical' },
    { id: 'a2', message: 'Moderate surge at Swargate Junction - 21 min ago', severity: 'medium' },
    { id: 'a3', message: 'Flow stabilized near Sarasbaug Access - 37 min ago', severity: 'safe' },
  ],
  cameras: [
    {
      id: 1,
      title: 'cam1',
      live: true,
      ml_count: 127,
      primary_emotion: 'Anxious',
      emotion_scores: {
        calm: 36,
        neutral: 32,
        anxious: 22,
        panic: 10,
      },
      location_details: 'East gate approach lane, Dagdusheth Temple perimeter.',
    },
  ],
  map: {
    main_gate: { name: 'Main Gate', coordinates: [73.856111, 18.516389] },
    boundary: [
      [73.8538, 18.5185],
      [73.8596, 18.5185],
      [73.8602, 18.516],
      [73.8591, 18.5138],
      [73.8552, 18.5136],
      [73.8536, 18.5155],
      [73.8538, 18.5185],
    ],
    zones: [],
    emergency_exits: [],
  },
};

export function useMlSceneData(pollMs = 8000) {
  const [scene, setScene] = useState(DEFAULT_SCENE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [networkOnline, setNetworkOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [serverReachable, setServerReachable] = useState(false);
  const [dataSource, setDataSource] = useState('default');
  const [cachedSceneAvailable, setCachedSceneAvailable] = useState(false);
  const [lastSuccessfulAt, setLastSuccessfulAt] = useState('');
  const [lastAttemptAt, setLastAttemptAt] = useState('');

  useEffect(() => {
    let mounted = true;

    const handleOnline = () => {
      console.log('Browser reported ONLINE');
      setNetworkOnline(true);
    };
    const handleOffline = () => {
      console.log('Browser reported OFFLINE');
      setNetworkOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Also re-check on window focus or visibility change to catch missed events
    const handleRecheck = () => {
      if (typeof navigator !== 'undefined') {
        setNetworkOnline(navigator.onLine);
      }
    };
    window.addEventListener('focus', handleRecheck);
    document.addEventListener('visibilitychange', handleRecheck);

    try {
      const rawCached = window.localStorage.getItem(SCENE_CACHE_KEY);
      if (rawCached) {
        const parsed = JSON.parse(rawCached);
        if (parsed && typeof parsed === 'object' && mounted) {
          setScene((prev) => ({ ...prev, ...parsed }));
          setDataSource('cache');
          setCachedSceneAvailable(true);
          if (parsed.updated_at) {
            setLastSuccessfulAt(parsed.updated_at);
          }
        }
      }
    } catch {
      // Ignore cache parsing issues and continue with defaults.
    }

    async function load() {
      const nowIso = new Date().toISOString();
      if (mounted) {
        setLastAttemptAt(nowIso);
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (mounted) {
          setNetworkOnline(false);
          setServerReachable(false);
          setError('Network offline');
          setLoading(false);
        }
        return;
      }

      try {
        const [data] = await Promise.all([
          getScene(),
          getHealth().catch(() => null),
        ]);

        if (mounted) {
          setScene((prev) => {
            const merged = { ...prev, ...data };
            try {
              window.localStorage.setItem(SCENE_CACHE_KEY, JSON.stringify(merged));
              setCachedSceneAvailable(true);
            } catch {
              // Ignore cache write failures.
            }
            return merged;
          });
          setError('');
          setDataSource('live');
          setServerReachable(true);
          const updatedAt = data?.updated_at || nowIso;
          setLastSuccessfulAt(updatedAt);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch scene');
          setServerReachable(false);
          setDataSource((prev) => (cachedSceneAvailable ? (prev === 'live' ? 'cache' : prev) : 'default'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    const id = window.setInterval(load, pollMs);

    return () => {
      mounted = false;
      window.clearInterval(id);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pollMs, cachedSceneAvailable]);

  const isFallbackActive = !networkOnline;

  return useMemo(
    () => ({
      scene,
      loading,
      error,
      systemStatus: {
        isFallbackActive,
        networkOnline,
        serverReachable,
        dataSource,
        cachedSceneAvailable,
        lastSuccessfulAt,
        lastAttemptAt,
      },
    }),
    [
      cachedSceneAvailable,
      dataSource,
      error,
      isFallbackActive,
      lastAttemptAt,
      lastSuccessfulAt,
      loading,
      networkOnline,
      scene,
      serverReachable,
    ]
  );
}
