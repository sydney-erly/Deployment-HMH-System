# backend/extensions.py

from flask_cors import CORS
from supabase import create_client

cors = CORS()

class SupabaseClient:
    def __init__(self):
        self.client = None

    def init_app(self, app):
        url = app.config["SUPABASE_URL"]
        key = app.config["SUPABASE_KEY"]
        if not url or not key:
            raise RuntimeError("Missing Supabase config")
        self.client = create_client(url, key)

    def __getattr__(self, name):
        """Forward attribute access to the real Supabase client once initialized."""
        if self.client is None:
            raise RuntimeError("Supabase client not initialized yet")
        return getattr(self.client, name)

supabase_client = SupabaseClient()
