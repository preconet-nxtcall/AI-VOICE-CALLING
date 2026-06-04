import requests
import json

BASE = "https://ai-voice-calling-bz0z.onrender.com"
creds = {"email": "final_test@example.com", "password": "Password123!"}

print("1. Logging in...")
resp = requests.post(f"{BASE}/api/v1/auth/login", json=creds, timeout=30)
if resp.status_code != 200:
    print(f"Failed to log in: {resp.text}")
    exit(1)

token = resp.json().get("access_token") or resp.json().get("token") or resp.json().get("data", {}).get("access_token")
if not token:
    print("Could not obtain access token.")
    exit(1)
print("Login successful.")

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

kb_id = "e18d2e37-be7a-4fff-81a7-a3deddb114e9"
script_id = "59dc8a1c-def9-4c13-befb-cbfdaa656954"
target_phone = "+918918523121"

print(f"\nTriggering outbound call to {target_phone}...")
call_payload = {
    "phone_number": target_phone,
    "knowledge_base_id": kb_id,
    "script_id": script_id
}

resp = requests.post(f"{BASE}/api/v1/agent/call", json=call_payload, headers=headers, timeout=30)
print(f"Status: {resp.status_code}")
print(f"Response: {json.dumps(resp.json(), indent=2)}")
