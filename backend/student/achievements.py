# backend/student/achievements.py
# Achievement awarding logic
# Returns (inline_codes, profile_only_codes)

from datetime import datetime
from utils.sb import sb_exec

PASS = 60

INLINE_CODES = {"first_correct", "three_in_a_row", "streak_master", "sharpshooter"}
PROFILE_ONLY_CODES = {"scholar", "wildfire"}


def _has_achievement(sb, sid, code):
    rows, err = sb_exec(
        sb.table("student_achievements")
          .select("id")
          .eq("students_id", sid)
          .eq("achievements_code", code)
          .limit(1)
    )
    return bool(rows)


def _award_once(sb, sid, code):
    """
    Insert achievement once.
    Safe with Supabase v2 (no .select() after insert).
    """
    if _has_achievement(sb, sid, code):
        return False

    rows, err = sb_exec(
        sb.table("student_achievements")
          .insert({
              "students_id": sid,
              "achievements_code": code,
              "earned_at": datetime.utcnow().isoformat()
          })
    )
    if err:
        print("Achievement insert failed:", err, "code=", code, "student=", sid)
        return False

    return True


def _consecutive_passes(sb, sid, max_lookback=50):
    rows, _ = sb_exec(
        sb.table("activity_attempts")
          .select("score")
          .eq("students_id", sid)
          .order("id", desc=True)
          .limit(max_lookback)
    )
    streak = 0
    for r in rows or []:
        try:
            if float(r.get("score", 0)) >= PASS:
                streak += 1
            else:
                break
        except Exception:
            break
    return streak


def _total_sound_passes(sb, sid):
    # Fallback direct count (works without RPC)
    rows, err = sb_exec(
        sb.table("activity_attempts")
          .select("id, meta, score")
          .eq("students_id", sid)
          .gte("score", PASS)
    )
    if err or not rows:
        return 0
    total = 0
    for r in rows:
        meta = r.get("meta") or {}
        if meta.get("layout") == "sound":
            total += 1
    return total


def _lesson_perfect(sb, sid, lesson_id: int) -> bool:
    """
    Sharpshooter:
      True if ALL attempts in a lesson are 100.

    Defensive:
      • Ignores bad lesson_id
      • Ignores rows with null scores
    """
    try:
        if not lesson_id:
            return False
        try:
            lid = int(lesson_id)
        except Exception:
            print("Sharpshooter: invalid lesson_id:", repr(lesson_id))
            return False

        rows, err = sb_exec(
            sb.table("activity_attempts")
              .select("score, activities!inner(lesson_id)")
              .eq("students_id", sid)
              .eq("activities.lesson_id", lid)
        )
        if err or not rows:
            return False

        scores = [
            float(r.get("score") or 0)
            for r in rows
            if r.get("score") is not None
        ]
        if not scores:
            return False

        print(f"Sharpshooter debug → lesson_id={lid}, scores={scores}")
        return all(s == 100.0 for s in scores)
    except Exception as e:
        print("Sharpshooter check failed:", e)
        return False


def check_and_award_achievements(sb, sid, score, *, lesson_id=None, layout=None):
    """
    Call AFTER recording the attempt.
    Args:
      sb: Supabase client
      sid: student id (uuid)
      score: numeric
      lesson_id: for Sharpshooter
      layout: 'sound' | 'asr' | 'emotion' | ...
    """
    inline, profile_only = [], []

    # first_correct
    if score is not None and float(score) >= PASS:
        if _award_once(sb, sid, "first_correct"):
            inline.append("first_correct")

    # streaks
    streak = _consecutive_passes(sb, sid)
    if streak >= 3 and _award_once(sb, sid, "three_in_a_row"):
        inline.append("three_in_a_row")
    if streak >= 5 and _award_once(sb, sid, "streak_master"):
        inline.append("streak_master")

    # scholar (10 passing sound attempts)
    if layout == "sound" and (score is not None and float(score) >= PASS):
        total_sound = _total_sound_passes(sb, sid)
        print(f"Scholar check: total_sound={total_sound}")
        if total_sound >= 10 and _award_once(sb, sid, "scholar"):
            profile_only.append("scholar")

    # sharpshooter (perfect lesson)
    if lesson_id and (score is not None and float(score) >= PASS):
        if _lesson_perfect(sb, sid, lesson_id):
            if _award_once(sb, sid, "sharpshooter"):
                inline.append("sharpshooter")

    return inline, profile_only
