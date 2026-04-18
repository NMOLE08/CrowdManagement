#!/usr/bin/env python3
"""
Termux bridge — runs on your Android phone inside Termux.

Setup:
  1. Install Termux from F-Droid (NOT Google Play — it's outdated there)
  2. Install Termux:API app from F-Droid
  3. Inside Termux:
       pkg update && pkg install python termux-api
       pip install flask
  4. Allow Termux to make calls:
       Settings → Apps → Termux → Permissions → Phone → Allow
  5. Run this script:
       python termux_bridge.py

The Flask server on your laptop/PC will talk to this script
to trigger calls and upload audio files.

Notes on audio during calls:
  - Audio is played via the phone's speaker using termux-media-player
  - The phone microphone picks it up and the caller hears it
  - Set call volume to maximum for clearest transmission
  - Works well for one-way announcement calls (crowd management alerts)
"""

import os
import subprocess
import time
import threading
import logging

from flask import Flask, request, jsonify

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Where uploaded audio files are stored on the Android device
AUDIO_DIR = "/sdcard/crowd_alerts"
os.makedirs(AUDIO_DIR, exist_ok=True)

# Seconds to wait after dialling before playing audio (ring + answer time)
ANSWER_WAIT = 10

# Seconds to wait after audio ends before the script considers the call done
POST_AUDIO_BUFFER = 5


# ─────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────

@app.get("/health")
def health():
    return jsonify({"status": "ok", "audio_dir": AUDIO_DIR})


# ─────────────────────────────────────────────────
# Audio upload
# ─────────────────────────────────────────────────

@app.post("/upload-audio")
def upload_audio():
    """
    Receive a WAV file from the Flask server and save it locally.
    The Flask server calls this before initiating calls.
    """
    file = request.files.get("audio")
    if not file:
        return jsonify({"error": "No audio file in request"}), 400

    save_path = os.path.join(AUDIO_DIR, file.filename)
    file.save(save_path)
    logger.info("Audio saved: %s (%d bytes)", save_path, os.path.getsize(save_path))
    return jsonify({"path": save_path, "ok": True})


# ─────────────────────────────────────────────────
# Make a call
# ─────────────────────────────────────────────────

@app.post("/make-call")
def make_call():
    """
    Initiate a phone call and play the alert audio.
    The Flask server sends: { "phoneNumber": "+91...", "audioFile": "/sdcard/..." }
    """
    data = request.json or {}
    number = data.get("phoneNumber", "").strip()
    audio_file = data.get("audioFile", "").strip()

    if not number:
        return jsonify({"error": "phoneNumber is required"}), 400

    if audio_file and not os.path.exists(audio_file):
        return jsonify({"error": f"Audio file not found: {audio_file}"}), 400

    # Run the call in a background thread so we can return immediately
    thread = threading.Thread(
        target=_call_and_play,
        args=(number, audio_file),
        daemon=True,
    )
    thread.start()

    return jsonify({"ok": True, "number": number, "audio": audio_file})


# ─────────────────────────────────────────────────
# Send SMS
# ─────────────────────────────────────────────────

@app.post("/send-sms")
def send_sms():
    """
    Send an SMS via termux-sms-send.
    The Flask server sends: { "phoneNumbers": ["+91..."], "message": "... " }
    """
    data = request.json or {}
    numbers = data.get("phoneNumbers", [])
    message = data.get("message", "").strip()

    if not numbers or not message:
        return jsonify({"error": "phoneNumbers and message are required"}), 400

    results = []
    for num in numbers:
        try:
            # -n flag for phone number
            logger.info("Sending SMS to %s ...", num)
            subprocess.run(["termux-sms-send", "-n", num, message], check=True)
            results.append({"number": num, "ok": True})
        except Exception as e:
            logger.error("Failed to send SMS to %s: %s", num, e)
            results.append({"number": num, "ok": False, "error": str(e)})

    return jsonify({"ok": True, "results": results})


def _call_and_play(number: str, audio_file: str):
    """Background task: dial → wait for answer → play audio → end call."""
    logger.info("Dialling %s …", number)

    # 1. Initiate the call (opens the phone dialler via termux-telephony-call)
    subprocess.run(["termux-telephony-call", number], check=False)

    # 2. Wait for the person to answer
    logger.info("Waiting %ds for answer…", ANSWER_WAIT)
    time.sleep(ANSWER_WAIT)

    if audio_file:
        # 3. Maximise call and media volume so the mic picks up the speaker clearly
        subprocess.run(["termux-volume", "call", "100"], check=False)
        subprocess.run(["termux-volume", "music", "100"], check=False)

        # 4. Play the audio — the phone's mic picks this up during the call
        logger.info("Playing audio: %s", audio_file)
        subprocess.run(["termux-media-player", "play", audio_file], check=False)

        # 5. Wait for audio to finish (estimate from file size if needed, or use a fixed wait)
        # A 40-second script at 24kHz 16-bit mono ≈ 1.92 MB — we wait 50s to be safe
        time.sleep(50)
        subprocess.run(["termux-media-player", "stop"], check=False)

    # 6. Small buffer, then the call will naturally end or be hung up by the recipient
    time.sleep(POST_AUDIO_BUFFER)
    logger.info("Call sequence complete for %s", number)


# ─────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────

if __name__ == "__main__":
    # 0.0.0.0 so it is reachable from your laptop on the same Wi-Fi network
    print(f"\n  Termux bridge running on port 5001")
    print(f"  Audio dir: {AUDIO_DIR}")
    print(f"  Make sure your PC's TERMUX_BRIDGE_URL points to this device's IP\n")
    app.run(host="0.0.0.0", port=5001, debug=False)
