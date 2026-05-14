import os
from twilio.rest import Client
from dotenv import load_dotenv

load_dotenv()

account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
from_number = os.environ.get("TWILIO_PHONE_NUMBER")
base_url = os.environ.get("PUBLIC_BASE_URL")

to_number = "+918918523121"
kb_id = "00000000-0000-0000-0000-000000000000" # Placeholder

if not all([account_sid, auth_token, from_number, base_url]):
    print("Error: Missing Twilio configuration in .env")
    exit(1)

client = Client(account_sid, auth_token)

webhook_url = f"{base_url}/voice?kb_id={kb_id}"
status_callback = f"{base_url}/voice/status-callback?kb_id={kb_id}"

try:
    call = client.calls.create(
        to=to_number,
        from_=from_number,
        url=webhook_url,
        status_callback=status_callback,
        status_callback_event=["completed", "failed", "busy", "no-answer", "canceled"],
        status_callback_method="POST",
    )
    print(f"Test call initiated successfully!")
    print(f"Call SID: {call.sid}")
    print(f"To: {to_number}")
    print(f"Webhook URL: {webhook_url}")
except Exception as e:
    print(f"Failed to initiate call: {e}")
