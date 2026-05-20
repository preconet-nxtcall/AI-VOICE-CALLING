import requests
import time

URL = "https://ai-voice-calling-bz0z.onrender.com/api/v1/campaigns/sweep"

print("Starting deployment poll...")
for i in range(30):
    try:
        resp = requests.post(URL)
        status = resp.status_code
        print(f"Attempt {i+1}: Status = {status}")
        if status == 401:
            print("SUCCESS! The new deployment is LIVE! `/campaigns/sweep` exists and requires authentication!")
            break
    except Exception as e:
        print(f"Attempt {i+1}: Error = {e}")
    time.sleep(15)
