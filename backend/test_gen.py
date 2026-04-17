import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
for model in ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash-lite-001"]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {"contents":[{"parts":[{"text":"Hello"}]}]}
    resp = requests.post(url, json=payload)
    if resp.status_code == 200:
        print(f"SUCCESS: {model}")
        break
    else:
        print(f"FAIL {model}: {resp.status_code} - {resp.text[:50]}")
