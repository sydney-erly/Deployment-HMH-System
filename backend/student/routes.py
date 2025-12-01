# backend/student/routes.py
# Student-facing routes: dashboard, activities, attempts, sessions, profile

from __future__ import annotations
import traceback
import random
import json 
from typing import Dict, List, Optional, Any, Iterable
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import io, os, mimetypes
from werkzeug.utils import secure_filename
from student.services import chapter_complete_firstN_live 
from extensions import supabase_client
from utils.sb import sb_exec
from auth.jwt_utils import require_student
from content.transform import pick_branch
from content.transform import public_url
from student.achievements import check_and_award_achievements 
from utils.time import mnl_day_bounds_utc


from student.services import (
    lessons_grouped_by_chapter,
    can_start_lesson,
    chapter_number,
    recompute_lesson_completion, 
)

from student.scoring import (
    score_recognition, score_listening, score_mcq, score_asr, score_emotion
)

student_bp = Blueprint("student", __name__)
BUCKET = "hmh-images"

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _normalize_level(val: Optional[str]) -> str:
    return (val or "non verbal").strip().lower().replace(" ", "_")

def _focus_chapter_numbers(level: str) -> set[int]:
    lv = _normalize_level(level)
    if lv == "non_verbal":
        return {1, 2}
    if lv == "emerging":
        return {3, 4}
    return {5, 6}  # verbal

def _progress_by_lesson(sb, sid) -> Dict[int, Dict[str, float]]:
    """
    Return { lesson_id: {"status": "completed"/..., "best": float_score} }
    Pull from lesson_progress first; you can add best_score updates elsewhere.
    """
    rows, err = sb_exec(
        sb.table("lesson_progress")
          .select("lesson_id,status,best_score")
          .eq("students_id", sid)
    )
    prog: Dict[int, Dict[str, float]] = {}
    if not err:
        for r in rows or []:
            lid = r.get("lesson_id")
            if lid is None:
                continue
            prog[int(lid)] = {
                "status": (r.get("status") or "").lower(),
                "best": float(r.get("best_score") or 0),
            }
    return prog

def _is_completed(prog: Dict[int, Dict[str, float]], lesson_id: int) -> bool:
    p = prog.get(int(lesson_id))
    if not p:
        return False
    return p.get("status") == "completed" or (p.get("best", 0.0) >= 60.0)

def _chapter_complete_first5(prog: Dict[int, Dict[str, float]], lessons: Iterable[dict]) -> bool:
    """
    Consider first 5 lessons in sort_order as the completion gate.
    """
    ls = sorted([l for l in (lessons or []) if isinstance(l, dict)],
                key=lambda x: (x.get("sort_order") or 9999))
    ls = ls[:5]
    if not ls:
        return False
    return all(_is_completed(prog, (l.get("id") or l.get("lesson_id"))) for l in ls)

# -------------------------------------------------------------------
# Student Profile (GET/PUT) — single definition (no duplicates)
# -------------------------------------------------------------------

