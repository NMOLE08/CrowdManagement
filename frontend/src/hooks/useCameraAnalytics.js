import { useEffect, useMemo, useState } from 'react';
import cam2Video from '../assets/cam2.mp4';
import cam2H264Video from '../assets/cam2_h264.mp4';
import cam3Video from '../assets/cam3_h264.mp4';
import cam4Video from '../assets/cam4_h264.mp4';
import cam5Video from '../assets/cam5_h264.mp4';
import cam6Video from '../assets/cam6_h264.mp4';

const DEFAULT_STREAM_BY_ID = {
  2: cam2H264Video || cam2Video,
  3: cam3Video,
  4: cam4Video,
  5: cam5Video,
  6: cam6Video,
};

const DUMMY_CAMERAS_2_TO_6 = [
  {
    id: 2,
    title: 'cam2',
    live: true,
    streamUrl: cam2H264Video || cam2Video,
    count: 82,
    emotion: 'Neutral',
    locationDetails: 'North barricade checkpoint near vendor corridor.',
    emotions: { calm: 42, neutral: 38, anxious: 14, panic: 6 },
  },
  {
    id: 3,
    title: 'cam3',
    live: true,
    streamUrl: cam3Video,
    count: 64,
    emotion: 'Calm',
    locationDetails: 'South lane queue spillover near utility Gate.',
    emotions: { calm: 51, neutral: 31, anxious: 13, panic: 5 },
  },
  {
    id: 4,
    title: 'cam4',
    live: true,
    streamUrl: cam4Video,
    count: 73,
    emotion: 'Neutral',
    locationDetails: 'Inner ring walkway near barricade turn.',
    emotions: { calm: 39, neutral: 41, anxious: 15, panic: 5 },
  },
  {
    id: 5,
    title: 'cam5',
    live: true,
    streamUrl: cam5Video,
    count: 58,
    emotion: 'Calm',
    locationDetails: 'Vendor-side corridor near hydration point.',
    emotions: { calm: 55, neutral: 28, anxious: 12, panic: 5 },
  },
  {
    id: 6,
    title: 'cam6',
    live: true,
    streamUrl: cam6Video,
    count: 91,
    emotion: 'Anxious',
    locationDetails: 'Temple exit merge lane near crowd diversion rope.',
    emotions: { calm: 27, neutral: 33, anxious: 28, panic: 12 },
  },
];

const HARDCODED_CAMERAS = [
  {
    id: 1,
    title: 'cam1',
    live: true,
    count: 127,
    emotion: 'Anxious',
    locationDetails: 'East Gate approach lane, Dagdusheth Temple perimeter.',
    emotions: { calm: 36, neutral: 32, anxious: 22, panic: 10 },
  },
  ...DUMMY_CAMERAS_2_TO_6,
];

function panicLabelToEmotion(panicLabel) {
  const normalized = String(panicLabel || 'GREEN').trim().toUpperCase();
  if (normalized === 'RED') {
    return 'Panic';
  }
  if (normalized === 'ORANGE' || normalized === 'YELLOW') {
    return 'Anxious';
  }
  return 'Calm';
}

function panicLabelToEmotionScores(panicLabel, panicProb) {
  const normalized = String(panicLabel || 'GREEN').trim().toUpperCase();
  const prob = Number.isFinite(Number(panicProb)) ? Number(panicProb) : 0;
  const panicPct = Math.max(0, Math.min(100, Math.round(prob * 100)));

  if (normalized === 'RED') {
    const panic = Math.max(70, panicPct);
    const anxious = Math.max(15, Math.round((100 - panic) * 0.6));
    const neutral = Math.max(5, 100 - panic - anxious);
    return { calm: 0, neutral, anxious, panic };
  }

  if (normalized === 'ORANGE' || normalized === 'YELLOW') {
    const anxious = Math.max(45, Math.max(panicPct, 35));
    const panic = Math.max(8, Math.round(anxious * 0.25));
    const neutral = Math.max(15, 100 - anxious - panic);
    return { calm: Math.max(0, 100 - anxious - panic - neutral), neutral, anxious, panic };
  }

  const calm = Math.max(50, 100 - Math.max(8, panicPct));
  const panic = Math.max(3, Math.round(panicPct * 0.4));
  const anxious = Math.max(8, Math.round((100 - calm - panic) * 0.4));
  const neutral = Math.max(8, 100 - calm - anxious - panic);
  return { calm, neutral, anxious, panic };
}

