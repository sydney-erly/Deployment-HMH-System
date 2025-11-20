# backend/auth/routes.py
# Authentication routes (teachers + students) WITH BRUTE FORCE PROTECTION.
# Adds:
#   - failed_attempts
#   - lockout_until
#   - auto increment + reset
#   - 10-minute soft lock after 5 wrong attempts
#   - IP-based rate limiting (10 per 10 minutes)
#
# For students:
#   - If active/pending session → redirect "student-dashboard" (+session payload)
#   - Else if they already STARTED a session today (Manila) → redirect "session-over"
#   - Else → redirect "language"

from flask import Blueprint, request, jsonify
from extensions import supabase_client
from utils.sb import sb_exec
from utils.time import mnl_day_bounds_utc
from auth.jwt_utils import make_jwt
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import bcrypt
from datetime import datetime, timedelta, timezone

auth_bp = Blueprint("auth", __name__)

# Simple IP-based rate limiter: 10 login calls per 10 minutes
limiter = Limiter(key_func=get_remote_address)

MAX_ATTEMPTS = 5
LOCK_MINUTES = 10


def now_utc():
  return datetime.now(timezone.utc)


def parse_dt(dt):
  """Convert ISO string from Supabase to aware datetime."""
  if not dt:
    return None
  if isinstance(dt, str):
    return datetime.fromisoformat(dt.replace("Z", "+00:00"))
  return dt


def is_locked(user):
  """Check if the account is under lock period."""
  until = parse_dt(user.get("lockout_until"))
  return until and until > now_utc()


def increment_failed_attempts(user, table):
  """Increase failed attempts and apply lockout if max reached."""
  sb = supabase_client.client
  failed = (user.get("failed_attempts") or 0) + 1

  update = {
    "failed_attempts": failed,
    "last_failed_at": now_utc().isoformat(),
  }

  if failed >= MAX_ATTEMPTS:
    update["lockout_until"] = (now_utc() + timedelta(minutes=LOCK_MINUTES)).isoformat()

  key = "teachers_id" if table == "teachers" else "students_id"
  sb.table(table).update(update).eq(key, user[key]).execute()


def reset_failed_attempts(user, table):
  """Reset after correct password."""
  sb = supabase_client.client
  key = "teachers_id" if table == "teachers" else "students_id"
  sb.table(table).update(
    {
      "failed_attempts": 0,
      "last_failed_at": None,
      "lockout_until": None,
    }
  ).eq(key, user[key]).execute()


@auth_bp.post("/login")
@limiter.limit("10 per 10 minutes")  # IP RATE LIMIT
def login():
  body = request.json or {}
  login_id = (body.get("login_id") or "").strip().lower()
  password = body.get("password") or ""

  if not login_id or not password:
    return jsonify({"error": "Missing credentials"}), 400

  sb = supabase_client.client

  # -------------------------------
  # Teacher login (with lockout)
  # -------------------------------
  t_data, t_err = sb_exec(
    sb.table("teachers")
    .select("teachers_id,password,failed_attempts,lockout_until")
    .eq("login_id", login_id)
    .maybe_single()
  )
  if t_err:
    return jsonify({"error": f"teachers query failed: {t_err}"}), 500

  if t_data:
    # 1) Check lockout first
    if is_locked(t_data):
      return (
        jsonify(
          {
            "locked": True,
            "message": "Too many failed attempts. Please try again later.",
          }
        ),
        423,
      )

    # 2) Check password
    if bcrypt.checkpw(password.encode(), t_data["password"].encode()):
      # Success → reset counter
      reset_failed_attempts(t_data, "teachers")
      token = make_jwt({"sub": t_data["teachers_id"], "role": "teacher"})
      return jsonify({"token": token, "role": "teacher", "redirect": "teacher"}), 200

    # 3) Wrong password → increment & generic error
    increment_failed_attempts(t_data, "teachers")
    return jsonify({"message": "Invalid login ID or password."}), 200

  # -------------------------------
  # Student login (with lockout)
  # -------------------------------
  s_data, s_err = sb_exec(
    sb.table("students")
    .select("students_id,password,failed_attempts,lockout_until")
    .eq("login_id", login_id)
    .maybe_single()
  )
  if s_err:
    return jsonify({"error": f"students query failed: {s_err}"}), 500

  if not s_data:
    # No such student
    return jsonify({"message": "Invalid login ID or password."}), 200

  # 1) Student lockout check
  if is_locked(s_data):
    return (
      jsonify(
        {
          "locked": True,
          "message": "Too many failed attempts. Please try again later.",
        }
      ),
      423,
    )

  # 2) Check password
  if not bcrypt.checkpw(password.encode(), s_data["password"].encode()):
    increment_failed_attempts(s_data, "students")
    return jsonify({"message": "Invalid login ID or password."}), 200

  # 3) Success → reset counter
  reset_failed_attempts(s_data, "students")

  sid = s_data["students_id"]

  # -------------------------------
  # Session redirect logic (unchanged)
  # -------------------------------
  sess_rows, sess_err = sb_exec(
    sb.table("sessions")
    .select("id, status, minutes_allowed, started_at, ended_at")
    .eq("students_id", sid)
    .order("id", desc=True)
    .limit(1)
  )
  if sess_err:
    return jsonify({"error": f"session check failed: {sess_err}"}), 500

  redirect = "language"
  session_payload = None

  if sess_rows:
    last = sess_rows[0]
    status = (last.get("status") or "").lower()

    if status in ("active", "pending"):
      # Still usable → resume dashboard
      redirect = "student-dashboard"
      session_payload = {
        "id": last.get("id"),
        "status": status,
        "minutes_allowed": last.get("minutes_allowed"),
        "started_at": last.get("started_at"),
        "ended_at": last.get("ended_at"),
      }
    else:
      # Not active/pending anymore. If they already STARTED a session today (Manila), send to session-over
      start_utc, end_utc = mnl_day_bounds_utc()
      today_rows, derr = sb_exec(
        sb.table("sessions")
        .select("id")
        .eq("students_id", sid)
        .gte("started_at", start_utc)
        .lt("started_at", end_utc)
        .limit(1)
      )
      if derr:
        return jsonify({"error": f"session day check failed: {derr}"}), 500
      if today_rows:
        redirect = "session-over"
      else:
        redirect = "language"

  token = make_jwt({"sub": sid, "role": "student"})
  return (
    jsonify(
      {
        "token": token,
        "role": "student",
        "redirect": redirect,
        "session": session_payload,  # only for active/pending
      }
    ),
    200,
  )
