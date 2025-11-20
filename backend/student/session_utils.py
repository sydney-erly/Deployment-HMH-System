#/student/session_utils.py
# Utilities for checking and updating student session status.

from datetime import datetime, timezone, timedelta
from utils.sb import sb_exec
from extensions import supabase_client

def check_session_expired(student_id):
    sb = supabase_client.client
    rows, _ = sb_exec(
        sb.table("sessions")
          .select("id,started_at,minutes_allowed,ended_at")
          .eq("students_id", student_id)
          .eq("status", "active")
          .order("id", desc=True).limit(1)
    )
    if not rows:
        return None, False

    sess = rows[0]
    if sess.get("ended_at"):
        return sess, True

    start = datetime.fromisoformat(sess["started_at"].replace("Z","+00:00"))
    expiry = start + timedelta(minutes=sess["minutes_allowed"])
    if datetime.now(timezone.utc) >= expiry:
        _, _ = sb_exec(
            sb.table("sessions")
              .update({"ended_at": datetime.now(timezone.utc).isoformat(), "status": "ended"})
              .eq("id", sess["id"])
        )
        return sess, True

    return sess, False
