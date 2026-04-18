from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
import re

import os
import logging
from dotenv import load_dotenv

from flask import Flask, Response, jsonify, request, render_template
from flask_cors import CORS
from fpdf import FPDF

from sms.gemini_service import GeminiService
from sms.sms_service import SMSService
from sms.call_service import CallService

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder="sms/templates")
CORS(app)

gemini = GeminiService(api_key=os.environ.get("GEMINI_API_KEY", ""))

sms_service = SMSService(
    gateway_url=os.environ.get("SMS_GATEWAY_URL", ""),
    username=os.environ.get("SMS_GATEWAY_USER", ""),
    password=os.environ.get("SMS_GATEWAY_PASS", ""),
)

calls = CallService(
    termux_bridge_url=os.environ.get("TERMUX_BRIDGE_URL", ""),
    gemini_service=gemini,
    audio_dir="sms/audio_alerts",
)

CONTACT_GROUPS: dict[str, list[str]] = {}
GROUPS_FILE = "sms/contact_groups.json"
if os.path.exists(GROUPS_FILE):
    with open(GROUPS_FILE) as f:
        CONTACT_GROUPS = json.load(f)

# Demo recipients configured by operator request.
# Keep one blank slot reserved for a future phone number.
DEMO_ALERT_NUMBERS_RAW = [
    "9702226623",
    "9172747866",
    "7769978772",
    "",
]

def save_groups():
    with open(GROUPS_FILE, "w") as f:
        json.dump(CONTACT_GROUPS, f, indent=2)

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
    1: ["cam3.jsonl"],  # Placeholder: cam1.jsonl missing
    2: ["cam2.jsonl", "can2.jsonl"],
    3: ["cam3.jsonl"],
    4: ["cam4.jsonl"],
    5: ["cam5.jsonl"],
    6: ["cam6.jsonl"],
}
CAM_FRAME_CACHE: dict[int, list[dict[str, Any]]] = {}
CAM_FRAME_INDEX: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}


def _touch() -> None:
    state["updated_at"] = datetime.now(timezone.utc).isoformat()


def _normalize_phone_number(number: str) -> str:
    cleaned = re.sub(r"\D", "", str(number or ""))
    if len(cleaned) == 10:
        return cleaned
    if len(cleaned) == 12 and cleaned.startswith("91"):
        return cleaned[-10:]
    return ""


def _demo_valid_numbers() -> list[str]:
    normalized = [_normalize_phone_number(n) for n in DEMO_ALERT_NUMBERS_RAW]
    return [n for n in dict.fromkeys(normalized) if n]


def _build_demo_instruction(level: str, ai_suggestion: str) -> str:
    base = "Coordinate with on-ground officers and keep emergency lanes clear."
    if str(level).lower() == "high":
        base = "Prioritize immediate evacuation flow and emergency exit routing."
    if ai_suggestion:
        return f"{base} Suggested action: {ai_suggestion}"
    return base


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


def _update_dynamic_state():
    """Recalculates scene metrics based on current camera frame rotation."""
    total_camera_people = 0
    max_count = -1
    best_cam_title = "Main Gate"
    
    # Process all cameras to update the live count and find the hotspot
    for cid in sorted(CAM_FRAME_FILES.keys()):
        frame = _next_camera_frame(cid)
        if frame:
            count = frame.get("head_count", 0)
            total_camera_people += count
            if count > max_count:
                max_count = count
                best_cam_title = f"Gate {cid-1}" if cid > 1 else "Main Gate approach"

    # Dynamic metrics: Base baseline + live camera fluctuation
    state["metrics"]["live_count"] = 124800 + total_camera_people
    
    # Calculate a risk percentage for the hotspot based on its count density
    # (Mock calculation: score = 80 + dynamic delta)
    risk_score = round(82.0 + (max_count % 15.0), 1)
    state["metrics"]["hotspot"] = f"{best_cam_title} - {risk_score}%"
    state["metrics"]["system"] = "Online"
    _touch()


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "crowdmanagement-flask", "city": state["city"]})


