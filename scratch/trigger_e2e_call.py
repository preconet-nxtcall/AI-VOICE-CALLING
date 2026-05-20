import requests
import time
import os

BASE_URL = "https://ai-voice-calling-bz0z.onrender.com/api/v1"
EMAIL = "preconetofficialmannan@gmail.com"
PASSWORD = "Admin123"
CSV_PATH = "scratch/test_lead.csv"

def run_test():
    print(f"1. Authenticating as {EMAIL}...")
    login_resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": EMAIL,
        "password": PASSWORD
    })
    
    if login_resp.status_code != 200:
        print(f"Error authenticating: {login_resp.status_code} - {login_resp.text}")
        return
        
    token = login_resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    print("Authentication successful!")

    print("\n2. Fetching existing campaigns to retrieve KB and Script IDs...")
    campaigns_resp = requests.get(f"{BASE_URL}/campaigns", headers=headers)
    if campaigns_resp.status_code != 200:
        print(f"Error fetching campaigns: {campaigns_resp.status_code} - {campaigns_resp.text}")
        return
        
    campaigns = campaigns_resp.json().get("campaigns", [])
    kb_id = None
    script_id = None
    
    # Try to find a campaign with configured KB and Script
    for c in campaigns:
        if c.get("knowledge_base_id") and c.get("script_id"):
            kb_id = c.get("knowledge_base_id")
            script_id = c.get("script_id")
            break
            
    if not kb_id or not script_id:
        print("Error: Could not find any existing campaign with valid Knowledge Base and Script configured. Please configure one in the UI first.")
        return
        
    print(f"Retrieved Configs - Knowledge Base ID: {kb_id} | Script ID: {script_id}")

    # Generate a unique campaign name using the current timestamp
    timestamp = int(time.time())
    new_campaign_name = f"E2E Recheck Campaign {timestamp}"
    
    print(f"\n3. Creating a brand new campaign: '{new_campaign_name}'...")
    create_resp = requests.post(f"{BASE_URL}/campaigns", headers=headers, json={
        "name": new_campaign_name,
        "knowledge_base_id": kb_id,
        "script_id": script_id,
        "status": "draft",
        "daily_limit": 100,
        "dialing_speed": "normal",
        "caller_id": "+14155550101" # Test caller ID
    })
    
    if create_resp.status_code not in (200, 201):
        print(f"Failed to create new campaign: {create_resp.status_code} - {create_resp.text}")
        return
        
    new_campaign = create_resp.json().get("campaign", {})
    campaign_id = new_campaign.get("id")
    print(f"New campaign created successfully! ID: {campaign_id}")

    print(f"\n4. Uploading leads from {CSV_PATH} to campaign {campaign_id}...")
    if not os.path.exists(CSV_PATH):
        print(f"Error: CSV file not found at {CSV_PATH}")
        return
        
    with open(CSV_PATH, 'rb') as f:
        files = {'file': ('test_lead.csv', f, 'text/csv')}
        upload_resp = requests.post(f"{BASE_URL}/campaigns/{campaign_id}/upload", headers=headers, files=files)
        
    print(f"Upload response: {upload_resp.status_code} - {upload_resp.text}")
    if upload_resp.status_code not in (200, 201):
        print("Upload failed!")
        return

    print("\n5. Activating the new campaign...")
    status_resp = requests.patch(f"{BASE_URL}/campaigns/{campaign_id}/status", headers=headers, json={
        "status": "active"
    })
    print(f"Activation response: {status_resp.status_code} - {status_resp.text}")

    print("\n6. Triggering manual dialer sweep...")
    sweep_resp = requests.post(f"{BASE_URL}/campaigns/sweep", headers=headers)
    print(f"Sweep response: {sweep_resp.status_code} - {sweep_resp.text}")

    print("\n7. Monitoring lead dialing status...")
    for i in range(5):
        print(f"\n--- Checking leads status (Check #{i+1}) ---")
        leads_resp = requests.get(f"{BASE_URL}/campaigns/{campaign_id}/leads", headers=headers)
        if leads_resp.status_code == 200:
            leads = leads_resp.json().get("leads", [])
            for l in leads:
                print(f"Lead ID: {l.get('id')} | Phone: {l.get('phone_number')} | Status: {l.get('status')} | Error: {l.get('error_message')}")
        else:
            print(f"Error fetching leads: {leads_resp.status_code}")
        time.sleep(8)

if __name__ == "__main__":
    run_test()
