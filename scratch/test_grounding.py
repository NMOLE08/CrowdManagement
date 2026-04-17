import os
import logging
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

try:
    # Use gemini-2.0-flash or gemini-1.5-flash for grounding test
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="What are the nearest hospitals to Dagdusheth Ganpati Mandir in Pune?",
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearchRetrieval())]
        )
    )
    print("--- RESPONSE ---")
    print(response.text)
    if response.candidates[0].grounding_metadata:
        print("\n--- GROUNDING METADATA FOUND ---")
except Exception as e:
    print(f"Error: {e}")
