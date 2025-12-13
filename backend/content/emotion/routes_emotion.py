#backend/content/emotion/routes_emotion.py
import base64
import cv2
import numpy as np
import time
import traceback
import json
from flask import Blueprint, request, jsonify

from extensions import supabase_client
from utils.sb import sb_exec
from auth.jwt_utils import require_student

emotion_bp = Blueprint("emotion", __name__, url_prefix="/api/emotion")

# -----------------------------------------------------------
# FER LIBRARY SETUP 
# -----------------------------------------------------------
try:
    from fer import FER
    
    # Initialize FER detector (downloads model automatically on first run)
    FER_DETECTOR = FER(mtcnn=False)  # mtcnn=False uses OpenCV (faster)
    print("✅ FER library loaded successfully")
    USE_FER_MODEL = True
    
except Exception as e:
    print(f"⚠️ FER library not available, falling back to heuristics: {e}")
    print("   Install with: pip install fer")
    FER_DETECTOR = None
    USE_FER_MODEL = False


# -----------------------------------------------------------
# Emotion Mapping
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
    if detected == expected and confidence < 0.50:
        return "Malapit na! Gawing mas malinaw." if lang == "tl" else "Almost! Make it clearer."
    
    hints = {
        "happy": "Ngumiti nang malawak!" if lang == "tl" else "Smile wider!",
        "angry": "Kunutin ang kilay!" if lang == "tl" else "Furrow your eyebrows!",
        "sad": "Mag-isip ng malungkot." if lang == "tl" else "Think sad thoughts.",
        "surprised": "Buksan ang bibig!" if lang == "tl" else "Open your mouth wide!",
        "neutral": "Relax lang." if lang == "tl" else "Just relax your face.",
    }
    
    return hints.get(expected, "Subukan muli!" if lang == "tl" else "Try again!")


# -----------------------------------------------------------
# FER LIBRARY DETECTOR
# -----------------------------------------------------------
def _analyze_image_with_fer_lib(image_bytes: bytes):
    """Use FER library for detection"""
    start = time.time()
    
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")
    
    # FER library expects RGB
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    # Detect emotions
    result = FER_DETECTOR.detect_emotions(img_rgb)
    
    if not result or len(result) == 0:
        latency_ms = int((time.time() - start) * 1000)
        return "no_face", 0.0, {"no_face": 0.0}, latency_ms  # Special marker
    
    # Get the first face (largest bounding box)
    face = max(result, key=lambda x: x['box'][2] * x['box'][3])
    emotions = face['emotions']
    
    # Map FER emotions to our system
    mapped_scores = {
        "happy": emotions.get('happy', 0),
        "sad": max(emotions.get('sad', 0), emotions.get('fear', 0)),
        "angry": max(emotions.get('angry', 0), emotions.get('disgust', 0)),
        "surprised": emotions.get('surprise', 0),
        "neutral": emotions.get('neutral', 0),
    }
    
    label = max(mapped_scores, key=mapped_scores.get)
    confidence = float(mapped_scores[label])
    latency_ms = int((time.time() - start) * 1000)
    
    return label, confidence, mapped_scores, latency_ms


# -----------------------------------------------------------
# FALLBACK HEURISTIC (same as before)
# -----------------------------------------------------------
_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

def _analyze_image_heuristic(image_bytes: bytes):
    """Fallback heuristic detector"""
    start = time.time()
    
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Invalid image")
    
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = _FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.18, minNeighbors=5)
    
    if len(faces) == 0:
        latency_ms = int((time.time() - start) * 1000)
        return "no_face", 0.0, {"no_face": 0.0}, latency_ms  # Special marker
    
    (x, y, w, h) = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[0]
    face = gray[y:y+h, x:x+w].astype("float32")
    face_mean = float(np.mean(face))
    
    mouth = face[int(h*0.60):int(h*0.92), int(w*0.15):int(w*0.85)]
    eyes = face[int(h*0.18):int(h*0.42), int(w*0.20):int(w*0.80)]
    eyebrows = face[int(h*0.15):int(h*0.30), int(w*0.20):int(w*0.80)]
    
    mouth_mean = float(np.mean(mouth)) if mouth.size else face_mean
    mouth_std = float(np.std(mouth)) if mouth.size else 0
    eyes_mean = float(np.mean(eyes)) if eyes.size else face_mean
    eyebrows_mean = float(np.mean(eyebrows)) if eyebrows.size else face_mean
    
    adaptive = max(1.0, (w * h) / 25000)
    scores = {}
    
    # Happy
    if (mouth_mean - face_mean) > (3 * adaptive) and mouth_std > (12 * adaptive):
        scores["happy"] = 0.60
    elif mouth_std > (8 * adaptive):
        scores["happy"] = 0.35
    
    # Angry
    if (face_mean - eyebrows_mean) > (5 * adaptive):
        scores["angry"] = 0.60
    elif (face_mean - eyebrows_mean) > (2 * adaptive):
        scores["angry"] = 0.35
    
    # Sad
    if (face_mean - eyes_mean) > (5 * adaptive):
        scores["sad"] = 0.60
    elif (face_mean - eyes_mean) > (3 * adaptive):
        scores["sad"] = 0.35
    
    # Surprised
    if mouth_std > (20 * adaptive):
        scores["surprised"] = 0.65
    elif mouth_std > (14 * adaptive):
        scores["surprised"] = 0.40
    
    # Neutral
    if abs(mouth_mean - face_mean) < (3 * adaptive):
        scores["neutral"] = 0.45
    
    if not scores:
        scores["neutral"] = 0.45
    
    label = max(scores, key=scores.get)
    confidence = float(scores[label])
    latency_ms = int((time.time() - start) * 1000)
    
    return label, confidence, scores, latency_ms


