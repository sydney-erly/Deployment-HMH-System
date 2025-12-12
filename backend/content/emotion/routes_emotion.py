#backend/content/emotion/routes_emotion.py
import base64
import cv2
import numpy as np
import time
import traceback
import json
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone

from extensions import supabase_client
from utils.sb import sb_exec
from auth.jwt_utils import require_student
from student.achievements import check_and_award_achievements

emotion_bp = Blueprint("emotion", __name__, url_prefix="/api/emotion")

# -----------------------------------------------------------
# Alias Normalizer
# -----------------------------------------------------------
_ALIAS = {
    "joy": "happy", "happiness": "happy", "masaya": "happy",
    "angry": "angry", "anger": "angry", "mad": "angry", "galit": "angry", "disgust": "angry",
    "sad": "sad", "sadness": "sad", "malungkot": "sad", "fear": "sad",
    "surprised": "surprised", "surprise": "surprised", "gulat": "surprised",
    "neutral": "neutral", "calm": "neutral", "kalma": "neutral",
}

def _norm(s: str) -> str:
    return _ALIAS.get((s or "").lower().strip(), (s or "").lower().strip())


# -----------------------------------------------------------
# Preloaded OpenCV Face Detector
# -----------------------------------------------------------
_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


# -----------------------------------------------------------
# PURE REAL EMOTION DETECTOR (NO BOOSTING)
# -----------------------------------------------------------
def _analyze_image(image_bytes: bytes, expected_norm: str):
    """
    Pure heuristic FER engine: NO expected-emotion boosting.
    Expected emotion is used ONLY for pass/fail.
    Detected label = real emotion from face.
    """

    start = time.time()

    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Invalid image data")

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Face detect
    faces = _FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.18, minNeighbors=5)
    if len(faces) == 0:
        latency_ms = int((time.time() - start) * 1000)
        return "neutral", 0.3, {"neutral": 0.3}, latency_ms

    # Pick largest face
    (x, y, w, h) = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[0]
    face = gray[y:y+h, x:x+w].astype("float32")
    face_mean = float(np.mean(face))

    # Regions
    mouth = face[int(h * 0.60):int(h * 0.92), int(w * 0.15):int(w * 0.85)]
    eyes  = face[int(h * 0.18):int(h * 0.42), int(w * 0.20):int(w * 0.80)]

    mouth_mean = float(np.mean(mouth)) if mouth.size else face_mean
    mouth_std  = float(np.std(mouth)) if mouth.size else 0
    eyes_mean  = float(np.mean(eyes)) if eyes.size else face_mean
    eyes_std   = float(np.std(eyes)) if eyes.size else 0

    adaptive = max(1.0, (w * h) / 25000)

    scores = {}

    # -----------------------------------------------------------
    # HAPPY
    # -----------------------------------------------------------
    if mouth_mean > face_mean + (4 * adaptive) or mouth_std > (12 * adaptive):
        scores["happy"] = 0.55
    if mouth_std > (18 * adaptive):
        scores["happy"] = max(scores.get("happy", 0), 0.75)

    # -----------------------------------------------------------
    # ANGRY
    # -----------------------------------------------------------
    mouth_open = (mouth_std > (14 * adaptive)) or (mouth_mean < face_mean - (6 * adaptive))
    if not mouth_open:
        if (face_mean - eyes_mean) > (6 * adaptive) and eyes_std > (10 * adaptive):
            scores["angry"] = 0.55
        if (face_mean - eyes_mean) > (10 * adaptive):
            scores["angry"] = max(scores.get("angry", 0), 0.75)

    # -----------------------------------------------------------
    # SAD
    # -----------------------------------------------------------
    if not mouth_open:
        if (face_mean - mouth_mean) > (5 * adaptive):
            scores["sad"] = 0.55
        if (face_mean - eyes_mean) > (5 * adaptive):
            scores["sad"] = max(scores.get("sad", 0), 0.60)

    # -----------------------------------------------------------
    # SURPRISED
    # -----------------------------------------------------------
    strong_mouth_open = (mouth_std > (20 * adaptive)) or (mouth_mean < face_mean - (10 * adaptive))
    if strong_mouth_open:
        scores["surprised"] = 0.65
        if mouth_std > (22 * adaptive):
            scores["surprised"] = max(scores.get("surprised", 0), 0.80)
        if (eyes_mean - face_mean) > (6 * adaptive):
            scores["surprised"] = max(scores.get("surprised", 0), 0.75)

    # -----------------------------------------------------------
    # NEUTRAL fallback
    # -----------------------------------------------------------
    if not scores:
        scores["neutral"] = 0.40
    elif all(v < 0.50 for v in scores.values()):
        scores["neutral"] = max(scores.get("neutral", 0), 0.50)

    # -----------------------------------------------------------
    # NO BOOSTING (critical change)
    # -----------------------------------------------------------

    # Final output: REAL detected emotion
    label = max(scores, key=scores.get)
    confidence = float(min(scores[label], 1.0))
    latency_ms = int((time.time() - start) * 1000)

    return label, confidence, scores, latency_ms


