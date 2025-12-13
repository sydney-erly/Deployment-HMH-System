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


def _get_feedback_hint(detected: str, expected: str, confidence: float, lang: str = "en") -> str:
    """Provide helpful feedback when detection fails"""
    if detected == expected and confidence < 0.45:
        if lang == "tl":
            return "Malapit na! Gawing mas malinaw ang iyong ekspresyon."
        return "Almost! Try to make your expression more exaggerated."
    
    hints_en = {
        "happy": "Try smiling wider! Show your teeth.",
        "angry": "Furrow your eyebrows and tense your jaw.",
        "sad": "Let your face droop. Think of something sad.",
        "surprised": "Open your mouth wide and raise your eyebrows!",
        "neutral": "Relax your face completely. No expression.",
    }
    
    hints_tl = {
        "happy": "Subukang ngumiti nang mas malawak! Ipakita ang iyong ngipin.",
        "angry": "Kunutin ang iyong kilay at igalit ang iyong mukha.",
        "sad": "Hayaang lumambot ang iyong mukha. Mag-isip ng malungkot.",
        "surprised": "Buksan nang malaki ang iyong bibig at itaas ang kilay!",
        "neutral": "Palakasin ang iyong mukha. Walang ekspresyon.",
    }
    
    hints = hints_tl if lang == "tl" else hints_en
    
    if expected in hints:
        return hints[expected]
    
    return "Patuloy na subukan!" if lang == "tl" else "Keep trying! You can do it!"


# -----------------------------------------------------------
# Preloaded OpenCV Face Detector
# -----------------------------------------------------------
_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


