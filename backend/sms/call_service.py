"""
Call service — orchestrates AI voice calls via the Termux bridge running
on your Android phone.

Flow:
  1. Gemini generates the voice script
  2. Gemini TTS converts it to WAV
  3. WAV is uploaded to the Termux bridge
  4. Bridge initiates the call and plays the audio over speakerphone
"""

import os
import time
import logging
import threading
from typing import List, Callable, Optional
from dataclasses import dataclass

import requests

from .gemini_service import GeminiService

logger = logging.getLogger(__name__)


@dataclass
class CallResult:
    number: str
    success: bool
    error: str = ""


class CallService:
    # Gap between consecutive calls (seconds) — avoids hammering the phone
    CALL_INTERVAL = 35

    def __init__(
        self,
        termux_bridge_url: str,
        gemini_service: GeminiService,
        audio_dir: str = "audio_alerts",
    ):
        """
        termux_bridge_url: e.g. "http://192.168.1.42:5001"
                           (Termux bridge running on the same Android phone)
        """
        self.bridge = termux_bridge_url.rstrip("/")
        self.gemini = gemini_service
        self.audio_dir = audio_dir
        os.makedirs(audio_dir, exist_ok=True)

    # ─────────────────────────────────────────────
    # Audio preparation
    # ─────────────────────────────────────────────

    def prepare_audio(
        self, incident_type: str, location: str, instructions: str
    ) -> tuple[str, str]:
        """
        Generate voice script + TTS audio file.
        Returns: (script_text, local_wav_path)
        """
        script = self.gemini.generate_voice_script(incident_type, location, instructions)
        safe = incident_type.lower().replace(" ", "_")[:24]
        wav_path = os.path.join(self.audio_dir, f"alert_{safe}.wav")
        self.gemini.text_to_speech(script, wav_path)
        logger.info("Audio prepared: %s", wav_path)
        return script, wav_path

    def upload_audio(self, local_wav_path: str) -> str:
        """
        Upload the WAV file to the Termux bridge so the Android phone can
        play it locally during the call.
        Returns the remote path on the Android device.
        """
        with open(local_wav_path, "rb") as f:
            r = requests.post(
                f"{self.bridge}/upload-audio",
                files={"audio": (os.path.basename(local_wav_path), f, "audio/wav")},
                timeout=30,
            )
        r.raise_for_status()
        remote_path = r.json()["path"]
        logger.info("Audio uploaded → %s", remote_path)
        return remote_path

    # ─────────────────────────────────────────────
    # Calling
    # ─────────────────────────────────────────────

    def call_single(self, phone_number: str, remote_audio_path: str) -> CallResult:
        """Trigger one call via the Termux bridge."""
        try:
            r = requests.post(
                f"{self.bridge}/make-call",
                json={"phoneNumber": phone_number, "audioFile": remote_audio_path},
                timeout=15,
            )
            r.raise_for_status()
            logger.info("Call initiated → %s", phone_number)
            return CallResult(number=phone_number, success=True)
        except Exception as e:
            logger.error("Call failed → %s: %s", phone_number, e)
            return CallResult(number=phone_number, success=False, error=str(e))

    def broadcast_calls(
        self,
        phone_numbers: List[str],
        remote_audio_path: str,
        on_progress: Optional[Callable[[CallResult], None]] = None,
    ) -> List[CallResult]:
        """
        Call every number sequentially with a gap between each.
        Accepts an optional callback for real-time progress updates.
        """
        results = []
        for i, number in enumerate(phone_numbers):
            if i > 0:
                time.sleep(self.CALL_INTERVAL)
            result = self.call_single(number, remote_audio_path)
            results.append(result)
            if on_progress:
                on_progress(result)
        return results

    def broadcast_calls_async(
        self,
        phone_numbers: List[str],
        remote_audio_path: str,
        on_progress: Optional[Callable[[CallResult], None]] = None,
    ) -> threading.Thread:
        """
        Same as broadcast_calls but runs in a background thread.
        Returns the thread (already started).
        """
        t = threading.Thread(
            target=self.broadcast_calls,
            args=(phone_numbers, remote_audio_path, on_progress),
            daemon=True,
        )
        t.start()
        return t

    # ─────────────────────────────────────────────
    # Health check
    # ─────────────────────────────────────────────

    def is_online(self) -> bool:
        try:
            r = requests.get(f"{self.bridge}/health", timeout=5)
            return r.status_code == 200
        except Exception:
            return False
