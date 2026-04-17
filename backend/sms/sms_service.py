"""
SMS service — wraps the android-sms-gateway REST API.

android-sms-gateway GitHub: https://github.com/capcom6/android-sms-gateway
Install the app on your Android phone, note the local IP (e.g. 192.168.1.x:8080).
Default credentials: admin / (set on first launch).
"""

import logging
from typing import List
from dataclasses import dataclass, field
import requests

logger = logging.getLogger(__name__)


@dataclass
class SMSResult:
    number: str
    success: bool
    message_id: str = ""
    error: str = ""


class SMSService:
    def __init__(self, gateway_url: str, username: str, password: str):
        """
        gateway_url: e.g. "http://192.168.1.42:8080"
        """
        self.base = gateway_url.rstrip("/")
        self.auth = (username, password)
        self.timeout = 12  # seconds

    # ─────────────────────────────────────────────
    # Core send methods
    # ─────────────────────────────────────────────

    def send(self, phone_number: str, message: str) -> SMSResult:
        """Send a single SMS."""
        try:
            r = requests.post(
                f"{self.base}/message",
                json={
                    "phoneNumbers": [phone_number],
                    "message": message,
                    "withDeliveryReport": True,
                },
                auth=self.auth,
                timeout=self.timeout,
            )
            r.raise_for_status()
            data = r.json()
            return SMSResult(
                number=phone_number,
                success=True,
                message_id=data.get("id", ""),
            )
        except requests.HTTPError as e:
            logger.error("SMS HTTP error %s → %s", phone_number, e)
            return SMSResult(number=phone_number, success=False, error=str(e))
        except Exception as e:
            logger.error("SMS send failed %s → %s", phone_number, e)
            return SMSResult(number=phone_number, success=False, error=str(e))

    def broadcast(self, phone_numbers: List[str], message: str) -> List[SMSResult]:
        """
        Send the same message to a list of numbers.
        The android-sms-gateway supports sending to multiple numbers in one
        request, but we fan out individually for granular per-number results.
        """
        results = []
        for number in phone_numbers:
            result = self.send(number, message)
            results.append(result)
            logger.info(
                "SMS %s → %s (%s)",
                "OK" if result.success else "FAIL",
                number,
                result.error or result.message_id,
            )
        return results

    # ─────────────────────────────────────────────
    # Health check
    # ─────────────────────────────────────────────

    def is_online(self) -> bool:
        """Returns True if the Android gateway is reachable."""
        try:
            r = requests.get(
                f"{self.base}/health",
                auth=self.auth,
                timeout=5,
            )
            return r.status_code == 200
        except Exception:
            return False

    def get_device_info(self) -> dict:
        """Get gateway device info (battery, connection type, etc.)."""
        try:
            r = requests.get(f"{self.base}/device", auth=self.auth, timeout=5)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"error": str(e)}