@student_bp.get("/profile", endpoint="profile")
@require_student
def get_profile():
    sb = supabase_client.client
    sid = request.user_id

    # ----------------------------------------
    # Fetch base student info
    # ----------------------------------------
    s, err = sb_exec(
        sb.table("students").select(
            "students_id, first_name, last_name, middle_initial, birthday, email, login_id, photo_url, speech_level, sex"
        ).eq("students_id", sid).limit(1)
    )

    if err or not s:
        _, ierr = sb_exec(
            sb.table("students").insert({
                "students_id": sid,
                "first_name": "Dev",
                "last_name": "Student",
                "speech_level": "non_verbal",
            })
        )
        if ierr:
            return jsonify({"error": f"Profile create failed: {ierr}"}), 500

        s, err = sb_exec(
            sb.table("students").select(
                "students_id, first_name, last_name, middle_initial, birthday, email, login_id, photo_url, speech_level, sex"
            ).eq("students_id", sid).limit(1)
        )
        if err or not s:
            return jsonify({"error": "Profile not found"}), 404

    student = s[0]

    
    # Assign default only if photo_url is NULL (not empty string)
    if student.get("photo_url") is None:
        default_url = _default_photo_for_gender(student.get("sex"))
        student["photo_url"] = default_url
        sb.table("students").update({"photo_url": default_url}).eq("students_id", sid).execute()


        # ----------------------------------------
    # Stats aggregation
    # ----------------------------------------
    stats = {
        "lessonsCompleted": 0,
        "activitiesPassed": 0,
        "streakDays": 0,
        "perfectLesson": False,
        "weekendLessons": 0,
    }

    # Last session info
    sess_rows, _ = sb_exec(
        sb.table("sessions")
          .select("mood, minutes_allowed, started_at, ended_at")
          .eq("students_id", sid)
          .order("id", desc=True)
          .limit(1)
    )
    last_session = sess_rows[0] if sess_rows else None

    # ----------------------------------------
    # Lesson progress + completions
    # ----------------------------------------
    prog_rows, _ = sb_exec(
        sb.table("lesson_progress")
          .select("lesson_id, status, best_score, completed_at, lessons!inner(chapter_id)")
          .eq("students_id", sid)
    )

    lessons_completed = [
        r for r in (prog_rows or [])
        if r.get("status") == "completed" or (r.get("best_score") or 0) >= 60
    ]
    stats["lessonsCompleted"] = len(lessons_completed)

    # ----------------------------------------
    # Speech stats (avg ASR)
    # ----------------------------------------
    speech_rows, _ = sb_exec(
        sb.table("activity_attempts")
          .select("score, activities!inner(type)")
          .eq("students_id", sid)
    )
    speech_scores = [
        float(r["score"]) for r in (speech_rows or [])
        if r.get("activities", {}).get("type") == "asr"
    ]
    avg_speech = round(sum(speech_scores) / len(speech_scores), 1) if speech_scores else 0

    # Emotion stats
    emo_scores = [
        float(r["score"]) for r in (speech_rows or [])
        if r.get("activities", {}).get("type") == "emotion"
    ]
    avg_emo = round(sum(emo_scores) / len(emo_scores), 1) if emo_scores else 0

    # ----------------------------------------
    # Adaptive Scholar logic
    # ----------------------------------------
    speech_level = (student.get("speech_level") or "").lower()
    if speech_level == "non_verbal":
        target_types = ["asr"]  # sound-based
    elif speech_level == "emerging":
        target_types = ["mcq", "tts"]  # words
    else:
        target_types = ["tts", "listening"]  # short sentences

    act_rows, _ = sb_exec(
        sb.table("activity_attempts")
          .select("score, activities!inner(type)")
          .eq("students_id", sid)
    )
    passed_acts = [
        r for r in (act_rows or [])
        if r.get("activities", {}).get("type") in target_types
        and (r.get("score") or 0) >= 60
    ]
    stats["activitiesPassed"] = len(passed_acts)

    # ----------------------------------------
    # Perfect lesson (Sharpshooter)
    # ----------------------------------------
    stats["perfectLesson"] = any(
        (r.get("best_score") or 0) == 100 for r in lessons_completed
    )

    # ----------------------------------------
    # Weekend Warrior (Sat + Sun)
    # ----------------------------------------
    import datetime
    weekend_days = set()
    for r in lessons_completed:
        dt = r.get("completed_at")
        if not dt:
            continue
        try:
            d = datetime.datetime.fromisoformat(dt)
            if d.weekday() in (5, 6):  # Sat=5, Sun=6
                weekend_days.add(d.weekday())
        except Exception:
            continue
    stats["weekendLessons"] = len(weekend_days)

    # ----------------------------------------
    # Recent emotions
    # ----------------------------------------
    emo_attempts, _ = sb_exec(
        sb.table("activity_attempts")
          .select("meta")
          .eq("students_id", sid)
          .order("id", desc=True)
          .limit(5)
    )
    recent_emotions = []
    for e in (emo_attempts or []):
        meta = e.get("meta") or {}
        emo = meta.get("recognized_emotion") or meta.get("emotion_label")
        if emo:
            recent_emotions.append(emo)

    # ----------------------------------------
    # Current lesson (first unfinished)
    # ----------------------------------------
    lesson_rows, _ = sb_exec(
        sb.table("lesson_progress")
          .select("lesson_id, status, lessons!inner(title_en, title_tl)")
          .eq("students_id", sid)
          .neq("status", "completed")
          .order("lesson_id")
          .limit(1)
    )
    current_lesson = lesson_rows[0] if lesson_rows else None

    # ----------------------------------------
    # Achievements (optional Supabase table)
    # ----------------------------------------
    
    achievements, _ = sb_exec(
        sb.table("student_achievements")
          .select(
            "achievements_code, earned_at, "
            "achievements:achievements_code(code, name, description, icon_path)"
          )
          .eq("students_id", sid)
    )


    # ----------------------------------------
    # Overall Progress
    # ----------------------------------------
    total_lessons = 30  # future: query chapters/lessons count
    progress_percent = int((stats["lessonsCompleted"] / total_lessons) * 100)

    # ----------------------------------------
    return jsonify({
        "student": student,
        "stats": stats,
        "speech": {"avg": avg_speech},
        "emotion": {"avg": avg_emo, "recent": recent_emotions},
        "session": last_session,
        "achievements": achievements or [],
        "current_lesson": current_lesson,
        "progress_percent": progress_percent,
    })


