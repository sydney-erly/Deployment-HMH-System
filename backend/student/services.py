# backend/student/services.py
# Student-related service helpers:
# - lesson_passed: check if ALL activities in a lesson have a >= 60 best attempt
# - lessons_grouped_by_chapter: preload lessons grouped by chapter (with cover/desc)
# - chapter_number: return numeric order for a chapter (for "Chapter X" labels)
# - decorate_dashboard_payload: build dashboard payload with focus/review & locks
# - can_start_lesson: enforce gating when fetching activities
# - recompute_lesson_completion: re-evaluate completion and upsert lesson_progress

from __future__ import annotations
from typing import Dict, List, Any, Optional, Iterable
from datetime import datetime, timezone

from extensions import supabase_client
from utils.sb import sb_exec
from content.transform import pick_branch, public_url

# --------------------------------------------------------------------
# Normalization & focus helpers
# --------------------------------------------------------------------

def _normalize_level(level: Optional[str]) -> str:
    """Normalize DB string into underscore form."""
    return (level or "non verbal").strip().lower().replace(" ", "_")

def _focus_set(level: str) -> set[int]:
    """Return the 2 focus chapter numbers for a given speech level."""
    lv = _normalize_level(level)
    if lv == "non_verbal":
        return {1, 2}
    if lv == "emerging":
        return {3, 4}
    return {5, 6}  # verbal

# --------------------------------------------------------------------
# Progress helpers
# --------------------------------------------------------------------

