# Location: mixview/backend/user_services.py
# Description: User-specific service management with fixed imports - COMPLETE VERSION

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
import requests
import logging
import os

# Fixed imports using relative imports
from db_package.models import User, UserServiceCredential, OAuthState
from routes.encryption import credential_encryption
from spotipy.oauth2 import SpotifyOAuth
import spotipy

logger = logging.getLogger(__name__)

class UserServiceManager:
    """Manages user-specific service credentials and connections"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def store_user_credentials(self, user_id: int, service_name: str, 
                              credentials: Dict[str, Any], credential_type: str = 'api_key') -> bool:
        """Store encrypted credentials for a user"""
        try:
            # Remove existing credentials for this service
            existing = self.db.query(UserServiceCredential).filter(
                UserServiceCredential.user_id == user_id,
                UserServiceCredential.service_name == service_name
            ).first()
            
            if existing:
                self.db.delete(existing)
            
            # Encrypt and store new credentials
            encrypted_data = credential_encryption.encrypt_credentials(credentials)
            
            new_credential = UserServiceCredential(
                user_id=user_id,
                service_name=service_name,
                credential_type=credential_type,
                encrypted_data=encrypted_data,
                expires_at=credentials.get('expires_at')
            )
            
            self.db.add(new_credential)
            self.db.commit()
            
            logger.info(f"Stored {service_name} credentials for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to store credentials for {service_name}: {e}")
            self.db.rollback()
            return False
    
    def get_user_credentials(self, user_id: int, service_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve and decrypt credentials for a user"""
        try:
            credential = self.db.query(UserServiceCredential).filter(
                UserServiceCredential.user_id == user_id,
                UserServiceCredential.service_name == service_name,
                UserServiceCredential.is_active == True
            ).first()
            
            if not credential:
                return None
            
            # Check if credentials are expired
            if credential.expires_at and credential.expires_at < datetime.utcnow():
                logger.warning(f"Credentials for {service_name} expired for user {user_id}")
                return None
            
            return credential_encryption.decrypt_credentials(credential.encrypted_data)
            
        except Exception as e:
            logger.error(f"Failed to retrieve credentials for {service_name}: {e}")
            return None
    
    def remove_user_credentials(self, user_id: int, service_name: str) -> bool:
        """Remove credentials for a user"""
        try:
            credential = self.db.query(UserServiceCredential).filter(
                UserServiceCredential.user_id == user_id,
                UserServiceCredential.service_name == service_name
            ).first()
            
            if credential:
                self.db.delete(credential)
                self.db.commit()
                logger.info(f"Removed {service_name} credentials for user {user_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to remove credentials for {service_name}: {e}")
            self.db.rollback()
            return False
    
    def get_user_service_status(self, user_id: int) -> Dict[str, bool]:
        """Get status of all services for a user"""
        services = ['spotify', 'lastfm', 'discogs', 'apple_music']
        status = {}
        
        for service in services:
            credentials = self.get_user_credentials(user_id, service)
            status[service] = credentials is not None
        
        # Apple Music doesn't need credentials
        status['apple_music'] = True
        status['musicbrainz'] = True
        
        return status
    
    def update_user_credentials(self, user_id: int, service_name: str, 
                               updated_credentials: Dict[str, Any]) -> bool:
        """Update existing credentials with new data (e.g., refreshed tokens)"""
        try:
            credential = self.db.query(UserServiceCredential).filter(
                UserServiceCredential.user_id == user_id,
                UserServiceCredential.service_name == service_name,
                UserServiceCredential.is_active == True
            ).first()
            
            if not credential:
                logger.warning(f"No existing credentials found for {service_name} for user {user_id}")
                return False
            
            # Decrypt existing credentials
            existing_creds = credential_encryption.decrypt_credentials(credential.encrypted_data)
            
            # Merge with updated credentials
            existing_creds.update(updated_credentials)
            
            # Re-encrypt and store
            credential.encrypted_data = credential_encryption.encrypt_credentials(existing_creds)
            credential.updated_at = datetime.utcnow()
            
            if 'expires_at' in updated_credentials:
                credential.expires_at = updated_credentials['expires_at']
            
            self.db.commit()
            logger.info(f"Updated {service_name} credentials for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update credentials for {service_name}: {e}")
            self.db.rollback()
            return False

