# backend/auth/routes_reset.py

import traceback
import sys
import json
import os
import re
import secrets
import hashlib
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify
from passlib.hash import bcrypt
from dotenv import load_dotenv
from extensions import supabase_client
from utils.emailer import send_email
from content.transform import public_url

load_dotenv()


reset_bp = Blueprint("reset_bp", __name__)

from content.transform import public_url

def get_logo_url() -> str:
    """Safely resolve logo URL after Supabase client is ready."""
    raw = os.getenv("LOGO_URL", "hmh-images/hmh-logo.png")
    try:
        return public_url(raw)
    except Exception:
        return raw  # fallback if Supabase isn't ready



# ---------- Config ----------
RESET_LINK_BASE = os.getenv("RESET_LINK_BASE", "https://hear-my-heart.app/reset-password")
PRIMARY = "#1800ad"
TEXT = "#000000"
WINDOW_MIN = 30
MAX_REQUESTS_PER_WINDOW = 3






# ---------- Helpers ----------
def _now_utc():
    return datetime.now(timezone.utc)


def _client_info(req):
    return (
        req.headers.get("X-Forwarded-For", req.remote_addr or ""),
        req.headers.get("User-Agent", ""),
    )


def _hash_token(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def _log(email: str | None, user_type: str | None, action: str, ip: str, ua: str, meta: dict | None = None):
    """Insert an audit record into password_reset_audit"""
    try:
        supabase_client.table("password_reset_audit").insert(
            {
                "email": email,
                "user_type": user_type,
                "action": action,
                "ip": ip,
                "user_agent": ua,
                "meta": meta or {},
            }
        ).execute()
    except Exception as e:
        print("⚠️ Failed to log audit event:", e)


def _password_is_strong(pw: str) -> tuple[bool, str]:
    """Basic password strength rules"""
    if not pw or len(pw) < 8:
        return False, "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", pw):
        return False, "Password must include at least one letter."
    if not re.search(r"\d", pw):
        return False, "Password must include at least one number."
    if pw.strip() == "":
        return False, "Password cannot be whitespace only."
    return True, ""


