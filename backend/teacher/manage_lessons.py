from flask import Blueprint, request, jsonify, make_response
from auth.jwt_utils import require_teacher
from extensions import supabase_client
from content.transform import pick_branch, public_url
import time
import re
import secrets
from datetime import datetime, timezone

manage_lessons_bp = Blueprint("manage_lessons", __name__)

ALLOWED_TYPES = {"mcq", "asr", "emotion", "recognition", "listening", "tts"}
ALLOWED_LAYOUTS = {"sound", "image", "sequence", "choose", "asr", "emotion"}
ALLOWED_BUCKETS = {"hmh-images", "hmh-audio"}

# -------------------------
# "No-API" Translation (EN -> TL)
# -------------------------

EMOTION_MAP = {
    "happy": "masaya",
    "sad": "malungkot",
    "angry": "galit",
    "surprised": "gulat",
}

PHRASE_MAP = {
    "which sound do you hear?": "Anong tunog ang naririnig mo?",
    "which one is correct?": "Alin ang tama?",
    "what emotion do you see?": "Anong emosyon ang nakikita mo?",
    "look! which one comes first?": "Tingnan! Alin ang nauna?",
    "new question": "Bagong tanong",
    "say “i am happy.”": "Sabihin: “Masaya ako.”",
    "show your face for this emotion!": "Ipakita ang mukha para sa emosyon na ito!",
    "say this": "Sabihin ito",
    "show your ": "Ipakita ang iyong "
}

def translate_en_to_tl(text: str) -> str:
    if not text:
        return ""
    s = str(text).strip()
    if not s:
        return ""
    key = s.lower().strip()

    if key in PHRASE_MAP:
        return PHRASE_MAP[key]

    if key in EMOTION_MAP:
        return EMOTION_MAP[key]

    m = re.match(r"^(choice|sound|step)\s*(\d+)$", key)
    if m:
        w, n = m.group(1), m.group(2)
        base = {"choice": "Pagpipilian", "sound": "Tunog", "step": "Hakbang"}[w]
        return f"{base} {n}"

    return s

def translate_emotion_en_to_tl(text: str) -> str:
    if not text:
        return ""
    k = str(text).lower().strip()
    return EMOTION_MAP.get(k, translate_en_to_tl(text))


@manage_lessons_bp.route("/chapters/<int:chapter_id>", methods=["OPTIONS"])
def options_chapter(chapter_id):
    return make_response("", 204)

@manage_lessons_bp.route("/lessons/<int:lesson_id>", methods=["OPTIONS"])
def options_lesson(lesson_id):
    return make_response("", 204)


def _sb():
    return supabase_client.client


def _safe_filename(name: str) -> str:
    name = (name or "file").strip()
    name = re.sub(r"[^a-zA-Z0-9._-]+", "_", name)
    return name[:120] if name else "file"


def _upload_storage(bucket: str, file, object_path: str) -> str:
    storage = _sb().storage.from_(bucket)
    content = file.read()
    storage.upload(object_path, content, {"content-type": file.mimetype})
    return f"{bucket}/{object_path}"


def _delete_storage_path(storage_path: str) -> bool:
    if not storage_path or not isinstance(storage_path, str):
        return False
    if "/" not in storage_path:
        return False

    bucket, obj = storage_path.split("/", 1)
    bucket = (bucket or "").strip()
    obj = (obj or "").strip()

    if bucket not in ALLOWED_BUCKETS or not obj:
        return False

    try:
        _sb().storage.from_(bucket).remove([obj])
        return True
    except Exception:
        return False


def _get_next_sort_order(table: str, where: dict | None = None) -> int:
    q = _sb().table(table).select("sort_order").order("sort_order", desc=True).limit(1)
    if where:
        for k, v in where.items():
            q = q.eq(k, v)
    res = q.execute()
    rows = res.data or []
    return int(rows[0]["sort_order"]) + 1 if rows else 1


def _resolve_chapter(ch):
    ch = dict(ch)
    ch["bg_path_resolved"] = public_url(ch.get("bg_path"))
    return ch