@student_bp.put("/profile")
@require_student
def update_profile():
    sb = supabase_client.client
    sid = request.user_id

    # ------------------------------------------
    # CASE 1 — PHOTO UPLOAD (multipart/form-data)
    # ------------------------------------------
    if request.content_type and "multipart/form-data" in request.content_type.lower():
        photo = request.files.get("photo")
        if not photo:
            return jsonify({"error": "No photo uploaded"}), 400

        # Save binary
        filename = f"{sid}/{secure_filename(photo.filename)}"
        file_bytes = photo.read()

        try:
            sb.storage.from_("hmh-images").upload(
                path=filename,
                file=file_bytes,
                file_options={
                    "upsert": True,
                    "content-type": photo.mimetype,   # FIXED!
                },
            )
        except Exception as e:
            print("UPLOAD ERROR FULL:", repr(e))

            return jsonify({"error": "Upload failed", "details": str(e)}), 500


        # Update DB
        sb.table("students") \
          .update({"photo_url": public_url}) \
          .eq("students_id", sid) \
          .execute()

        return jsonify({"photo_url": public_url})

    # ------------------------------------------
    # CASE 2 — JSON UPDATE (email, etc.)
    # ------------------------------------------
    data = request.get_json(silent=True) or {}
    updates = {}

    if "email" in data:
        updates["email"] = data["email"]

    if updates:
        sb.table("students") \
          .update(updates) \
          .eq("students_id", sid) \
          .execute()

    return jsonify({"ok": True, "updated": updates})

@student_bp.put("/profile/email")
@require_student
def update_email():
    sb = supabase_client.client
    sid = request.user_id

    data = request.get_json(silent=True) or {}
    email = data.get("email")

    if not email:
        return jsonify({"error": "Missing email"}), 400

    sb.table("students") \
        .update({"email": email}) \
        .eq("students_id", sid) \
        .execute()

    return jsonify({"ok": True, "email": email})




# -------------------------------------------------------------------
# Profile photo defaulting
# -------------------------------------------------------------------

def _default_photo_for_gender(sex: str) -> str:
    # Normalize and lowercase
    s = (sex or "").strip().lower()

    if s in ("male", "m", "boy"):
        fname = f"hmh-images/pfp/boypfp{random.randint(1,4)}.png"
    elif s in ("female", "f", "girl"):
        fname = f"hmh-images/pfp/girlpfp{random.randint(1,4)}.png"
    else:
        fname = "hmh-images/pfp/defaultpfp.png"

    return public_url(fname)

# -------------------------------------------------------------------
# Student Dashboard
# -------------------------------------------------------------------