@app.get("/api/v1/scene")
def scene():
    """Frontend hook endpoint: one call to render map, metrics, and alerts."""
    _update_dynamic_state()
    return jsonify(state)


@app.get("/api/v1/alerts")
def alerts():
    return jsonify({"updated_at": state["updated_at"], "alerts": state["alerts"]})


@app.get("/api/v1/map")
def map_data():
    return jsonify({"updated_at": state["updated_at"], "map": state["map"]})


@app.get("/api/v1/metrics")
def metrics():
    _update_dynamic_state()
    return jsonify({"updated_at": state["updated_at"], "metrics": state["metrics"]})


@app.post("/api/v1/chat")
def handle_chat_api():
    """Handle conversational chat requests from the frontend."""
    if not gemini:
        return jsonify({"reply": "System Error: Gemini Service is not initialized."}), 500
        
    data = request.get_json(silent=True) or {}
    user_msg = data.get("message", "").strip()
    language = data.get("language", "en")
    
    if not user_msg:
        return jsonify({"reply": "I didn't receive a message."}), 400
        
    try:
        reply = gemini.conversational_chat(user_msg, state, language)
        return jsonify({"reply": reply})
    except Exception as e:
        app.logger.error(f"Chat route error: {e}")
        return jsonify({"reply": "Internal Server Error: AI could not process the request."}), 500


@app.get("/api/v1/demo/recipients")
def get_demo_recipients():
    active_numbers = _demo_valid_numbers()
    return jsonify({
        "configured": DEMO_ALERT_NUMBERS_RAW,
        "active": active_numbers,
        "missing_slots": sum(1 for n in DEMO_ALERT_NUMBERS_RAW if not str(n).strip()),
    })


@app.post("/api/v1/demo/suggestion")
def get_demo_suggestion():
    data = request.get_json(silent=True) or {}
    alert_level = str(data.get("alertLevel", "warning")).strip().lower()
    language = data.get("language", "en")

    if alert_level not in {"warning", "high"}:
        return jsonify({"error": "alertLevel must be 'warning' or 'high'"}), 400

    suggestion = gemini.generate_demo_suggestion(alert_level=alert_level, context=state, language=language)
    return jsonify({"suggestion": suggestion, "alertLevel": alert_level})


def _send_demo_alert(level: str, mode: str, language: str) -> tuple[dict[str, Any], int]:
    valid_numbers = _demo_valid_numbers()
    if not valid_numbers:
        return {"error": "No valid demo recipients configured."}, 400

    ai_suggestion = gemini.generate_demo_suggestion(alert_level=level, context=state, language=language)
    incident = "Crowd Warning" if level == "warning" else "High Crowd Pressure"
    location = state.get("main_place") or state.get("city") or "Venue"
    instructions = _build_demo_instruction(level=level, ai_suggestion=ai_suggestion)

    response_payload: dict[str, Any] = {
        "ok": True,
        "level": level,
        "mode": mode,
        "aiSuggestion": ai_suggestion,
        "recipients": valid_numbers,
        "configuredRecipients": DEMO_ALERT_NUMBERS_RAW,
        "missingRecipientSlots": sum(1 for n in DEMO_ALERT_NUMBERS_RAW if not str(n).strip()),
        "sms": None,
        "calls": None,
    }

    if mode in ("sms", "both"):
        sms_text = gemini.generate_sms_message(incident, location, instructions)
        results = sms_service.broadcast(valid_numbers, sms_text)
        response_payload["sms"] = {
            "message": sms_text,
            "sent": sum(1 for r in results if r.success),
            "failed": sum(1 for r in results if not r.success),
            "details": [{"number": r.number, "ok": r.success, "error": r.error} for r in results],
        }

    if mode in ("call", "both"):
        try:
            script, wav_path = calls.prepare_audio(incident, location, instructions)
            remote_path = calls.upload_audio(wav_path)
            calls.broadcast_calls_async(valid_numbers, remote_path)
            response_payload["calls"] = {
                "script": script,
                "audio_file": wav_path,
                "status": "in_progress",
            }
        except Exception as e:
            logger.error("Demo call flow failed: %s", e)
            return {"error": f"Call flow failed: {e}"}, 500

    return response_payload, 200


