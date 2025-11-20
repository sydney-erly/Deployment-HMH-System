# backend/content/asr/asr_routes.py
import os, io, time
from pathlib import Path
import numpy as np
from flask import Blueprint, jsonify, request
from pydub import AudioSegment
from pydub.silence import detect_nonsilent
from faster_whisper import WhisperModel

# ----------------------------
# Config & model loading
# ----------------------------

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
    AudioSegment.converter = which("ffmpeg") or os.getenv("FFMPEG_BINARY") or AudioSegment.converter
except Exception:
    pass

print(f"[ASR] EN_DIR={EN_DIR}")
print(f"[ASR] TL_DIR={TL_DIR}")
print(f"[ASR] DEVICE={DEVICE} COMPUTE={COMPUTE}")

# Load models once (global singletons)
_en = WhisperModel(EN_DIR, device=DEVICE, compute_type=COMPUTE)
_tl = WhisperModel(TL_DIR, device=DEVICE, compute_type=COMPUTE)

# ----------------------------
# Audio helpers
# ----------------------------

def _decode_to_mono_float32(raw: bytes, filename_hint: str | None = None):
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
    seg = AudioSegment((audio_f32 * 32767).astype(np.int16).tobytes(),
                       frame_rate=sr, sample_width=2, channels=1)
    spans = detect_nonsilent(seg, min_silence_len=min_sil_ms,
                             silence_thresh=seg.dBFS - 16, seek_step=10)
    if not spans:
        return audio_f32
    start = max(0, spans[0][0] - pad_ms)
    end = min(len(seg), spans[-1][1] + pad_ms)
    trimmed = seg[start:end]
    out = np.array(trimmed.get_array_of_samples()).astype(np.float32) / 32768.0
    return out


def _normalize(s: str) -> str:
    return (s or "").lower().strip().replace("“", "").replace("”", "") \
             .replace('"', "").replace("'", "").replace(".", "").replace(",", "") \
             .replace("?", "").replace("!", "").replace("  ", " ")


# ----------------------------
# Transcription
# ----------------------------

def _transcribe(raw: bytes, lang: str, filename_hint: str | None):
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
    print(f"[ASR] transcribed chars={len(text)} latency={latency_ms}ms segments={len(segs)}")
    return {"text": text, "sr": sr, "latency_ms": latency_ms, "model_used": label}


# ----------------------------
# Blueprint
# ----------------------------

asr_bp = Blueprint("asr", __name__)

@asr_bp.get("/ping")
def ping():
    return jsonify({
        "ok": True,
        "en": EN_LABEL,
        "tl": TL_LABEL,
        "device": DEVICE,
        "compute": COMPUTE
    })


@asr_bp.post("/recognize")
def recognize():
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

    print(f"[ASR] /recognize lang={lang} name={getattr(f, 'filename', '?')} "
          f"mimetype={getattr(f, 'mimetype', '?')} size={size}")

    try:
        out = _transcribe(f.read(), lang, getattr(f, "filename", None))
        text = out["text"]

        def _score(heard: str, expect: str | None):
            if not expect:
                return None, None
            nh = _normalize(heard)
            ne = _normalize(expect)
            score = 100.0 if (ne and nh == ne) else 0.0
            return score, (score >= 60.0)

        score, passed = _score(text, expected)

        return jsonify({
            "ok": True,
            "text": text,
            "latency_ms": out["latency_ms"],
            "model_used": out["model_used"],
            "sr": out["sr"],
            "score": score,
            "passed": passed,
        })
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 415
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ----------------------------------------------------------------------
# Alias for legacy frontend endpoint (/api/asr/analyze)
# ----------------------------------------------------------------------
@asr_bp.post("/analyze")
def analyze_alias():
    """Alias for /api/asr/recognize to support existing frontend"""
    return recognize()