class SpotifyOAuthManager:
    """Handles Spotify OAuth flow for users"""
    
    @staticmethod
    def create_oauth_state(db: Session, user_id: int, redirect_uri: str) -> str:
        """Create OAuth state for Spotify authorization"""
        state_token = secrets.token_urlsafe(32)
        
        # Clean up old states
        old_states = db.query(OAuthState).filter(
            OAuthState.user_id == user_id,
            OAuthState.service_name == 'spotify',
            OAuthState.expires_at < datetime.utcnow()
        ).all()
        
        for old_state in old_states:
            db.delete(old_state)
        
        # Create new state
        oauth_state = OAuthState(
            user_id=user_id,
            service_name='spotify',
            state_token=state_token,
            redirect_uri=redirect_uri,
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        
        db.add(oauth_state)
        db.commit()
        
        return state_token
    
    @staticmethod
    def get_spotify_auth_url(db: Session, user_id: int, 
                           client_id: str, redirect_uri: str) -> str:
        """Generate Spotify authorization URL"""
        state_token = SpotifyOAuthManager.create_oauth_state(db, user_id, redirect_uri)
        
        scope = "user-read-private user-read-email user-library-read user-top-read"
        
        auth_url = (
            "https://accounts.spotify.com/authorize"
            f"?response_type=code"
            f"&client_id={client_id}"
            f"&scope={scope}"
            f"&redirect_uri={redirect_uri}"
            f"&state={state_token}"
        )
        
        return auth_url
    
    @staticmethod
    def handle_oauth_callback(db: Session, code: str, state: str,
                            client_id: str, client_secret: str) -> Optional[int]:
        """Handle OAuth callback and store tokens"""
        try:
            # Verify state
            oauth_state = db.query(OAuthState).filter(
                OAuthState.state_token == state,
                OAuthState.service_name == 'spotify',
                OAuthState.is_used == False,
                OAuthState.expires_at > datetime.utcnow()
            ).first()
            
            if not oauth_state:
                logger.error("Invalid or expired OAuth state")
                return None
            
            # Mark state as used
            oauth_state.is_used = True
            
            # Exchange code for tokens
            token_url = "https://accounts.spotify.com/api/token"
            token_data = {
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': oauth_state.redirect_uri,
                'client_id': client_id,
                'client_secret': client_secret,
            }
            
            response = requests.post(token_url, data=token_data)
            response.raise_for_status()
            
            token_info = response.json()
            
            # Calculate expiration time
            expires_at = datetime.utcnow() + timedelta(seconds=token_info.get('expires_in', 3600))
            
            # Store credentials
            credentials = {
                'access_token': token_info['access_token'],
                'refresh_token': token_info.get('refresh_token'),
                'token_type': token_info.get('token_type', 'Bearer'),
                'expires_at': expires_at.isoformat(),
                'scope': token_info.get('scope', '')
            }
            
            service_manager = UserServiceManager(db)
            success = service_manager.store_user_credentials(
                oauth_state.user_id, 'spotify', credentials, 'oauth_token'
            )
            
            if success:
                db.commit()
                logger.info(f"Successfully stored Spotify tokens for user {oauth_state.user_id}")
                return oauth_state.user_id
            
            return None
            
        except Exception as e:
            logger.error(f"OAuth callback failed: {e}")
            db.rollback()
            return None
    
    @staticmethod
    def refresh_spotify_token(db: Session, user_id: int, 
                            client_id: str, client_secret: str) -> bool:
        """Refresh Spotify access token using refresh token"""
        try:
            service_manager = UserServiceManager(db)
            credentials = service_manager.get_user_credentials(user_id, 'spotify')
            
            if not credentials or not credentials.get('refresh_token'):
                logger.error(f"No refresh token available for user {user_id}")
                return False
            
            # Request new access token
            token_url = "https://accounts.spotify.com/api/token"
            token_data = {
                'grant_type': 'refresh_token',
                'refresh_token': credentials['refresh_token'],
                'client_id': client_id,
                'client_secret': client_secret,
            }
            
            response = requests.post(token_url, data=token_data)
            response.raise_for_status()
            
            token_info = response.json()
            
            # Calculate new expiration time
            expires_at = datetime.utcnow() + timedelta(seconds=token_info.get('expires_in', 3600))
            
            # Update credentials with new token
            updated_credentials = {
                'access_token': token_info['access_token'],
                'expires_at': expires_at.isoformat(),
            }
            
            # If we got a new refresh token, update that too
            if 'refresh_token' in token_info:
                updated_credentials['refresh_token'] = token_info['refresh_token']
            
            success = service_manager.update_user_credentials(user_id, 'spotify', updated_credentials)
            
            if success:
                logger.info(f"Successfully refreshed Spotify token for user {user_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Token refresh failed for user {user_id}: {e}")
            return False

class UserSpotifyService:
    """User-specific Spotify service"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.service_manager = UserServiceManager(db)
        self.sp = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Spotify client with user's credentials"""
        credentials = self.service_manager.get_user_credentials(self.user_id, 'spotify')
        
        if not credentials:
            logger.warning(f"No Spotify credentials found for user {self.user_id}")
            return
        
        try:
            # Check if token needs refresh
            expires_at_str = credentials.get('expires_at', '')
            if expires_at_str:
                expires_at = datetime.fromisoformat(expires_at_str)
                if expires_at <= datetime.utcnow():
                    # Token expired, try to refresh
                    if self._refresh_token():
                        credentials = self.service_manager.get_user_credentials(self.user_id, 'spotify')
                    else:
                        return
            
            self.sp = spotipy.Spotify(auth=credentials['access_token'])
            
        except Exception as e:
            logger.error(f"Failed to initialize Spotify client for user {self.user_id}: {e}")
    
    def _refresh_token(self) -> bool:
        """Refresh Spotify access token"""
        try:
            client_id = os.getenv('SPOTIFY_CLIENT_ID')
            client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')
            
            if not client_id or not client_secret:
                logger.error("Spotify client credentials not configured")
                return False
            
            return SpotifyOAuthManager.refresh_spotify_token(
                self.db, self.user_id, client_id, client_secret
            )
            
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            return False
    
    def is_available(self) -> bool:
        """Check if Spotify service is available for this user"""
        return self.sp is not None
    
    def search_artist(self, query: str) -> Optional[Dict[str, Any]]:
        """Search for artist using user's Spotify account"""
        if not self.sp:
            return None
        
        try:
            results = self.sp.search(q=f"artist:{query}", type="artist", limit=1)
            items = results.get("artists", {}).get("items", [])
            return items[0] if items else None
            
        except Exception as e:
            logger.error(f"Spotify search failed for user {self.user_id}: {e}")
            # Try to refresh token and retry once
            if "token expired" in str(e).lower() or "unauthorized" in str(e).lower():
                if self._refresh_token():
                    self._initialize_client()
                    if self.sp:
                        try:
                            results = self.sp.search(q=f"artist:{query}", type="artist", limit=1)
                            items = results.get("artists", {}).get("items", [])
                            return items[0] if items else None
                        except Exception as retry_e:
                            logger.error(f"Spotify search retry failed: {retry_e}")
            return None
    
    def search_album(self, query: str, artist_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Search for album using user's Spotify account"""
        if not self.sp:
            return None
        
        try:
            search_query = f"album:{query}"
            if artist_name:
                search_query += f" artist:{artist_name}"
            
            results = self.sp.search(q=search_query, type="album", limit=1)
            items = results.get("albums", {}).get("items", [])
            return items[0] if items else None
            
        except Exception as e:
            logger.error(f"Spotify album search failed for user {self.user_id}: {e}")
            return None
    
    def search_track(self, query: str, artist_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Search for track using user's Spotify account"""
        if not self.sp:
            return None
        
        try:
            search_query = f"track:{query}"
            if artist_name:
                search_query += f" artist:{artist_name}"
            
            results = self.sp.search(q=search_query, type="track", limit=1)
            items = results.get("tracks", {}).get("items", [])
            return items[0] if items else None
            
        except Exception as e:
            logger.error(f"Spotify track search failed for user {self.user_id}: {e}")
            return None
    
    def get_user_profile(self) -> Optional[Dict[str, Any]]:
        """Get current user's Spotify profile"""
        if not self.sp:
            return None
        
        try:
            return self.sp.current_user()
        except Exception as e:
            logger.error(f"Failed to get Spotify user profile for user {self.user_id}: {e}")
            return None
    
    def get_user_top_artists(self, time_range: str = 'medium_term', limit: int = 50) -> Optional[List[Dict[str, Any]]]:
        """Get user's top artists"""
        if not self.sp:
            return None
        
        try:
            results = self.sp.current_user_top_artists(time_range=time_range, limit=limit)
            return results.get('items', [])
        except Exception as e:
            logger.error(f"Failed to get user top artists for user {self.user_id}: {e}")
            return None
    
    def get_user_top_tracks(self, time_range: str = 'medium_term', limit: int = 50) -> Optional[List[Dict[str, Any]]]:
        """Get user's top tracks"""
        if not self.sp:
            return None
        
        try:
            results = self.sp.current_user_top_tracks(time_range=time_range, limit=limit)
            return results.get('items', [])
        except Exception as e:
            logger.error(f"Failed to get user top tracks for user {self.user_id}: {e}")
            return None
    
    def get_user_playlists(self, limit: int = 50) -> Optional[List[Dict[str, Any]]]:
        """Get user's playlists"""
        if not self.sp:
            return None
        
        try:
            results = self.sp.current_user_playlists(limit=limit)
            return results.get('items', [])
        except Exception as e:
            logger.error(f"Failed to get user playlists for user {self.user_id}: {e}")
            return None
    
    def get_recommendations(self, seed_artists: List[str] = None, seed_tracks: List[str] = None, 
                          seed_genres: List[str] = None, limit: int = 20, **kwargs) -> Optional[Dict[str, Any]]:
        """Get music recommendations"""
        if not self.sp:
            return None
        
        try:
            return self.sp.recommendations(
                seed_artists=seed_artists,
                seed_tracks=seed_tracks, 
                seed_genres=seed_genres,
                limit=limit,
                **kwargs
            )
        except Exception as e:
            logger.error(f"Failed to get recommendations for user {self.user_id}: {e}")
            return None

class UserLastFMService:
    """User-specific Last.fm service"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.service_manager = UserServiceManager(db)
        self.api_key = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Last.fm client with user's API key"""
        credentials = self.service_manager.get_user_credentials(self.user_id, 'lastfm')
        
        if credentials:
            self.api_key = credentials.get('api_key')
    
    def is_available(self) -> bool:
        """Check if Last.fm service is available for this user"""
        return self.api_key is not None
    
    def get_artist_info(self, artist_name: str) -> Optional[Dict[str, Any]]:
        """Get artist info using user's Last.fm API key"""
        if not self.api_key:
            return None
        
        try:
            url = "http://ws.audioscrobbler.com/2.0/"
            params = {
                "method": "artist.getinfo",
                "artist": artist_name,
                "api_key": self.api_key,
                "format": "json"
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("artist")
            
        except Exception as e:
            logger.error(f"Last.fm request failed for user {self.user_id}: {e}")
            return None
    
    def get_album_info(self, artist_name: str, album_name: str) -> Optional[Dict[str, Any]]:
        """Get album info using user's Last.fm API key"""
        if not self.api_key:
            return None
        
        try:
            url = "http://ws.audioscrobbler.com/2.0/"
            params = {
                "method": "album.getinfo",
                "artist": artist_name,
                "album": album_name,
                "api_key": self.api_key,
                "format": "json"
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("album")
            
        except Exception as e:
            logger.error(f"Last.fm album request failed for user {self.user_id}: {e}")
            return None
    
    def get_track_info(self, artist_name: str, track_name: str) -> Optional[Dict[str, Any]]:
        """Get track info using user's Last.fm API key"""
        if not self.api_key:
            return None
        
        try:
            url = "http://ws.audioscrobbler.com/2.0/"
            params = {
                "method": "track.getInfo",
                "artist": artist_name,
                "track": track_name,
                "api_key": self.api_key,
                "format": "json"
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("track")
            
        except Exception as e:
            logger.error(f"Last.fm track request failed for user {self.user_id}: {e}")
            return None
    
    def search_artist(self, artist_name: str) -> Optional[Dict[str, Any]]:
        """Search for artist using Last.fm"""
        if not self.api_key:
            return None
        
        try:
            url = "http://ws.audioscrobbler.com/2.0/"
            params = {
                "method": "artist.search",
                "artist": artist_name,
                "api_key": self.api_key,
                "format": "json",
                "limit": 1
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            artists = data.get("results", {}).get("artistmatches", {}).get("artist", [])
            return artists[0] if artists else None
            
        except Exception as e:
            logger.error(f"Last.fm artist search failed for user {self.user_id}: {e}")
            return None
    
    def get_similar_artists(self, artist_name: str, limit: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Get similar artists using Last.fm"""
        if not self.api_key:
            return None
        
        try:
            url = "http://ws.audioscrobbler.com/2.0/"
            params = {
                "method": "artist.getsimilar",
                "artist": artist_name,
                "api_key": self.api_key,
                "format": "json",
                "limit": limit
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("similarartists", {}).get("artist", [])
            
        except Exception as e:
            logger.error(f"Last.fm similar artists request failed for user {self.user_id}: {e}")
            return None
    
    def get_top_albums(self, artist_name: str, limit: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Get top albums for an artist"""
        if not self.api_key:
            return None
        
        try:
            url = "http://ws.audioscrobbler.com/2.0/"
            params = {
                "method": "artist.gettopalbums",
                "artist": artist_name,
                "api_key": self.api_key,
                "format": "json",
                "limit": limit
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("topalbums", {}).get("album", [])
            
        except Exception as e:
            logger.error(f"Last.fm top albums request failed for user {self.user_id}: {e}")
            return None
    
    def get_top_tracks(self, artist_name: str, limit: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Get top tracks for an artist"""
        if not self.api_key:
            return None
        
        try:
            url = "http://ws.audioscrobbler.com/2.0/"
            params = {
                "method": "artist.gettoptracks",
                "artist": artist_name,
                "api_key": self.api_key,
                "format": "json",
                "limit": limit
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("toptracks", {}).get("track", [])
            
        except Exception as e:
            logger.error(f"Last.fm top tracks request failed for user {self.user_id}: {e}")
            return None

class UserDiscogsService:
    """User-specific Discogs service"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.service_manager = UserServiceManager(db)
        self.token = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Discogs client with user's token"""
        credentials = self.service_manager.get_user_credentials(self.user_id, 'discogs')
        
        if credentials:
            self.token = credentials.get('token')
    
    def is_available(self) -> bool:
        """Check if Discogs service is available for this user"""
        return self.token is not None
    
    def search_artist(self, artist_name: str) -> Optional[Dict[str, Any]]:
        """Search artist using user's Discogs token"""
        if not self.token:
            return None
        
        try:
            url = "https://api.discogs.com/database/search"
            headers = {"Authorization": f"Discogs token={self.token}"}
            params = {"q": artist_name, "type": "artist"}
            
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            results = data.get("results", [])
            return results[0] if results else None
            
        except Exception as e:
            logger.error(f"Discogs search failed for user {self.user_id}: {e}")
            return None
    
    def search_release(self, artist_name: str, album_name: str) -> Optional[Dict[str, Any]]:
        """Search for album/release using user's Discogs token"""
        if not self.token:
            return None
        
        try:
            url = "https://api.discogs.com/database/search"
            headers = {"Authorization": f"Discogs token={self.token}"}
            params = {
                "q": f"{artist_name} {album_name}",
                "type": "release"
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            results = data.get("results", [])
            return results[0] if results else None
            
        except Exception as e:
            logger.error(f"Discogs release search failed for user {self.user_id}: {e}")
            return None
    
    def get_artist_releases(self, artist_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get releases for an artist using Discogs ID"""
        if not self.token:
            return []
        
        try:
            url = f"https://api.discogs.com/artists/{artist_id}/releases"
            headers = {"Authorization": f"Discogs token={self.token}"}
            params = {"per_page": limit, "sort": "year", "sort_order": "desc"}
            
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("releases", [])
            
        except Exception as e:
            logger.error(f"Discogs releases request failed for user {self.user_id}: {e}")
            return []
    
    def get_artist_info(self, artist_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed artist information"""
        if not self.token:
            return None
        
        try:
            url = f"https://api.discogs.com/artists/{artist_id}"
            headers = {"Authorization": f"Discogs token={self.token}"}
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Discogs artist info request failed for user {self.user_id}: {e}")
            return None
    
    def search_master(self, query: str) -> Optional[List[Dict[str, Any]]]:
        """Search for master releases"""
        if not self.token:
            return None
        
        try:
            url = "https://api.discogs.com/database/search"
            headers = {"Authorization": f"Discogs token={self.token}"}
            params = {"q": query, "type": "master"}
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get("results", [])
            
        except Exception as e:
            logger.error(f"Discogs master search failed for user {self.user_id}: {e}")
            return None
    
    def get_release_info(self, release_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed release information"""
        if not self.token:
            return None
        
        try:
            url = f"https://api.discogs.com/releases/{release_id}"
            headers = {"Authorization": f"Discogs token={self.token}"}
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Discogs release info request failed for user {self.user_id}: {e}")
            return None

class UserAppleMusicService:
    """User-specific Apple Music service (search links only)"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def is_available(self) -> bool:
        """Apple Music is always available (search links only)"""
        return True
    
    def get_search_url(self, query: str, media_type: str = "all") -> str:
        """Generate Apple Music search URL"""
        encoded_query = query.replace(" ", "+")
        base_url = "https://music.apple.com/us/search"
        
        if media_type == "artist":
            return f"{base_url}?term={encoded_query}&entity=musicArtist"
        elif media_type == "album":
            return f"{base_url}?term={encoded_query}&entity=album"
        elif media_type == "song":
            return f"{base_url}?term={encoded_query}&entity=song"
        else:
            return f"{base_url}?term={encoded_query}"
    
    def get_artist_url(self, artist_name: str) -> str:
        """Get Apple Music search URL for an artist"""
        return self.get_search_url(artist_name, "artist")
    
    def get_album_url(self, artist_name: str, album_name: str) -> str:
        """Get Apple Music search URL for an album"""
        return self.get_search_url(f"{artist_name} {album_name}", "album")
    
    def get_track_url(self, artist_name: str, track_name: str) -> str:
        """Get Apple Music search URL for a track"""
        return self.get_search_url(f"{artist_name} {track_name}", "song")

class UserMusicBrainzService:
    """User-specific MusicBrainz service (always available, no auth required)"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.base_url = "https://musicbrainz.org/ws/2"
        self.headers = {
            'User-Agent': 'MixView/1.0 (https://github.com/mixview/mixview)',
            'Accept': 'application/json'
        }
    
    def is_available(self) -> bool:
        """MusicBrainz is always available"""
        return True
    
    def search_artist(self, artist_name: str, limit: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Search for artists in MusicBrainz"""
        try:
            url = f"{self.base_url}/artist"
            params = {
                'query': f'artist:"{artist_name}"',
                'fmt': 'json',
                'limit': limit
            }
            
            response = requests.get(url, params=params, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('artists', [])
            
        except Exception as e:
            logger.error(f"MusicBrainz artist search failed for user {self.user_id}: {e}")
            return None
    
    def search_release_group(self, album_name: str, artist_name: str = None, limit: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Search for release groups (albums) in MusicBrainz"""
        try:
            url = f"{self.base_url}/release-group"
            query = f'releasegroup:"{album_name}"'
            if artist_name:
                query += f' AND artist:"{artist_name}"'
            
            params = {
                'query': query,
                'fmt': 'json',
                'limit': limit
            }
            
            response = requests.get(url, params=params, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('release-groups', [])
            
        except Exception as e:
            logger.error(f"MusicBrainz release group search failed for user {self.user_id}: {e}")
            return None
    
    def search_recording(self, track_name: str, artist_name: str = None, limit: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Search for recordings (tracks) in MusicBrainz"""
        try:
            url = f"{self.base_url}/recording"
            query = f'recording:"{track_name}"'
            if artist_name:
                query += f' AND artist:"{artist_name}"'
            
            params = {
                'query': query,
                'fmt': 'json',
                'limit': limit
            }
            
            response = requests.get(url, params=params, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('recordings', [])
            
        except Exception as e:
            logger.error(f"MusicBrainz recording search failed for user {self.user_id}: {e}")
            return None
    
    def get_artist_info(self, artist_mbid: str) -> Optional[Dict[str, Any]]:
        """Get detailed artist information by MusicBrainz ID"""
        try:
            url = f"{self.base_url}/artist/{artist_mbid}"
            params = {
                'fmt': 'json',
                'inc': 'artist-rels+url-rels+release-groups'
            }
            
            response = requests.get(url, params=params, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"MusicBrainz artist info request failed for user {self.user_id}: {e}")
            return None

# Helper functions for service validation
def validate_spotify_credentials(client_id: str, client_secret: str) -> bool:
    """Validate Spotify app credentials"""
    try:
        token_url = "https://accounts.spotify.com/api/token"
        token_data = {
            'grant_type': 'client_credentials',
            'client_id': client_id,
            'client_secret': client_secret,
        }
        
        response = requests.post(token_url, data=token_data)
        return response.status_code == 200
        
    except Exception as e:
        logger.error(f"Spotify credential validation failed: {e}")
        return False

def validate_lastfm_api_key(api_key: str) -> bool:
    """Validate Last.fm API key"""
    try:
        url = "http://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "artist.getinfo",
            "artist": "Radiohead",
            "api_key": api_key,
            "format": "json"
        }
        
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return "error" not in data
        return False
        
    except Exception as e:
        logger.error(f"Last.fm API key validation failed: {e}")
        return False

def validate_discogs_token(token: str) -> bool:
    """Validate Discogs personal access token"""
    try:
        url = "https://api.discogs.com/database/search"
        headers = {"Authorization": f"Discogs token={token}"}
        params = {"q": "Beatles", "type": "artist"}
        
        response = requests.get(url, headers=headers, params=params, timeout=10)
        return response.status_code == 200
        
    except Exception as e:
        logger.error(f"Discogs token validation failed: {e}")
        return False

def get_service_instance(db: Session, user_id: int, service_name: str):
    """Factory function to get appropriate service instance"""
    service_map = {
        'spotify': UserSpotifyService,
        'lastfm': UserLastFMService,
        'discogs': UserDiscogsService,
        'apple_music': UserAppleMusicService,
        'musicbrainz': UserMusicBrainzService
    }
    
    service_class = service_map.get(service_name)
    if service_class:
        return service_class(db, user_id)
    else:
        logger.error(f"Unknown service: {service_name}")
        return None

def get_all_user_services(db: Session, user_id: int) -> Dict[str, Any]:
    """Get instances of all services for a user"""
    services = {}
    
    for service_name in ['spotify', 'lastfm', 'discogs', 'apple_music', 'musicbrainz']:
        try:
            service_instance = get_service_instance(db, user_id, service_name)
            if service_instance:
                services[service_name] = {
                    'instance': service_instance,
                    'available': service_instance.is_available(),
                    'name': service_name.title().replace('_', ' ')
                }
        except Exception as e:
            logger.error(f"Failed to initialize {service_name} service for user {user_id}: {e}")
            services[service_name] = {
                'instance': None,
                'available': False,
                'name': service_name.title().replace('_', ' '),
                'error': str(e)
            }
    
    return services

def test_all_services(db: Session, user_id: int) -> Dict[str, Dict[str, Any]]:
    """Test all services for a user"""
    services = get_all_user_services(db, user_id)
    test_results = {}
    
    for service_name, service_info in services.items():
        service_instance = service_info['instance']
        
        if not service_instance or not service_info['available']:
            test_results[service_name] = {
                'status': 'unavailable',
                'message': 'Service not configured or available',
                'test_successful': False
            }
            continue
        
        try:
            # Test each service with a simple search
            if service_name == 'spotify':
                result = service_instance.search_artist("Beatles")
                test_results[service_name] = {
                    'status': 'available',
                    'message': 'Service working' if result else 'Service connected but search failed',
                    'test_successful': result is not None
                }
                
            elif service_name == 'lastfm':
                result = service_instance.get_artist_info("Beatles")
                test_results[service_name] = {
                    'status': 'available',
                    'message': 'Service working' if result else 'Service connected but API call failed',
                    'test_successful': result is not None
                }
                
            elif service_name == 'discogs':
                result = service_instance.search_artist("Beatles")
                test_results[service_name] = {
                    'status': 'available',
                    'message': 'Service working' if result else 'Service connected but search failed',
                    'test_successful': result is not None
                }
                
            elif service_name == 'apple_music':
                # Apple Music always works (just generates URLs)
                result = service_instance.get_artist_url("Beatles")
                test_results[service_name] = {
                    'status': 'available',
                    'message': 'Service working',
                    'test_successful': bool(result)
                }
                
            elif service_name == 'musicbrainz':
                result = service_instance.search_artist("Beatles")
                test_results[service_name] = {
                    'status': 'available',
                    'message': 'Service working' if result else 'Service available but search failed',
                    'test_successful': result is not None
                }
                
        except Exception as e:
            test_results[service_name] = {
                'status': 'error',
                'message': f'Test failed: {str(e)}',
                'test_successful': False
            }
    
    return test_results
