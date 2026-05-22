import requests

base_url = "https://ai-voice-calling-bz0z.onrender.com"

print("Fetching system info from Render...")
try:
    resp = requests.get(f"{base_url}/api/v1/sys-info", timeout=10)
    print(f"Status: {resp.status_code}")
    print(resp.json())
except Exception as e:
    print(f"Error: {e}")
