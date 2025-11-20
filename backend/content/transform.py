# backend/content/transform.py
# Pick correct i18n branch and resolve media to public (or signed) URLs
# works with the "activities" table structure
# uses the Supabase storage client from extensions
# and the public_url function to convert storage paths to URLs
# also defines pick_branch to flatten the data structure for frontend use

from typing import Any, Dict, Optional
from extensions import supabase_client

USE_SIGNED_URLS = False
SIGNED_TTL_SECS = 60 * 60 * 24  # 24h

def _is_http(url: Optional[str]) -> bool:
    return isinstance(url, str) and (url.startswith("http://") or url.startswith("https://"))

def _is_storage_path(s: Optional[str]) -> bool:
    return isinstance(s, str) and (s.startswith("hmh-images/") or s.startswith("hmh-audio/"))

def _public_from_rest_path(path: str) -> str:
    base = f"{supabase_client.client.supabase_url}/storage/v1/object/public"
    return f"{base}/{path}"

def public_url(path: Optional[str]) -> Optional[str]:
    if not path or _is_http(path): return path
    if not _is_storage_path(path): return path
    bucket, *rest = path.split("/", 1)
    object_path = rest[0] if rest else ""
    if USE_SIGNED_URLS:
        storage = supabase_client.client.storage.from_(bucket)
        signed = storage.create_signed_url(object_path, SIGNED_TTL_SECS)
        return signed.get("signedURL") or signed.get("signed_url")
    return _public_from_rest_path(path)

def _resolve_choice(ch: Dict[str, Any]) -> Dict[str, Any]:
    c = dict(ch)
    if "image" in c: c["image"] = public_url(c.get("image"))
    if "audio" in c: c["audio"] = public_url(c.get("audio"))
    return c


def pick_branch(row: Dict[str, Any], lang: str) -> Dict[str, Any]:
    lang = (lang or "en").lower()
    base = {
        "id": row["id"],
        "type": row["type"],
        "sort_order": row.get("sort_order", 0),
        "supports": row.get("supports") or [],
        "prompt": row.get("prompt_en") if lang == "en" else row.get("prompt_tl"),
        "meta": {
            "spiral_tag": row.get("spiral_tag"),
            "difficulty": row.get("difficulty"),
            "affective_level": row.get("affective_level"),
        },
    }

    data = row.get("data") or {}
    if isinstance(data, dict) and "layout" in data:
        base["layout"] = data.get("layout")

    # --- new unified parsing logic ---
    i18n = data.get("i18n") or {}
    d_lang = i18n.get(lang) or i18n.get("en") or {}

    payload = {
        "prompt_audio": public_url(d_lang.get("prompt_audio")),
        "prompt_image": public_url(d_lang.get("prompt_image")),
        "choices": [_resolve_choice(x) for x in (d_lang.get("choices") or [])],
        "correct": d_lang.get("correct"),
    }

    # Handle both nested and flat formats
    #  Emotion
    payload["expected_emotion"] = (
        d_lang.get("expected_emotion")
        or data.get(f"expected_emotion_{lang}")
        or data.get("expected_emotion_en")
    )

    #  ASR
    payload["expected_speech"] = (
        d_lang.get("expected_speech")
        or data.get(f"expected_speech_{lang}")
        or data.get("expected_speech_en")
    )


    #  Conversation
    payload["prompt"] = (
        d_lang.get("prompt")
        or data.get(f"prompt_{lang}")
        or row.get("prompt_en")
        or row.get("prompt_tl")
    )

    if "targets" in d_lang:
        payload["targets"] = [
            {**t, "image": public_url(t.get("image"))}
            for t in (d_lang.get("targets") or [])
        ]

    return {**base, "payload": payload}
