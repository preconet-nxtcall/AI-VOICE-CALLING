import requests
import json

base_url = "https://ai-voice-calling-bz0z.onrender.com"

print("Fetching Webhook Logs from Render...")
try:
    resp = requests.get(f"{base_url}/api/v1/webhook-logs", timeout=10)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        logs = data.get("logs", [])
        if not logs:
            print("No webhook callback logs found on the server.")
        else:
            for i, entry in enumerate(logs, 1):
                print(f"\n[{i}] Time: {entry.get('timestamp')}")
                print(f"Payload: {json.dumps(entry.get('payload'), indent=2)}")
    else:
        print(f"Failed to fetch logs: {resp.text}")
except Exception as e:
    print(f"Error fetching Webhook Logs: {e}")
