# backend/errors.py
# this file is for centralized error handling


from flask import jsonify, request
from werkzeug.exceptions import HTTPException

def register_error_handlers(app):
    @app.errorhandler(Exception)
    def handle_any_error(e):
        # Preserve HTTP status codes for known HTTP errors (e.g., 404 Not Found)
        if isinstance(e, HTTPException):
            code = e.code or 500
            # For API paths, return JSON; otherwise, let Flask render default page
            if request.path.startswith("/api/"):
                return jsonify({"error": e.description}), code
            return e  # non-API: default HTML error page

        # Non-HTTPException → 500
        if request.path.startswith("/api/"):
            return jsonify({"error": "Internal Server Error"}), 500
        return "Internal Server Error", 500
