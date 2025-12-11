# backend/teacher/routes.py
# updated 12/03/2025 11:50AM



# from backend.utils.defaults import assign_default_photo_path
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta, timezone
import bcrypt
import re
from collections import defaultdict

from auth.jwt_utils import require_teacher
from extensions import supabase_client
from utils.sb import sb_exec




teacher_bp = Blueprint("teacher", __name__)




# ---------- Uniform JSON error handler ----------
@teacher_bp.errorhandler(Exception)
def _teacher_json_errors(ex):
    print(" teacher_bp exception:", repr(ex))
    return jsonify({"error": "Internal Server Error", "detail": str(ex)}), 500




# ---------- Utility ----------
def now_ph():
    return datetime.now(timezone(timedelta(hours=8)))




def today_start_utc():
    ph = now_ph().replace(hour=0, minute=0, second=0, microsecond=0)
    return ph.astimezone(timezone.utc)




def greet_ph():
    h = now_ph().hour
    if 5 <= h < 12:
        return "Good morning"
    if 12 <= h < 18:
        return "Good afternoon"
    return "Good evening"




# Safe select helper
def sb_safe_select(q):
    rows, err = sb_exec(q)
    if err:
        print("Supabase select error:", err)
        return []
    return rows or []




# Retry wrapper for transient hiccups (net/RLS/signed URLs)
import time




def make_initials(first, last):
    f = (first or "").strip()[:1].upper()
    l = (last or "").strip()[:1].upper()
    return f + l if (f or l) else None




def sb_try_rows(name, fn, retries=2, delay=0.2):
    """
    Call sb_exec via fn() with small retries so brief failures
    don't collapse sections of the dashboard to empty arrays/zeros.
    Usage: rows = sb_try_rows("students", lambda: sb_exec(sb.table("students").select("id")))
    """
    last_err = None
    for attempt in range(retries + 1):
        try:
            rows, err = fn()
            if err:
                last_err = err
                print(f"[WARN] {name} attempt {attempt+1} failed:", err)
            else:
                return rows or []
        except Exception as ex:
            last_err = ex
            print(f"[EXCEPTION] {name} attempt {attempt+1}:", ex)
        time.sleep(delay)
    print(f"[ERROR] {name} giving up after {retries+1} attempts:", last_err)
    return []








# ======================= Student payload sanitizers =======================
ALLOWED_STUDENT_FIELDS = [
    # Required
    "first_name",
    "middle_name",
    "last_name",
    "birthday",
    "sex",
    "diagnosis",
    "speech_level",
    "room_assignment",
    "schedule",
    "class_time",




    # Optional
    "enrollment_status",
    "grade_level",
    "school_last_attended",
    "address",
    "religion",
    "father_name",
    "mother_name",
    "contact_number",
    "email",
    "guardian_name",
    "guardian_relationship",




    # System fields that can exist
    "photo_url",
    "record_status",
    "middle_initial",
    "level_confirmed_at",
    "graduated_at",
]




REQUIRED_STUDENT_FIELDS = [
    "first_name",
    "middle_name",
    "last_name",
    "birthday",
    "sex",
    "diagnosis",
    "speech_level",
    "room_assignment",
    "schedule",
    "class_time",
]












EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")




