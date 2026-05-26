import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(override=True)

api_token = os.environ.get("VOICELINK_API_TOKEN")
did_number = os.environ.get("VOICELINK_DID_NUMBER")
public_url = os.environ.get("PUBLIC_BASE_URL")
country_code = os.environ.get("VOICELINK_COUNTRY_CODE", "")

print(f"VoiceLink API Token: {api_token}")
print(f"DID Number: {did_number}")
print(f"Public Base URL: {public_url}")
print(f"Country Code: '{country_code}'")

def make_call(to_number, country_code_val):
    # Strip leading +
    did_clean = did_number.strip()
    if did_clean.startswith("+"):
        did_clean = did_clean[1:]
        
    cust_clean = to_number.strip()
    if cust_clean.startswith("+"):
        cust_clean = cust_clean[1:]
        
    ws_base = public_url.replace("https://", "wss://").replace("http://", "ws://")
    websocket_url = f"{ws_base}/voice/voicelink-stream"
    webhook_url = f"{public_url}/voice/voicelink-status-callback"
    
    custom_params = json.dumps({
        "kb_id": "test-kb-uuid", 
        "temp_call_sid": "test-temp-sid"
    })
    
    payload = {
        "did_number": did_clean,
        "customer_number": cust_clean,
        "country_code": country_code_val,
        "custom_parameters": custom_params,
        "websocket_url": websocket_url,
        "webhook_url": webhook_url,
    }
    
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    
    url = "https://app.voicelink.co.in/api/v1/add_lead"
    print(f"\nSending payload to VoiceLink: {json.dumps(payload, indent=2)}")
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
        print(f"Response status: {resp.status_code}")
        print(f"Response body: {resp.text}")
    except Exception as e:
        print(f"ERROR: {e}")

# Test with country code "91" (India) and customer = 8918523121
print("\n--- Triggering single call to 8918523121 (India) ---")
make_call("8918523121", "91")

