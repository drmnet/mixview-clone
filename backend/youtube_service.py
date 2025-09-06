# Location: mixview/backend/youtube_service.py
# Description: YouTube Data API service for MixView

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
import requests
import logging
import os

from user_services import UserServiceManager

logger = logging.getLogger(__name__)

class UserYouTubeService:
    """User-specific YouTube service using YouTube Data API"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.service_manager = UserServiceManager(db)
        self.api_key = None
        self.base_url = "https://www.googleapis.com/youtube/v3"
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize YouTube client with user's API key"""
        credentials = self.service_manager.get_user_credentials(self.user_id, 'youtube')
        
        if credentials:
            self.api_key = credentials.get('api_key')
    
    def is_available(self) -> bool:
        """Check if YouTube service is available for this user"""
        return self.api_key is not None
    
    def search_videos(self, query: str, max_results: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Search for music videos on YouTube"""
        if not self.api_key:
            return None
        
        try:
            url = f"{self.base_url}/search"
            params = {
                'part': 'snippet',
                'q': query,
                'type': 'video',
                'videoCategoryId': '10',  # Music category
                'maxResults': max_results,
                'key': self.api_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('items', [])
            
        except Exception as e:
            logger.error(f"YouTube search failed for user {self.user_id}: {e}")
            return None
    
    def search_artist_videos(self, artist_name: str, max_results: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Search for videos by a specific artist"""
        if not self.api_key:
            return None
        
        try:
            # Search for the artist's channel first
            channel_query = f"{artist_name} official"
            url = f"{self.base_url}/search"
            params = {
                'part': 'snippet',
                'q': channel_query,
                'type': 'channel',
                'maxResults': 5,
                'key': self.api_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            channels = response.json().get('items', [])
            
            # If we found channels, search for videos from the most relevant one
            if channels:
                channel_id = channels[0]['id']['channelId']
                return self.get_channel_videos(channel_id, max_results)
            else:
                # Fallback to regular search
                return self.search_videos(f"{artist_name} music", max_results)
                
        except Exception as e:
            logger.error(f"YouTube artist search failed for user {self.user_id}: {e}")
            return None
    
    def get_channel_videos(self, channel_id: str, max_results: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Get videos from a specific channel"""
        if not self.api_key:
            return None
        
        try:
            url = f"{self.base_url}/search"
            params = {
                'part': 'snippet',
                'channelId': channel_id,
                'type': 'video',
                'order': 'relevance',
                'maxResults': max_results,
                'key': self.api_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('items', [])
            
        except Exception as e:
            logger.error(f"YouTube channel videos request failed for user {self.user_id}: {e}")
            return None
    
    def get_video_details(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a specific video"""
        if not self.api_key:
            return None
        
        try:
            url = f"{self.base_url}/videos"
            params = {
                'part': 'snippet,statistics,contentDetails',
                'id': video_id,
                'key': self.api_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            items = data.get('items', [])
            return items[0] if items else None
            
        except Exception as e:
            logger.error(f"YouTube video details request failed for user {self.user_id}: {e}")
            return None
    
    def search_music_by_artist_and_track(self, artist_name: str, track_name: str) -> Optional[Dict[str, Any]]:
        """Search for a specific track by artist and song name"""
        if not self.api_key:
            return None
        
        try:
            query = f"{artist_name} {track_name} official"
            videos = self.search_videos(query, max_results=5)
            
            if videos:
                # Return the first (most relevant) result
                video = videos[0]
                video_id = video['id']['videoId']
                
                # Get additional details
                details = self.get_video_details(video_id)
                
                return {
                    'video_id': video_id,
                    'title': video['snippet']['title'],
                    'description': video['snippet']['description'],
                    'thumbnail': video['snippet']['thumbnails']['medium']['url'],
                    'channel_title': video['snippet']['channelTitle'],
                    'published_at': video['snippet']['publishedAt'],
                    'url': f"https://www.youtube.com/watch?v={video_id}",
                    'details': details
                }
            
            return None
            
        except Exception as e:
            logger.error(f"YouTube track search failed for user {self.user_id}: {e}")
            return None
    
    def get_playlist_videos(self, playlist_id: str, max_results: int = 50) -> Optional[List[Dict[str, Any]]]:
        """Get videos from a playlist"""
        if not self.api_key:
            return None
        
        try:
            url = f"{self.base_url}/playlistItems"
            params = {
                'part': 'snippet',
                'playlistId': playlist_id,
                'maxResults': max_results,
                'key': self.api_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('items', [])
            
        except Exception as e:
            logger.error(f"YouTube playlist request failed for user {self.user_id}: {e}")
            return None
    
    def search_playlists(self, query: str, max_results: int = 10) -> Optional[List[Dict[str, Any]]]:
        """Search for playlists"""
        if not self.api_key:
            return None
        
        try:
            url = f"{self.base_url}/search"
            params = {
                'part': 'snippet',
                'q': query,
                'type': 'playlist',
                'maxResults': max_results,
                'key': self.api_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('items', [])
            
        except Exception as e:
            logger.error(f"YouTube playlist search failed for user {self.user_id}: {e}")
            return None

# Helper functions for YouTube service validation
def validate_youtube_api_key(api_key: str) -> bool:
    """Validate YouTube Data API key"""
    try:
        url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            'part': 'snippet',
            'q': 'test',
            'type': 'video',
            'maxResults': 1,
            'key': api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        return response.status_code == 200
        
    except Exception as e:
        logger.error(f"YouTube API key validation failed: {e}")
        return False

def get_youtube_service_info() -> Dict[str, Any]:
    """Get information about YouTube service setup"""
    return {
        'name': 'YouTube',
        'description': 'Access music videos and YouTube content',
        'auth_type': 'api_key',
        'setup_instructions': [
            '1. Go to Google Cloud Console (https://console.cloud.google.com/)',
            '2. Create a new project or select an existing one',
            '3. Enable the YouTube Data API v3',
            '4. Create credentials (API key)',
            '5. Restrict the API key to YouTube Data API v3',
            '6. Copy the API key and paste it below'
        ],
        'setup_url': 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
        'required_permissions': [
            'YouTube Data API v3 access',
            'Search videos, channels, and playlists',
            'Get video details and statistics'
        ],
        'quota_info': {
            'daily_quota': 10000,
            'search_cost': 100,
            'video_details_cost': 1,
            'note': 'Be mindful of quota usage with heavy searching'
        }
    }