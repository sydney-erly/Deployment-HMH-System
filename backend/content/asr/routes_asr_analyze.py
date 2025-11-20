# backend/content/asr/routes_asr_analyze.py

import os
import io
import time
import json
import re
import traceback
from pathlib import Path
from typing import Optional

import numpy as np
from flask import Blueprint, jsonify, request
from pydub import AudioSegment
from pydub.silence import detect_nonsilent
from faster_whisper import WhisperModel
from difflib import SequenceMatcher

from extensions import supabase_client
from utils.sb import sb_exec
from auth.jwt_utils import require_student
from student.achievements import check_and_award_achievements

# -------------------------------------------------------------------
# Model setup (from old asr_routes.py, but shared with DB logic)
# -------------------------------------------------------------------

def _pick_dir(env_key: str, default_rel: str) -> str:
    """Use env var if it exists; else resolve relative to backend/."""
    p = os.getenv(env_key)
    if p and os.path.isdir(p):
        return p
    backend_root = Path(__file__).resolve().parents[2]  # .../backend
    return str((backend_root / default_rel).resolve())


EN_DIR = _pick_dir("HMH_ASR_EN_REPO", "ct2/en")
TL_DIR = _pick_dir("HMH_ASR_TL_REPO", "ct2/tl")
EN_LABEL = os.getenv("HMH_ASR_EN_NAME", Path(EN_DIR).name or "ct2-en")
TL_LABEL = os.getenv("HMH_ASR_TL_NAME", Path(TL_DIR).name or "ct2-tl")

DEVICE = os.getenv("HMH_ASR_DEVICE", "cpu")
COMPUTE = os.getenv("HMH_ASR_COMPUTE_TYPE", "int8")  # good default on CPU

# Help pydub find ffmpeg on Windows if PATH isn't set.
try:
    from pydub.utils import which
    AudioSegment.converter = (
        which("ffmpeg") or os.getenv("FFMPEG_BINARY") or AudioSegment.converter
    )
except Exception:
    pass

print(f"[ASR] EN_DIR={EN_DIR}")
print(f"[ASR] TL_DIR={TL_DIR}")
print(f"[ASR] DEVICE={DEVICE} COMPUTE={COMPUTE}")

# Load Whisper models once (global singletons)
_en = WhisperModel(EN_DIR, device=DEVICE, compute_type=COMPUTE)
_tl = WhisperModel(TL_DIR, device=DEVICE, compute_type=COMPUTE)

# -------------------------------------------------------------------
# Audio helpers (from old asr_routes.py)
# -------------------------------------------------------------------

def _decode_to_mono_float32(raw: bytes, filename_hint: Optional[str] = None):
    """Decode webm/opus/wav/m4a → mono 16k float32. Return (arr, sr)."""
    try:
        seg = AudioSegment.from_file(io.BytesIO(raw), format=None)
    except Exception as e1:
        try:
            fmt = (Path(filename_hint).suffix or "").lstrip(".") if filename_hint else None
            seg = AudioSegment.from_file(io.BytesIO(raw), format=fmt if fmt else None)
        except Exception as e2:
            raise RuntimeError(f"Audio decode failed (need ffmpeg?). e1={e1} e2={e2}")

    seg = seg.set_channels(1).set_frame_rate(16000)

    arr = np.array(seg.get_array_of_samples())
    if seg.sample_width == 2:
        arr = arr.astype(np.float32) / 32768.0
    elif seg.sample_width == 4:
        arr = arr.astype(np.float32) / 2147483648.0
    else:
        arr = arr.astype(np.float32)
        m = float(np.max(np.abs(arr)) or 1.0)
        arr /= m

    f32 = arr.astype(np.float32)
    peak = float(np.max(np.abs(f32))) if f32.size else 0.0
    dur_ms = int(len(f32) / 16000 * 1000)
    print(f"[ASR] decoded len={len(f32)} (~{dur_ms} ms) peak={peak:.4f} sw={seg.sample_width}")
    return f32, seg.frame_rate


def _trim_silence_float32(audio_f32: np.ndarray, sr: int, min_sil_ms=120, pad_ms=80):
    """Energy-based trim using pydub; keeps voice region with padding."""
    seg = AudioSegment(
        (audio_f32 * 32767).astype(np.int16).tobytes(),
        frame_rate=sr,
        sample_width=2,
        channels=1,
    )
    spans = detect_nonsilent(
        seg, min_silence_len=min_sil_ms, silence_thresh=seg.dBFS - 16, seek_step=10
    )
    if not spans:
        return audio_f32
    start = max(0, spans[0][0] - pad_ms)
    end = min(len(seg), spans[-1][1] + pad_ms)
    trimmed = seg[start:end]
    out = np.array(trimmed.get_array_of_samples()).astype(np.float32) / 32768.0
    return out