@app.post("/api/v1/demo/warning-alert")
def execute_warning_alert():
    data = request.get_json(silent=True) or {}
    language = data.get("language", "en")
    payload, status = _send_demo_alert(level="warning", mode="sms", language=language)
    return jsonify(payload), status


@app.post("/api/v1/demo/high-alert")
def execute_high_alert():
    data = request.get_json(silent=True) or {}
    language = data.get("language", "en")
    payload, status = _send_demo_alert(level="high", mode="both", language=language)
    return jsonify(payload), status


@app.get("/api/v1/camera-frame-stats")
def camera_frame_stats():
    requested_cam = request.args.get("camera_id", type=int)

    if requested_cam is not None:
        if requested_cam not in CAM_FRAME_FILES:
            return jsonify({"error": "camera_id must be between 1 and 6"}), 400

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


# ─────────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────────

@app.get("/")
def dashboard():
    return render_template("dashboard.html", groups=list(CONTACT_GROUPS.keys()))

@app.get("/api/status")
def api_status():
    return jsonify({
        "sms_gateway": sms_service.is_online(),
        "termux_bridge": calls.is_online(),
        "device_info": sms_service.get_device_info(),
    })

@app.get("/api/groups")
def get_groups():
    return jsonify(CONTACT_GROUPS)

@app.post("/api/groups/<name>")
def upsert_group(name: str):
    data = request.json
    CONTACT_GROUPS[name] = data.get("numbers", [])
    save_groups()
    return jsonify({"ok": True, "group": name, "count": len(CONTACT_GROUPS[name])})

@app.delete("/api/groups/<name>")
def delete_group(name: str):
    CONTACT_GROUPS.pop(name, None)
    save_groups()
    return jsonify({"ok": True})

@app.post("/api/preview")
def preview_alert():
    d = request.json
    incident = d["incidentType"]
    location = d["location"]
    instructions = d.get("instructions", "")

    sms_text = gemini.generate_sms_message(incident, location, instructions)
    voice_script = gemini.generate_voice_script(incident, location, instructions)

    return jsonify({"sms": sms_text, "voice": voice_script})

@app.post("/api/send-alert")
def send_alert():
    d = request.json
    incident    = d["incidentType"]
    location    = d["location"]
    instructions = d.get("instructions", "")
    mode        = d["mode"]          # "sms" | "call" | "both"
    group_name  = d.get("group", "")
    custom_nums = d.get("customNumbers", [])

    numbers = list(CONTACT_GROUPS.get(group_name, [])) + custom_nums
    numbers = list(dict.fromkeys(numbers))
    if not numbers:
        return jsonify({"error": "No recipients specified"}), 400

    response_payload = {
        "total": len(numbers),
        "mode": mode,
        "sms": None,
        "calls": None,
    }

    if mode in ("sms", "both"):
        message = gemini.generate_sms_message(incident, location, instructions)
        results = sms_service.broadcast(numbers, message)
        response_payload["sms"] = {
            "message": message,
            "sent": sum(1 for r in results if r.success),
            "failed": sum(1 for r in results if not r.success),
            "details": [{"number": r.number, "ok": r.success, "error": r.error} for r in results],
        }

    if mode in ("call", "both"):
        try:
            script, wav_path = calls.prepare_audio(incident, location, instructions)
            remote_path = calls.upload_audio(wav_path)
            call_results = []
            def on_progress(result):
                call_results.append({"number": result.number, "ok": result.success, "error": result.error})
            calls.broadcast_calls_async(numbers, remote_path, on_progress)
            response_payload["calls"] = {
                "script": script,
                "audio_file": wav_path,
                "status": "in_progress",
                "note": "Calls are being made sequentially.",
            }
        except Exception as e:
            logger.error("Audio preparation failed: %s", e)
            return jsonify({"error": f"Audio preparation failed: {e}"}), 500

    return jsonify({"ok": True, **response_payload})


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
    app.run(host="0.0.0.0", port=5001, debug=True)
