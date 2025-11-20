# backend/student/scoring.py
# Scoring utilities for different activity types (0..100)
import re
from difflib import SequenceMatcher



# -------------------------------
# Small helpers
# -------------------------------

def _safe_lower(s: str) -> str:
    return (s or "").strip().lower()


def _is_correct_key(act: dict, submission: dict) -> bool:
    """
    Prefer explicit keys in submission (choice_key/correct_key),
    fall back to act['payload'] for older content.
    """
    # New-style submission fields
    ch = (submission or {}).get("choice_key")
    correct = (submission or {}).get("correct_key")
    if ch is not None or correct is not None:
        return bool(ch) and bool(correct) and (ch == correct)

    # Legacy payload fields
    target = (act.get("payload") or {}).get("correct")
    got = (submission or {}).get("key")
    return bool(target) and (got == target)


# -------------------------------
# Emotion normalization
# -------------------------------

def _norm_emotion(label: str) -> str:
    s = _safe_lower(label)
    alias = {
        # EN → canonical
        "joy": "happy",
        "happiness": "happy",
        "happy": "happy",
        "surprised": "surprise",
        "surprising": "surprise",
        "surprise": "surprise",
        "angry": "anger",
        "anger": "anger",
        "sadness": "sad",
        "sad": "sad",
        "neutral": "neutral",
        # TL → canonical
        "masaya": "happy",
        "malungkot": "sad",
        "galit": "anger",
        "gulat": "surprise",
    }
    return alias.get(s, s)


# -------------------------------
# Scorers
# -------------------------------

def score_recognition(act, submission):
    """ letter sound → letter """
    return 100.0 if _is_correct_key(act, submission) else 0.0


def score_listening(act, submission):
    """ hear word → pick picture/word """
    return 100.0 if _is_correct_key(act, submission) else 0.0


def score_mcq(act, submission):
    """ picture choice / word connection, etc. """
    return 100.0 if _is_correct_key(act, submission) else 0.0


def score_asr(act, submission, lang: str = "en") -> float:
    """
    ASD-friendly ASR scoring.

    Rules:
      • Ignore stutters (ma-ma-ma → mama)
      • Use backend_text if present; else transcript
      • Extract expected_speech from activity.data.i18n[lang]
      • Require key noun to appear in transcript
      • Require fuzzy similarity ≥ 0.40
    """
    data = act.get("data") or {}
    i18n = data.get("i18n", {})

    # Pick language branch
    lang = (lang or "en").lower()
    branch = i18n.get(lang) or i18n.get("en") or next(iter(i18n.values()), {})

    expected = (
        branch.get("expected_speech")
        or branch.get("expected_text")
        or data.get(f"expected_text_{lang}")
        or data.get("expected_text_en")
        or ""
    )

    heard = (
        submission.get("backend_text")
        or submission.get("transcript")
        or ""
    )

    def _norm(s: str) -> str:
        s = (s or "").lower()
        # strip quotes & punctuation
        s = re.sub(r"[\"'“”.,?!]", " ", s)
        s = re.sub(r"\s+", " ", s)
        return s.strip()

    if not expected or not heard:
        return 0.0

    norm_exp = _norm(expected)
    norm_txt = _norm(heard)

    #  Ignore stutters like "ma-ma-ma"
    norm_txt = re.sub(r"\b([a-z]{1,4})-\1\b", r"\1", norm_txt)
    norm_txt = re.sub(r"(\b[a-z]{1,4}\b)(?:\s+\1)+", r"\1", norm_txt)

    exp_tokens = [t for t in norm_exp.split() if len(t) > 2]
    txt_tokens = norm_txt.split()

    # Key noun heuristic: first content word not in stopwords
    stopwords = {
        "ang", "si", "na", "ng", "yung", "yong",
        "the", "is", "are", "am", "has", "have", "with", "a", "an",
    }
    key_noun = None
    for t in exp_tokens:
        if t not in stopwords:
            key_noun = t
            break

    # Require key noun to appear
    if key_noun and key_noun not in txt_tokens:
        # print(f"[ASR score] missing key noun '{key_noun}' in {txt_tokens}")
        return 0.0

    # Fuzzy similarity
    sim = SequenceMatcher(None, norm_exp, norm_txt).ratio()
    # print(f"[ASR score] exp={norm_exp!r} txt={norm_txt!r} sim={sim:.3f}")

    return 100.0 if sim >= 0.40 else 0.0



def score_emotion(act, submission):
    """
    Emotion detection (DeepFace) scorer:
      • Normalizes expected (EN/TL) and detected to canonical labels
      • Requires confidence ≥ 0.55
      • Returns 0 or 100 (no partials) for clean metrics
    """
    lang = _safe_lower((submission or {}).get("lang") or "en")
    i18n = (act.get("data") or {}).get("i18n") or {}

    exp_raw = (i18n.get(lang, {}) or {}).get("expected_emotion") \
              or (i18n.get("en", {}) or {}).get("expected_emotion")
    det_raw = ((submission or {}).get("detected") or {}).get("label")
    conf = float(((submission or {}).get("detected") or {}).get("confidence") or 0.0)

    if not exp_raw or not det_raw:
        return 0.0

    exp = _norm_emotion(exp_raw)
    det = _norm_emotion(det_raw)

    return 100.0 if (det == exp and conf >= 0.55) else 0.0
