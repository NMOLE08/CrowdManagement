"""
Gemini service — handles two jobs:
  1. Generate alert text (SMS message + voice call script)
  2. Convert that text to speech (WAV file) using Gemini TTS
"""

import os
import wave
import logging
import json
from typing import Dict, Optional
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Available Gemini TTS voices (authoritative-sounding options)
# Aoede = clear and calm, Charon = deep and steady, Fenrir = confident
VOICE_NAME = "Aoede"


class GeminiService:
    """Wrapper around Gemini models for chat, SMS, voice scripts, and TTS.

    Provides methods to generate conversational responses, SMS alerts, voice scripts,
    and text‑to‑speech audio files.
    """

    def __init__(self, api_key: str) -> None:
        self.client = genai.Client(api_key=api_key)

    # ─────────────────────────────────────────────
    # Text generation
    # ─────────────────────────────────────────────

    def conversational_chat(self, user_msg: str, context: Optional[Dict] = None, language: str = "en") -> str:
        """Process a chat message with optional telemetry context and grounding.

        Uses Google Search grounding to answer spatial/POI queries and respects
         the dashboard's current language toggle.
        """
        # Serialize telemetry context for inclusion in the prompt
        context_str = json.dumps(context, indent=2) if context else "No live telemetry available."
        
        lang_rule = "Reply in English."
        if language == "mr":
            lang_rule = "MANDATORY: Reply entirely in the Marathi language."

        prompt = (
            f"You are CrowdShield Assistant, an AI expert in crowd management and public safety.\n"
            f"Your goal is to assist the dashboard operator with succinct advice about the venue.\n"
            f"\n"
            f"CURRENT VENUE STATE & MAP TELEMETRY:\n{context_str}\n"
            f"\n"
            f"User message: {user_msg}\n"
            f"\n"
            f"HARD RULES FOR RESPONSE FORMATTING:\n"
            f"1. {lang_rule}\n"
            f"2. NEVER use asterisks (*), hyphens (-), or any markdown symbols.\n"
            f"3. NEVER use bullet points. Write in clean, standard conversational paragraphs.\n"
            f"4. If searching for locations (hospitals, exits), provide real-world addresses from Pune.\n"
            f"5. DO NOT output raw JSON blocks. Keep answers conversational."
        )
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearchRetrieval())]
                )
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini Chat error: {e}")
            return "Sorry, I am currently offline or experiencing a connection issue."

    def generate_sms_message(self, incident_type: str, location: str, instructions: str) -> str:
        """Generate a concise SMS alert (≤160 chars) for the given incident."""
        prompt = f"""You are an emergency alert system for crowd management authorities.
Generate a clear, actionable SMS alert for the following situation.

Incident Type: {incident_type}
Location: {location}
Instructions: {instructions}

Rules:
- Maximum 155 characters (must fit in one SMS)
- MUST be written entirely in the Marathi language.
- Start with ALERT: (in Marathi)
- State the incident, location, and one clear action
- Calm but urgent tone — no panic-inducing language
- No hashtags, links, or special formatting

Reply with ONLY the Marathi SMS text, nothing else."""

        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini SMS error: {e}")
            return f"🚨 दक्षता: {location} येथे {incident_type} ची नोंद झाली आहे. {instructions}"

    def generate_voice_script(self, incident_type: str, location: str, instructions: str) -> str:
        """Generate a spoken voice call script (~40 seconds / 110 words)."""
        prompt = f"""You are an emergency broadcast AI for a crowd management authority.
Generate a voice call script to be read aloud to the public.

Incident Type: {incident_type}
Location: {location}
Instructions: {instructions}

Rules:
- Approximately 100–120 words (fits in ~40 seconds when spoken clearly)
- MUST be written entirely in the Marathi language.
- Start with a Marathi equivalent to: "This is an official public safety alert."
- Cover: what is happening, where, what people should do right now
- End with a Marathi equivalent to: "Please follow all instructions from authorities. Stay safe."
- Calm, authoritative tone — this is broadcast to large crowds
- No filler phrases, no repetition

Reply with ONLY the spoken Marathi script, nothing else."""

        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini Voice Script error: {e}")
            return f"हा एक अधिकृत सार्वजनिक सुरक्षा इशारा आहे. {location} येथे {incident_type} ची घटना घडत आहे. {instructions}. कृपया अधिकाऱ्यांच्या सर्व सूचनांचे पालन करा. सुरक्षित रहा."

    def generate_demo_suggestion(self, alert_level: str, context: Optional[Dict] = None, language: str = "en") -> str:
        """Generate short operational suggestion text for warning/high-alert modal cards."""
        context_str = json.dumps(context, indent=2) if context else "No live telemetry available."
        level = "high" if str(alert_level).strip().lower() in {"high", "high_alert", "critical"} else "warning"
        lang_rule = "Reply in English."
        if language == "mr":
            lang_rule = "MANDATORY: Reply entirely in Marathi."

        prompt = (
            "You are CrowdShield Assistant, an expert in live crowd operations.\n"
            f"Current telemetry:\n{context_str}\n\n"
            f"Alert level: {level}\n"
            "Generate one concise actionable suggestion for ground officers.\n"
            "Constraints:\n"
            f"1. {lang_rule}\n"
            "2. Keep it to a single sentence, maximum 16 words.\n"
            "3. No markdown, bullets, labels, or extra commentary.\n"
            "4. Mention the safest movement/exit strategy if possible."
        )

        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            return (response.text or "").strip()
        except Exception as e:
            logger.error(f"Gemini Suggestion error: {e}")
            if language == "mr":
                return "गर्दीला जवळच्या सुरक्षित बाहेर पडण्याच्या मार्गाकडे वळवा आणि प्रवेश वेग नियंत्रित ठेवा."
            return "Reroute crowd to the nearest safe exit and regulate inflow pace immediately."

    # ─────────────────────────────────────────────
    # Text-to-speech
    # ─────────────────────────────────────────────

    def text_to_speech(self, text: str, output_path: str) -> str:
        """
        Convert text to a WAV audio file using Gemini TTS.

        Gemini TTS returns raw PCM bytes (24 kHz, 16-bit, mono).
        We wrap them in a proper WAV container.

        Returns: the path to the saved WAV file.
        """
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=VOICE_NAME
                            )
                        )
                    ),
                ),
            )

            # Extract raw PCM bytes from response
            audio_data = response.candidates[0].content.parts[0].inline_data.data

            # Save as WAV
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with wave.open(output_path, "wb") as wf:
                wf.setnchannels(1)   # Mono
                wf.setsampwidth(2)   # 16-bit = 2 bytes per sample
                wf.setframerate(24000)  # Gemini TTS native sample rate
                wf.writeframes(audio_data)

            logger.info("TTS audio saved → %s (%d bytes)", output_path, len(audio_data))
            return output_path
        except Exception as e:
            logger.error(f"Gemini TTS error: {e}")
            # Use offline TTS fallback audio
            fallback_wav = "/Users/adityajadhav/Downloads/sim/audio_alerts/fallback.wav"
            import shutil
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            if os.path.exists(fallback_wav):
                shutil.copy(fallback_wav, output_path)
            return output_path
