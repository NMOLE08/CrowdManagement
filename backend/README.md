# CrowdManagement Flask Backend

This backend exposes ML-integration-ready endpoints for the React frontend.

## Run

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Base URL: `http://localhost:5000`

## Endpoints

- `GET /health`
- `GET /api/v1/scene` -> frontend one-shot payload (metrics + map + alerts)
- `GET /api/v1/map`
- `GET /api/v1/metrics`
- `GET /api/v1/alerts`
- `POST /api/v1/model-output` -> teammate pushes latest ML output
- `POST /api/v1/reset` -> reset to default sample data

## `POST /api/v1/model-output` payload example

```json
{
  "city": "Pune",
  "metrics": {
    "live_count": 131400,
    "hotspot": "Shaniwar Wada - 91%",
    "system": "Online"
  },
  "alerts": [
    {
      "id": "a-new",
      "message": "Critical alert at Main Gate",
      "severity": "critical"
    }
  ],
  "map": {
    "main_gate": {
      "name": "Main Gate",
      "coordinates": [73.856111, 18.516389]
    },
    "boundary": [[73.85,18.52],[73.86,18.52],[73.86,18.51],[73.85,18.51],[73.85,18.52]],
    "zones": [],
    "emergency_exits": []
  }
}
```

Severity values expected by frontend styles: `critical`, `medium`, `safe`.
