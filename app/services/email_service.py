import os
import logging
import requests
import json

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_email(to_email, subject, body, html_body=None):
        api_token = os.environ.get("ZEPTOMAIL_API_TOKEN")
        sender_email = os.environ.get("ZEPTOMAIL_USER", os.environ.get("MAIL_DEFAULT_SENDER"))
        
        # ZeptoMail endpoint for .in region (assuming based on email domain)
        url = "https://api.zeptomail.in/v1.1/email"

        if not api_token or not sender_email:
            logger.warning("ZeptoMail configuration missing. Logging email content instead.")
            print("\n" + "="*50)
            print(f"EMAIL SIMULATION (ZEPTOMAIL)")
            print(f"To: {to_email}")
            print(f"Subject: {subject}")
            print(f"Body: {body}")
            print("="*50 + "\n")
            return True

        payload = {
            "from": {
                "address": sender_email,
                "name": "AINxt.call"
            },
            "to": [
                {
                    "email_address": {
                        "address": to_email
                    }
                }
            ],
            "subject": subject,
            "htmlbody": html_body if html_body else f"<div>{body.replace('\\n', '<br>')}</div>"
        }

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": api_token
        }

        try:
            response = requests.post(url, data=json.dumps(payload), headers=headers)
            response_json = response.json()
            
            if response.status_code == 200 or response.status_code == 201:
                logger.info(f"Email sent successfully to {to_email}")
                return True
            else:
                logger.error(f"Failed to send email via ZeptoMail: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Exception while sending email via ZeptoMail: {e}")
            return False

    @staticmethod
    def send_password_reset(email, new_password):
        subject = "Your New Password - AINxt.call"
        body = f"Hello,\n\nAs requested, your password has been reset. Your new temporary password is:\n\n{new_password}\n\nPlease log in and change your password immediately for security.\n\nBest regards,\nThe AINxt.call Team"
        
        html_body = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2>Password Reset Successful</h2>
            <p>Hello,</p>
            <p>As requested, your password has been reset. Your new temporary password is:</p>
            <p style="font-size: 1.2em; font-weight: bold; background: #f4f4f4; padding: 10px; display: inline-block;">{new_password}</p>
            <p>Please log in and change your password immediately for security.</p>
            <p>Best regards,<br>The AINxt.call Team</p>
        </div>
        """
        return EmailService.send_email(email, subject, body, html_body=html_body)
    @staticmethod
    def send_appointment_notification(to_email, lead_phone, appointment_details, call_sid=None):
        subject = f"NEW APPOINTMENT REQUEST: {lead_phone}"
        body = (
            f"Hello,\n\n"
            f"An appointment or demo request was detected during an AI voice call.\n\n"
            f"Lead Phone: {lead_phone}\n"
            f"Details: {appointment_details}\n"
            f"Call SID: {call_sid}\n\n"
            f"Please check your dashboard for more details.\n\n"
            f"Best regards,\nThe AINxt.call Team"
        )
        
        html_body = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #4f46e5;">New Appointment Detected</h2>
            <p>Hello,</p>
            <p>An appointment or demo request was detected during an AI voice call.</p>
            <div style="background: #f8fafc; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0;">
                <p><strong>Lead Phone:</strong> {lead_phone}</p>
                <p><strong>Details:</strong> <span style="color: #ef4444; font-weight: bold;">{appointment_details}</span></p>
                <p><strong>Call SID:</strong> {call_sid}</p>
            </div>
            <p>Please log in to your dashboard to view the full transcript and follow up with the lead.</p>
            <p>Best regards,<br>The AINxt.call Team</p>
        </div>
        """
        return EmailService.send_email(to_email, subject, body, html_body=html_body)
