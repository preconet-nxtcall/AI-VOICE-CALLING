import requests
import json

BASE = "https://ai-voice-calling-bz0z.onrender.com"

# Try multiple possible credentials
credentials_to_try = [
    {"email": "test_auth@example.com", "password": "Password123!"},
    {"email": "final_test@example.com", "password": "Password123!"},
    {"email": "admin@example.com", "password": "admin123"},
]

token = None
for creds in credentials_to_try:
    print(f"Trying: {creds['email']}")
    try:
        resp = requests.post(
            f"{BASE}/api/v1/auth/login",
            json=creds,
            timeout=30
        )
        print(f"  Status: {resp.status_code}")
        data = resp.json()
        # Try different token field names
        token = (
            data.get("access_token") or
            data.get("token") or
            (data.get("data") or {}).get("access_token") or
            (data.get("data") or {}).get("token")
        )
        if token:
            print(f"  SUCCESS! Token obtained.")
            break
        else:
            print(f"  Response: {json.dumps(data)[:200]}")
    except Exception as e:
        print(f"  Error: {e}")

if not token:
    print("\nCould not login. Trying to list KBs without auth...")
    # Maybe the endpoint is public
    resp = requests.get(f"{BASE}/api/v1/knowledge/list", timeout=30)
    print(f"Status: {resp.status_code}")
    print(resp.text[:500])
else:
    # Get knowledge bases
    print("\nFetching knowledge bases...")
    endpoints = [
        "/api/v1/knowledge/list",
        "/api/v1/knowledge-bases",
    ]
    for ep in endpoints:
        try:
            resp2 = requests.get(
                f"{BASE}{ep}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            print(f"\n{ep} -> Status: {resp2.status_code}")
            if resp2.status_code == 200:
                print(resp2.text[:1000])
                break
        except Exception as e:
            print(f"  Error: {e}")