def _resolve_lesson(l):
    l = dict(l)
    l["cover_path_resolved"] = public_url(l.get("cover_path"))
    return l


def _ensure_dict(x):
    return x if isinstance(x, dict) else {}


def _ensure_list(x):
    return x if isinstance(x, list) else []


def _normalize_lang(lang: str) -> str:
    lang = (lang or "en").lower().strip()
    return lang if lang in ("en", "tl") else "en"


def _normalize_choices(choices):
    out = []
    for c in _ensure_list(choices):
        if not isinstance(c, dict):
            continue
        key = (c.get("key") or "").strip()
        if not key:
            continue

        label = c.get("label")
        if isinstance(label, str):
            label = label.strip() or key
        else:
            label = key

        out.append(
            {
                "key": key,
                "label": label,
                "image": c.get("image"),
                "audio": c.get("audio"),
            }
        )
    return out


def _validate_type_and_layout(a_type: str, layout: str):
    a_type = (a_type or "").strip().lower()
    layout = (layout or "").strip().lower()
    if a_type and a_type not in ALLOWED_TYPES:
        return False, f"Invalid type: {a_type}"
    if layout and layout not in ALLOWED_LAYOUTS:
        return False, f"Invalid layout: {layout}"
    return True, ""


# -------------------------
# Helpers for consistent DB format
# -------------------------
def _make_i18n_branch_from_body(i: dict, layout: str):
    i = _ensure_dict(i)
    layout = (layout or "").lower().strip()

    branch = {}

    if "prompt_image" in i:
        branch["prompt_image"] = i.get("prompt_image")
    if "prompt_audio" in i:
        branch["prompt_audio"] = i.get("prompt_audio")

    if layout in ("sound", "image", "sequence", "choose"):
        branch["choices"] = _normalize_choices(i.get("choices") or [])
        branch["correct"] = i.get("correct")

    if layout == "asr":
        if "expected_speech" in i:
            branch["expected_speech"] = i.get("expected_speech")

    if layout == "emotion":
        if "expected_emotion" in i:
            branch["expected_emotion"] = i.get("expected_emotion")

    return branch


def _auto_translate_en_branch_to_tl(en_branch: dict, layout: str) -> dict:
    layout = (layout or "").lower().strip()
    en_branch = _ensure_dict(en_branch)

    tl = {}

    if layout in ("sound", "image", "sequence", "choose"):
        choices = _ensure_list(en_branch.get("choices"))
        tl_choices = []
        for c in choices:
            c = _ensure_dict(c)
            key_en = (c.get("key") or "").strip()
            if not key_en:
                continue
            key_tl = translate_en_to_tl(key_en)
            tl_choices.append(
                {
                    "key": key_tl,
                    "label": key_tl,
                    "image": c.get("image"),
                    "audio": c.get("audio"),
                }
            )
        tl["choices"] = tl_choices

        correct_en = (en_branch.get("correct") or "").strip()
        if correct_en:
            en_keys = [(_ensure_dict(x).get("key") or "").strip() for x in choices]
            mapped = None
            try:
                idx = en_keys.index(correct_en)
                if 0 <= idx < len(tl_choices):
                    mapped = tl_choices[idx]["key"]
            except Exception:
                mapped = None
            tl["correct"] = mapped or translate_en_to_tl(correct_en)

    if layout == "asr":
        if en_branch.get("expected_speech"):
            tl["expected_speech"] = translate_en_to_tl(str(en_branch.get("expected_speech")))
        if en_branch.get("prompt_audio"):
            tl["prompt_audio"] = en_branch.get("prompt_audio")
        if en_branch.get("prompt_image"):
            tl["prompt_image"] = en_branch.get("prompt_image")

    if layout == "emotion":
        if en_branch.get("expected_emotion"):
            tl["expected_emotion"] = translate_emotion_en_to_tl(str(en_branch.get("expected_emotion")))

    for k in ("prompt_image", "prompt_audio"):
        if en_branch.get(k):
            tl[k] = en_branch.get(k)

    return tl


