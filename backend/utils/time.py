# backend/utils/time.py
# time-related utilities for HMH (Manila-based)

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

def mnl_day_bounds_utc():
    """
    Return (start_utc_iso, end_utc_iso) for the current Manila day.
    Used for session and daily cooldown calculations.
    """
    now_mnl   = datetime.now(ZoneInfo("Asia/Manila"))
    start_mnl = now_mnl.replace(hour=0, minute=0, second=0, microsecond=0)
    end_mnl   = start_mnl + timedelta(days=1)
    return (
        start_mnl.astimezone(timezone.utc).isoformat(),
        end_mnl.astimezone(timezone.utc).isoformat(),
    )

def now_mnl():# formerly now_mnl_iso()
    """
    Return current Manila time as an ISO string with UTC offset.
    Used for created_at/ended_at timestamps.
    """
    return datetime.now(ZoneInfo("Asia/Manila")).astimezone(timezone.utc).isoformat()
