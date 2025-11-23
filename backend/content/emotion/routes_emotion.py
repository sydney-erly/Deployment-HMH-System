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
    return _ALIAS.get((s or "").lower().strip(), (s or "").lower().strip())

# Preload face detection model
_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def _analyze_image(image_bytes: bytes):
    """
    Lightweight OpenCV heuristic emotion detection.
    - Picks the largest face (closest person)
    - Very lenient smile/surprise rules for ASD kids
    - Returns: label, confidence, scores, latency_ms
    """

    start = time.time()

    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Invalid image data")

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Detect faces
    faces = _FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5)

    if len(faces) == 0:
        latency_ms = int((time.time() - start) * 1000)
        return "neutral", 0.2, {"neutral": 0.2}, latency_ms

    # ----------------------------------------------------------
    # Pick the *largest face* → most likely the child
    # ----------------------------------------------------------
    faces = sorted(faces, key=lambda box: box[2] * box[3], reverse=True)
    (x, y, w, h) = faces[0]

    face = gray[y:y + h, x:x + w]

    # ROI averages
    overall_mean = float(np.mean(face))

    mouth_region = face[int(h * 0.60):int(h * 0.95), int(w * 0.15):int(w * 0.85)]
    eye_region = face[int(h * 0.15):int(h * 0.45), int(w * 0.20):int(w * 0.80)]

    mouth_mean = float(np.mean(mouth_region)) if mouth_region.size else overall_mean
    eye_mean = float(np.mean(eye_region)) if eye_region.size else overall_mean

    scores = {}

    # ------------------------------------------------------------------
    # Heuristic rules – tuned extremely lenient for ASD kids
    # ------------------------------------------------------------------

    # HAPPY: smiling → bright mouth area
    if mouth_mean > overall_mean + 3:
        scores["happy"] = max(scores.get("happy", 0.0), 0.4)
    if mouth_mean > overall_mean + 6:
        scores["happy"] = max(scores.get("happy", 0.0), 0.7)

    # SURPRISED: very bright mouth/lower face
    if mouth_mean > overall_mean + 12:
        scores["surprised"] = max(scores.get("surprised", 0.0), 0.6)
    if mouth_mean > overall_mean + 20:
        scores["surprised"] = max(scores.get("surprised", 0.0), 0.8)

    # ANGRY: darker eyes → eyebrows lowered
    if eye_mean < overall_mean - 12:
        scores["angry"] = max(scores.get("angry", 0.0), 0.6)

    # SAD: darker mouth & lower face
    if mouth_mean < overall_mean - 5:
        scores["sad"] = max(scores.get("sad", 0.0), 0.6)

    # No signal → neutral fallback
    if not scores:
        scores["neutral"] = 0.5

    # Choose dominant emotion
    label = max(scores, key=scores.get)
    confidence = float(scores[label])

    latency_ms = int((time.time() - start) * 1000)
    return label, confidence, scores, latency_ms


def _next_activity_for(sb, lesson_id: int, sort_order: int):
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
    """Analyze webcam emotion safely (no 500 errors)."""
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
    except Exception:
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

    # Parse JSON
    act_data = act.get("data")
    if isinstance(act_data, str):
        try:
            act_data = json.loads(act_data)
        except:
            act_data = {}
    elif not isinstance(act_data, dict):
        act_data = {}

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

    # Analyze
    try:
        label, confidence, scores, latency_ms = _analyze_image(raw)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Emotion detection failed: {e}"}), 200

    label_norm = _norm(label)
    print(f"[EMOTION] Detected={label_norm} Expected={expected_norm} Conf={confidence}")

    # -----------------------------------------------------------------
    # Thresholds (VERY lenient)
    # -----------------------------------------------------------------
    emotion_thresholds = {
        "angry": 0.25,
        "sad": 0.25,
        "happy": 0.15,
        "surprised": 0.15,
        "neutral": 0.20,
    }
    threshold = emotion_thresholds.get(expected_norm, 0.15)

    # Pass/fail
    passed = (label_norm == expected_norm and confidence >= threshold)

    # Soft pass (if correct label at all)
    if not passed and label_norm == expected_norm:
        print(f"[EMOTION] Soft pass triggered for {label_norm}")
        passed = True

    score = 100.0 if passed else 0.0
    attempt_id = None

    if passed:
        try:
            ins = sb.table("activity_attempts").insert({
                "students_id": sid,
                "activities_id": activities_id,
                "score": score,
                "meta": {
                    "layout": "emotion",
                    "detected": {
                        "label": label_norm,
                        "confidence": round(confidence, 3)
                    },
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
                "model_backend": "opencv-heuristic",
                "latency_ms": latency_ms,
            }).execute()
        except Exception as e:
            print("⚠️ DB insert failed:", e)

    # Next activity
    try:
        next_act = _next_activity_for(sb, int(act["lesson_id"]), int(act["sort_order"]))
    except:
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
# Skip
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
