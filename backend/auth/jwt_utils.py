# backend/auth/jwt_utils.py
# updated with full request.user support (11/17/2025)

import jwt
from functools import wraps
from flask import request, jsonify, current_app


# ---------- Create a JWT ----------
def make_jwt(payload: dict) -> str:
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


# ---------- Decode a JWT ----------
def decode_jwt(token: str) -> dict:
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])


# ---------- Role-based protection ----------
def require_role(role):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return jsonify({"error": "Missing token"}), 401

            # Decode token
            try:
                payload = decode_jwt(auth.split(" ", 1)[1])
            except Exception:
                return jsonify({"error": "Invalid token"}), 401

            # Validate role
            if payload.get("role") != role:
                return jsonify({"error": f"{role.title()} only"}), 403

            # ---------- CRITICAL FIX ----------
            # Attach the full decoded JWT payload
            request.user = payload                    # <--- FIXED
            request.user_id = payload.get("sub")      # still available

            return fn(*args, **kwargs)
        return wrapper
    return deco


# Convenience wrappers
require_student = require_role("student")
require_teacher = require_role("teacher")