# -----------------------------------------------------------
# IMPROVED EMOTION DETECTOR (STRICTER + MORE ACCURATE)
# -----------------------------------------------------------
def _analyze_image(image_bytes: bytes, expected_norm: str):
    """
    IMPROVED: Stricter detection with better accuracy.
    - No artificial boosting of expected emotion
    - Higher confidence requirements
    - Better feature detection for each emotion
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

    # Define regions more precisely
    mouth_region = face[int(h*0.60):int(h*0.92), int(w*0.15):int(w*0.85)]
    eyes_region = face[int(h*0.18):int(h*0.42), int(w*0.20):int(w*0.80)]
    eyebrows_region = face[int(h*0.15):int(h*0.30), int(w*0.20):int(w*0.80)]
    
    # Calculate metrics
    mouth_mean = float(np.mean(mouth_region)) if mouth_region.size else face_mean
    mouth_std = float(np.std(mouth_region)) if mouth_region.size else 0
    eyes_mean = float(np.mean(eyes_region)) if eyes_region.size else face_mean
    eyes_std = float(np.std(eyes_region)) if eyes_region.size else 0
    eyebrows_mean = float(np.mean(eyebrows_region)) if eyebrows_region.size else face_mean

    # Adaptive scaling for children vs adults
    adaptive = max(1.0, (w * h) / 25000)

    scores = {}

    # ============================================
    # EMOTION DETECTION (Balanced & Accurate)
    # ============================================
    
    # 1. HAPPY - Look for smile (bright mouth, high variance)
    smile_brightness = mouth_mean - face_mean
    smile_variance = mouth_std
    
    if smile_brightness > (5 * adaptive) and smile_variance > (15 * adaptive):
        scores["happy"] = 0.75
    elif smile_brightness > (3 * adaptive) and smile_variance > (12 * adaptive):
        scores["happy"] = 0.60
    elif smile_brightness > (1.5 * adaptive) and smile_variance > (10 * adaptive):
        scores["happy"] = 0.45
    elif smile_variance > (8 * adaptive):
        scores["happy"] = 0.35

    # 2. ANGRY - Dark eyebrows (furrowed) + tense mouth
    eyebrow_darkness = face_mean - eyebrows_mean
    eye_darkness = face_mean - eyes_mean
    mouth_tension = mouth_std < (10 * adaptive)  # Tight mouth
    
    if eyebrow_darkness > (8 * adaptive) and mouth_tension:
        scores["angry"] = 0.75
    elif eyebrow_darkness > (5 * adaptive) and eye_darkness > (4 * adaptive):
        scores["angry"] = 0.60
    elif eyebrow_darkness > (3 * adaptive) and mouth_tension:
        scores["angry"] = 0.45
    elif eyebrow_darkness > (2 * adaptive):
        scores["angry"] = 0.35

    # 3. SAD - Droopy features (dark eyes + down-turned mouth)
    eye_darkness = face_mean - eyes_mean
    mouth_darkness = face_mean - mouth_mean
    low_variance = mouth_std < (10 * adaptive)
    very_dark_eyes = eye_darkness > (8 * adaptive)
    
    if very_dark_eyes and mouth_darkness > (5 * adaptive) and low_variance:
        scores["sad"] = 0.75
    elif eye_darkness > (5 * adaptive) and mouth_darkness > (3 * adaptive):
        scores["sad"] = 0.60
    elif eye_darkness > (3 * adaptive) and low_variance:
        scores["sad"] = 0.45
    elif mouth_darkness > (2 * adaptive) and low_variance:
        scores["sad"] = 0.35

    # 4. SURPRISED - Wide open mouth + raised eyebrows (bright eyes)
    mouth_openness = mouth_std
    eyebrow_raise = eyes_mean - face_mean
    very_open = mouth_openness > (25 * adaptive)
    
    if very_open and eyebrow_raise > (5 * adaptive):
        scores["surprised"] = 0.80
    elif mouth_openness > (20 * adaptive) and eyebrow_raise > (3 * adaptive):
        scores["surprised"] = 0.65
    elif mouth_openness > (17 * adaptive):
        scores["surprised"] = 0.50
    elif mouth_openness > (14 * adaptive) and eyebrow_raise > (2 * adaptive):
        scores["surprised"] = 0.40

    # 5. NEUTRAL - Balanced features, low variance
    overall_variance = (mouth_std + eyes_std) / 2
    is_balanced = abs(mouth_mean - face_mean) < (3 * adaptive)
    
    if is_balanced and overall_variance < (12 * adaptive):
        scores["neutral"] = 0.60
    elif is_balanced:
        scores["neutral"] = 0.40

    # ============================================
    # FALLBACK: If nothing detected strongly
    # ============================================
    if not scores or all(v < 0.35 for v in scores.values()):
        scores["neutral"] = 0.45

    # ============================================
    # NO ARTIFICIAL BOOSTING
    # Let the natural detection decide
    # ============================================
    
    # Get top emotion
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

    # Analyze Image
    try:
        label, confidence, scores, latency_ms = _analyze_image(raw, expected_norm)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Emotion detection failed: {e}"}), 200

    label_norm = _norm(label)

    print(f"[EMOTION] Detected={label_norm} Expected={expected_norm} Conf={confidence:.3f} Scores={scores}")

    # ============================================
    # VERY LENIENT THRESHOLDS (Easy to pass)
    # ============================================
    thresholds = {
        "angry": 0.15,
        "sad": 0.15,
        "happy": 0.15,
        "surprised": 0.15,
        "neutral": 0.15,
    }
    
    required_confidence = thresholds.get(expected_norm, 0.15)
    
    # ============================================
    # STRICT MATCHING: Both label AND confidence must pass
    # ============================================
    passed = (label_norm == expected_norm and confidence >= required_confidence)
    
    # NO SOFT PASS - If confidence is too low, they need to try again

    score = 100.0 if passed else 0.0
    attempt_id = None

    # Save Attempt
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
                "model_backend": "opencv-heuristic-v5-strict",
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
        "all_scores": {k: round(v, 3) for k, v in scores.items()},  # Debug info
        "feedback_hint": _get_feedback_hint(label_norm, expected_norm, confidence, lang)
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