def _make_data_for_activity(layout: str, i18n_in: dict) -> dict:
    layout = (layout or "").lower().strip()
    i18n_in = _ensure_dict(i18n_in)

    if layout == "emotion":
        en = _ensure_dict(i18n_in.get("en"))
        tl = _ensure_dict(i18n_in.get("tl"))
        expected_en = (en.get("expected_emotion") or "").strip() or None
        expected_tl = (tl.get("expected_emotion") or "").strip() or None
        return {
            "layout": "emotion",
            "expected_emotion_en": expected_en,
            "expected_emotion_tl": expected_tl,
        }

    return {"layout": layout, "i18n": i18n_in}


# -------------------------
# Soft-delete helpers (Activities)
# -------------------------
def _resequence_activities(lesson_id: int):
    """
    Ensures active activities are 1..N (no gaps).
    """
    sb = _sb()
    rows = (
        sb.table("activities")
        .select("id")
        .eq("lesson_id", lesson_id)
        .eq("is_active", True)
        .order("sort_order")
        .execute()
        .data
        or []
    )

    for idx, r in enumerate(rows, start=1):
        sb.table("activities").update({"sort_order": idx}).eq("id", r["id"]).execute()

    return rows


# -------------------------
# Media URL helpers
# -------------------------
def _resolve_media_branch_for_frontend(activity: dict, lang: str) -> dict:
    a = dict(activity or {})
    payload = _ensure_dict(a.get("payload") or {})

    p_img_path = payload.get("prompt_image")
    p_aud_path = payload.get("prompt_audio")

    payload["prompt_image_path"] = p_img_path or None
    payload["prompt_audio_path"] = p_aud_path or None
    payload["prompt_image_url"] = public_url(p_img_path) if p_img_path else ""
    payload["prompt_audio_url"] = public_url(p_aud_path) if p_aud_path else ""

    choices = _ensure_list(payload.get("choices"))
    out_choices = []
    for c in choices:
        c = _ensure_dict(c)
        img_path = c.get("image")
        aud_path = c.get("audio")

        out_choices.append(
            {
                **c,
                "image_path": img_path or None,
                "audio_path": aud_path or None,
                "image_url": public_url(img_path) if img_path else "",
                "audio_url": public_url(aud_path) if aud_path else "",
            }
        )
    payload["choices"] = out_choices

    data = _ensure_dict(a.get("data"))
    if (data.get("layout") or "").lower().strip() == "emotion":
        exp = data.get("expected_emotion_tl") if lang == "tl" else data.get("expected_emotion_en")
        if exp is not None:
            payload["expected_emotion"] = exp

    a["payload"] = payload
    return a


# -------------------------
# Chapters / Lessons
# -------------------------
@manage_lessons_bp.get("/chapters")
@require_teacher
def get_chapters():
    res = _sb().table("chapters").select("*").order("sort_order").execute()
    chapters = res.data or []
    chapters = [_resolve_chapter(c) for c in chapters]
    return jsonify({"chapters": chapters})


@manage_lessons_bp.get("/chapters/<int:chapter_id>/lessons")
@require_teacher
def get_lessons(chapter_id: int):
    res = (
        _sb()
        .table("lessons")
        .select("*")
        .eq("chapter_id", chapter_id)
        .order("sort_order")
        .execute()
    )
    lessons = res.data or []
    lessons = [_resolve_lesson(l) for l in lessons]
    return jsonify({"lessons": lessons})


