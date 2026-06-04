import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)

api_key = os.environ.get("ELEVENLABS_API_KEY")
voice_id_hindi_female = os.environ.get("ELEVENLABS_VOICE_ID_HINDI_FEMALE")
voice_id_default = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

print(f"API Key: {api_key}")
print(f"Hindi Female Voice ID: {voice_id_hindi_female}")
print(f"Default Voice ID: {voice_id_default}")

def run_pcm_format_test(v_id, name):
    print(f"\nTesting voice {name} ({v_id}) with pcm_16000 format...")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{v_id}?output_format=pcm_16000"
    headers = {
        "Accept": "*/*",
        "Content-Type": "application/json",
        "xi-api-key": api_key,
    }
    payload = {
        "text": "Hello, this is a test from Antigravity to verify ElevenLabs PCM format.",
        "model_id": "eleven_multilingual_v2",
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
        print(f"Response status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"SUCCESS! Voice is working. Bytes returned: {len(resp.content)}")
            
            # Let's try downsampling it to G.711 A-law if audioop is available
            try:
                import audioop
                pcm16k_bytes = resp.content
                pcm8k_bytes, _ = audioop.ratecv(pcm16k_bytes, 2, 1, 16000, 8000, None)
                alaw_bytes = audioop.lin2alaw(pcm8k_bytes, 2)
                print(f"audioop downsampling and ALAW conversion successful! ALAW bytes: {len(alaw_bytes)}")
            except Exception as ae:
                print(f"audioop check failed: {ae}")
        else:
            print(f"FAILED! Response body: {resp.text}")
    except Exception as e:
        print(f"ERROR: {e}")

run_pcm_format_test(voice_id_default, "Default")
run_pcm_format_test(voice_id_hindi_female, "Hindi Female")
