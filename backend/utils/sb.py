# backend/utils/sb.py
# this file is for Supabase utility functions

def sb_exec(q):
    try:
        res = q.execute()
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"
    if hasattr(res, "data"):
        return res.data, None
    if isinstance(res, dict):
        return res.get("data"), res.get("error")
    return res, None