@student_bp.get("/student-dashboard", endpoint="student_dashboard")
@require_student
def student_dashboard():
    sb = supabase_client.client
    sid = request.user_id
    lang = (request.args.get("lang") or "en").lower()

    # S1: Student
    srows, serr = sb_exec(
        sb.table("students")
          .select("speech_level, first_name, photo_url, sex")
          .eq("students_id", sid)
          .limit(1)
    )
    if serr:
        return jsonify({"ok": False, "stage": "S1-students", "error": str(serr)}), 500

    # Auto-assign gender-based avatar if missing
    if srows and not srows[0].get("photo_url"):
        default_url = _default_photo_for_gender(srows[0].get("sex"))
        srows[0]["photo_url"] = default_url
        sb.table("students").update({"photo_url": default_url}).eq("students_id", sid).execute()

    level = _normalize_level(srows[0].get("speech_level") if srows else "non_verbal")
    student_name = srows[0].get("first_name") if srows else "Student"

    # S2: Chapters
    ch_rows, cerr = sb_exec(
        sb.table("chapters")
          .select("id, code, title_en, title_tl, sort_order, bg_path")
          .order("sort_order")
    )
    if cerr:
        return jsonify({"ok": False, "stage": "S2-chapters", "error": str(cerr)}), 500

    chapters = []
    for c in ch_rows or []:
        cid = c.get("id") or c.get("chapters_id") or c.get("chapter_id")
        if not cid:
            continue
        chapters.append({
            "id": int(cid),
            "code": c.get("code"),
            "title_en": c.get("title_en"),
            "title_tl": c.get("title_tl"),
            "sort_order": int(c.get("sort_order") or 999),
            "bg_path": c.get("bg_path"),
        })

    # S3: Lessons grouped by chapter
    try:
        per_ch_lessons = lessons_grouped_by_chapter() or {}
    except Exception as e:
        return jsonify({"ok": False, "stage": "S3-lessons_grouped_by_chapter", "error": str(e)}), 500

    # S4: Progress + focus sets
    prog = _progress_by_lesson(sb, sid)            # {lesson_id: {status,best}}
    focus_set = _focus_chapter_numbers(level)      # e.g., {1,2} for non_verbal

    # helper: map lesson_id -> "completed"/"unlocked"/"locked"
    def _lesson_state(lid: int) -> str:
        p = prog.get(int(lid)) or {}
        if (p.get("status") == "completed") or (float(p.get("best", 0.0)) >= 60.0):
            return "completed"
        if p.get("status") in ("unlocked", "in_progress"):
            return "unlocked"
        return "locked"

    out = []
    for ch in chapters:
        cid = ch["id"]
        ch_no = ch["sort_order"]
        title = ch["title_en"] if lang == "en" else (ch.get("title_tl") or ch["title_en"])

        raw_lessons = sorted(
            per_ch_lessons.get(cid, []) or [],
            key=lambda x: (x.get("sort_order") or 9999)
        )

        is_focus  = ch_no in focus_set
        is_future = ch_no > max(focus_set)
        # is_review not used explicitly; anything not focus and not future becomes review.

        # If any lesson in this chapter is unlocked/completed in lesson_progress,
        # we **override** the blanket future lock and show the chapter as accessible.
        chapter_has_access = any(
            _lesson_state((L.get("id") or L.get("lesson_id"))) != "locked"
            for L in raw_lessons
            if isinstance(L, dict) and (L.get("id") or L.get("lesson_id"))
        )

        # Decide chapter mode

  

        # NEW: consider backend chapter unlocks
        real_chapter_unlocked = any(
            (
                prog.get((L.get("id") or L.get("lesson_id")), {})
                .get("status") in ("unlocked", "completed")
            )
            for L in raw_lessons
            if isinstance(L, dict)
        )

        # Determine default behavior
        if is_future and (chapter_has_access or real_chapter_unlocked):
            mode = "review"
        elif is_future:
            mode = "locked"
        elif is_focus:
            mode = "focus"
        else:
            mode = "review"


        lessons_out = []
        prev_completed = True  # for sequential gating inside focus chapters

        for idx, L in enumerate(raw_lessons):
            lid = L.get("id") or L.get("lesson_id")
            if not lid:
                continue

            lsort = L.get("sort_order") or (idx + 1)
            ltitle = L.get("title_en") if lang == "en" else (L.get("title_tl") or L.get("title_en"))
            ldesc  = L.get("description_en") if lang == "en" else (L.get("description_tl") or L.get("description_en"))
            cover  = public_url(L.get("cover_path")) if L.get("cover_path") else None

            real = _lesson_state(lid)

            if mode == "locked":
                status = "locked"  # truly future and no access recorded
            elif mode == "review":
                # review chapters are open; prefer real state; otherwise default to unlocked
                status = real if real != "locked" else "unlocked"
            else:
                # focus: sequential gating but still respect already-completed lessons
                if real == "completed":
                    status = "completed"
                    prev_completed = True
                elif real == "unlocked":
                    status = "unlocked"
                    prev_completed = False
                else:
                    if lsort == 1:
                        status = "unlocked"
                        prev_completed = (real == "completed")
                    else:
                        status = "unlocked" if prev_completed else "locked"
                        prev_completed = (real == "completed")

            lessons_out.append({
                "id": int(lid),
                "code": L.get("code"),
                "title": ltitle,
                "description_en": L.get("description_en"),
                "description_tl": L.get("description_tl"),
                "cover_path": cover,
                "sort_order": int(lsort),
                "status": status,
            })

        out.append({
            "id": cid,
            "code": ch.get("code"),
            "number": ch_no,
            "title": title,
            "sort_order": ch_no,
            "mode": mode,
            "bg_path": public_url(ch.get("bg_path")),
            "lessons": lessons_out,
        })

    return jsonify({
        "ok": True,
        "student": {
            "students_id": sid,
            "name": student_name,
            "speech_level": level,
            "photo_url": srows[0].get("photo_url") if srows else None,
        },
        "chapters": out
    })