def _normalize_text(s: str) -> str:
    """Lowercase + strip punctuation/quotes for fuzzy comparison."""
    s = (s or "").lower()
    s = s.replace("“", "").replace("”", "").replace('"', "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


# -------------------------------------------------------------------
# Transcription (merged)
# -------------------------------------------------------------------

def _transcribe(raw: bytes, lang: str, filename_hint: Optional[str]):
    """Decode + basic sanity checks + Whisper transcription."""
    audio, sr = _decode_to_mono_float32(raw, filename_hint)

    if audio.size < 1600:
        print("[ASR] too short; skipping model")
        return {"text": "", "sr": sr, "latency_ms": 5, "model_used": "no_audio"}

    if float(np.max(np.abs(audio)) or 0.0) < 0.005:
        print("[ASR] too quiet; skipping model")
        return {"text": "", "sr": sr, "latency_ms": 5, "model_used": "too_quiet"}

    is_en = (lang or "en").lower().startswith("en")
    model = _en if is_en else _tl
    label = EN_LABEL if is_en else TL_LABEL

    t0 = time.time()
    segments_gen, info = model.transcribe(
        audio,
        language=("en" if is_en else "tl"),
        beam_size=5,
        condition_on_previous_text=False,
        without_timestamps=True,
        temperature=0.0,
        vad_filter=False,
        task="transcribe",
        compression_ratio_threshold=2.6,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
    )
    segs = list(segments_gen)
    text = " ".join(s.text for s in segs).strip()
    latency_ms = int((time.time() - t0) * 1000)
    print(
        f"[ASR] transcribed chars={len(text)} latency={latency_ms}ms "
        f"segments={len(segs)} model={label}"
    )
    return {"text": text, "sr": sr, "latency_ms": latency_ms, "model_used": label}


# -------------------------------------------------------------------
# DB helpers & fuzzy scoring (from routes_asr_analyze, tuned for ASD)
# -------------------------------------------------------------------

def _next_activity(sb, lesson_id, sort_order):
    """Fetch next activity in lesson, if any."""
    rows, _ = sb_exec(
        sb.table("activities")
        .select("id,sort_order")
        .eq("lesson_id", lesson_id)
        .gt("sort_order", sort_order)
        .order("sort_order")
        .limit(1)
    )
    return rows[0] if rows else None


def _fuzzy_asr_pass(expected: str, transcript: str) -> bool:
    """
    ASD-friendly ASR scoring:
      • Ignore stutters (ma-ma-ma → ma)
      • Require correct key noun where possible
      • Pass if any meaningful keyword is in transcript
      • OR fuzzy similarity ≥ 0.40
    """
    if not expected or not transcript:
        return False

    norm_exp = _normalize_text(expected)
    norm_txt = _normalize_text(transcript)

    # Ignore simple stutters like "ma-ma-ma"
    norm_txt = re.sub(r"\b([a-z]{1,3})-\1\b", r"\1", norm_txt)
    norm_txt = re.sub(r"(\b[a-z]{1,3}\b)(?:\s+\1)+", r"\1", norm_txt)

    exp_tokens = [t for t in norm_exp.split() if len(t) > 2]
    txt_tokens = norm_txt.split()

    # Try to identify a "key noun" (first non-stopword token)
    stopwords = {
        "ang",
        "si",
        "sa",
        "ng",
        "na",
        "ay",
        "ako",
        "ikaw",
        "siya",
        "the",
        "a",
        "an",
        "is",
        "are",
        "am",
        "has",
        "have",
        "with",
        "and",
        "she",
        "he",
        "they",
        "i",
        "you",
        "we",
        "long",
        "tall",
        "short",
        "happy",
        "sad",
        "mahaba",
        "matangkad",
        "malungkot",
        "masaya",
    }

    key_noun = None
    for t in exp_tokens:
        if t not in stopwords:
            key_noun = t
            break

    # Strong pass if key noun detected in transcript
    if key_noun and key_noun in txt_tokens:
        return True

    # Pass if any important keyword is present
    for word in exp_tokens:
        if word in txt_tokens:
            return True

    # Fallback: global fuzzy similarity
    sim = SequenceMatcher(None, norm_exp, norm_txt).ratio()
    print(f"[ASR] fuzzy sim={sim:.3f} exp={norm_exp!r} txt={norm_txt!r}")
    return sim >= 0.40


# -------------------------------------------------------------------
# Blueprint & routes
# -------------------------------------------------------------------

# NOTE: no url_prefix here; app.py mounts it at /api/asr
asr_bp = Blueprint("asr", __name__)


@asr_bp.get("/ping")
def ping():
    """Simple health/ping for ASR models."""
    return jsonify(
        {
            "ok": True,
            "en": EN_LABEL,
            "tl": TL_LABEL,
            "device": DEVICE,
            "compute": COMPUTE,
        }
    )


@asr_bp.post("/recognize")
def recognize():
    """
    Lightweight dev endpoint:
      - No DB
      - Optional 'expected' field
    Good for quickly testing transcription quality.
    """
    f = request.files.get("audio")
    if not f:
        return jsonify({"ok": False, "error": "missing 'audio' file"}), 400

    lang = (request.form.get("lang") or "en").lower()
    expected = request.form.get("expected")

    try:
        size = f.content_length or len(f.read())
        f.seek(0)
    except Exception:
        size = "?"
        f.seek(0)

    print(
        f"[ASR] /recognize lang={lang} name={getattr(f, 'filename', '?')} "
        f"mimetype={getattr(f, 'mimetype', '?')} size={size}"
    )

    try:
        out = _transcribe(f.read(), lang, getattr(f, "filename", None))
        text = out["text"]

        def _score(heard: str, expect: Optional[str]):
            if not expect:
                return None, None
            nh = _normalize_text(heard)
            ne = _normalize_text(expect)
            score = 100.0 if (ne and nh == ne) else 0.0
            return score, (score >= 60.0)

        score, passed = _score(text, expected)

        return jsonify(
            {
                "ok": True,
                "text": text,
                "latency_ms": out["latency_ms"],
                "model_used": out["model_used"],
                "sr": out["sr"],
                "score": score,
                "passed": passed,
            }
        )
    except RuntimeError as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 415
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


# ----------------------------------------------------------------------
# Main endpoint used by the app: /api/asr/analyze
# ----------------------------------------------------------------------
@asr_bp.post("/analyze")
@require_student
def analyze_asr():
    """
    Full ASR endpoint used by HearMyHeart:
      - Decodes & transcribes audio
      - Looks up expected text from activities.data.i18n
      - Fuzzy ASD-friendly scoring
      - Saves activity_attempts & speech_metrics on pass
      - Triggers achievements
      - Returns next_activity for lesson flow
    """
    sb = supabase_client.client
    sid = request.user_id

    lang = (request.form.get("lang") or "en").lower()
    lesson_id = request.form.get("lesson_id")
    activities_id = request.form.get("activities_id")
    f = request.files.get("audio")

    if not (activities_id and f):
        return jsonify({"error": "Missing fields"}), 400

    # -----------------------------------
    # Fetch activity + expected speech
    # -----------------------------------
    act_rows, _ = sb_exec(
        sb.table("activities")
        .select("id, lesson_id, sort_order, data")
        .eq("id", activities_id)
        .limit(1)
    )
    if not act_rows:
        return jsonify({"error": "Activity not found"}), 404

    act = act_rows[0]
    raw_data = act.get("data")

    if isinstance(raw_data, str):
        try:
            data = json.loads(raw_data)
        except Exception:
            data = {}
    else:
        data = raw_data or {}

    i18n = data.get("i18n", {})
    branch = i18n.get(lang) or i18n.get("en") or {}

    expected = (
        branch.get("expected_speech")
        or branch.get("expected_text")
        or data.get(f"expected_text_{lang}")
        or data.get("expected_text_en")
        or ""
    )

    # -----------------------------------
    # Decode + Transcribe
    # -----------------------------------
    try:
        raw = f.read()
        out = _transcribe(raw, lang, getattr(f, "filename", None))
        text = out["text"]
        latency = out["latency_ms"]
        model_used = out["model_used"]
        sr = out["sr"]
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"ASR failed: {e}"}), 500

    print(
        f"[ASR] expected={expected!r} heard={text!r} "
        f"lang={lang} model={model_used} latency={latency}ms"
    )

    # -----------------------------------
    # Fuzzy scoring
    # -----------------------------------
    passed = _fuzzy_asr_pass(expected, text)
    score = 100.0 if passed else 0.0

    attempt_id = None
    inline_codes, profile_codes = [], []

    # -----------------------------------
    # Save attempt + metrics ONLY if passed
    # -----------------------------------
    if passed:
        try:
            ins = (
                sb.table("activity_attempts")
                .insert(
                    {
                        "students_id": sid,
                        "activities_id": activities_id,
                        "score": score,
                        "meta": {
                            "layout": "asr",
                            "recognized_text": text,
                            "expected_text": expected,
                            "lang": lang,
                            "backend_text": text,
                            "latency_ms": latency,
                        },
                    }
                )
                .execute()
            )
            attempt_id = ins.data[0]["id"] if ins.data else None

            sb.table("speech_metrics").insert(
                {
                    "attempt_id": attempt_id,
                    "students_id": sid,
                    "activities_id": activities_id,
                    "recognized_text": text,
                    "expected_text": expected,
                    "accuracy": score,
                    "lang": lang,
                    "model_used": model_used,
                    "latency_ms": latency,
                }
            ).execute()
        except Exception:
            traceback.print_exc()
            attempt_id = None

        # Achievements
        try:
            inline_codes, profile_codes = check_and_award_achievements(
                sb,
                sid,
                score,
                lesson_id=lesson_id,
                layout="asr",
            )
        except Exception:
            traceback.print_exc()
            inline_codes, profile_codes = [], []

    # -----------------------------------
    # Next activity in lesson
    # -----------------------------------
    next_act = _next_activity(
        sb,
        int(act["lesson_id"]),
        int(act["sort_order"]),
    )

    return jsonify(
        {
            "ok": True,
            "text": text,
            "expected": expected,
            "score": score,
            "passed": passed,
            "attempt_id": attempt_id,
            "latency_ms": latency,
            "model_used": model_used,
            "sr": sr,
            "next_activity": next_act,
            "inline_achievements": inline_codes,
            "profile_achievements": profile_codes,
        }
    )
