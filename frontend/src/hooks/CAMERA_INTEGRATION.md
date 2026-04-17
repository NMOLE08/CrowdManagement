# Camera + Emotion Integration

Use these hooks to integrate ML output with minimum UI edits.

## Hooks

- `useCameraAnalytics(scene)`:
  - Normalizes incoming `scene.cameras` data.
  - Provides `cameras` list for rendering.
  - Provides `getCameraDetails(camera)` for count/location values.

- `useEmotionDetection(camera)`:
  - Reads `primary_emotion` and `emotion_scores` from camera payload.
  - Returns `primaryEmotion` and `emotionBars` (sorted percentages).

## Expected ML JSON shape

POST this to `/api/v1/model-output`:

```json
{
  "cameras": [
    {
      "id": 1,
      "title": "cam1",
      "streamUrl": "https://your-stream-url",
      "live": true,
      "ml_count": 132,
      "primary_emotion": "Anxious",
      "emotion_scores": {
        "calm": 30,
        "neutral": 40,
        "anxious": 20,
        "panic": 10
      },
      "location_details": "East gate lane near main barricade."
    }
  ]
}
```

## API helper

You can also call `pushCameraModelOutput(cameras)` from `src/api/mlApi.js`.