def _progress_map(students_id: str) -> Dict[int, Dict[str, float]]:
    """
    Map lesson_id -> {"status": str, "best": float} using lesson_progress.
    """
    sb = supabase_client.client
    rows, err = sb_exec(
        sb.table("lesson_progress")
          .select("lesson_id,status,best_score")
          .eq("students_id", students_id)
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

def _has_completed(prog: Dict[int, Dict[str, float]], lesson_id: int) -> bool:
    """
    A lesson is completed if lesson_progress.status == 'completed' OR best_score >= 60.
    """
    p = prog.get(int(lesson_id))
    if not p:
        return False
    return p.get("status") == "completed" or (p.get("best", 0.0) >= 60.0)

def _chapter_complete_first5(
    prog: Dict[int, Dict[str, float]],
    lessons: Iterable[dict]
) -> bool:
    """
    Consider the first 5 lessons (by sort_order) as the completion gate for a chapter.
    """
    ordered = sorted(
        [l for l in (lessons or []) if isinstance(l, dict)],
        key=lambda x: (x.get("sort_order") or 9999)
    )[:5]
    if not ordered:
        return False
    return all(
        _has_completed(prog, (l.get("id") or l.get("lesson_id")))
        for l in ordered
        if (isinstance(l, dict) and (l.get("id") or l.get("lesson_id")))
    )

# --------------------------------------------------------------------
# Lesson/Chapter data helpers
# --------------------------------------------------------------------

def lesson_passed(students_id: str, lesson_id: int) -> bool:
    """
    Return True if the student has a >= 60 best attempt for every activity in the lesson.
    """
    sb = supabase_client.client

    acts, err = sb_exec(
        sb.table("activities")
          .select("id")
          .eq("lesson_id", lesson_id)
          .order("sort_order")
    )
    if err:
        return False
    act_ids = [a.get("id") for a in (acts or []) if isinstance(a, dict)]
    if not act_ids:
        return False

    atts, err = sb_exec(
        sb.table("activity_attempts")
          .select("activities_id,score")
          .in_("activities_id", act_ids)
          .eq("students_id", students_id)
    )
    best: Dict[int, float] = {}
    for a in atts or []:
        aid = a.get("activities_id")
        sc = float(a.get("score") or 0.0)
        if aid is None:
            continue
        best[aid] = max(best.get(aid, 0.0), sc)

    return all(best.get(aid, 0.0) >= 60.0 for aid in act_ids)

def lessons_grouped_by_chapter() -> Dict[int, List[Dict[str, Any]]]:
    """
    Return all lessons grouped by chapter_id.
    Shape: { chapter_id: [ {id, chapter_id, code, title_en, title_tl, sort_order, ...}, ... ] }
    """
    sb = supabase_client.client
    lessons, err = sb_exec(
        sb.table("lessons")
          .select(
              "id,chapter_id,code,title_en,title_tl,sort_order,is_active,"
              "cover_path,description_en,description_tl"
          )
          .order("chapter_id")
          .order("sort_order")
    )
    if err:
        return {}

    grouped: Dict[int, List[Dict[str, Any]]] = {}
    for l in lessons or []:
        if not isinstance(l, dict):
            continue
        ch_id = l.get("chapter_id")
        if ch_id is None:
            continue
        grouped.setdefault(int(ch_id), []).append(l)
    return grouped

def chapter_number(chapter_id: int) -> Optional[int]:
    """
    Return the sort_order (1, 2, 3, …) for a given chapter_id.
    """
    sb = supabase_client.client
    row, err = sb_exec(
        sb.table("chapters")
          .select("sort_order")
          .eq("id", chapter_id)
          .limit(1)
    )
    if err or not row:
        return None
    return row[0].get("sort_order")

# --------------------------------------------------------------------
# Dashboard decoration (for the "pretty" payload)
# --------------------------------------------------------------------

def decorate_dashboard_payload(
    students_id: str,
    level: str,
    lang: str,
    chapters: List[Dict],
    per_chapter_lessons: Dict[int, List[Dict]]
):
    """
    Build dashboard chapters payload applying Focus/Review rules based on speech_level.
      - Chapters in focus set → "focus"
      - All other chapters → "review" (unlocked)
      - In focus chapters:
          · Lesson 1 always unlocked
          · Lessons 2..N sequentially unlocked on completion
      - Second focus chapter is locked until the first focus chapter's first 5 lessons completed
    Adds i18n-localized titles and cover/public URLs.
    """
    focus = _focus_set(level)
    first_focus = min(focus) if focus else None
    second_focus = max(focus) if focus else None

    # Load cached progress
    prog = _progress_map(students_id)

    chapters_out: List[Dict[str, Any]] = []
    lessons_by_ch: Dict[int, List[Dict[str, Any]]] = {}

    # Build a quick mapping: chapter_no -> chapter_id (from input chapters)
    chapter_no_to_id: Dict[int, int] = {}
    for ch in chapters or []:
        if not isinstance(ch, dict):
            continue
        cid = ch.get("id") or ch.get("chapters_id") or ch.get("chapter_id")
        cno = ch.get("sort_order")
        if cid and cno:
            chapter_no_to_id[int(cno)] = int(cid)

    for ch in chapters or []:
        if not isinstance(ch, dict):
            continue
        cid = ch.get("id") or ch.get("chapters_id") or ch.get("chapter_id")
        if not cid:
            continue

        ch_num = ch.get("sort_order") or chapter_number(int(cid)) or 999
        mode = "focus" if int(ch_num) in focus else "review"

        # Localize chapter title
        chapter_title = pick_branch(
            {"en": ch.get("title_en"), "tl": ch.get("title_tl")},
            lang
        )

        # Collect lessons for this chapter
        raw_lessons = sorted(
            per_chapter_lessons.get(int(cid), []) or [],
            key=lambda x: (x.get("sort_order") or 9999)
        )

        # Second focus chapter lock (only in focus mode)
        lock_whole_chapter = False
        if mode == "focus" and second_focus and int(ch_num) == int(second_focus):
            first_focus_cid = chapter_no_to_id.get(int(first_focus)) if first_focus else None
            prev_lessons = per_chapter_lessons.get(int(first_focus_cid), []) if first_focus_cid else []
            lock_whole_chapter = not _chapter_complete_first5(prog, prev_lessons)

        lesson_objs: List[Dict[str, Any]] = []
        prev_completed = True  # for sequential gating inside focus chapters
        for idx, L in enumerate(raw_lessons):
            if not isinstance(L, dict):
                continue
            lid = L.get("id") or L.get("lesson_id")
            if not lid:
                continue

            l_title = pick_branch(
                {"en": L.get("title_en"), "tl": L.get("title_tl")},
                lang
            )
            l_desc = pick_branch(
                {"en": L.get("description_en"), "tl": L.get("description_tl")},
                lang
            ) or ""
            cover_url = public_url(L.get("cover_path")) if L.get("cover_path") else None
            lsort = L.get("sort_order") or (idx + 1)
            completed = _has_completed(prog, int(lid))

            if mode == "review":
                unlocked = True
            else:
                if lock_whole_chapter:
                    unlocked = False
                else:
                    # focus: lesson 1 always unlocked; others sequential on completion
                    if lsort == 1:
                        unlocked = True
                        prev_completed = completed
                    else:
                        unlocked = bool(prev_completed)
                        prev_completed = completed

            lesson_objs.append({
                "id": int(lid),
                "code": L.get("code"),
                "title": l_title,
                "description": l_desc,
                "sort_order": lsort,
                "completed": completed,
                "unlocked": unlocked,
                "cover_url": cover_url,
                "cover_path": L.get("cover_path"),
            })

        out_ch = {
            "id": int(cid),
            "code": ch.get("code"),
            "title": chapter_title,
            "sort_order": int(ch_num),
            "state": mode,  # "focus" or "review"
            "lessons": lesson_objs,
        }
        chapters_out.append(out_ch)
        lessons_by_ch[int(cid)] = lesson_objs

    return chapters_out, lessons_by_ch

# --------------------------------------------------------------------
# Lesson gating — used by /lesson/<id>/activities
# --------------------------------------------------------------------

def can_start_lesson(
    students_id: str,
    level: str,
    lesson: Dict[str, Any],
    per_chapter_lessons: Dict[int, List[Dict[str, Any]]]
) -> bool:
    """
    Enforce:
      - Review chapters (outside focus): all lessons allowed
      - Focus chapters:
          · Lesson 1 always allowed
          · Lessons 2..N require previous lesson completed
      - Second focus chapter locked until first focus chapter's first 5 lessons completed
    """
    lv = _normalize_level(level)
    ch_id = (lesson or {}).get("chapter_id")
    lsort = (lesson or {}).get("sort_order") or 999
    lid   = (lesson or {}).get("id")

    if not ch_id:
        return False  # malformed payload

    # Lesson 1 anywhere → always allowed
    if int(lsort) == 1:
        return True

    # Determine the chapter number for this lesson
    try:
        ch_no = chapter_number(int(ch_id))
    except Exception:
        ch_no = None

    focus = _focus_set(lv)

    # REVIEW chapters (not in focus set) → allow everything
    if ch_no not in focus:
        return True

    # FOCUS chapters: sequential requirement
    lessons_in_ch = sorted(
        per_chapter_lessons.get(int(ch_id), []) or [],
        key=lambda x: (x.get("sort_order") or 9999)
    )

    # Previous lesson in same chapter must be completed
    prev = next((x for x in lessons_in_ch if (x.get("sort_order") == (int(lsort) - 1))), None)
    if prev and prev.get("id") and (prev.get("id") != lid):
        prog = _progress_map(students_id)
        if not _has_completed(prog, int(prev["id"])):
            return False

        # If this is the 2nd focus chapter, ensure first focus chapter's first 5 lessons completed
        if ch_no == max(focus):
            first_focus_no = min(focus)
            # Find the first focus chapter id
            first_focus_ch_id = None
            for k in per_chapter_lessons.keys():
                try:
                    if chapter_number(int(k)) == first_focus_no:
                        first_focus_ch_id = int(k)
                        break
                except Exception:
                    continue
            if first_focus_ch_id is not None:
                if not _chapter_complete_first5(prog, per_chapter_lessons.get(first_focus_ch_id, [])):
                    return False

    return True

# --------------------------------------------------------------------
# Completion recompute — keeps lesson_progress in sync
# --------------------------------------------------------------------

def recompute_lesson_completion(sb, sid, lesson_id):
    """
    Recompute if a student completed a lesson.
    A lesson is completed when EVERY activity in that lesson has best_score ≥ 60
    for this student. We also store best_score as the average of those per-activity
    bests (not the average of all attempts).
    """
    # 1) fetch activities in lesson
    acts, err = sb_exec(
        sb.table("activities")
          .select("id")
          .eq("lesson_id", lesson_id)
    )
    if err or not acts:
        return False

    act_ids = [a["id"] for a in acts if isinstance(a, dict) and a.get("id")]
    if not act_ids:
        return False

    # 2) fetch attempts for those activities
    atts, err = sb_exec(
        sb.table("activity_attempts")
          .select("activities_id, score")
          .in_("activities_id", act_ids)
          .eq("students_id", sid)
    )
    if err:
        return False

    # 3) compute best per activity
    best_by_activity = {}
    for a in atts or []:
        aid = a.get("activities_id")
        sc = float(a.get("score") or 0.0)
        if aid is None:
            continue
        best_by_activity[aid] = max(best_by_activity.get(aid, 0.0), sc)

    # 4) must have a best for every activity and all ≥ 60
    if len(best_by_activity) != len(act_ids):
        passed = False
    else:
        passed = all(best_by_activity.get(aid, 0.0) >= 60.0 for aid in act_ids)

    # 5) compute display best_score as avg of bests (or 0 if none)
    if best_by_activity:
        avg_best = sum(best_by_activity.values()) / len(act_ids)
    else:
        avg_best = 0.0

    # 6) upsert lesson_progress
    payload = {
        "students_id": sid,
        "lesson_id": lesson_id,
        "best_score": avg_best,
        "status": "completed" if passed else "in_progress",
        "unlocked_at": datetime.now(timezone.utc).isoformat(),
    }
    if passed:
        payload["completed_at"] = datetime.now(timezone.utc).isoformat()

    existing, _ = sb_exec(
        sb.table("lesson_progress")
          .select("id")
          .eq("students_id", sid)
          .eq("lesson_id", lesson_id)
          .limit(1)
    )

    if existing:
        sb_exec(
            sb.table("lesson_progress")
              .update(payload)
              .eq("students_id", sid)
              .eq("lesson_id", lesson_id)
        )
    else:
        sb_exec(sb.table("lesson_progress").insert(payload))

    return passed


def chapter_complete_firstN_live(students_id: str, lessons: list[dict], N: int = 5) -> bool:
    """Return True iff the first N **active** lessons are completed based on attempts
    (every activity in each lesson has best ≥ 60). Ignores lesson_progress cache."""
    from .services import lesson_passed  

    active = [l for l in (lessons or []) if (l.get("is_active") is True or l.get("is_active") is None)]
    firstN = sorted(active, key=lambda x: (x.get("sort_order") or 9999))[:N]
    if not firstN:
        return False
    for L in firstN:
        lid = L.get("id") or L.get("lesson_id")
        if not lid or not lesson_passed(students_id, int(lid)):
            return False
    return True



def student_completed_all_lessons(students_id: str) -> bool:
    """
    Return True if the student has completed all active lessons.
    Completion is per your existing rule: lesson_progress.status='completed'
    for lessons where lessons.is_active = TRUE.
    """
    total_sql = """
      SELECT COUNT(*)::int AS total
      FROM lessons
      WHERE is_active = TRUE
    """
    done_sql = """
      SELECT COUNT(*)::int AS done
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id
      WHERE lp.students_id = %(sid)s
        AND lp.status = 'completed'
        AND l.is_active = TRUE
    """
    total = sb_exec(total_sql)[0]["total"]
    done = sb_exec(done_sql, {"sid": students_id})[0]["done"]
    return total > 0 and done >= total