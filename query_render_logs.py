import requests

base_url = "https://ai-voice-calling-bz0z.onrender.com"

print("Fetching Persistent WS/Webhook File Logs from Render...")
try:
    resp = requests.get(f"{base_url}/api/v1/ws-file-logs", timeout=10)
    print(f"Status: {resp.status_code}")
    logs = resp.json().get("logs", [])
    print(f"Retrieved {len(logs)} log entries:")
    for log in logs:
        print(log)
except Exception as e:
    print(f"Error fetching WS File Logs: {e}")

print("\nFetching In-Memory WS Logs from Render...")
try:
    resp = requests.get(f"{base_url}/api/v1/ws-logs", timeout=10)
    print(f"Status: {resp.status_code}")
    logs = resp.json().get("logs", [])
    print(f"Retrieved {len(logs)} legacy log entries.")
except Exception as e:
    print(f"Error fetching Legacy WS Logs: {e}")

print("\nFetching Debug Logs from Render...")
try:
    resp = requests.get(f"{base_url}/api/v1/debug-logs", timeout=10)
    print(f"Status: {resp.status_code}")
    print(resp.text[:2000]) # print first 2000 chars of debug.log
except Exception as e:
    print(f"Error fetching Debug Logs: {e}")

