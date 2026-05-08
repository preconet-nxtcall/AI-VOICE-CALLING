import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_email(to_email, subject, body):
        smtp_server = os.environ.get("SMTP_SERVER")
        smtp_port = os.environ.get("SMTP_PORT")
        smtp_username = os.environ.get("SMTP_USERNAME")
        smtp_password = os.environ.get("SMTP_PASSWORD")
        sender_email = os.environ.get("MAIL_DEFAULT_SENDER", smtp_username)

        if not all([smtp_server, smtp_port, smtp_username, smtp_password]):
            logger.warning("SMTP configuration missing. Logging email content instead.")
            print("\n" + "="*50)
            print(f"EMAIL SIMULATION")
            print(f"To: {to_email}")
            print(f"Subject: {subject}")
            print(f"Body: {body}")
            print("="*50 + "\n")
            return True

        try:
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))

            server = smtplib.SMTP(smtp_server, int(smtp_port))
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
            server.quit()
            return True
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    @staticmethod
    def send_password_reset(email, new_password):
        subject = "Your New Password - AINxt.call"
        body = f"Hello,\n\nAs requested, your password has been reset. Your new temporary password is:\n\n{new_password}\n\nPlease log in and change your password immediately for security.\n\nBest regards,\nThe AINxt.call Team"
        return EmailService.send_email(email, subject, body)
