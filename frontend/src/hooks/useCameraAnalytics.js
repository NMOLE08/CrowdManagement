import { useMemo } from 'react';
import cam2Video from '../assets/cam2_h264.mp4';
import cam3Video from '../assets/cam3_h264.mp4';
import cam4Video from '../assets/cam4_h264.mp4';
import cam5Video from '../assets/cam5_h264.mp4';
import cam6Video from '../assets/cam6_h264.mp4';

const DEFAULT_STREAM_BY_ID = {
  2: cam2Video,
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
    streamUrl: cam2Video,
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
    locationDetails: 'South lane queue spillover near utility gate.',
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
    locationDetails: 'East gate approach lane, Dagdusheth Temple perimeter.',
    emotions: { calm: 36, neutral: 32, anxious: 22, panic: 10 },
  },
  ...DUMMY_CAMERAS_2_TO_6,
];

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
  const cameras = useMemo(() => {
    const incoming = Array.isArray(scene?.cameras) ? scene.cameras : [];
    const incomingCam1 = incoming.find((cam) => {
      const title = String(cam?.title || cam?.name || '').toLowerCase();
      return cam?.id === 1 || title === 'cam1';
    });

    const hardcodedCam1 = HARDCODED_CAMERAS.find((cam) => cam.id === 1) || HARDCODED_CAMERAS[0];
    const cam1 = normalizeCamera({ ...hardcodedCam1, ...(incomingCam1 || {}) }, 0);

    // Cameras 2-6 are strictly frontend dummy data from src/assets and never backend-driven.
    const fixedCameras = DUMMY_CAMERAS_2_TO_6.map((cam, index) => normalizeCamera(cam, index + 1));

    return [cam1, ...fixedCameras];
  }, [scene?.cameras]);

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
      location_details: 'East gate lane near main barricade.',
    },
  ],
};
