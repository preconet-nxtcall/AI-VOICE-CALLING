import requests
import json

api_token = "162397|R8dlvTSnVTsFTprDzFBeGLc5TjhSlkfxnXsTwAqa1e981fce"
did_number = "919484957094"
to_number = "8918523121"
country_code = ""

payload = {
    "did_number": did_number,
    "customer_number": to_number,
    "country_code": country_code,
    "custom_parameters": json.dumps({"kb_id": "test_kb", "temp_call_sid": "test_sid"}),
    "websocket_url": "wss://ai-voice-calling-bz0z.onrender.com/voice/voicelink-stream",
    "webhook_url": "https://ai-voice-calling-bz0z.onrender.com/voice/voicelink-status-callback",
    "call_limit": 1
}

headers = {
    "Authorization": f"Bearer {api_token}",
    "Content-Type": "application/json"
}

print("Initiating Direct VoiceLink API test...")
try:
    resp = requests.post(
        "https://app.voicelink.co.in/api/v1/add_lead",
        json=payload,
        headers=headers,
        timeout=15
    )
    print(f"HTTP Status Code: {resp.status_code}")
    print(f"Response Headers: {resp.headers}")
    print(f"Response Content: {resp.text}")
except Exception as e:
    print(f"Request failed: {e}")
