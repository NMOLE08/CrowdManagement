from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# In-memory store so teammate can post ML output without database setup.
DEFAULT_STATE: dict[str, Any] = {
    "city": "Pune",
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "metrics": {
        "live_count": 124820,
        "hotspot": "Shivajinagar Hub - 84%",
        "system": "Online",
    },
    "map": {
        "main_gate": {
            "name": "Main Gate",
            "coordinates": [73.856111, 18.516389],
        },
        "boundary": [
            [73.8538, 18.5185],
            [73.8596, 18.5185],
            [73.8602, 18.5160],
            [73.8591, 18.5138],
            [73.8552, 18.5136],
            [73.8536, 18.5155],
            [73.8538, 18.5185],
        ],
        "zones": [
            {
                "id": "shivajinagar",
                "name": "Shivajinagar Hub",
                "coordinates": [73.8478, 18.5314],
                "risk": "VERY HIGH",
                "riskScore": 92.4,
                "crowd": 5980,
                "capacity": 6500,
            },
            {
                "id": "swargate",
                "name": "Swargate Junction",
                "coordinates": [73.8570, 18.5003],
                "risk": "MODERATE",
                "riskScore": 71.2,
                "crowd": 6420,
                "capacity": 10200,
            },
            {
                "id": "pune-station",
                "name": "Pune Station Gate",
                "coordinates": [73.8766, 18.5286],
                "risk": "MODERATE",
                "riskScore": 59.8,
                "crowd": 7115,
                "capacity": 13500,
            },
        ],
        "emergency_exits": [
            {
                "id": "route-1-west",
                "route": "Route 1 (Western Exit)",
                "name": "Laxmi Road",
                "coordinates": [73.8487, 18.5140],
            },
            {
                "id": "route-2-north",
                "route": "Route 2 (Northern Exit)",
                "name": "Mamledar Kacheri",
                "coordinates": [73.8581, 18.5067],
            },
            {
                "id": "route-3-east",
                "route": "Route 3 (Eastern Exit)",
                "name": "Subhanshah Dargah (Raviwar Peth)",
                "coordinates": [73.8605, 18.5152],
            },
            {
                "id": "route-4-southwest",
                "route": "Route 4 (South-Western Exit)",
                "name": "Perugate",
                "coordinates": [73.8487, 18.5114],
            },
        ],
    },
    "alerts": [
        {
            "id": "a1",
            "message": "Critical alert at Shivajinagar Hub - 9 min ago",
            "severity": "critical",
        },
        {
            "id": "a2",
            "message": "Moderate surge at Swargate Junction - 21 min ago",
            "severity": "medium",
        },
        {
            "id": "a3",
            "message": "Flow stabilized near Sarasbaug Access - 37 min ago",
            "severity": "safe",
        },
    ],
    "cameras": [
        {
            "id": 1,
            "title": "cam1",
            "live": True,
            "ml_count": 127,
            "primary_emotion": "Anxious",
            "emotion_scores": {
                "calm": 36,
                "neutral": 32,
                "anxious": 22,
                "panic": 10,
            },
            "location_details": "East gate approach lane, Dagdusheth Temple perimeter.",
        },
    ],
}

state: dict[str, Any] = deepcopy(DEFAULT_STATE)


def _touch() -> None:
    state["updated_at"] = datetime.now(timezone.utc).isoformat()


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "crowdmanagement-flask", "city": state["city"]})


@app.get("/api/v1/scene")
def scene():
    """Frontend hook endpoint: one call to render map, metrics, and alerts."""
    return jsonify(state)


@app.get("/api/v1/alerts")
def alerts():
    return jsonify({"updated_at": state["updated_at"], "alerts": state["alerts"]})


@app.get("/api/v1/map")
def map_data():
    return jsonify({"updated_at": state["updated_at"], "map": state["map"]})


@app.get("/api/v1/metrics")
def metrics():
    return jsonify({"updated_at": state["updated_at"], "metrics": state["metrics"]})


@app.post("/api/v1/model-output")
def ingest_model_output():
    """
    Teammate integration endpoint.
    Accepts partial payload to update live frontend state.
    """
    payload = request.get_json(silent=True) or {}

    if not isinstance(payload, dict):
        return jsonify({"error": "Payload must be a JSON object"}), 400

    for key in ("metrics", "map", "alerts", "city", "cameras"):
        if key in payload:
            state[key] = payload[key]

    _touch()
    return jsonify({"status": "updated", "updated_at": state["updated_at"]})


@app.post("/api/v1/reset")
def reset_state():
    state.clear()
    state.update(deepcopy(DEFAULT_STATE))
    _touch()
    return jsonify({"status": "reset", "updated_at": state["updated_at"]})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
