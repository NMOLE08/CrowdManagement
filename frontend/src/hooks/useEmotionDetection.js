import { useMemo } from 'react';

export function useEmotionDetection(camera) {
  return useMemo(() => {
    if (!camera) {
      return {
        primaryEmotion: 'N/A',
        emotionBars: [],
      };
    }

    const scores = camera.emotion_scores || camera.emotions || {};

    const emotionBars = Object.entries(scores)
      .map(([name, value]) => {
        const numeric = Number(value);
        return {
          name,
          value: Number.isFinite(numeric) ? Math.max(0, numeric) : 0,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((item) => {
        const normalized = item.value <= 1 ? item.value * 100 : item.value;
        return {
          name: item.name,
          percentage: Math.min(100, Math.round(normalized)),
        };
      });

    const topBar = emotionBars[0];
    const primaryEmotion =
      camera.primary_emotion ||
      camera.emotion ||
      (topBar ? topBar.name : 'N/A');

    return {
      primaryEmotion,
      emotionBars,
    };
  }, [camera]);
}