# ----------------------------------------------------------
# Activities for a lesson (guarded)
# ----------------------------------------------------------
@student_bp.get("/lesson/<int:lesson_id>/activities")
@require_student
def student_lesson_activities(lesson_id: int):
    """
    Returns i18n-picked, storage-resolved activities for a lesson.
    Enforces chapter/lesson access using speech_level rules.
    """
    import json

    sb = supabase_client.client
    sid = request.user_id
    lang = (request.args.get("lang") or request.headers.get("X-HMH-Lang") or "en").lower()

    # Student level (normalize for focus_map)
    srows, serr = sb_exec(
        sb.table("students").select("speech_level").eq("students_id", sid).limit(1)
    )
    if serr or not srows:
        return jsonify({"ok": False, "error": "student not found"}), 404
    level = _normalize_level(srows[0].get("speech_level"))

    # Lesson row
    lrow, lerr = sb_exec(
        sb.table("lessons")
          .select("id,chapter_id,code,title_en,title_tl,sort_order")
          .eq("id", lesson_id).limit(1)
    )
    if lerr:
        return jsonify({"ok": False, "where": "lessons", "error": str(lerr)}), 500
    if not lrow:
        return jsonify({"ok": False, "error": f"Lesson {lesson_id} not found"}), 404
    lesson = lrow[0]

    # Guard: focus sequential / review always / locked never
    per_ch_lessons = lessons_grouped_by_chapter() or {}
    if not can_start_lesson(sid, level, lesson, per_ch_lessons):
        return jsonify({"ok": False, "error": "locked"}), 403

    # ✅ Fetch activities
    rows, err = sb_exec(
        sb.table("activities")
          .select("id,lesson_id,type,sort_order,spiral_tag,difficulty,affective_level,"
                  "supports,prompt_en,prompt_tl,data")
          .eq("lesson_id", lesson_id)
          .order("sort_order")
    )
    if err:
        return jsonify({"ok": False, "where": "activities", "error": str(err)}), 500

    #  Convert stringified JSON fields into dicts
    for r in (rows or []):
        if isinstance(r.get("data"), str):
            try:
                r["data"] = json.loads(r["data"])
            except Exception:
                pass

    # Resolve i18n
    activities = [pick_branch(r, lang) for r in (rows or [])]

    return jsonify({
        "ok": True,
        "meta": {
            "lesson_id": lesson["id"],
            "chapter_id": lesson["chapter_id"],
            "lesson_code": lesson["code"],
            "lesson_title": lesson["title_en"] if lang == "en" else (lesson.get("title_tl") or lesson["title_en"]),
            "count": len(activities),
            "lang": lang,
        },
        "activities": activities
    })


@student_bp.post("/attempt")
@require_student
def attempt():
    sb = supabase_client.client
    j = (request.get_json(silent=True) or {})
    activity_id = j.get("activity_id")
    lang = (j.get("lang") or "en").lower()
    submission = j.get("submission") or {}
    print("DEBUG attempt submission:", j)

    # ------------------------------
    # Validate input
    # ------------------------------
    if not activity_id:
        return jsonify({"error": "Missing activity_id"}), 400

    sid = getattr(request, "user_id", None) or getattr(request, "student_id", None)
    if not sid:
        print("No student ID found in request!")
        return jsonify({"error": "Missing student_id"}), 401

    # ------------------------------
    # Fetch activity
    # ------------------------------
    rows, err = sb_exec(
        sb.table("activities")
          .select("id,type,prompt_en,prompt_tl,supports,data,sort_order")
          .eq("id", activity_id)
          .limit(1)
    )
    if err or not rows:
        return jsonify({"error": "Activity not found"}), 404

    act = rows[0]
    a_type = (act.get("type") or "").lower()

    # ------------------------------
    # Score computation
    # ------------------------------
    score = 0.0
    if a_type == "mcq":
        ch = submission.get("choice_key")
        correct = submission.get("correct_key")
        score = 100.0 if (ch and correct and ch == correct) else 0.0
    elif a_type == "recognition":
        score = score_recognition(act, submission)
    elif a_type in ("listening", "tts"):
        score = score_listening(act, submission)
    elif a_type == "asr": 
        score = score_asr(act, submission, lang=lang)
    elif a_type == "emotion":
        score = score_emotion(act, submission)
    else:
        score = 0.0  # unknown type hard-fail safe

    # ------------------------------
    # Save attempt 
    # ------------------------------
    enriched_meta = {
        "action": submission.get("action"),
        "layout": submission.get("layout"),
        "lang": lang,
        "wrong_count": submission.get("wrong_count"),
        "choice_key": submission.get("choice_key"),
        "correct_key": submission.get("correct_key"),
        "session_id": submission.get("session_id"),
        "submission": submission,
    }

    try:
        insert_result = sb.table("activity_attempts").insert({
            "students_id": sid,
            "activities_id": activity_id,
            "score": score,
            "meta": enriched_meta
        }).execute()

        attempt_rows = insert_result.data if hasattr(insert_result, "data") else None
        if not attempt_rows:
            raise Exception("Insert returned no data")

        attempt_id = attempt_rows[0]["id"]
        print(f"Attempt saved id={attempt_id}, student={sid}, score={score}")
    except Exception as e:
        print("Attempt insert failed:", e)
        return jsonify({"error": f"DB insert failed: {str(e)}"}), 500

    # ------------------------------
    # Metrics (ASR / Emotion)
    # ------------------------------
    try:
        if a_type == "asr":
            # Prefer server transcript if present; fallback to browser transcript
            recog_text = submission.get("backend_text") or submission.get("transcript") or ""
            i18n = (act.get("data") or {}).get("i18n", {})
            expect_text = (
                (i18n.get(lang) or {}).get("expected_speech")
                or (i18n.get("en") or {}).get("expected_speech")
                or ""
            )
            model_used = submission.get("model_used") or "hmh-whisper-auto"
            latency_ms = submission.get("latency_ms")

            sb.table("speech_metrics").insert({
                "attempt_id": attempt_id,
                "students_id": sid,
                "activities_id": activity_id,
                "recognized_text": recog_text,
                "expected_text": (expect_text or "").lower(),
                "accuracy": score,
                "lang": lang,
                "model_used": model_used,
                "latency_ms": latency_ms
            }).execute()

        elif a_type == "emotion":
            det = (submission.get("detected") or {}).get("label")
            conf = (submission.get("detected") or {}).get("confidence")
            expected = (
                ((act.get("data") or {}).get("i18n") or {}).get(lang, {},).get("expected_emotion")
                or ((act.get("data") or {}).get("i18n") or {}).get("en", {},).get("expected_emotion")
            )

            if det:
                sb.table("emotion_metrics").insert({
                    "attempt_id": attempt_id,
                    "students_id": sid,
                    "activities_id": activity_id,
                    "detected_emotion": det,
                    "expected_emotion": expected,
                    "confidence": conf,
                    "model_backend": "DeepFace-opencv"
                }).execute()

    except Exception as e:
        print("Metric logging failed:", e)

    # ------------------------------
    # Achievements
    # ------------------------------
    new_inline, new_profile = [], []
    try:
        print("Checking possible achievements for", sid)

        # prefer provided lesson_id; if absent, derive from activity_id
        lesson_id = j.get("lesson_id") or submission.get("lesson_id")
        if lesson_id is not None:
            try:
                lesson_id = int(lesson_id)
            except Exception:
                lesson_id = None

        if not lesson_id:
            lr, le = sb_exec(
                sb.table("activities").select("lesson_id").eq("id", activity_id).limit(1)
            )
            if not le and lr:
                lesson_id = lr[0]["lesson_id"]

        layout = submission.get("layout")

        inline_codes, profile_codes = check_and_award_achievements(
            sb,
            sid,
            score,
            lesson_id=lesson_id,
            layout=layout,
        )

        new_inline = inline_codes or []
        new_profile = profile_codes or []

        print("Inline achievements:", new_inline)
        print("Profile-only achievements:", new_profile)

    except Exception as e:
        print("Achievement logic failed gracefully:", e)
        new_inline, new_profile = [], []


    # ------------------------------
    # Final response
    # ------------------------------
    return jsonify({
        "score": float(score),
        "passed": bool(score >= 60.0),
        "inline_achievements": new_inline,
        "profile_achievements": new_profile
    })

