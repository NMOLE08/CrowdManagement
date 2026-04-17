import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
resp = requests.get(url)
for m in resp.json().get("models", []):
    if "flash" in m["name"]:
        print(m["name"])