# -----------------------------------------------------------
# NEXT ACTIVITY HELPER
# -----------------------------------------------------------
def _next_activity_for(sb, lesson_id: int, sort_order: int):
    try:
        rows, _ = sb_exec(
            sb.table("activities")
              .select("id, sort_order")
              .eq("lesson_id", lesson_id)
              .gt("sort_order", sort_order)
              .order("sort_order")
              .limit(1)
        )
        return rows[0] if rows else None
    except:
        return None


# -----------------------------------------------------------
# MAIN EMOTION ANALYSIS ROUTE
# -----------------------------------------------------------
@emotion_bp.post("/analyze")
@require_student
def analyze_emotion():
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

    # Decode image
    try:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64, validate=True)
    except:
        return jsonify({"error": "Invalid base64 image"}), 400

    # Load activity
    act_rows, err = sb_exec(
        sb.table("activities")
          .select("id,data,sort_order,lesson_id")
          .eq("id", activities_id)
          .limit(1)
    )
    if err or not act_rows:
        return jsonify({"error": "Activity not found"}), 404

    act = act_rows[0]
    act_data = act.get("data") or {}
    if isinstance(act_data, str):
        try:
            act_data = json.loads(act_data)
        except:
            act_data = {}

    i18n = act_data.get("i18n") or {}
    branch = i18n.get(lang) or i18n.get("en") or {}

    exp_raw = (
        branch.get("expected_emotion")
        or act_data.get("expected_emotion_en")
        or act_data.get("expected_emotion_tl")
        or ""
    )
    expected_norm = _norm(exp_raw)

    # Analyze Image (REAL detection)
    try:
        label, confidence, scores, latency_ms = _analyze_image(raw, expected_norm)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Emotion detection failed: {e}"}), 200

    label_norm = _norm(label)

    print(f"[EMOTION] REAL={label_norm} Expected={expected_norm} Conf={confidence}")

    # -----------------------------------------------------------
    # PASS/FAIL: Expected emotion is checked ONLY here
    # -----------------------------------------------------------
    thresholds = {
        "angry": 0.15,
        "sad": 0.20,
        "happy": 0.15,
        "surprised": 0.15,
        "neutral": 0.20,
    }
    threshold = thresholds.get(expected_norm, 0.15)

    passed = (label_norm == expected_norm and confidence >= threshold)

    # Soft pass
    if not passed and label_norm == expected_norm:
        passed = True

    score = 100.0 if passed else 0.0
    attempt_id = None

    # Save Attempt only if passed
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
                "confidence": round(confidence, 3),
                "model_backend": "opencv-heuristic-v4-pure",
                "latency_ms": latency_ms,
            }).execute()

        except Exception as e:
            print("⚠️ DB insert failed:", e)

    # Determine next activity
    next_act = _next_activity_for(sb, int(act["lesson_id"]), int(act["sort_order"]))

    return jsonify({
        "ok": True,
        "label": label_norm,
        "confidence": round(confidence, 3),
        "expected_emotion": expected_norm,
        "passed": passed,
        "score": score,
        "attempt_id": attempt_id,
        "next_activity": next_act,
        "auto": auto_flag,
    })


# -----------------------------------------------------------
# SKIP HANDLER
# -----------------------------------------------------------
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

    next_act = _next_activity_for(
        sb,
        int(act["lesson_id"]),
        int(act["sort_order"])
    )

    return jsonify({"ok": True, "attempt_id": attempt_id, "next_activity": next_act})