# ----------------------------------------------------------
# Lesson runtime progress: GET (resume) / POST (save/clear)
# ----------------------------------------------------------
@student_bp.get("/lesson/<int:lesson_id>/progress")
@require_student
def get_lesson_progress(lesson_id: int):
    """
    Try exact (student, lesson, lang). If none, fall back to latest ANY lang row.
    """
    sb = supabase_client.client
    sid = request.user_id
    lang = (request.args.get("lang") or request.headers.get("X-HMH-Lang") or "en").lower()

    # 1) exact lang
    rows, err = sb_exec(
        sb.table("lesson_runtime_progress")
          .select("activity_id,activity_idx,scores,updated_at,completed_at,lang")
          .eq("students_id", sid)
          .eq("lesson_id", lesson_id)
          .eq("lang", lang)
          .limit(1)
    )
    if err:
        return jsonify({"ok": False, "error": str(err)}), 500

    # 2) fallback: latest any lang
    if not rows:
        rows2, err2 = sb_exec(
            sb.table("lesson_runtime_progress")
              .select("activity_id,activity_idx,scores,updated_at,completed_at,lang")
              .eq("students_id", sid)
              .eq("lesson_id", lesson_id)
              .order("updated_at", desc=True)
              .limit(1)
        )
        if err2:
            return jsonify({"ok": False, "error": str(err2)}), 500
        rows = rows2

    if not rows:
        return jsonify({"ok": True, "progress": None})

    r = rows[0]
    return jsonify({
        "ok": True,
        "progress": {
            "activity_id": r.get("activity_id"),
            "index": r.get("activity_idx"),
            "scores": r.get("scores") or [],
            "updated_at": r.get("updated_at"),
            "completed_at": r.get("completed_at"),
            "lang": r.get("lang"),
        }
    })



