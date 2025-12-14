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
# ACCURATE ADULT EMOTION DETECTOR
# -----------------------------------------------------------
def _analyze_image(image_bytes: bytes, expected_norm: str):
    """
    Accurate emotion detection for adults.
    NO auto-pass, NO expected emotion boost.
    Pure detection based on facial features.
    """

    start = time.time()

    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Invalid image data")

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Face detect
    faces = _FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(100, 100))
    if len(faces) == 0:
        latency_ms = int((time.time() - start) * 1000)
        return "neutral", 0.3, {"neutral": 0.3}, latency_ms

    # Pick largest face
    (x, y, w, h) = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[0]
    face = gray[y:y+h, x:x+w].astype("float32")
    face_mean = float(np.mean(face))

    # Define regions with better precision
    mouth_region = face[int(h*0.65):int(h*0.90), int(w*0.25):int(w*0.75)]
    eyes_region = face[int(h*0.25):int(h*0.45), int(w*0.20):int(w*0.80)]
    eyebrows_region = face[int(h*0.20):int(h*0.35), int(w*0.20):int(w*0.80)]

    # Calculate metrics
    mouth_mean = float(np.mean(mouth_region)) if mouth_region.size else face_mean
    mouth_std = float(np.std(mouth_region)) if mouth_region.size else 0
    eyes_mean = float(np.mean(eyes_region)) if eyes_region.size else face_mean
    eyes_std = float(np.std(eyes_region)) if eyes_region.size else 0
    eyebrows_mean = float(np.mean(eyebrows_region)) if eyebrows_region.size else face_mean

    scores = {}

    # Print debug info
    print(f"[DEBUG] Face: mean={face_mean:.1f}")
    print(f"[DEBUG] Mouth: mean={mouth_mean:.1f}, std={mouth_std:.1f}")
    print(f"[DEBUG] Eyes: mean={eyes_mean:.1f}, std={eyes_std:.1f}")
    print(f"[DEBUG] Eyebrows: mean={eyebrows_mean:.1f}")

    # --------------------------------------
    # HAPPY - bright mouth, high variation (smile)
    # --------------------------------------
    if mouth_std > 18 and mouth_mean > face_mean + 5:
        happy_score = min(0.7 + (mouth_std - 18) * 0.02, 0.95)
        scores["happy"] = happy_score
        print(f"[HAPPY] Detected: {happy_score:.2f}")

    # --------------------------------------
    # SAD - dark eyes, low mouth variation, slightly down
    # --------------------------------------
    if (face_mean - eyes_mean) > 8 and mouth_std < 12 and mouth_mean < face_mean:
        sad_score = min(0.6 + ((face_mean - eyes_mean) - 8) * 0.03, 0.90)
        scores["sad"] = sad_score
        print(f"[SAD] Detected: {sad_score:.2f}")

    # --------------------------------------
    # ANGRY - very dark eyebrows/eyes, mouth closed, tense
    # --------------------------------------
    if (face_mean - eyebrows_mean) > 12 and (face_mean - eyes_mean) > 10 and mouth_std < 15:
        angry_score = min(0.65 + ((face_mean - eyebrows_mean) - 12) * 0.03, 0.92)
        scores["angry"] = angry_score
        print(f"[ANGRY] Detected: {angry_score:.2f}")

    # --------------------------------------
    # SURPRISED - wide open mouth, bright eyes
    # --------------------------------------
    if mouth_std > 25 and mouth_mean < face_mean - 8:
        surprised_score = min(0.7 + (mouth_std - 25) * 0.02, 0.95)
        if eyes_mean > face_mean + 3:  # Wide eyes bonus
            surprised_score += 0.1
        scores["surprised"] = min(surprised_score, 0.98)
        print(f"[SURPRISED] Detected: {surprised_score:.2f}")

    # --------------------------------------
    # NEUTRAL - fallback when nothing strong detected
    # --------------------------------------
    if not scores or all(v < 0.55 for v in scores.values()):
        scores["neutral"] = 0.60
        print("[NEUTRAL] Detected (fallback)")

    # Final result - NO BOOSTING
    label = max(scores, key=scores.get)
    confidence = float(min(scores[label], 1.0))
    latency_ms = int((time.time() - start) * 1000)

    print(f"[RESULT] Label={label}, Confidence={confidence:.2f}, All scores={scores}")

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

    # Analyze Image
    try:
        label, confidence, scores, latency_ms = _analyze_image(raw, expected_norm)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Emotion detection failed: {e}"}), 500

    label_norm = _norm(label)

    print(f"[EMOTION] Detected={label_norm} (conf={confidence:.2f}) | Expected={expected_norm}")

    # Strict thresholds - must match AND meet confidence
    thresholds = {
        "happy": 0.25,
        "sad": 0.25,
        "angry": 0.20,
        "surprised": 0.25,
        "neutral": 0.25,
    }
    threshold = thresholds.get(expected_norm, 0.25)

    # STRICT PASS: Must match label AND meet threshold
    passed = (label_norm == expected_norm and confidence >= threshold)

    score = 100.0 if passed else 0.0
    attempt_id = None

    print(f"[PASS CHECK] Match={label_norm == expected_norm}, Conf={confidence:.2f} >= {threshold} = {passed}")

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
                "model_backend": "opencv-heuristic-accurate",
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
        "all_scores": {k: round(v, 2) for k, v in scores.items()},  # Debug info
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