# -----------------------------------------------------------
# MAIN ANALYZER
# -----------------------------------------------------------
def _analyze_image(image_bytes: bytes):
    if USE_FER_MODEL and FER_DETECTOR is not None:
        return _analyze_image_with_fer_lib(image_bytes)
    else:
        return _analyze_image_heuristic(image_bytes)


# -----------------------------------------------------------
# API ROUTES
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


@emotion_bp.post("/analyze")
@require_student
def analyze_emotion():
    sb = supabase_client.client
    data = request.get_json(silent=True) or {}
    
    sid = request.user_id
    activities_id = data.get("activities_id")
    lang = (data.get("lang") or "en").lower()
    b64 = data.get("image_base64")
    
    if not (activities_id and b64):
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64, validate=True)
    except:
        return jsonify({"error": "Invalid base64"}), 400
    
    act_rows, _ = sb_exec(
        sb.table("activities")
          .select("id,data,sort_order,lesson_id")
          .eq("id", activities_id)
          .limit(1)
    )
    if not act_rows:
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
    
    try:
        label, confidence, scores, latency_ms = _analyze_image(raw)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Detection failed: {e}"}), 500
    
    label_norm = _norm(label)
    
    # Handle no face detected
    if label == "no_face":
        return jsonify({
            "ok": False,
            "error": "no_face_detected",
            "label": "no_face",
            "confidence": 0.0,
            "expected_emotion": expected_norm,
            "passed": False,
            "message": "Walang mukha na nakita. Siguraduhing nasa gitna ka ng camera." if lang == "tl" else "No face detected. Please center your face in the camera.",
            "all_scores": {},
        }), 200
    
    # Thresholds
    thresholds = {
        "happy": 0.30 if USE_FER_MODEL else 0.15,
        "sad": 0.35 if USE_FER_MODEL else 0.15,
        "angry": 0.35 if USE_FER_MODEL else 0.15,
        "surprised": 0.40 if USE_FER_MODEL else 0.15,
        "neutral": 0.30 if USE_FER_MODEL else 0.15,
    }
    
    required = thresholds.get(expected_norm, 0.30 if USE_FER_MODEL else 0.15)
    passed = (label_norm == expected_norm and confidence >= required)
    
    print(f"[EMOTION] {'FER' if USE_FER_MODEL else 'Heuristic'} | Detected={label_norm} Expected={expected_norm} Conf={confidence:.3f} Passed={passed}")
    
    attempt_id = None
    if passed:
        try:
            ins = sb.table("activity_attempts").insert({
                "students_id": sid,
                "activities_id": activities_id,
                "score": 100.0,
                "meta": {
                    "layout": "emotion",
                    "detected": {"label": label_norm, "confidence": round(confidence, 3)},
                    "expected": expected_norm,
                    "model": "fer-ml" if USE_FER_MODEL else "heuristic",
                },
            }).execute()
            attempt_id = (ins.data or [{}])[0].get("id")
        except Exception as e:
            print(f"⚠️ DB error: {e}")
    
    next_act = _next_activity_for(sb, int(act["lesson_id"]), int(act["sort_order"]))
    
    return jsonify({
        "ok": True,
        "label": label_norm,
        "confidence": round(confidence, 3),
        "expected_emotion": expected_norm,
        "passed": passed,
        "score": 100.0 if passed else 0.0,
        "attempt_id": attempt_id,
        "next_activity": next_act,
        "all_scores": {k: round(v, 3) for k, v in scores.items()},
        "feedback_hint": _get_feedback_hint(label_norm, expected_norm, confidence, lang),
        "model_used": "FER-ML" if USE_FER_MODEL else "Heuristic"
    })


@emotion_bp.post("/skip")
@require_student
def skip_emotion():
    sb = supabase_client.client
    data = request.get_json(silent=True) or {}
    
    sid = request.user_id
    activities_id = data.get("activities_id")
    
    if not activities_id:
        return jsonify({"error": "Missing activities_id"}), 400
    
    act_rows, _ = sb_exec(
        sb.table("activities")
          .select("lesson_id, sort_order")
          .eq("id", activities_id)
          .limit(1)
    )
    if not act_rows:
        return jsonify({"error": "Activity not found"}), 404
    
    act = act_rows[0]
    
    try:
        insert = sb.table("activity_attempts").insert({
            "students_id": sid,
            "activities_id": activities_id,
            "score": 0.0,
            "meta": {"layout": "emotion", "skipped": True},
        }).execute()
        attempt_id = insert.data[0]["id"] if insert.data else None
    except Exception as e:
        return jsonify({"error": f"DB error: {e}"}), 500
    
    next_act = _next_activity_for(sb, int(act["lesson_id"]), int(act["sort_order"]))
    
    return jsonify({"ok": True, "attempt_id": attempt_id, "next_activity": next_act})