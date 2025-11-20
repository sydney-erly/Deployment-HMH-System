# backend/content/routes.py
# this file is for content-related routes
# such as fetching lesson activities with language support
# it uses the sb_exec utility to interact with the database
# and the pick_branch function to select language-specific fields
# it defines a blueprint for content routes
# all routes are prefixed with /api

from flask import Blueprint, request, jsonify
from utils.sb import sb_exec
from .transform import pick_branch

content_bp = Blueprint("content", __name__, url_prefix="/api/content")
@content_bp.get("/lesson/<int:lesson_id>/activities")

def get_lesson_activities(lesson_id: int):
    lang = (request.args.get("lang") or request.headers.get("X-HMH-Lang") or "en").lower()

    rows = sb_exec("""
        select id, lesson_id, type, sort_order, spiral_tag, difficulty, affective_level,
               supports, prompt_en, prompt_tl, data
          from activities
         where lesson_id = %s
         order by sort_order asc, id asc
    """, (lesson_id,))

    activities = [pick_branch(row, lang) for row in rows or []]
    return jsonify({"ok": True, "activities": activities})