# backend/student/routes_graduation.py
from flask import Blueprint, jsonify, request
from student.services import student_completed_all_lessons
from extensions import supabase_client
from utils.time import now_mnl 

grad_bp = Blueprint("graduation", __name__)

def _get_auth_user(request):
    # Adjust to your auth pattern; many of your routes have request.auth prepared.
    # Here, we expect request.auth = {"user_id": "<uuid>"}.
    user = getattr(request, "auth", None)
    if not user or "user_id" not in user:
        # Fallback: if you carry auth via headers/JWT, resolve here
        raise PermissionError("Unauthorized")
    return user

@grad_bp.get("/graduation-status")
def graduation_status():
    user = _get_auth_user(request)
    sid = user["user_id"]
    supa = supabase_client.client()
    prof = (
        supa.table("students")
        .select("graduated_at")
        .eq("students_id", sid)
        .single()
        .execute()
        .data
    )
    return jsonify({
        "all_completed": student_completed_all_lessons(sid),
        "graduated_at": (prof or {}).get("graduated_at")
    })

@grad_bp.post("/mark-graduated")
def mark_graduated():
    user = _get_auth_user(request)
    sid = user["user_id"]

    if not student_completed_all_lessons(sid):
        return jsonify({"ok": False, "error": "Not completed"}), 400

    supabase_client.client().table("students")\
        .update({"graduated_at": now_mnl()})\
        .eq("students_id", sid)\
        .execute()

    return jsonify({"ok": True})
