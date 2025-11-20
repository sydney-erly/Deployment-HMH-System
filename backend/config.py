# backend/config.py
# this file is for environment variables and configuration settings

import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    SUPABASE_URL  = os.getenv("SUPABASE_URL")
    SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    JWT_SECRET    = os.getenv("JWT_SECRET", "dev-secret-change")
    ALLOW_ORIGIN  = os.getenv("ALLOW_ORIGIN", "http://localhost:5173")
