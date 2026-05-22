import requests

base_url = "https://ai-voice-calling-bz0z.onrender.com"

print("Fetching entire Debug Logs from Render...")
try:
    resp = requests.get(f"{base_url}/api/v1/debug-logs", timeout=10)
    print(f"Status: {resp.status_code}")
    
    # Save the log to a local file
    with open("render_debug.log", "w", encoding="utf-8") as f:
        f.write(resp.text)
    print("Logs saved to render_debug.log successfully.")
    
    # Print the last 1000 lines or last 3000 chars
    lines = resp.text.split("\n")
    print(f"Total lines: {len(lines)}")
    print("\n--- Last 50 lines of logs ---")
    for line in lines[-50:]:
        print(line)
        
except Exception as e:
    print(f"Error fetching Debug Logs: {e}")