function normalizeCamera(camera, index) {
  const fallbackId = index + 1;
  const id = camera.id ?? fallbackId;
  const title = camera.title || camera.name || `cam${fallbackId}`;
  const streamFromId = DEFAULT_STREAM_BY_ID[id];

  return {
    ...camera,
    id,
    title,
    streamUrl: camera.streamUrl || streamFromId,
    live: Boolean(camera.live),
  };
}

export function useCameraAnalytics(scene) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
  const [frameStatsByCamera, setFrameStatsByCamera] = useState({});

  useEffect(() => {
    let active = true;

    const fetchFrameStats = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/camera-frame-stats`);
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const frames = payload?.frames;
        if (active && frames && typeof frames === 'object') {
          setFrameStatsByCamera(frames);
        }
      } catch {
        // Keep previous values when backend frame polling fails.
      }
    };

    fetchFrameStats();
    const timer = window.setInterval(fetchFrameStats, 900);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiBaseUrl]);

  const cameras = useMemo(() => {
    const incoming = Array.isArray(scene?.cameras) ? scene.cameras : [];
    const incomingCam1 = incoming.find((cam) => {
      const title = String(cam?.title || cam?.name || '').toLowerCase();
      return cam?.id === 1 || title === 'cam1';
    });

    const hardcodedCam1 = HARDCODED_CAMERAS.find((cam) => cam.id === 1) || HARDCODED_CAMERAS[0];
    const cam1 = normalizeCamera({ ...hardcodedCam1, ...(incomingCam1 || {}) }, 0);

    // Cameras 2-6 keep frontend video sources but live count/reaction from backend frame stats.
    const fixedCameras = DUMMY_CAMERAS_2_TO_6.map((cam, index) => {
      const dynamic = frameStatsByCamera[String(cam.id)] || frameStatsByCamera[cam.id];
      if (!dynamic) {
        return normalizeCamera(cam, index + 1);
      }

      const emotion = panicLabelToEmotion(dynamic.panic_label);
      const emotionScores = panicLabelToEmotionScores(dynamic.panic_label, dynamic.panic_prob);

      return normalizeCamera(
        {
          ...cam,
          count: Number(dynamic.head_count ?? cam.count ?? 0),
          ml_count: Number(dynamic.head_count ?? cam.count ?? 0),
          emotion,
          primary_emotion: emotion,
          emotions: emotionScores,
          emotion_scores: emotionScores,
          panic_label: dynamic.panic_label,
          panic_prob: dynamic.panic_prob,
          frame_id: dynamic.frame_id,
          timestamp_sec: dynamic.timestamp_sec,
        },
        index + 1
      );
    });

    return [cam1, ...fixedCameras];
  }, [frameStatsByCamera, scene?.cameras]);

  const getCameraDetails = (camera) => {
    if (!camera) {
      return {
        count: 0,
        locationDetails: 'Location details unavailable.',
      };
    }

    const rawCount = camera.ml_count ?? camera.count ?? camera.people_count ?? 0;
    const parsedCount = Number(rawCount);
    const count = Number.isFinite(parsedCount) ? parsedCount : 0;

    const locationDetails =
      camera.location_details ||
      camera.locationDetails ||
      camera.location ||
      'Location details unavailable.';

    return {
      count,
      locationDetails,
    };
  };

  return {
    cameras,
    getCameraDetails,
  };
}

export const CAMERA_ML_JSON_EXAMPLE = {
  cameras: [
    {
      id: 1,
      title: 'cam1',
      streamUrl: 'https://your-stream-url',
      live: true,
      ml_count: 132,
      primary_emotion: 'Anxious',
      emotion_scores: {
        calm: 30,
        neutral: 40,
        anxious: 20,
        panic: 10,
      },
      location_details: 'East Gate lane near main barricade.',
    },
  ],
};