@manage_lessons_bp.get("/lessons/<int:lesson_id>/activities")
@require_teacher
def get_activities_for_lesson(lesson_id: int):
    """
    ✅ only active activities
    ✅ always ordered
    """
    lang = _normalize_lang(request.args.get("lang") or "en")
    res = (
        _sb()
        .table("activities")
        .select("*")
        .eq("lesson_id", lesson_id)
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    rows = res.data or []
    activities = [pick_branch(r, lang) for r in rows]
    activities = [_resolve_media_branch_for_frontend(a, lang) for a in activities]
    return jsonify({"activities": activities})


# -------------------------
# Translation endpoint
# -------------------------
@manage_lessons_bp.post("/translate")
@require_teacher
def translate_payload():
    body = request.get_json(force=True) or {}
    payload = _ensure_dict(body.get("payload") or {})

    out = {}

    if payload.get("prompt"):
        out["prompt"] = translate_en_to_tl(payload.get("prompt"))

    if payload.get("choices"):
        out["choices"] = []
        for c in _ensure_list(payload.get("choices")):
            c = _ensure_dict(c)
            key_en = (c.get("key") or "").strip()
            if not key_en:
                continue
            key_tl = translate_en_to_tl(key_en)
            out["choices"].append(
                {
                    "key": key_tl,
                    "label": key_tl,
                    "image": c.get("image"),
                    "audio": c.get("audio"),
                }
            )

    if payload.get("expected_emotion"):
        out["expected_emotion"] = translate_emotion_en_to_tl(payload.get("expected_emotion"))

    if payload.get("expected_speech"):
        out["expected_speech"] = translate_en_to_tl(payload.get("expected_speech"))

    for k in ("prompt_image", "prompt_audio"):
        if payload.get(k):
            out[k] = payload.get(k)

    if payload.get("correct") and out.get("choices"):
        correct_en = (payload.get("correct") or "").strip()
        en_keys = [
            (_ensure_dict(x).get("key") or "").strip()
            for x in _ensure_list(payload.get("choices"))
        ]
        try:
            idx = en_keys.index(correct_en)
            if 0 <= idx < len(out["choices"]):
                out["correct"] = out["choices"][idx]["key"]
            else:
                out["correct"] = translate_en_to_tl(correct_en)
        except Exception:
            out["correct"] = translate_en_to_tl(correct_en)

    return jsonify({"translated": out})


# -------------------------
# Create Activity
# -------------------------
@manage_lessons_bp.post("/lessons/<int:lesson_id>/activities")
@require_teacher
def create_activity_for_lesson(lesson_id: int):
    body = request.get_json(force=True) or {}
    lang = _normalize_lang(body.get("lang") or "en")

    lchk = _sb().table("lessons").select("id").eq("id", lesson_id).limit(1).execute()
    if not lchk.data:
        return jsonify({"error": "Lesson not found"}), 404

    a_type = (body.get("type") or "mcq").strip().lower()
    layout = (body.get("layout") or "").strip().lower()
    ok, msg = _validate_type_and_layout(a_type, layout)
    if not ok:
        return jsonify({"error": msg}), 400

    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    i = _ensure_dict(body.get("i18n") or {})

    # ✅ next sort order only among active
    q = (
        _sb()
        .table("activities")
        .select("sort_order")
        .eq("lesson_id", lesson_id)
        .eq("is_active", True)
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    )
    rows = q.data or []
    next_sort = int(rows[0]["sort_order"]) + 1 if rows else 1

    en_branch = _make_i18n_branch_from_body(i, layout)
    tl_branch = _auto_translate_en_branch_to_tl(en_branch, layout)

    if layout == "emotion":
        data = _make_data_for_activity(
            layout,
            {
                "en": {"expected_emotion": en_branch.get("expected_emotion")},
                "tl": {"expected_emotion": tl_branch.get("expected_emotion")},
            },
        )
    else:
        data = _make_data_for_activity(layout, {"en": en_branch, "tl": tl_branch})

    prompt_en = prompt if lang == "en" else None
    prompt_tl = prompt if lang == "tl" else None
    if lang == "en":
        prompt_tl = translate_en_to_tl(prompt)

    insert_row = {
        "lesson_id": lesson_id,
        "type": a_type,
        "sort_order": next_sort,
        "data": data,
        "prompt_en": prompt_en,
        "prompt_tl": prompt_tl,
        "is_active": True,      # ✅ important
        "deleted_at": None,     # ✅ important
    }

    ins = _sb().table("activities").insert(insert_row).execute()
    if not ins.data:
        return jsonify({"error": "Failed to create activity"}), 500

    created = ins.data[0]
    out = pick_branch(created, lang)
    out = _resolve_media_branch_for_frontend(out, lang)
    return jsonify({"activity": out}), 201


# -------------------------
# Update Activity
# -------------------------
@manage_lessons_bp.patch("/activities/<int:activity_id>")
@require_teacher
def patch_activity(activity_id: int):
    body = request.get_json(force=True) or {}
    lang = _normalize_lang(body.get("lang") or "en")

    existing = (
        _sb()
        .table("activities")
        .select("*")
        .eq("id", activity_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        return jsonify({"error": "Activity not found"}), 404

    row = existing.data[0]
    data = _ensure_dict(row.get("data"))
    current_layout = (data.get("layout") or "").strip().lower()

    new_type = body.get("type")
    new_layout = body.get("layout")
    effective_layout = (new_layout or current_layout or "").strip().lower()

    ok, msg = _validate_type_and_layout(
        (new_type or row.get("type") or "").strip().lower(),
        effective_layout,
    )
    if not ok:
        return jsonify({"error": msg}), 400

    update_row = {}

    if new_type is not None:
        update_row["type"] = (new_type or "").strip().lower()

    new_prompt = body.get("prompt")
    if new_prompt is not None:
        if lang == "en":
            update_row["prompt_en"] = new_prompt
            if not row.get("prompt_tl") or body.get("force_translate_tl") is True:
                update_row["prompt_tl"] = translate_en_to_tl(new_prompt)
        else:
            update_row["prompt_tl"] = new_prompt

    i_in = _ensure_dict(body.get("i18n") or {})
    branch_in = _make_i18n_branch_from_body(i_in, effective_layout)

    if effective_layout == "emotion":
        expected_en = data.get("expected_emotion_en")
        expected_tl = data.get("expected_emotion_tl")

        if lang == "en":
            expected_en = (branch_in.get("expected_emotion") or "").strip() or None
            if (not expected_tl) or body.get("force_translate_tl") is True:
                expected_tl = translate_emotion_en_to_tl(expected_en or "")
        else:
            expected_tl = (branch_in.get("expected_emotion") or "").strip() or None

        data = {
            "layout": "emotion",
            "expected_emotion_en": expected_en,
            "expected_emotion_tl": expected_tl,
        }
        update_row["data"] = data

    else:
        i18n = _ensure_dict(data.get("i18n"))
        en_branch = _ensure_dict(i18n.get("en"))
        tl_branch = _ensure_dict(i18n.get("tl"))

        if lang == "en":
            en_branch = branch_in
            if (not tl_branch) or body.get("force_translate_tl") is True:
                tl_branch = _auto_translate_en_branch_to_tl(en_branch, effective_layout)
        else:
            tl_branch = branch_in

        i18n["en"] = en_branch
        i18n["tl"] = tl_branch
        data = {"layout": effective_layout, "i18n": i18n}
        update_row["data"] = data

    upd = _sb().table("activities").update(update_row).eq("id", activity_id).execute()
    if not upd.data:
        return jsonify({"error": "Failed to update activity"}), 500

    updated = upd.data[0]
    out = pick_branch(updated, lang)
    out = _resolve_media_branch_for_frontend(out, lang)
    return jsonify({"activity": out})


# -------------------------
# Soft Delete Activity (INACTIVE)
# -------------------------
@manage_lessons_bp.delete("/activities/<int:activity_id>")
@require_teacher
def delete_activity(activity_id: int):
    sb = _sb()

    # find activity + lesson
    res = sb.table("activities").select("id, lesson_id").eq("id", activity_id).limit(1).execute()
    if not res.data:
        return jsonify({"error": "Activity not found"}), 404

    lesson_id = int(res.data[0]["lesson_id"])

    # ✅ soft delete
    sb.table("activities").update(
        {
            "is_active": False,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", activity_id).execute()

    # ✅ resequence remaining actives to 1..N
    _resequence_activities(lesson_id)

    return jsonify({"ok": True})


# -------------------------
# Upload endpoints (existing activity)
# -------------------------
@manage_lessons_bp.post("/activities/<int:activity_id>/upload")
@require_teacher
def upload_activity_media(activity_id: int):
    kind = (request.args.get("kind") or "").lower().strip()
    lang = _normalize_lang(request.args.get("lang") or "en")

    if kind not in ("image", "audio"):
        return jsonify({"error": "kind must be image or audio"}), 400

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Missing file"}), 400

    existing = _sb().table("activities").select("id").eq("id", activity_id).limit(1).execute()
    if not existing.data:
        return jsonify({"error": "Activity not found"}), 404

    bucket = "hmh-images" if kind == "image" else "hmh-audio"
    ts = int(time.time())
    fname = _safe_filename(file.filename)
    object_path = f"teacher-uploads/{kind}/{activity_id}/{lang}/{ts}_{fname}"

    storage_path = _upload_storage(bucket, file, object_path)
    resolved = public_url(storage_path)

    return jsonify({"path": storage_path, "url": resolved})


# -------------------------
# TEMP upload (no activity id needed)
# -------------------------
@manage_lessons_bp.post("/uploads/temp")
@require_teacher
def upload_temp_media():
    kind = (request.args.get("kind") or "").lower().strip()
    lang = _normalize_lang(request.args.get("lang") or "en")

    if kind not in ("image", "audio"):
        return jsonify({"error": "kind must be image or audio"}), 400

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Missing file"}), 400

    bucket = "hmh-images" if kind == "image" else "hmh-audio"
    ts = int(time.time())
    fname = _safe_filename(file.filename)

    temp_key = secrets.token_hex(8)
    object_path = f"teacher-uploads/temp/{temp_key}/{kind}/{lang}/{ts}_{fname}"

    storage_path = _upload_storage(bucket, file, object_path)
    resolved = public_url(storage_path)

    return jsonify({"path": storage_path, "url": resolved, "temp_key": temp_key})


@manage_lessons_bp.post("/uploads/temp/cleanup")
@require_teacher
def cleanup_temp_uploads():
    body = request.get_json(force=True) or {}
    paths = body.get("paths") or []
    if not isinstance(paths, list):
        return jsonify({"error": "paths must be a list"}), 400

    deleted = 0
    for p in paths:
        if isinstance(p, str) and _delete_storage_path(p):
            deleted += 1

    return jsonify({"ok": True, "deleted": deleted})


# -------------------------
# Create Chapter
# -------------------------
@manage_lessons_bp.post("/chapters")
@require_teacher
def create_chapter():
    title_en = (request.form.get("title_en") or "").strip()
    title_tl = (request.form.get("title_tl") or "").strip()
    bg = request.files.get("chapter_bg")

    if not title_en or not title_tl:
        return jsonify({"error": "Title EN/TL required"}), 400
    if not bg:
        return jsonify({"error": "Chapter image required"}), 400

    sort_order = _get_next_sort_order("chapters")
    ts = int(time.time())
    fname = _safe_filename(bg.filename)

    path = _upload_storage("hmh-images", bg, f"teacher-uploads/chapters/{sort_order}/{ts}_{fname}")

    ins = _sb().table("chapters").insert(
        {
            "code": f"CH{sort_order}",
            "sort_order": sort_order,
            "title_en": title_en,
            "title_tl": title_tl,
            "bg_path": path,
        }
    ).execute()

    ch = ins.data[0]
    return jsonify({"chapter": _resolve_chapter(ch)}), 201


# -------------------------
# Create Lesson
# -------------------------
@manage_lessons_bp.post("/chapters/<int:chapter_id>/lessons")
@require_teacher
def create_lesson(chapter_id):
    title_en = (request.form.get("lesson_title_en") or "").strip()
    title_tl = (request.form.get("lesson_title_tl") or "").strip()
    desc_en = request.form.get("lesson_description_en")
    desc_tl = request.form.get("lesson_description_tl")
    cover = request.files.get("lesson_cover")

    if not title_en or not title_tl:
        return jsonify({"error": "Lesson title EN/TL required"}), 400
    if not cover:
        return jsonify({"error": "Lesson cover required"}), 400

    ch = _sb().table("chapters").select("sort_order").eq("id", chapter_id).limit(1).execute()
    if not ch.data:
        return jsonify({"error": "Chapter not found"}), 404

    sort_order = _get_next_sort_order("lessons", {"chapter_id": chapter_id})
    ts = int(time.time())
    fname = _safe_filename(cover.filename)

    path = _upload_storage("hmh-images", cover, f"teacher-uploads/lessons/{chapter_id}/{sort_order}/{ts}_{fname}")

    ins = _sb().table("lessons").insert(
        {
            "chapter_id": chapter_id,
            "sort_order": sort_order,
            "code": f"CH{ch.data[0]['sort_order']}-L{sort_order}",
            "title_en": title_en,
            "title_tl": title_tl,
            "description_en": desc_en or None,
            "description_tl": desc_tl or None,
            "cover_path": path,
        }
    ).execute()

    lesson = ins.data[0]
    return jsonify({"lesson": _resolve_lesson(lesson)}), 201


# -------------------------
# Patch Chapter (auto-fill TL if missing)
# -------------------------
@manage_lessons_bp.patch("/chapters/<int:chapter_id>")
@require_teacher
def patch_chapter(chapter_id):
    title_en = (request.form.get("title_en") or "").strip()
    title_tl = (request.form.get("title_tl") or "").strip()
    bg = request.files.get("chapter_bg")

    upd = {}
    if title_en:
        upd["title_en"] = title_en
        if not title_tl:
            upd["title_tl"] = translate_en_to_tl(title_en)

    if title_tl:
        upd["title_tl"] = title_tl

    if bg:
        ts = int(time.time())
        fname = _safe_filename(bg.filename)
        path = _upload_storage(
            "hmh-images",
            bg,
            f"teacher-uploads/chapters/{chapter_id}/{ts}_{fname}",
        )
        upd["bg_path"] = path

    if not upd:
        return jsonify({"error": "Nothing to update"}), 400

    res = (
        _sb()
        .table("chapters")
        .update(upd)
        .eq("id", chapter_id)
        .execute()
    )

    if not res.data:
        return jsonify({"error": "Chapter not found"}), 404

    return jsonify({"chapter": _resolve_chapter(res.data[0])})


# -------------------------
# Patch Lesson (auto-fill TL if missing)
# -------------------------
@manage_lessons_bp.patch("/lessons/<int:lesson_id>")
@require_teacher
def patch_lesson(lesson_id):
    title_en = (request.form.get("lesson_title_en") or "").strip()
    title_tl = (request.form.get("lesson_title_tl") or "").strip()
    desc_en = request.form.get("lesson_description_en")
    desc_tl = request.form.get("lesson_description_tl")
    cover = request.files.get("lesson_cover")

    upd = {}

    if title_en:
        upd["title_en"] = title_en
        if not title_tl:
            upd["title_tl"] = translate_en_to_tl(title_en)

    if title_tl:
        upd["title_tl"] = title_tl

    upd["description_en"] = desc_en if desc_en != "" else None
    upd["description_tl"] = desc_tl if desc_tl != "" else None

    if desc_en is not None and (desc_tl is None or desc_tl == ""):
        upd["description_tl"] = translate_en_to_tl(desc_en) if (desc_en or "").strip() else None

    if cover:
        ts = int(time.time())
        fname = _safe_filename(cover.filename)
        path = _upload_storage(
            "hmh-images",
            cover,
            f"teacher-uploads/lessons/{lesson_id}/{ts}_{fname}",
        )
        upd["cover_path"] = path

    res = (
        _sb()
        .table("lessons")
        .update(upd)
        .eq("id", lesson_id)
        .execute()
    )

    if not res.data:
        return jsonify({"error": "Lesson not found"}), 404

    return jsonify({"lesson": _resolve_lesson(res.data[0])})


# -------------------------
# Reorder endpoints
# -------------------------
def _ensure_int_ids(ids):
    out = []
    for x in (ids or []):
        try:
            out.append(int(x))
        except Exception:
            pass
    return out


@manage_lessons_bp.patch("/chapters/reorder")
@require_teacher
def reorder_chapters():
    body = request.get_json(silent=True) or {}
    ids = _ensure_int_ids(body.get("ids"))
    if not ids:
        return jsonify({"error": "ids is required"}), 400

    sb = _sb()

    # validate all exist
    res = sb.table("chapters").select("id").in_("id", ids).execute()
    rows = res.data or []
    existing = {int(r["id"]) for r in rows if r.get("id") is not None}
    if len(existing) != len(set(ids)):
        return jsonify({"error": "One or more chapter ids not found"}), 400

    # ✅ update only (no insert needed)
    for i, cid in enumerate(ids, start=1):
        r = sb.table("chapters").update({"sort_order": i}).eq("id", cid).execute()
        # optional: if you want to see exact supabase error
        if getattr(r, "error", None):
            return jsonify({"error": f"Reorder failed: {r.error}"}), 500

    return jsonify({"ok": True})

@manage_lessons_bp.patch("/chapters/<int:chapter_id>/lessons/reorder")
@require_teacher
def reorder_lessons(chapter_id: int):
    body = request.get_json(silent=True) or {}
    ids = _ensure_int_ids(body.get("ids"))
    if not ids:
        return jsonify({"error": "ids is required"}), 400

    sb = _sb()

    try:
        # Validate: lessons exist + belong to this chapter
        res = (
            sb.table("lessons")
            .select("id, chapter_id")
            .in_("id", ids)
            .execute()
        )
        rows = res.data or []
        if len(rows) != len(set(ids)):
            return jsonify({"error": "One or more lesson ids not found"}), 400

        for r in rows:
            if int(r.get("chapter_id") or -1) != int(chapter_id):
                return jsonify({"error": "All lesson ids must belong to this chapter"}), 400

        # Pick a TEMP base that cannot collide
        mx = (
            sb.table("lessons")
            .select("sort_order")
            .eq("chapter_id", chapter_id)
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        max_sort = int(mx.data[0]["sort_order"]) if (mx.data and mx.data[0].get("sort_order") is not None) else 0
        temp_base = max_sort + 1000  # big enough to avoid conflicts

        # Phase 1: set TEMP sort_order (unique)
        for i, lid in enumerate(ids, start=1):
            upd = sb.table("lessons").update({"sort_order": temp_base + i}).eq("id", lid).execute()
            if getattr(upd, "error", None):
                return jsonify({"error": str(upd.error)}), 400
            if upd.data == []:
                return jsonify({"error": "Update blocked (RLS/policy)"}), 403

        # Phase 2: set FINAL sort_order (1..N)
        for i, lid in enumerate(ids, start=1):
            upd = sb.table("lessons").update({"sort_order": i}).eq("id", lid).execute()
            if getattr(upd, "error", None):
                return jsonify({"error": str(upd.error)}), 400
            if upd.data == []:
                return jsonify({"error": "Update blocked (RLS/policy)"}), 403

        return jsonify({"ok": True})

    except Exception as e:
        return jsonify({"error": f"Reorder crashed: {type(e).__name__}: {e}"}), 500




@manage_lessons_bp.patch("/lessons/<int:lesson_id>/activities/reorder")
@require_teacher
def reorder_activities(lesson_id: int):
    body = request.get_json(silent=True) or {}
    ids = _ensure_int_ids(body.get("ids"))
    if not ids:
        return jsonify({"error": "ids is required"}), 400

    sb = _sb()

    # only allow reordering active activities in this lesson
    res = (
        sb.table("activities")
        .select("id, lesson_id, is_active")
        .in_("id", ids)
        .execute()
    )
    rows = res.data or []
    if len(rows) != len(set(ids)):
        return jsonify({"error": "One or more activity ids not found"}), 400

    for r in rows:
        if int(r.get("lesson_id") or -1) != int(lesson_id):
            return jsonify({"error": "All activity ids must belong to this lesson"}), 400
        if r.get("is_active") is False:
            return jsonify({"error": "Cannot reorder inactive activities"}), 400

    #  update only
    for i, aid in enumerate(ids, start=1):
        r = sb.table("activities").update({"sort_order": i}).eq("id", aid).execute()
        if getattr(r, "error", None):
            return jsonify({"error": f"Reorder failed: {r.error}"}), 500

    #  ensure actives are resequenced (no gaps)
    _resequence_activities(lesson_id)

    return jsonify({"ok": True})
