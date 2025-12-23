import os, warnings
from flask import Flask
from config import Config
from extensions import supabase_client
from errors import register_error_handlers
from flask_cors import CORS

# Silence TF/Whisper warnings
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Blueprints
from auth.routes import auth_bp
from student.routes import student_bp
from teacher.routes import teacher_bp
from teacher.manage_lessons import manage_lessons_bp
from content.routes import content_bp
from content.asr.routes_asr_analyze import asr_bp
from content.emotion.routes_emotion import emotion_bp
from student.routes_graduation import grad_bp
from auth.routes_reset import reset_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    supabase_client.init_app(app)

    # CORS (allow dev + production)
    CORS(
        app,
        resources={r"/api/*": {
            "origins": [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://hear-my-heart.app",
                "https://www.hear-my-heart.app"
            ],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
        }}
    )

    @app.get("/")
    def root():
        return {"ok": True, "service": "hmh-backend"}

    @app.get("/health")
    def health():
        return {"ok": True}

    # Register all blueprints
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(student_bp, url_prefix="/api/student")
    app.register_blueprint(teacher_bp, url_prefix="/api/teacher")
    app.register_blueprint(manage_lessons_bp, url_prefix="/api/teacher/manage-lessons")
    app.register_blueprint(grad_bp, url_prefix="/api/student")
    app.register_blueprint(asr_bp, url_prefix="/api/asr")
    app.register_blueprint(emotion_bp, url_prefix="/api/emotion")
    app.register_blueprint(reset_bp, url_prefix="/api/auth")
    app.register_blueprint(content_bp, url_prefix="/api")

    register_error_handlers(app)
    return app

# 👉 Gunicorn loads THIS app. Do NOT run Flask dev server in production.
app = create_app()
