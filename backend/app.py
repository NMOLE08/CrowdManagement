from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from fpdf import FPDF

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

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
CAM_FRAME_FILES: dict[int, list[str]] = {
    2: ["cam2.jsonl", "can2.jsonl"],
    3: ["cam3.jsonl"],
    4: ["cam4.jsonl"],
    5: ["cam5.jsonl"],
    6: ["cam6.jsonl"],
}
CAM_FRAME_CACHE: dict[int, list[dict[str, Any]]] = {}
CAM_FRAME_INDEX: dict[int, int] = {2: 0, 3: 0, 4: 0, 5: 0, 6: 0}


def _touch() -> None:
    state["updated_at"] = datetime.now(timezone.utc).isoformat()


def _load_camera_frames(cam_id: int) -> list[dict[str, Any]]:
    if cam_id in CAM_FRAME_CACHE:
        return CAM_FRAME_CACHE[cam_id]

    frames: list[dict[str, Any]] = []
    for filename in CAM_FRAME_FILES.get(cam_id, []):
        file_path = OUTPUT_DIR / filename
        if not file_path.exists():
            continue

        with file_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                row = line.strip()
                if not row:
                    continue
                try:
                    parsed = json.loads(row)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    frames.append(parsed)

        if frames:
            break

    CAM_FRAME_CACHE[cam_id] = frames
    return frames


def _next_camera_frame(cam_id: int) -> dict[str, Any] | None:
    frames = _load_camera_frames(cam_id)
    if not frames:
        return None

    current_index = CAM_FRAME_INDEX.get(cam_id, 0) % len(frames)
    frame = frames[current_index]
    CAM_FRAME_INDEX[cam_id] = (current_index + 1) % len(frames)
    return {
        "camera_id": cam_id,
        "frame_id": frame.get("frame_id"),
        "timestamp_sec": frame.get("timestamp_sec"),
        "head_count": frame.get("head_count", 0),
        "panic_label": frame.get("panic_label", "GREEN"),
        "panic_prob": frame.get("panic_prob", 0.0),
        "latency_ms": frame.get("latency_ms"),
    }


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


@app.get("/api/v1/camera-frame-stats")
def camera_frame_stats():
    requested_cam = request.args.get("camera_id", type=int)

    if requested_cam is not None:
        if requested_cam not in CAM_FRAME_FILES:
            return jsonify({"error": "camera_id must be between 2 and 6"}), 400

        frame = _next_camera_frame(requested_cam)
        if frame is None:
            return jsonify({"camera_id": requested_cam, "available": False, "frame": None})
        return jsonify({"camera_id": requested_cam, "available": True, "frame": frame})

    frames_by_camera: dict[str, Any] = {}
    for cam_id in CAM_FRAME_FILES:
        frames_by_camera[str(cam_id)] = _next_camera_frame(cam_id)

    return jsonify(
        {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "frames": frames_by_camera,
        }
    )


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


def _safe_pdf_text(value: Any) -> str:
    text = str(value)
    return text.encode("latin-1", errors="replace").decode("latin-1")


@app.post("/api/v1/planning/report-pdf")
def planning_report_pdf():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Payload must be a JSON object"}), 400

    placements = payload.get("placements") or []
    if not isinstance(placements, list):
        return jsonify({"error": "placements must be a list"}), 400

    boundary_coordinates = payload.get("boundaryCoordinates") or []
    if not isinstance(boundary_coordinates, list):
        boundary_coordinates = []

    counts: dict[str, int] = {}
    for item in placements:
        tool_id = str((item or {}).get("toolId", "unknown"))
        counts[tool_id] = counts.get(tool_id, 0) + 1

    generated_at = payload.get("generatedAt") or datetime.now(timezone.utc).isoformat()

    pdf = FPDF(unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _safe_pdf_text("CrowdShield Planning Report"), ln=True)

    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, _safe_pdf_text(f"Generated At: {generated_at}"), ln=True)
    pdf.cell(0, 7, _safe_pdf_text(f"Total Placements: {len(placements)}"), ln=True)
    pdf.cell(0, 7, _safe_pdf_text(f"Boundary Points: {len(boundary_coordinates)}"), ln=True)

    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _safe_pdf_text("Placement Summary"), ln=True)
    pdf.set_font("Helvetica", "", 11)

    if counts:
        for tool_id, count in sorted(counts.items()):
            pdf.cell(0, 7, _safe_pdf_text(f"- {tool_id}: {count}"), ln=True)
    else:
        pdf.cell(0, 7, _safe_pdf_text("- No tools placed"), ln=True)

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _safe_pdf_text("Placement Details"), ln=True)
    pdf.set_font("Helvetica", "", 10)

    if placements:
        for idx, item in enumerate(placements, start=1):
            tool_id = _safe_pdf_text((item or {}).get("toolId", "unknown"))
            lat = _safe_pdf_text((item or {}).get("lat", ""))
            lng = _safe_pdf_text((item or {}).get("lng", ""))
            pdf.multi_cell(0, 6, _safe_pdf_text(f"{idx}. {tool_id}  lat: {lat}, lng: {lng}"))
    else:
        pdf.cell(0, 7, _safe_pdf_text("No placement entries."), ln=True)

    pdf_bytes = bytes(pdf.output(dest="S"))
    buffer = BytesIO(pdf_bytes)

    return Response(
        buffer.getvalue(),
        mimetype="application/pdf",
        headers={"Content-Disposition": "attachment; filename=crowdshield-plan-report.pdf"},
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
