# backend/utils/emailer.py
import smtplib, os
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()
SMTP_HOST = os.getenv("SMTP_HOST","smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT",587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)

def send_email(to: str, subject: str, body: str, html=False) -> bool:
    msg = MIMEText(body, "html" if html else "plain")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False