@student_bp.post("/lesson/<int:lesson_id>/progress")
@require_student
def save_lesson_progress(lesson_id: int):
    """
    Saves or clears the student's runtime progress for a lesson.
    Body:
      {
        "lang": "en",
        "activity_id": 123,   # optional but preferred
        "index": 5,           # fallback if activity_id missing
        "scores": [100, 80],  # optional
        "updated_at": 1731043200000,  # optional client clock (ms)
        "clear": false
      }
    """
    sb = supabase_client.client
    sid = request.user_id
    j = request.get_json(silent=True) or {}
    lang = (j.get("lang") or "en").lower()
    clear = bool(j.get("clear"))

    if clear:
        _, derr = sb_exec(
            sb.table("lesson_runtime_progress")
              .delete()
              .eq("students_id", sid)
              .eq("lesson_id", lesson_id)
              .eq("lang", lang)
        )
        if derr:
            return jsonify({"ok": False, "error": str(derr)}), 500
        return jsonify({"ok": True, "cleared": True})

    # upsert progress
    try:
        idx = int(j.get("index") or 0)
    except Exception:
        idx = 0

    payload = {
        "students_id": sid,
        "lesson_id": int(lesson_id),
        "lang": lang,
        "activity_id": j.get("activity_id"),
        "activity_idx": idx,
        "scores": j.get("scores") or [],
        "updated_at": datetime.fromtimestamp(
            (int(j.get("updated_at")) / 1000.0), tz=timezone.utc
        ) if j.get("updated_at") else datetime.now(timezone.utc),
    }

    # Use RPC-like UPSERT behavior
    q = sb.table("lesson_runtime_progress").upsert(payload, on_conflict="students_id,lesson_id,lang")
    _, uerr = sb_exec(q)
    if uerr:
        return jsonify({"ok": False, "error": str(uerr)}), 500

    return jsonify({"ok": True})