def _render_reset_email_html(reset_link: str) -> str:
    """Modern minimal reset email inspired by Bluassist style"""
    return f"""
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f7fa;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table width="560" cellpadding="0" cellspacing="0" role="presentation"
                 style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;
                        box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <!-- Header / Logo -->
            <tr>
              <td align="center" style="padding:32px 24px 16px 24px;">
                <img src="{get_logo_url()}" alt="HearMyHeart" style="height:48px;display:block;margin-bottom:12px;" />
                <h2 style="color:#1800ad;margin:0;font-size:22px;">Reset your password</h2>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td align="left" style="padding:0 32px 32px 32px;color:#333333;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px 0;">
                  Hi there,
                </p>
                <p style="margin:0 0 16px 0;">
                  Need to reset your password? No problem! Just click the button below
                  and you’ll be on your way. If you didn’t make this request, please ignore this email.
                </p>
                <p style="margin:28px 0;text-align:center;">
                  <a href="{reset_link}" target="_blank"
                     style="display:inline-block;background:#1800ad;color:#ffffff;
                            text-decoration:none;padding:14px 32px;border-radius:8px;
                            font-weight:bold;font-size:15px;">
                    Reset My Password
                  </a>
                </p>
                <p style="margin:0 0 8px 0;font-size:13px;color:#666;">
                  This link expires in <b>30 minutes</b>.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="border-top:1px solid #eaeaea;padding:24px 16px;color:#888;font-size:12px;">
                <p style="margin:0 0 6px 0;">
                  Problems or questions? Email us at
                  <a href="mailto:hearmyheart.help@gmail.com" style="color:#1800ad;text-decoration:none;">
                    hearmyheart.help@gmail.com
                  </a>
                </p>
                <p style="margin:0;color:#999;">
                  © {datetime.now().year} HearMyHeart. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


# ---------- Routes ----------
@reset_bp.post("/request-reset")
def request_reset():
    """Step 1: User submits email for reset"""
    try:
        print("📩 [RESET] request received")

        # Safely parse JSON or plain text
        raw = request.get_data(as_text=True)
        print("📦 RAW BODY =", repr(raw))
        print("📦 CONTENT-TYPE =", request.headers.get("Content-Type"))

        try:
            data = json.loads(raw) if raw else {}
        except Exception:
            data = {}

        # Handle string or dict payloads
        if isinstance(data, str):
            print("⚠️ Received string instead of JSON; wrapping manually")
            data = {"email": data}
        elif not isinstance(data, dict):
            data = {}

        email = (data.get("email") or "").strip().lower()
        print("📩 Email parsed as:", email)

        ip, ua = _client_info(request)
        if not email:
            return jsonify({"error": "Email is required"}), 400

        # --- rate limit check ---
        try:
            window_start = (_now_utc() - timedelta(minutes=WINDOW_MIN)).isoformat()
            rl = (
                supabase_client.table("password_reset_audit")
                .select("id", count="exact")
                .eq("email", email)
                .eq("action", "request")
                .gte("created_at", window_start)
                .execute()
            )
            recent_count = getattr(rl, "count", 0) or 0
        except Exception as e:
            print("⚠️ Rate-limit check failed:", e)
            recent_count = 0

        if recent_count >= MAX_REQUESTS_PER_WINDOW:
            _log(email, None, "rate_limited", ip, ua, {"window_min": WINDOW_MIN})
            return jsonify({"message": "If that email exists, we sent a reset link."}), 200

        # --- lookup student or teacher ---
        stu = supabase_client.client.table("students").select("email").eq("email", email).execute()
        tch = supabase_client.client.table("teachers").select("email").eq("email", email).execute()
        user_type = "student" if getattr(stu, "data", []) else "teacher" if getattr(tch, "data", []) else None

        _log(email, user_type, "request", ip, ua)

        if not user_type:
            return jsonify({"message": "If that email exists, we sent a reset link."}), 200

        # --- create and store token ---
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)

        supabase_client.table("password_resets").delete().eq("email", email).execute()
        supabase_client.table("password_resets").insert(
            {"email": email, "token_hash": token_hash, "user_type": user_type}
        ).execute()
        print("✅ token stored in db")

        # --- send email ---
        reset_link = f"{RESET_LINK_BASE}?token={token}"
        html_body = _render_reset_email_html(reset_link)
        print("✉️ sending email to:", email)
        sent = send_email(email, "🔐 Reset your HearMyHeart password", html_body, html=True)
        print("📬 send_email result:", sent)

        _log(email, user_type, "email_sent" if sent else "email_failed", ip, ua)
        return jsonify({"message": "If that email exists, we sent a reset link."}), 200

    except Exception as e:
        print("❌ ERROR in /request-reset:", e)
        traceback.print_exc(file=sys.stdout)
        return jsonify({"error": str(e)}), 500


@reset_bp.post("/reset-password")
def reset_password():
    """Step 2: User clicks link and sets a new password"""
    try:
        raw = request.get_data(as_text=True)
        try:
            data = json.loads(raw) if raw else {}
        except Exception:
            data = {}

        if isinstance(data, str):
            data = {"token": "", "new_password": ""}
        elif not isinstance(data, dict):
            data = {}

        token = (data.get("token") or "").strip()
        new_password = (data.get("new_password") or "").strip()
        ip, ua = _client_info(request)

        if not token or not new_password:
            return jsonify({"error": "Missing token or password"}), 400

        ok, err = _password_is_strong(new_password)
        if not ok:
            return jsonify({"error": err}), 400

        token_hash = _hash_token(token)
        rec = supabase_client.table("password_resets").select("*").eq("token_hash", token_hash).execute()
        rows = getattr(rec, "data", [])
        if not rows:
            _log(None, None, "invalid_token", ip, ua)
            return jsonify({"error": "Invalid or expired link"}), 400

        row = rows[0]
        email = row["email"]
        user_type = row["user_type"]
        created_at = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))

        if _now_utc() - created_at > timedelta(minutes=WINDOW_MIN):
            _log(email, user_type, "expired_token", ip, ua)
            supabase_client.table("password_resets").delete().eq("token_hash", token_hash).execute()
            return jsonify({"error": "Invalid or expired link"}), 400

        hashed_pw = bcrypt.hash(new_password)
        if user_type == "student":
            supabase_client.table("students").update({"password": hashed_pw}).eq("email", email).execute()
        else:
            supabase_client.table("teachers").update({"password": hashed_pw}).eq("email", email).execute()

        supabase_client.table("password_resets").delete().eq("token_hash", token_hash).execute()
        _log(email, user_type, "reset_success", ip, ua)

        return jsonify({"message": "Password reset successfully. You can now log in."}), 200

    except Exception as e:
        print("❌ ERROR in /reset-password:", e)
        traceback.print_exc(file=sys.stdout)
        return jsonify({"error": str(e)}), 500
