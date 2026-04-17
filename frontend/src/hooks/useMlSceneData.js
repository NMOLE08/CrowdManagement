import { useEffect, useMemo, useState } from 'react';
import { getScene } from '../api/mlApi';

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

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await getScene();
        if (mounted) {
          setScene((prev) => ({ ...prev, ...data }));
          setError('');
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch scene');
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
    };
  }, [pollMs]);

  return useMemo(
    () => ({ scene, loading, error }),
    [scene, loading, error]
  );
}
