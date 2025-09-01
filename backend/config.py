# Location: mixview/backend/config.py
# Description: Configuration management with consistent imports and database integration

import os
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

class Config:
    """Configuration management for MixView backend"""
    
    @staticmethod
    def load_secrets() -> Dict[str, Optional[str]]:
        """
        Load secrets from environment variables.
        This allows for dynamic configuration via the setup wizard.
        """
        secrets = {}
        
        # Load from environment variables
        secrets["spotify_client_id"] = os.getenv("SPOTIFY_CLIENT_ID")
        secrets["spotify_client_secret"] = os.getenv("SPOTIFY_CLIENT_SECRET")
        secrets["spotify_redirect_uri"] = os.getenv("SPOTIFY_REDIRECT_URI", "http://localhost:8001/oauth/spotify/callback")
        secrets["lastfm_api_key"] = os.getenv("LASTFM_API_KEY")
        secrets["discogs_token"] = os.getenv("DISCOGS_TOKEN")
        secrets["apple_music_token"] = os.getenv("APPLE_MUSIC_TOKEN")

        return secrets
    
    @staticmethod
    def get_database_url() -> str:
        """Get database connection URL from environment variables."""
        return os.getenv("DATABASE_URL", "postgresql://mixview:mixviewpass@db:5432/mixview")
    
    @staticmethod
    def validate_config() -> Dict[str, bool]:
        """Validate that required configuration is present."""
        secrets = Config.load_secrets()
        validation = {
            "spotify": bool(secrets.get("spotify_client_id") and secrets.get("spotify_client_secret")),
            "lastfm": bool(secrets.get("lastfm_api_key")),
            "discogs": bool(secrets.get("discogs_token")),
            "apple_music": bool(secrets.get("apple_music_token")),
            "database": bool(os.getenv("DB_USER") and os.getenv("DB_PASSWORD")),
        }
        
        missing_services = [service for service, valid in validation.items() if not valid]
        if missing_services:
            logger.warning(f"Missing configuration for services: {missing_services}")
            
        return validation