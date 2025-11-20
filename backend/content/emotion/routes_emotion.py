import base64, cv2, numpy as np, time, traceback, json
from flask import Blueprint, request, jsonify
from deepface import DeepFace
from datetime import datetime, timezone

from extensions import supabase_client
from utils.sb import sb_exec
from auth.jwt_utils import require_student
from student.achievements import check_and_award_achievements

emotion_bp = Blueprint("emotion", __name__, url_prefix="/api/emotion")

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
_ALIAS = {
    "joy": "happy", "happiness": "happy", "masaya": "happy",
    "angry": "angry", "anger": "angry", "mad": "angry", "galit": "angry", "disgust": "angry",
    "sad": "sad", "sadness": "sad", "malungkot": "sad", "fear": "sad",
    "surprised": "surprised", "surprise": "surprised", "gulat": "surprised",
    "neutral": "neutral", "calm": "neutral", "kalma": "neutral",
}

def _norm(s: str) -> str:
    """Normalize emotion strings to a canonical label."""
    return _ALIAS.get((s or "").lower().strip(), (s or "").lower().strip())

def _analyze_image(image_bytes: bytes):
    """Decode image bytes and run DeepFace emotion detection. Returns normalized scores 0..1."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image data")

    start = time.time()
    result = DeepFace.analyze(
        img_path=img,
        actions=["emotion"],
        enforce_detection=False,
        detector_backend="opencv",
    )
    latency_ms = int((time.time() - start) * 1000)

    if isinstance(result, list):
        result = result[0]

    raw = (result.get("emotion") or {})  # dict like {"angry": 0.12, "happy": 84.5, ...}
    # normalize to 0..1 safely (DeepFace can yield 0..100 or 0..1 depending on backend)
    scores_tmp = { _norm(k): float(v) for k, v in raw.items() if v is not None }
    max_val = max(scores_tmp.values(), default=1.0)
    # If the largest value is > 1.5 we assume 0..100 scale and divide by 100
    scale = 100.0 if max_val > 1.5 else 1.0
    scores = { k: (v/scale) for k, v in scores_tmp.items() }

    label = _norm(result.get("dominant_emotion"))
    confidence = float(scores.get(label, 0.0))
    return label, confidence, scores, latency_ms



def _next_activity_for(sb, lesson_id: int, sort_order: int):
    """Fetch the next activity (id, sort_order) in a lesson."""
    try:
        rows, _ = sb_exec(
            sb.table("activities")
              .select("id,sort_order")
              .eq("lesson_id", lesson_id)
              .gt("sort_order", sort_order)
              .order("sort_order")
              .limit(1)
        )
        return rows[0] if rows else None
    except Exception:
        return None


# ---------------------------------------------------------------------
# Emotion Detection Route (JWT protected)
# ---------------------------------------------------------------------
@emotion_bp.post("/analyze")
@require_student
def analyze_emotion():
    """Analyze webcam emotion safely (no 500 errors ever)."""
    sb = supabase_client.client
    data = request.get_json(silent=True) or {}

    sid = request.user_id
    activities_id = data.get("activities_id")
    lesson_id = data.get("lesson_id")
    lang = (data.get("lang") or "en").lower()
    b64 = data.get("image_base64")
    auto_flag = bool(data.get("auto"))

    if not (activities_id and b64):
        return jsonify({"error": "Missing required fields"}), 400

    # Decode base64
    try:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64, validate=True)
    except Exception as e:
        print("❌ Base64 decode failed:", e)
        return jsonify({"error": "Invalid base64 image"}), 400

    # Fetch activity
    act_rows, err = sb_exec(
        sb.table("activities")
          .select("id,data,sort_order,lesson_id")
          .eq("id", activities_id)
          .limit(1)
    )
    if err or not act_rows:
        return jsonify({"error": "Activity not found"}), 404
    act = act_rows[0]

    # Parse JSON safely
    act_data = act.get("data")
    if isinstance(act_data, str):
        try:
            act_data = json.loads(act_data)
        except Exception:
            act_data = {}
    elif not isinstance(act_data, dict):
        act_data = {}

    # Extract expected emotion (flat + i18n)
    i18n = act_data.get("i18n") or {}
    branch = i18n.get(lang) or i18n.get("en") or {}
    exp_raw = (
        branch.get("expected_emotion")
        or act_data.get(f"expected_emotion_{lang}")
        or act_data.get("expected_emotion_en")
        or act_data.get("expected_emotion_tl")
        or ""
    )
    expected_norm = _norm(exp_raw)

    # Analyze image
    try:
        label, confidence, scores, latency_ms = _analyze_image(raw)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Emotion detection failed: {e}"}), 200  # no 500

    label_norm = _norm(label)
    print(f"[DEBUG] Detected={label_norm} Expected={expected_norm} Conf={confidence}")

    # Safe scores dict
    if not isinstance(scores, dict):
        scores = {}

    # thresholds
    emotion_thresholds = {
        "angry": 0.25,
        "sad": 0.35,
        "happy": 0.5,
        "surprised": 0.4,
        "neutral": 0.35,
    }
    threshold = emotion_thresholds.get(expected_norm, 0.4)

    passed = (label_norm == expected_norm and confidence >= threshold)

    # soft pass
    if not passed and label_norm == expected_norm:
        print(f"[DEBUG] Soft pass triggered for {label_norm} (conf={confidence:.3f})")
        passed = True

    score = 100.0 if passed else 0.0
    attempt_id = None

    # Insert wrapped in try/except
    if passed:
        try:
            ins = sb.table("activity_attempts").insert({
                "students_id": sid,
                "activities_id": activities_id,
                "score": score,
                "meta": {
                    "layout": "emotion",
                    "detected": {"label": label_norm, "confidence": round(confidence, 3)},
                    "expected": expected_norm,
                    "lang": lang,
                    "auto": auto_flag,
                },
            }).execute()
            attempt_id = (ins.data or [{}])[0].get("id")

            sb.table("emotion_metrics").insert({
                "attempt_id": attempt_id,
                "students_id": sid,
                "activities_id": activities_id,
                "detected_emotion": label_norm,
                "expected_emotion": expected_norm,
                "confidence": round(float(confidence), 3),
                "model_backend": "deepface-opencv",
                "latency_ms": latency_ms,
            }).execute()
        except Exception as e:
            print("⚠️ Supabase insert failed:", e)

    # Compute next activity safely
    try:
        next_act = _next_activity_for(sb, int(act["lesson_id"]), int(act["sort_order"]))
    except Exception as e:
        print("⚠️ next_act lookup failed:", e)
        next_act = None

    return jsonify({
        "ok": True,
        "label": label_norm,
        "confidence": round(float(confidence), 3),
        "expected_emotion": expected_norm,
        "passed": passed,
        "score": score,
        "attempt_id": attempt_id,
        "next_activity": next_act,
        "auto": auto_flag,
    })

# ---------------------------------------------------------------------
# Skip current emotion activity
# ---------------------------------------------------------------------
@emotion_bp.post("/skip")
@require_student
def skip_emotion():
    sb = supabase_client.client
    data = request.get_json(silent=True) or {}
    sid = request.user_id
    activities_id = data.get("activities_id")
    lesson_id = data.get("lesson_id")

    if not activities_id:
        return jsonify({"error": "Missing activities_id"}), 400

    act_rows, err = sb_exec(
        sb.table("activities")
          .select("lesson_id, sort_order")
          .eq("id", activities_id)
          .limit(1)
    )
    if err or not act_rows:
        return jsonify({"error": "Activity not found"}), 404
    act = act_rows[0]

    try:
        insert = sb.table("activity_attempts").insert({
            "students_id": sid,
            "activities_id": activities_id,
            "score": 0.0,
            "meta": {
                "layout": "emotion",
                "skipped": True,
                "reason": "user_pressed_skip",
                "lesson_id": lesson_id,
            },
        }).execute()
        attempt_id = insert.data[0]["id"] if insert.data else None
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"DB insert failed: {e}"}), 500

    next_act = _next_activity_for(sb, int(act["lesson_id"]), int(act["sort_order"]))
    return jsonify({"ok": True, "attempt_id": attempt_id, "next_activity": next_act})
