from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
import re

import os
import json
import logging
from dotenv import load_dotenv

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