@student_bp.post("/lesson/<int:lesson_id>/complete")
@require_student
def complete_lesson(lesson_id: int):
    sb = supabase_client.client
    sid = request.user_id

    try:
        is_completed = recompute_lesson_completion(sb, sid, int(lesson_id))

        # Current lesson row
        lrow, _ = sb_exec(
            sb.table("lessons")
              .select("id, chapter_id, sort_order")
              .eq("id", lesson_id).limit(1)
        )
        if not lrow:
            return jsonify({"ok": False, "error": "Lesson not found"}), 404

        ch_id = int(lrow[0]["chapter_id"])
        sort_order = int(lrow[0]["sort_order"])

        # Lessons in current chapter (active only)
        lessons, _ = sb_exec(
            sb.table("lessons")
              .select("id, sort_order, is_active")
              .eq("chapter_id", ch_id)
              .eq("is_active", True)
              .order("sort_order")
        )

        # 1) Next-lesson unlock (only if this lesson is completed)
        next_lesson_id = None
        if is_completed:
            for L in lessons or []:
                if int(L["sort_order"]) == sort_order + 1:
                    next_lesson_id = int(L["id"])
                    sb_exec(
                        sb.table("lesson_progress")
                          .upsert({
                              "students_id": sid,
                              "lesson_id": next_lesson_id,
                              "status": "unlocked",
                              "unlocked_at": datetime.now(timezone.utc)
                          }, on_conflict="students_id,lesson_id")
                    )
                    break

        # 2) Chapter completion (first 5 active lessons)
        chapter_completed = chapter_complete_firstN_live(sid, lessons or [], N=5)

        # 3) If chapter completed → unlock first active lesson of the NEXT chapter (works for all chapters)
        next_chapter_unlocked = False
        if chapter_completed:
            ch_rows, _ = sb_exec(
                sb.table("chapters").select("id, sort_order").order("sort_order")
            )
            sorted_chs = sorted(ch_rows or [], key=lambda x: int(x["sort_order"]))
            for idx, c in enumerate(sorted_chs):
                if int(c["id"]) == ch_id and idx + 1 < len(sorted_chs):
                    next_ch_id = int(sorted_chs[idx + 1]["id"])
                    next_lessons, _ = sb_exec(
                        sb.table("lessons")
                          .select("id, sort_order")
                          .eq("chapter_id", next_ch_id)
                          .eq("is_active", True)
                          .order("sort_order")
                    )
                    if next_lessons:
                        first_lesson_id = int(next_lessons[0]["id"])
                        sb_exec(
                            sb.table("lesson_progress")
                              .upsert({
                                  "students_id": sid,
                                  "lesson_id": first_lesson_id,
                                  "status": "unlocked",
                                  "unlocked_at": datetime.now(timezone.utc)
                              }, on_conflict="students_id,lesson_id")
                        )
                        next_chapter_unlocked = True
                    break

        # Cleanup runtime progress
        sb.table("lesson_runtime_progress").delete() \
          .eq("students_id", sid).eq("lesson_id", lesson_id).execute()

        return jsonify({
            "ok": True,
            "completed": bool(is_completed),
            "next_lesson_id": next_lesson_id,
            "chapter_completed": bool(chapter_completed),
            "next_chapter_unlocked": bool(next_chapter_unlocked),
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


# ----------------------------------------------------------
# Sessions: create (pending) → activate (active) → end (ended)
# ----------------------------------------------------------
@student_bp.post("/create-session")
@require_student
def create_session():
    """
    Creates a PENDING session (no start time yet).
    Enforces:
      • Only 1 active or pending session at a time
      • Only 1 started session per Manila calendar day
    """
    sb = supabase_client.client
    j = request.get_json(silent=True) or {}
    sid = request.user_id

    # validate minutes
    try:
        minutes = int(j.get("minutes", 0) or 0)
    except Exception:
        minutes = 0
    if minutes not in (5, 10, 15, 20):
        return jsonify({"error": "Invalid minutes"}), 400

    mood = j.get("mood")
    language = (j.get("language") or "en").lower()

    # (a) block if any active/pending exists
    act_rows, act_err = sb_exec(
        sb.table("sessions")
          .select("id")
          .eq("students_id", sid)
          .in_("status", ["pending", "active"])
          .limit(1)
    )
    if act_err:
        return jsonify({"error": f"session lookup failed: {act_err}"}), 500
    if act_rows:
        return jsonify({
            "ok": False,
            "blocked": True,
            "reason": "session_active",
            "message": "A session is still active or pending."
        }), 403

    # (b) block if a session already STARTED today (Manila day)
    start_utc, end_utc = mnl_day_bounds_utc()
    today_rows, day_err = sb_exec(
        sb.table("sessions")
          .select("id")
          .eq("students_id", sid)
          .gte("started_at", start_utc)
          .lt("started_at", end_utc)
          .limit(1)
    )
    if day_err:
        return jsonify({"error": f"session day check failed: {day_err}"}), 500
    if today_rows:
        return jsonify({
            "ok": False,
            "blocked": True,
            "reason": "session_recent",
            "message": "You already finished (or started) a session today."
        }), 403

    # create pending session (no started_at yet)
    _, ierr = sb_exec(
        sb.table("sessions").insert({
            "students_id": sid,
            "mood": mood,
            "language": language,
            "minutes_allowed": minutes,
            "status": "pending",
            "started_at": None,
            "ended_at": None,
            "forced_logout": False,
        })
    )
    if ierr:
        return jsonify({"error": f"insert session failed: {ierr}"}), 500

    rows, ferr = sb_exec(
        sb.table("sessions")
          .select("id, minutes_allowed, mood, language, status, started_at, ended_at")
          .eq("students_id", sid)
          .order("id", desc=True)
          .limit(1)
    )
    if ferr or not rows:
        return jsonify({"error": f"could not fetch session: {ferr}"}), 500

    return jsonify({"ok": True, "session": rows[0]})


@student_bp.post("/activate-session")
@require_student
def activate_session():
    """
    Activates a PENDING session and stamps started_at (now).
    If they already STARTED a session today (Manila), return blocked: session_recent.
    """
    sb = supabase_client.client
    j = request.get_json(silent=True) or {}
    sess_id = j.get("session_id")
    if not sess_id:
        return jsonify({"error": "Missing session_id"}), 400

    # Before activating, check Manila day uniqueness
    sid = request.user_id
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
        # They already started one today
        return jsonify({"ok": False, "blocked": True, "reason": "session_recent"}), 403

    now_iso = _now_utc_iso()

    q = sb.table("sessions") \
          .update({"status": "active", "started_at": now_iso}) \
          .eq("id", sess_id) \
          .eq("students_id", request.user_id) \
          .eq("status", "pending") \
          .is_("started_at", None)

    _, uerr = sb_exec(q)
    if uerr:
        return jsonify({"error": f"activate failed: {uerr}"}), 500

    rows, ferr = sb_exec(
        sb.table("sessions")
          .select("id, minutes_allowed, mood, language, status, started_at, ended_at")
          .eq("id", sess_id)
          .eq("students_id", request.user_id)
          .limit(1)
    )
    if ferr or not rows:
        return jsonify({"error": f"fetch after activate failed: {ferr}"}), 500

    return jsonify({"ok": True, "session": rows[0]})


@student_bp.post("/end-session")
@require_student
def end_session():
    """
    Ends a session (sets status=ended, ended_at now()).
    Body (optional): { session_id }
    """
    sb = supabase_client.client
    j = request.get_json(silent=True) or {}
    sess_id = j.get("session_id")

    # fallback: latest active
    if not sess_id:
        rows, ferr = sb_exec(
            sb.table("sessions")
              .select("id")
              .eq("students_id", request.user_id)
              .eq("status", "active")
              .order("id", desc=True).limit(1)
        )
        if ferr or not rows:
            return jsonify({"error": "no active session found"}), 404
        sess_id = rows[0]["id"]

    now_iso = _now_utc_iso()
    _, uerr = sb_exec(
        sb.table("sessions").update({
            "status": "ended",
            "ended_at": now_iso
        }).eq("id", sess_id).eq("students_id", request.user_id)
    )
    if uerr:
        return jsonify({"error": f"end failed: {uerr}"}), 500

    return jsonify({"ok": True})