def _normalize_date_to_yyyy_mm_dd(value):
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00").replace("/", "-"))
        return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"
    except Exception:
        pass
    for fmt in ("%Y-%m-%d", "%m-%d-%Y", "%m/%d/%Y", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            d = datetime.strptime(s, fmt)
            return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"
        except Exception:
            continue
    return None




def _sanitize_student_payload(data: dict, current: dict | None = None) -> dict:
    out = {}
    for k in ALLOWED_STUDENT_FIELDS:
        if k in data:
            v = data[k]
            if isinstance(v, str):
                v = v.strip()
                if v == "" or v == "—":
                    v = None
            elif v == "":
                v = None
            out[k] = v




    # normalize date
    if "birthday" in out:
        out["birthday"] = _normalize_date_to_yyyy_mm_dd(out.get("birthday"))




    # email sanity
    if out.get("email") and not EMAIL_RE.match(out["email"]):
        out["email"] = None




    # contact: keep only digits and leading +
    if out.get("contact_number"):
        digits = re.sub(r"[^\d+]", "", str(out["contact_number"]))
        out["contact_number"] = digits or None




    # prevent NOT NULL violations
    current = current or {}
    for req in ("first_name", "last_name"):
        if (out.get(req) is None) and current.get(req):
            out[req] = current[req]




    # defaults if both new and current are empty
    if out.get("enrollment_status") is None and current.get("enrollment_status") is None:
        out["enrollment_status"] = "Active"
    if out.get("speech_level") is None and current.get("speech_level") is None:
        out["speech_level"] = "N/A"
    if out.get("sex") is None and current.get("sex") is None:
        out["sex"] = "Unspecified"




    return out




def _diff_payload(old: dict, new: dict) -> dict:
    changed = {}
    for k, v in new.items():
        ov = old.get(k)
        same = (ov == v) or (ov is None and v is None)
        if not same:
            changed[k] = v
    return changed
# ========================================================================




# ======================= Photo URL resolver helpers ======================
def _resolve_photo_url(path_or_url: str | None, *, bucket="student-photos", expires_sec=86400) -> str | None:
    """
    If the value is already an http(s) URL, return it.
    If it's a Supabase Storage path (e.g. 'avatars/123.jpg'), try to produce a fetchable URL:
      1) Try public URL (if bucket is public)
      2) Fall back to a signed URL (if bucket is private)
    """
    if not path_or_url:
        return None
    u = str(path_or_url).strip()
    if u.startswith("http://") or u.startswith("https://"):
        return u




    sb = supabase_client.client




    # Try public URL first
    try:
        pub = sb.storage.from_(bucket).get_public_url(u)
        public_url = (pub or {}).get("publicUrl") or (pub or {}).get("public_url")
        if public_url:
            return public_url
    except Exception as ex:
        print("get_public_url error:", ex)




    # Fall back to a signed URL
    try:
        sig = sb.storage.from_(bucket).create_signed_url(u, expires_sec)
        return (sig or {}).get("signedURL") or (sig or {}).get("signed_url")
    except Exception as ex:
        print("create_signed_url error:", ex)
        return None




def _inject_resolved_photo(row: dict | None, *, bucket="student-photos") -> dict | None:
    if not row:
        return row
    resolved = _resolve_photo_url(row.get("photo_url"), bucket=bucket)
    if resolved:
        row["photo_url_resolved"] = resolved
    return row
# ========================================================================




# ---------- Overview (fixed: never early-return, always compute inactive) ----------
@teacher_bp.get("/overview")
@require_teacher
def overview():
    sb = supabase_client.client




    def safe_exec(name, fn):
        try:
            rows, err = fn()
            if err:
                print(f"[WARN] {name} failed:", err)
                return []
            return rows or []
        except Exception as ex:
            print(f"[EXCEPTION] {name}:", ex)
            return []




    # --- Teacher (minimal columns); do not early-return on failure ---
    teacher = None
    try:
        teacher, terr = sb_exec(
            sb.table("teachers")
            .select("teachers_id,first_name,last_name,login_id")
            .eq("teachers_id", request.user["sub"])
            .maybe_single()
        )
        if terr:
            print("Teacher fetch failed:", terr)
            teacher = None
    except Exception as ex:
        print("Teacher fetch exception:", ex)
        teacher = None




    # Try to add teacher photo best-effort
    # Try to add teacher photo best-effort
    if teacher:
        # ⭐ ADD INITIALS FOR TEACHER DASHBOARD
        teacher["initials"] = make_initials(
            teacher.get("first_name"),
            teacher.get("last_name")
        )


        try:
            t_photo_row, tperr = sb_exec(
                sb.table("teachers")
                .select("photo_url")
                .eq("teachers_id", teacher["teachers_id"])
                .maybe_single()
            )
            if not tperr and t_photo_row and t_photo_row.get("photo_url"):
                teacher["photo_url"] = t_photo_row["photo_url"]
                _inject_resolved_photo(teacher, bucket="hmh-images")


        except Exception as ex:
            print("Teacher photo fetch exception:", ex)






    # --- Basic counts ---
    students_rows = sb_try_rows(
    "students",
    lambda: sb_exec(
        sb.table("students")
          .select("students_id")
          .eq("record_status", "Active")
    )
)

    sessions_rows = sb_try_rows(
        "sessions",
        lambda: sb_exec(sb.table("sessions").select("id").gte("started_at", today_start_utc()))
    )
    students_count = len(students_rows)
    sessions_today = len(sessions_rows)


    # ============================================================
    #   DAILY SCORE TRENDS (Python-only, accurate, zeros included)
    # ============================================================


    def _to_ph_day(date_like):
        if not date_like:
            return None
        s = str(date_like)
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.astimezone(timezone(timedelta(hours=8))).date().isoformat()
        except Exception:
            # Already YYYY-MM-DD
            return s.split("T")[0]


    def _normalize_and_sort(rows):
        bucket = {}
        for r in rows or []:
            raw_day = r.get("date") or r.get("day")
            ph_day = _to_ph_day(raw_day)


            # --- CRITICAL FIX: zero should NOT be skipped ---
            val = r.get("avg")
            if val is None:
                val = r.get("score")
            if val is None:
                val = r.get("average_score")


            try:
                val = float(val)
            except Exception:
                continue


            if not ph_day:
                continue


            agg = bucket.setdefault(ph_day, {"sum": 0.0, "n": 0})
            agg["sum"] += val
            agg["n"] += 1


        # Final averaged timeline
        series = [
            {"date": d, "avg": round(v["sum"] / max(v["n"], 1), 2)}
            for d, v in bucket.items()
        ]
        series.sort(key=lambda x: x["date"])
        return series[-14:]  # last 14 real days


    # ---- ALWAYS use activity_attempts (ignore the broken RPC) ----
    since_utc = (now_ph() - timedelta(days=60)).astimezone(timezone.utc).isoformat()


    rows = sb_safe_select(
        sb.table("activity_attempts")
          .select("score, created_at")
          .gte("created_at", since_utc)
    )


    shaped = [
        {"date": r.get("created_at"), "score": r.get("score")}
        for r in rows
    ]


    line_series = _normalize_and_sort(shaped)
    avg_last = line_series[-1]["avg"] if line_series else 0.0






#---------------------------------------------------------------------------------------------------------------------------




    # --- Diagnosis distribution ---
    diag_rows = sb_try_rows(
    "students diagnosis",
    lambda: sb_exec(
        sb.table("students")
          .select("diagnosis")
          .eq("record_status", "Active")
    )
)

    diag_counts = {"ASD": 0, "DS": 0, "GDD": 0, "SPEECH DELAY": 0, "ADHD": 0, "Unspecified": 0}
    for r in diag_rows:
        raw = r.get("diagnosis")
        if not raw:
            diag_counts["Unspecified"] += 1
        else:
            d = str(raw).strip().upper()
            diag_counts[d] = diag_counts.get(d, 0) + 1
    diagnosis_counts = [{"diagnosis": k, "count": v} for k, v in diag_counts.items()]




    # --- Recently active students ---
    recent_active = sb_try_rows(
        "recent sessions",
        lambda: sb_exec(
            sb.table("sessions")
            .select("students:students_id(first_name,last_name,photo_url,login_id),started_at")
            .gte("started_at", today_start_utc())
            .order("started_at", desc=True)
            .limit(10)
        )
    )
    for r in recent_active:
        st = r.get("students")
        if isinstance(st, dict):
            _inject_resolved_photo(st)




    # --- Inactive students (always compute) ---
    days = int(request.args.get("inactive_days", "7"))
    cutoff = now_ph() - timedelta(days=days)
    cutoff_utc = cutoff.astimezone(timezone.utc)
    last_rows = sb_try_rows("last_session_per_student", lambda: sb_exec(sb.rpc("last_session_per_student", {})))




    inactive = []
    for r in last_rows:
        last_started = r.get("last_started_at")
        if not last_started:
            inactive.append(r)
            continue
        try:
            dt = datetime.fromisoformat(str(last_started).replace("Z", "+00:00"))
        except Exception:
            dt = None
        if (dt is None) or (dt < cutoff_utc):
            inactive.append(r)




    # Enrich inactive with student basics + resolved photo
    ids = [str(r.get("students_id")) for r in inactive if r.get("students_id")]
    ids = list({i for i in ids if i})
    student_map = {}
    if ids:
        stu_rows = sb_try_rows(
            "inactive student rows",
            lambda: sb_exec(
                sb.table("students")
                .select("students_id, first_name, last_name, login_id, photo_url")
                .in_("students_id", ids)
            )
        )
        for s in stu_rows:
            student_map[str(s.get("students_id"))] = s




    for r in inactive:
        sid = str(r.get("students_id") or "")
        if sid and sid in student_map:
            s = student_map[sid]
            r.setdefault("first_name", s.get("first_name"))
            r.setdefault("last_name", s.get("last_name"))
            r.setdefault("login_id", s.get("login_id"))
            r.setdefault("photo_url", s.get("photo_url"))
        _inject_resolved_photo(r)  # adds photo_url_resolved if possible




        # ---------- Safe teacher name for greeting ----------
    if teacher:
        fname = (teacher.get("first_name") or "").strip()
        lname = (teacher.get("last_name") or "").strip()


        if fname:
            tname = f"Teacher {fname}"
        elif lname:
            tname = f"Teacher {lname}"
        else:
            tname = "Teacher"
    else:
        tname = "Teacher"


    # ---------- Final payload ----------
    payload = {
        "greeting": f"{greet_ph()}, {tname}!",
        "teacher": teacher,
        "counts": {
            "students": students_count,
            "sessions_today": sessions_today,
            "avg_last": avg_last,
        },
        "lineSeries": line_series,
        "barSeries": diagnosis_counts,
        "recentActive": recent_active,
        "inactive": inactive[:10],
        "todayISO": now_ph().date().isoformat(),
    }
    return jsonify(payload), 200






# ---------- Analytics (matches spec: split speech vs emotion; duration in engagement) ----------
@teacher_bp.get("/analytics")
@require_teacher
def analytics():
    sb = supabase_client.client




    DAYS_FOR_SESSIONS = 30
    DAYS_FOR_ATTEMPTS = 90




    def _parse_dt(s):
        if not s:
            return None
        try:
            return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        except Exception:
            return None




    try:
        # --- raw reads (SELECT-only; no schema changes) ---
        emo_rows = sb_safe_select(
            sb.table("emotion_metrics")
              .select("expected_emotion, detected_emotion, created_at")
        )




        since_sessions = (now_ph() - timedelta(days=DAYS_FOR_SESSIONS)).astimezone(timezone.utc).isoformat()
        sess_rows = sb_safe_select(
            sb.table("sessions")
              .select("students_id, mood, started_at, ended_at")
              .gte("started_at", since_sessions)
        )




        since_attempts = (now_ph() - timedelta(days=DAYS_FOR_ATTEMPTS)).astimezone(timezone.utc).isoformat()
        att_rows = sb_safe_select(
            sb.table("activity_attempts")
              .select("students_id, activities_id, score, created_at")
              .gte("created_at", since_attempts)
        )




        act_rows = sb_safe_select(
            sb.table("activities").select("id, lesson_id, type")
        )
        act_by_id = {int(r["id"]): r for r in act_rows if r.get("id") is not None}




        lesson_rows = sb_safe_select(
            sb.table("lessons").select("id, title_en")
        )
        lesson_title = {int(r["id"]): (r.get("title_en") or f"Lesson {r['id']}") for r in lesson_rows if r.get("id") is not None}




        # student names for engagement
        student_ids = sorted({str(r["students_id"]) for r in sess_rows if r.get("students_id")})
        stu_by_id = {}
        if student_ids:
            CHUNK = 300
            for i in range(0, len(student_ids), CHUNK):
                chunk = student_ids[i:i+CHUNK]
                rows = sb_safe_select(
                    sb.table("students")
                      .select("students_id, first_name, last_name")
                      .in_("students_id", chunk)
                )
                for s in rows:
                    full = f"{(s.get('first_name') or '').strip()} {(s.get('last_name') or '').strip()}".strip()
                    stu_by_id[str(s["students_id"])] = full or "Student"




        # ============ 1) Emotion Recognition Distribution ============
        emo_stats = {}
        for r in emo_rows:
            exp = (r.get("expected_emotion") or "Unspecified").strip() or "Unspecified"
            det = (r.get("detected_emotion") or "").strip()
            b = emo_stats.setdefault(exp, {"ok": 0, "n": 0})
            b["n"] += 1
            if det and det.lower() == exp.lower():
                b["ok"] += 1
        emotion_distribution = [
            {"emotion": k, "avg_match": round(100.0 * v["ok"] / max(v["n"], 1), 1)}
            for k, v in sorted(emo_stats.items())
        ]




        # ============ 2) Engagement Insights ============
        from math import isfinite
        eng = {}
        for s in sess_rows:
            sid = str(s.get("students_id") or "")
            if not sid:
                continue
            st = _parse_dt(s.get("started_at"))
            en = _parse_dt(s.get("ended_at"))
            dur_min = None
            if st and en:
                dur_min = max(0.0, (en - st).total_seconds() / 60.0)
            rec = eng.setdefault(sid, {"student": stu_by_id.get(sid, "Student"),
                                       "session_count": 0, "dur_sum": 0.0, "dur_n": 0})
            rec["session_count"] += 1
            if dur_min is not None and isfinite(dur_min):
                rec["dur_sum"] += dur_min; rec["dur_n"] += 1




        engagement = []
        for sid, r in eng.items():
            engagement.append({
                "student": r["student"],
                "session_count": int(r["session_count"]),
                "avg_duration_min": round(r["dur_sum"]/max(r["dur_n"],1), 1) if r["dur_n"] else 0.0
            })
        engagement.sort(key=lambda x: (-x["session_count"], x["student"]))




        # ============ 3) Performance Trends (two series: speech vs emotion) ============
        # SPEECH comes from activity_attempts where activities.type == 'asr' (or 'speech' if ever used)
        speech_week = {}
        for a in att_rows:
            sc = a.get("score")
            if sc is None:
                continue
            act = act_by_id.get(int(a.get("activities_id") or -1))
            # 👇 THIS is the line you were looking for
            if not act or (act.get("type") or "").lower() not in ("asr", "speech"):
                continue
            dt = _parse_dt(a.get("created_at"))
            if not dt:
                continue
            ph = dt.astimezone(timezone(timedelta(hours=8)))
            key = ph.strftime("%Y-%V")  # ISO week
            agg = speech_week.setdefault(key, {"sum": 0.0, "n": 0})
            agg["sum"] += float(sc); agg["n"] += 1




        # emotion from emotion_metrics as % correct per week
        emo_week = {}
        for r in emo_rows:
            dt = _parse_dt(r.get("created_at"))
            if not dt:
                continue
            ph = dt.astimezone(timezone(timedelta(hours=8)))
            key = ph.strftime("%Y-%V")
            ok = int((r.get("detected_emotion") or "").strip().lower()
                     == (r.get("expected_emotion") or "").strip().lower())
            agg = emo_week.setdefault(key, {"ok": 0, "n": 0})
            agg["ok"] += ok; agg["n"] += 1




        keys = sorted(set(speech_week) | set(emo_week))
        performance_trends = []
        for k in keys:
            s = speech_week.get(k, {"sum": 0, "n": 0})
            e = emo_week.get(k, {"ok": 0, "n": 0})
            performance_trends.append({
                "week": k,
                "speech_avg": round(s["sum"]/max(s["n"],1), 1),
                "emotion_match": round(100.0*e["ok"]/max(e["n"],1), 1)
            })




        # ============ 4) Mood vs Performance ============
        sess_by_student = {}
        for s in sess_rows:
            sid = str(s.get("students_id") or "")
            st = _parse_dt(s.get("started_at"))
            en = _parse_dt(s.get("ended_at")) or (st + timedelta(hours=2) if st else None)
            if not sid or not st or not en:
                continue
            sess_by_student.setdefault(sid, []).append({
                "start": st, "end": en,
                "mood": (s.get("mood") or "Unspecified").strip() or "Unspecified"
            })
        for arr in sess_by_student.values():
            arr.sort(key=lambda x: x["start"])




        mood_sum = {}
        for a in att_rows:
            sid = str(a.get("students_id") or "")
            sc = a.get("score")
            ts = _parse_dt(a.get("created_at"))
            if sc is None or not ts or sid not in sess_by_student:
                continue
            mood = None
            for s in sess_by_student[sid]:
                if s["start"] <= ts <= s["end"]:
                    mood = s["mood"]; break
            if not mood:
                continue
            agg = mood_sum.setdefault(mood, {"sum": 0.0, "n": 0})
            agg["sum"] += float(sc); agg["n"] += 1
        mood_performance = [
            {"mood": k, "avg_accuracy": round(v["sum"]/max(v["n"],1), 1)}
            for k, v in sorted(mood_sum.items())
        ]




        # ============ 5) Lesson Difficulty ============
        lesson_agg = {}
        for a in att_rows:
            sc = a.get("score"); aid = a.get("activities_id")
            if sc is None or aid is None:
                continue
            act = act_by_id.get(int(aid))
            if not act:
                continue
            lid = act.get("lesson_id")
            if lid is None:
                continue
            title = lesson_title.get(int(lid), f"Lesson {lid}")
            agg = lesson_agg.setdefault(title, {"sum": 0.0, "n": 0})
            agg["sum"] += float(sc); agg["n"] += 1
        lesson_difficulty = [
            {"lesson": k, "avg_accuracy": round(v["sum"]/max(v["n"],1), 1)}
            for k, v in lesson_agg.items()
        ]
        lesson_difficulty.sort(key=lambda x: x["avg_accuracy"])  # harder first




        return jsonify({
            "emotion_distribution": emotion_distribution,
            "engagement": engagement,
            "performance_trends": performance_trends,
            "mood_performance": mood_performance,
            "lesson_difficulty": lesson_difficulty,
        }), 200




    except Exception as ex:
        print("analytics compute error:", ex)
        return jsonify({"error": str(ex)}), 500








# ---------- Teacher Profile ----------


@teacher_bp.get("/profile")
@require_teacher
def teacher_profile():
    sb = supabase_client.client
    try:
        row, err = sb_exec(
            sb.table("teachers")
            .select("teachers_id, first_name, middle_name, last_name, email, birthday, photo_url")
            .eq("teachers_id", request.user["sub"])
            .maybe_single()
        )
        if err:
            return jsonify({"error": err}), 500
        if not row:
            return jsonify({"error": "Not found"}), 404


        # Generate initials for display only
        initials = make_initials(row.get("first_name"), row.get("last_name"))


        # Clone row so initials are NOT part of the DB payload
        safe = dict(row)
        safe["initials"] = initials


        # Resolve photo for frontend
        _inject_resolved_photo(safe, bucket="hmh-images")


        return jsonify(safe), 200




    except Exception as ex:
        print("teacher_profile error:", ex)
        return jsonify({"error": str(ex)}), 500








# ---------- Teacher Photo Upload ----------
@teacher_bp.post("/photo")
@require_teacher
def upload_teacher_photo():
    """
    Accepts multipart/form-data with 'file' and uploads to Supabase Storage
    under 'hmh-images/pfp/'. Updates teacher.photo_url.
    """
    sb = supabase_client.client
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Missing file"}), 400




    teachers_id = request.user["sub"]
    filename = f"pfp/teacher-{teachers_id}-{int(datetime.now().timestamp())}.{file.filename.rsplit('.', 1)[-1]}"
    data = file.read()




    try:
        # Upload to your existing bucket and folder
        sb.storage.from_("hmh-images").upload(filename, data)




        # Update teacher record with just the path
        sb.table("teachers").update({"photo_url": filename}).eq("teachers_id", teachers_id).execute()




        # Generate a viewable URL
        photo_url = _resolve_photo_url(filename, bucket="hmh-images")




        return jsonify({
            "photo_url": filename,
            "photo_url_resolved": photo_url
        }), 200




    except Exception as e:
        print("🔥 upload_teacher_photo failed:", e)
        return jsonify({"error": str(e)}), 500




# ---------- Teacher Profile Update ----------
@teacher_bp.put("/profile")
@require_teacher
def update_teacher_profile():
    sb = supabase_client.client
    payload = request.get_json(silent=True) or {}
    teachers_id = request.user["sub"]




    # Prevent updating restricted fields
    disallowed = {"teachers_id", "password", "role", "login_id", "initials"}
    payload = {k: v for k, v in payload.items() if k not in disallowed}


    payload.pop("initials", None)






    if not payload:
        return jsonify({"error": "No editable fields provided"}), 400




    try:
        # Update teacher info
        sb.table("teachers").update(payload).eq("teachers_id", teachers_id).execute()




        # Fetch updated record
        row, err = sb_exec(
            sb.table("teachers")
            .select("teachers_id, first_name, middle_name, last_name, email, birthday, photo_url")
            .eq("teachers_id", teachers_id)
            .maybe_single()
        )
        if err:
            return jsonify({"error": err}), 500




        _inject_resolved_photo(row, bucket="hmh-images")
        return jsonify(row), 200




    except Exception as ex:
        print("🔥 update_teacher_profile error:", ex)
        return jsonify({"error": str(ex)}), 500




# ---------- Rooms ----------
@teacher_bp.get("/rooms")
@require_teacher
def rooms():
    sb = supabase_client.client
    rows, err = sb_exec(
    sb.table("students")
      .select("room_assignment, record_status")
      .eq("record_status", "Active")
)

    if err:
        return jsonify({"error": err}), 500




    counts = {}
    for r in rows or []:
        key = (r.get("room_assignment") or "").strip() or "Unassigned"
        counts[key] = counts.get(key, 0) + 1




    for k in ["Room A", "Room B", "Room C", "Room D", "Unassigned"]:
        counts.setdefault(k, 0)




    return jsonify([{"room": k, "count": v} for k, v in counts.items()])




# ---------- Students (list/create) ----------
@teacher_bp.get("/students")
@require_teacher
def list_students():
    sb = supabase_client.client
    room = request.args.get("room")
    search = (request.args.get("q") or "").strip()




    q = sb.table("students").select(
    "students_id,login_id,first_name,middle_name,last_name,birthday,diagnosis,enrollment_status,room_assignment,photo_url,record_status"
    ).eq("record_status", "Active") \
    .order("last_name")




    if room:
        q = q.ilike("room_assignment", f"%{room}%")
    if search:
        q = q.ilike("last_name", f"%{search}%")




    rows, err = sb_exec(q)
    if err:
        return jsonify({"error": err}), 500




    rows = rows or []
    for r in rows:
        _inject_resolved_photo(r)
    return jsonify(rows)












#===========add student===================
@teacher_bp.post("/students")
@require_teacher
def create_student():
    sb = supabase_client.client




    incoming = request.json or {}




    # Assign password
    raw_pw = incoming.pop("raw_password", "hope123")
    hashed = bcrypt.hashpw(raw_pw.encode(), bcrypt.gensalt()).decode()
    incoming["password"] = hashed




    # Sanitize input based on allowed fields
    payload = _sanitize_student_payload(incoming)




    # Validate required fields
    missing = [f for f in REQUIRED_STUDENT_FIELDS if not payload.get(f)]
    if missing:
        return jsonify({
            "error": f"Missing required fields: {', '.join(missing)}"
        }), 400




    # Ensure photo_url exists
    if not payload.get("photo_url"):
        payload["photo_url"] = ""

    if not payload.get("record_status"):
        payload["record_status"] = "Active"




    # INSERT — supabase-py v1/v2 safe version
    row, err = sb_exec(
        sb.table("students")
          .insert(payload)   # DO NOT chain .select() or .maybe_single()
    )




    if err:
        print("🔥 INSERT ERROR:", err)
        print("🔥 PAYLOAD:", payload)
        return jsonify({"error": str(err)}), 500




    # Supabase returns list of rows
    if isinstance(row, list) and row:
        row = row[0]




    return jsonify(row), 201












# ---------- Student GET/PUT/DELETE ----------
@teacher_bp.get("/student/<uuid:students_id>")
@require_teacher
def get_student(students_id):
    sb = supabase_client.client
    row, err = sb_exec(
        sb.table("students").select("*").eq("students_id", str(students_id)).maybe_single()
    )
    if err:
        return jsonify({"error": err}), 500
    if not row:
        return jsonify({"error": "Not found"}), 404




    _inject_resolved_photo(row)
    return jsonify(row)




@teacher_bp.put("/student/<uuid:students_id>")
@require_teacher
def update_student(students_id):
    sb = supabase_client.client




    incoming = request.get_json(silent=True) or {}
    incoming.pop("students_id", None)




    if "raw_password" in incoming:
        raw = incoming.pop("raw_password") or "hmh123"
        incoming["password"] = bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()




    # Get current row
    current, e1 = sb_exec(
        sb.table("students")
        .select("*")
        .eq("students_id", str(students_id))
        .maybe_single()
    )
    if e1:
        return jsonify({"error": e1}), 500
    if not current:
        return jsonify({"error": "Not found"}), 404




    # Sanitize + diff
    sanitized = _sanitize_student_payload(incoming, current=current)
    current_view = {k: current.get(k) for k in ALLOWED_STUDENT_FIELDS}
    payload = _diff_payload(current_view, sanitized)




    print("PUT /student payload:", payload)




    if not payload:
        _inject_resolved_photo(current)
        return jsonify(current), 200




    upd_res, upd_err = sb_exec(
        sb.table("students")
        .update(payload)
        .eq("students_id", str(students_id))
    )
    if upd_err:
        e2s = str(upd_err)
        print("❗ update_student failed.\n  students_id:", students_id, "\n  payload:", payload, "\n  error:", e2s)
        status = 403 if ("rls" in e2s.lower() or "permission" in e2s.lower()) else 500
        return jsonify({"error": e2s, "payload": payload}), status




    updated, e3 = sb_exec(
        sb.table("students")
        .select("*")
        .eq("students_id", str(students_id))
        .maybe_single()
    )
    if e3:
        return jsonify({"error": e3}), 500
    if not updated:
        return jsonify({"error": "Not found"}), 404


    _inject_resolved_photo(updated)
    return jsonify(updated)




# -------------------------------------------------------
# -------------------------------------------------------
@teacher_bp.delete("/student/<uuid:students_id>")
@require_teacher
def delete_student(students_id):
    """
    Soft delete: mark student as Archived so they disappear from dashboards,
    but keep all related data (sessions, attempts, speech/emotion metrics).
    """
    sb = supabase_client.client

    # We only update flags – we do NOT delete the row
    payload = {
        "record_status": "Archived",
        "enrollment_status": "Inactive",
    }

    _, err = sb_exec(
        sb.table("students")
          .update(payload)
          .eq("students_id", str(students_id))
    )

    if err:
        return jsonify({"error": str(err)}), 500

    return jsonify({"ok": True, "archived": True})




# ---------- Student Progress Dashboard ----------
@teacher_bp.get("/student/<uuid:students_id>/progress")
@require_teacher
def student_progress(students_id):
    """
    Strictly SELECT-only; matches your available columns.




    Returns:
      - speech: [{date, avg}] (from activity_attempts filtered to ASR/SPEECH)
      - emotion + emotion_trend: [{date, avg}] (from emotion_metrics)
      - lesson_avg: [{lesson_id, avg}] (from v_student_lesson_scores.lesson_avg)
      - engagement: [{date, value}] avg minutes per day from sessions (last 30d)
      - letter_accuracy: [{label, acc}] from speech_metrics.expected_text
      - mastered_words / needs_practice_words: lists with n>=3 gate
      - emotion_breakdown: [{emotion, avg_match}] from emotion_metrics
      - activity_heatmap: sparse rows per lesson of real activities only
    """
    sb = supabase_client.client




    def _parse_dt(s):
        if not s:
            return None
        try:
            return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        except Exception:
            return None




    def _ph_day(dt):
        if not dt:
            return None
        return dt.astimezone(timezone(timedelta(hours=8))).date().isoformat()




    # ---- lesson_avg straight from the view (only existing columns) ----
    v_rows = sb_safe_select(
        sb.table("v_student_lesson_scores")
          .select("lesson_id, lesson_avg")
          .eq("students_id", str(students_id))
    )
    lesson_avg = [
        {"lesson_id": r.get("lesson_id"), "avg": float(r.get("lesson_avg") or 0)}
        for r in v_rows if r.get("lesson_id") is not None
    ]




    # ---- Speech trend (manual join via activities.type) ----
    att_rows = sb_safe_select(
        sb.table("activity_attempts")
        .select("activities_id, score, created_at")
        .eq("students_id", str(students_id))
    )



    # fetch activity types for those ids
    act_ids = sorted({int(r["activities_id"]) for r in att_rows if r.get("activities_id") is not None})
    act_type = {}
    if act_ids:
        for i in range(0, len(act_ids), 500):
            chunk = act_ids[i:i+500]
            rows = sb_safe_select(
                sb.table("activities").select("id, type").in_("id", chunk)
            )
            for a in rows:
                act_type[int(a["id"])] = (a.get("type") or "").lower()


    speech_day = {}
    for a in att_rows:
        aid = a.get("activities_id")
        if aid is None:
            continue
        t = act_type.get(int(aid), "")
        if t not in ("asr", "speech"):
            continue
        sc = a.get("score")
        dt = _parse_dt(a.get("created_at"))
        if sc is None or not dt:
            continue
        key = _ph_day(dt)
        if not key:
            continue
        b = speech_day.setdefault(key, {"sum": 0.0, "n": 0})
        b["sum"] += float(sc); b["n"] += 1




    speech = [{"date": d, "avg": round(v["sum"]/max(1, v["n"]), 1)}
            for d, v in sorted(speech_day.items())]


    # ---- Emotion trend + breakdown (from emotion_metrics only) ----
    emo_rows = sb_safe_select(
        sb.table("emotion_metrics")
          .select("expected_emotion, detected_emotion, created_at")
          .eq("students_id", str(students_id))
    )




    # trend per PH day
    emo_day = {}
    for r in emo_rows:
        dt = _parse_dt(r.get("created_at"))
        day = _ph_day(dt)
        if not day:
            continue
        ok = int((r.get("detected_emotion") or "").strip().lower()
                 == (r.get("expected_emotion") or "").strip().lower())
        b = emo_day.setdefault(day, {"ok": 0, "n": 0})
        b["ok"] += ok; b["n"] += 1
    emotion = [{"date": d, "avg": round(100.0 * v["ok"]/max(1, v["n"]), 1)} for d, v in sorted(emo_day.items())]
    emotion_trend = list(emotion)  # same shape/series




    # breakdown by expected emotion
    emo_stat = {}
    for r in emo_rows:
        exp = (r.get("expected_emotion") or "Unspecified").strip() or "Unspecified"
        det = (r.get("detected_emotion") or "").strip()
        b = emo_stat.setdefault(exp, {"ok": 0, "n": 0})
        b["n"] += 1
        if det and det.lower() == exp.lower():
            b["ok"] += 1
    emotion_breakdown = [
        {"emotion": k, "avg_match": round(100.0 * v["ok"]/max(1, v["n"]), 1)}
        for k, v in sorted(emo_stat.items())
    ]


    # ---- Engagement (last 30d) from sessions with fallback) ----
    since_sessions = (now_ph() - timedelta(days=30)).astimezone(timezone.utc).isoformat()
    sess_rows = sb_safe_select(
        sb.table("sessions")
        .select("started_at, ended_at, minutes_allowed")
        .eq("students_id", str(students_id))
        .gte("started_at", since_sessions)
    )
    bucket = {}
    for s in sess_rows:
        st = _parse_dt(s.get("started_at")); en = _parse_dt(s.get("ended_at"))
        if st and en:
            mins = max(0.0, (en - st).total_seconds()/60.0)
        else:
            # fallback when ended_at is missing
            try:
                mins = float(s.get("minutes_allowed") or 0.0)
            except Exception:
                mins = 0.0
            if not st:
                # if we truly have no start time, skip
                continue
        day = _ph_day(st)
        if not day:
            continue
        b = bucket.setdefault(day, {"sum": 0.0, "n": 0})
        b["sum"] += mins; b["n"] += 1




    engagement = [{"date": d, "value": round(v["sum"]/max(1, v["n"]), 1)}
                for d, v in sorted(bucket.items())]



    # ---- Letter/word accuracy + mastered / needs (n>=3) from speech_metrics ----
    sm_rows = sb_safe_select(
        sb.table("speech_metrics")
          .select("expected_text, accuracy")
          .eq("students_id", str(students_id))
    )
    word_acc = {}
    for r in sm_rows:
        label = (r.get("expected_text") or "").strip()
        if not label:
            continue
        try:
            acc = float(r.get("accuracy") or 0)
        except Exception:
            continue
        b = word_acc.setdefault(label, {"sum": 0.0, "n": 0})
        b["sum"] += acc; b["n"] += 1
    letter_accuracy = [{"label": w, "acc": round(v["sum"]/max(1, v["n"]), 1)} for w, v in word_acc.items()]
    letter_accuracy.sort(key=lambda x: x["label"].lower())




    mastered_words = [w for w, v in word_acc.items() if v["n"] >= 3 and (v["sum"]/v["n"]) >= 80]
    needs_practice_words = [w for w, v in word_acc.items() if v["n"] >= 3 and (v["sum"]/v["n"]) < 60]




    # ---- Activity “heatmap” but sparse: ONLY real cells, no fabricated zeros ----
    #  -> this makes the front-end Scatter look like a scatter, not a calendar
    att_raw = sb_safe_select(
        sb.table("activity_attempts")
          .select("activities_id, score")
          .eq("students_id", str(students_id))
    )
    act_ids = sorted({int(r["activities_id"]) for r in att_raw if r.get("activities_id") is not None})
    meta_by_id = {}
    if act_ids:
        for i in range(0, len(act_ids), 500):
            chunk = act_ids[i:i+500]
            part = sb_safe_select(
                sb.table("activities").select("id, lesson_id, sort_order, type").in_("id", chunk)
            )
            for a in part:
                meta_by_id[int(a["id"])] = a




    # aggregate avg score per (lesson_id, sort_order) WITHOUT filling gaps
    by_lesson_col = {}
    for r in att_raw:
        aid = r.get("activities_id"); sc = r.get("score")
        if aid is None or sc is None:
            continue
        meta = meta_by_id.get(int(aid))
        if not meta:
            continue
        lid = int(meta.get("lesson_id"))
        col = int(meta.get("sort_order") or 0)
        key = (lid, col)
        b = by_lesson_col.setdefault(key, {"sum": 0.0, "n": 0})
        b["sum"] += float(sc); b["n"] += 1




    # build sparse rows: each row is a list of existing cells (no 0% placeholders)
    from collections import defaultdict
    rows_map = defaultdict(list)  # lid -> list of (col, avg)
    for (lid, col), agg in by_lesson_col.items():
        avg = round(agg["sum"]/max(1, agg["n"]), 1)
        rows_map[lid].append((col, avg))




    activity_heatmap = []
    for lid in sorted(rows_map.keys()):
        # sort columns by sort_order and push real cells only
        cols = sorted(rows_map[lid], key=lambda x: x[0])
        row_cells = [{"acc": avg, "label": f"L{lid}-A{col+1}"} for col, avg in cols]
        activity_heatmap.append(row_cells)



    payload = {
        "speech": speech,
        "emotion": emotion,
        "lesson_avg": lesson_avg,
        "engagement": engagement,
        "letter_accuracy": letter_accuracy,
        "mastered_words": mastered_words,
        "needs_practice_words": needs_practice_words,
        "emotion_breakdown": emotion_breakdown,
        "emotion_trend": emotion_trend,
        "activity_heatmap": activity_heatmap,  # sparse rows → front-end scatter
    }
    return jsonify(payload), 200




@teacher_bp.get("/student/<uuid:students_id>/recommendations")
@require_teacher
def student_recommendations(students_id):
    sb = supabase_client.client
    rows = sb_safe_select(
        sb.table("v_student_lesson_scores")
          .select("lesson_id, lesson_avg")
          .eq("students_id", str(students_id))
    )

    if not rows:
        return jsonify({
            "recommendations": {
                "remark": "No progress data yet",
                "next_lessons": [],
                "focus_areas": []
            }
        })


    # Pick two lowest lessons as next recommendations
    sorted_rows = sorted(
        [{"lesson_id": r["lesson_id"], "avg": float(r.get("lesson_avg") or 0)} for r in rows if r.get("lesson_id") is not None],
        key=lambda x: x["avg"]
    )
    next_lessons = [r["lesson_id"] for r in sorted_rows[:2]]


    # Focus areas = lessons with <60%
    focus_areas = [r["lesson_id"] for r in rows if float(r.get("lesson_avg") or 0) < 60]

    overall_avg = sum(float(r.get("lesson_avg") or 0) for r in rows) / max(len(rows), 1)
    remark = "On track" if overall_avg >= 60 else "Needs support"




    return jsonify({
        "recommendations": {
            "remark": remark,
            "next_lessons": next_lessons,
            "focus_areas": list(dict.fromkeys(focus_areas)),  # unique
        }
    })



# ---------- Student Overview ----------
@teacher_bp.get("/student/<uuid:students_id>/overview")
@require_teacher
def student_overview(students_id):
    sb = supabase_client.client
    try:
        attempts = sb_safe_select(
            sb.table("activity_attempts")
            .select("score, activities(type)")
            .eq("students_id", str(students_id))
        )


        speech_scores, emotion_scores = [], []
        for a in attempts:
            act = a.get("activities") or {}
            t = (act.get("type") or "").lower()
            if t in ("asr", "speech"):
                speech_scores.append(a.get("score") or 0)
            elif t == "emotion":
                emotion_scores.append(a.get("score") or 0)


        speech_avg = round(sum(speech_scores) / len(speech_scores), 1) if speech_scores else 0
        emotion_avg = round(sum(emotion_scores) / len(emotion_scores), 1) if emotion_scores else 0


        prog = sb_safe_select(
            sb.table("lesson_progress")
            .select("lesson_id, updated_at")
            .eq("students_id", str(students_id))
            .order("updated_at", desc=True)
            .limit(1)
        )
        current_lesson, current_chapter = None, None
        if prog:
            lesson_id = prog[0]["lesson_id"]
            lesson_row, _ = sb_exec(
                sb.table("lessons").select("title_en, chapter_id").eq("id", lesson_id).maybe_single()
            )
            if lesson_row:
                current_lesson = lesson_row.get("title_en")
                chap_row, _ = sb_exec(
                    sb.table("chapters").select("title_en").eq("id", lesson_row.get("chapter_id")).maybe_single()
                )
                if chap_row:
                    current_chapter = chap_row.get("title_en")


        sess = sb_safe_select(
            sb.table("sessions")
            .select("started_at, ended_at, mood")
            .eq("students_id", str(students_id))
            .order("started_at", desc=True)
            .limit(1)
        )


        last_session_time = sess[0]["started_at"] if sess else None
        last_session_end = sess[0]["ended_at"] if sess else None
        last_mood = sess[0]["mood"] if sess else None


        return jsonify({
            "speech_score": speech_avg,
            "emotion_score": emotion_avg,
            "current_chapter": current_chapter,
            "current_lesson": current_lesson,
            "last_session_time": last_session_time,
            "last_session_end": last_session_end,
            "last_mood": last_mood,
        }), 200


    except Exception as e:
        print("🔥 Error fetching student overview:", e)
        return jsonify({"error": str(e)}), 500




# ---------- Activity Log ----------
@teacher_bp.get("/student/<uuid:students_id>/activity")
@require_teacher
def student_activity_log(students_id):
    """
    Returns a unified chronological log of student activity:
    - SESSION: { ts, title, detail(mood), duration_sec }
    - LESSON:  { ts, title, detail(Chapter ...), score? }
    - SPEECH / EMOTION attempts: { ts, title, detail, score? }
    """
    sb = supabase_client.client
    try:
        events = []




        # Sessions
        sessions = sb_safe_select(
            sb.table("sessions")
            .select("started_at, ended_at, mood")
            .eq("students_id", str(students_id))
            .order("started_at", desc=True)
            .limit(200)
        )
        for s in sessions:
            start = s.get("started_at")
            end = s.get("ended_at")
            dur = None
            if isinstance(start, str) and isinstance(end, str) and start and end:
                try:
                    sdt = datetime.fromisoformat(start.replace("Z", "+00:00"))
                    edt = datetime.fromisoformat(end.replace("Z", "+00:00"))
                    dur = max(0, (edt - sdt).total_seconds())
                except Exception:
                    dur = None
            events.append({
                "type": "SESSION",
                "ts": start,
                "title": "Session started",
                "detail": f"Mood: {s.get('mood')}" if s.get("mood") else "",
                "duration_sec": dur
            })




        # Lesson completions
        progress = sb_safe_select(
            sb.table("lesson_progress")
            .select("lesson_id, status, updated_at, best_score")
            .eq("students_id", str(students_id))
            .order("updated_at", desc=True)
            .limit(300)
        )
        for r in progress:
            status = (r.get("status") or "").strip().lower()
            if status != "completed":
                continue

            lesson_id = r.get("lesson_id")
            title_en, chapter_title = None, None
            if lesson_id is not None:
                lesson_row, _ = sb_exec(
                    sb.table("lessons")
                    .select("title_en, chapter_id")
                    .eq("id", lesson_id)
                    .maybe_single()
                )
                if lesson_row:
                    title_en = lesson_row.get("title_en")
                    chap_row, _ = sb_exec(
                        sb.table("chapters")
                        .select("title_en")
                        .eq("id", lesson_row.get("chapter_id"))
                        .maybe_single()
                    )
                    if chap_row:
                        chapter_title = chap_row.get("title_en")

            # Use best_score (numeric) if present
            score_val = r.get("best_score")
            score_rounded = round(score_val) if isinstance(score_val, (int, float)) else None

            events.append({
                "type": "LESSON",
                "ts": r.get("updated_at"),
                "lesson_id": lesson_id,  # 🔹 add this
                "title": f"Completed Lesson {title_en or lesson_id}",
                "detail": f"Chapter {chapter_title}" if chapter_title else "Lesson completed",
                "score": score_rounded,
            })

        # Activity attempts (speech + emotion)
        attempts = sb_safe_select(
            sb.table("activity_attempts")
            .select("created_at, score, activities(type)")
            .eq("students_id", str(students_id))
            .order("created_at", desc=True)
            .limit(300)
        )
        for a in attempts:
            act = a.get("activities") or {}
            t = (act.get("type") or "").lower()
            if t not in ("asr", "speech", "emotion"):
                continue


            # normalize type for output
            out_type = "SPEECH" if t in ("asr", "speech") else "EMOTION"


            events.append({
                "type": out_type,
                "ts": a.get("created_at"),
                "title": "Speech practice" if out_type == "SPEECH" else "Emotion recognition",
                "detail": "Pronunciation accuracy" if out_type == "SPEECH" else "Facial mimic accuracy",
                "score": round(a["score"]) if isinstance(a.get("score"), (int, float)) else None
            })


        events.sort(key=lambda x: x.get("ts") or "", reverse=True)
        return jsonify(events), 200


    except Exception as e:
        print("🔥 Error building activity log:", e)
        return jsonify({"error": str(e)}), 500

@teacher_bp.get("/student/<uuid:students_id>/lesson/<int:lesson_id>/table")
@require_teacher
def student_lesson_table(students_id, lesson_id):
    """
    Returns per-activity breakdown for one lesson:

      Activity | Question | Spiral Tag | Attempts | Score (best)
    """
    sb = supabase_client.client

    # 1) Fetch activities for the lesson
    act_rows = sb_safe_select(
        sb.table("activities")
          .select("id, sort_order, prompt_en, spiral_tag")
          .eq("lesson_id", lesson_id)
          .order("sort_order")
    )

    if not act_rows:
        return jsonify({
            "lesson_id": lesson_id,
            "lesson_title": None,
            "lesson_avg": None,
            "rows": []
        }), 200

    act_ids = [int(a["id"]) for a in act_rows]

    # 2) Fetch attempts for those activities
    att_rows = sb_safe_select(
        sb.table("activity_attempts")
          .select("activities_id, score, created_at")
          .eq("students_id", str(students_id))
          .in_("activities_id", act_ids)
          .order("created_at", desc=True)
    )

    from collections import defaultdict
    bucket = defaultdict(list)  # activity_id -> [scores]

    for a in att_rows:
        aid = int(a["activities_id"])
        sc = a.get("score")
        if sc is not None:
            bucket[aid].append(float(sc))

    # compute rows
    rows = []
    avg_sum = 0
    avg_n = 0

    for a in act_rows:
        aid = int(a["id"])
        scores = bucket.get(aid, [])

        attempts = len(scores)
        latest = scores[0] if scores else None
        avg = (sum(scores) / attempts) if attempts else None

        if avg is not None:
            avg_sum += avg
            avg_n += 1

        rows.append({
            "activity_id": aid,
            "question": a.get("prompt_en"),
            "spiral_tag": a.get("spiral_tag"),
            "attempts": attempts,
            "score": latest,
            "average": avg
        })

    # fetch lesson title
    lesson_row, _ = sb_exec(
        sb.table("lessons")
          .select("title_en")
          .eq("id", lesson_id)
          .maybe_single()
    )
    lesson_title = lesson_row.get("title_en") if lesson_row else None

    lesson_avg = round(avg_sum / avg_n, 1) if avg_n else None

    return jsonify({
        "lesson_id": lesson_id,
        "lesson_title": lesson_title,
        "lesson_avg": lesson_avg,
        "rows": rows
    }), 200










