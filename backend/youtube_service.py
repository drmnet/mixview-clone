# Location: mixview/backend/youtube_service.py
# YouTube Data API v3 integration for music video search

import os
import logging
import requests
from typing import Dict, List, Optional, Any
from urllib.parse import quote

logger = logging.getLogger(__name__)

class YouTubeService:
    """Service for interacting with YouTube Data API v3"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('YOUTUBE_API_KEY')
        self.base_url = "https://www.googleapis.com/youtube/v3"
        
    def test_connection(self) -> Dict[str, Any]:
        """Test if the YouTube API key is valid"""
        if not self.api_key:
            return {
                "success": False,
                "error": "No API key provided",
                "details": "YouTube API key is required"
            }
        
        try:
            # Test with a simple search query
            response = requests.get(
                f"{self.base_url}/search",
                params={
                    "part": "snippet",
                    "q": "test",
                    "type": "video",
                    "maxResults": 1,
                    "key": self.api_key
                },
                timeout=10
            )
            
            if response.status_code == 200:
                return {
                    "success": True,
                    "message": "YouTube API connection successful",
                    "quota_used": 100  # Search costs 100 quota units
                }
            elif response.status_code == 403:
                error_data = response.json()
                error_reason = error_data.get('error', {}).get('errors', [{}])[0].get('reason', 'unknown')
                
                if error_reason == 'quotaExceeded':
                    return {
                        "success": False,
                        "error": "Quota exceeded",
                        "details": "Daily quota limit reached. Try again tomorrow."
                    }
                elif error_reason == 'keyInvalid':
                    return {
                        "success": False,
                        "error": "Invalid API key",
                        "details": "The provided YouTube API key is invalid"
                    }
                else:
                    return {
                        "success": False,
                        "error": "Access forbidden",
                        "details": f"YouTube API error: {error_reason}"
                    }
            elif response.status_code == 400:
                return {
                    "success": False,
                    "error": "Bad request",
                    "details": "Invalid API request format"
                }
            else:
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}",
                    "details": "Unexpected response from YouTube API"
                }
                
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Connection timeout",
                "details": "Request to YouTube API timed out"
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "error": "Connection error",
                "details": "Could not connect to YouTube API"
            }
        except Exception as e:
            logger.error(f"Unexpected error testing YouTube connection: {e}")
            return {
                "success": False,
                "error": "Unexpected error",
                "details": str(e)
            }
    
    def search_music_videos(
        self,
        query: str,
        max_results: int = 10,
        order: str = "relevance"
    ) -> Dict[str, Any]:
        """
        Search for music videos on YouTube
        
        Args:
            query: Search query (artist + song name recommended)
            max_results: Number of results to return (1-50)
            order: Sort order (relevance, date, rating, viewCount, title)
        """
        if not self.api_key:
            return {
                "success": False,
                "error": "No API key configured",
                "videos": []
            }
        
        try:
            # Add music-specific terms to improve results
            music_query = f"{query} music video"
            
            response = requests.get(
                f"{self.base_url}/search",
                params={
                    "part": "snippet",
                    "q": music_query,
                    "type": "video",
                    "videoCategoryId": "10",  # Music category
                    "maxResults": min(max_results, 50),
                    "order": order,
                    "key": self.api_key
                },
                timeout=15
            )
            
            if response.status_code == 200:
                data = response.json()
                videos = []
                
                for item in data.get('items', []):
                    video = {
                        "id": item['id']['videoId'],
                        "title": item['snippet']['title'],
                        "description": item['snippet']['description'][:200] + "..." if len(item['snippet']['description']) > 200 else item['snippet']['description'],
                        "channel": item['snippet']['channelTitle'],
                        "published_at": item['snippet']['publishedAt'],
                        "thumbnail": {
                            "default": item['snippet']['thumbnails']['default']['url'],
                            "medium": item['snippet']['thumbnails'].get('medium', {}).get('url'),
                            "high": item['snippet']['thumbnails'].get('high', {}).get('url')
                        },
                        "url": f"https://www.youtube.com/watch?v={item['id']['videoId']}",
                        "embed_url": f"https://www.youtube.com/embed/{item['id']['videoId']}"
                    }
                    videos.append(video)
                
                return {
                    "success": True,
                    "query": query,
                    "total_results": data.get('pageInfo', {}).get('totalResults', 0),
                    "videos": videos,
                    "quota_used": 100  # Search costs 100 quota units
                }
            else:
                error_response = response.json() if response.content else {}
                return {
                    "success": False,
                    "error": f"YouTube API error: {response.status_code}",
                    "details": error_response.get('error', {}).get('message', 'Unknown error'),
                    "videos": []
                }
                
        except Exception as e:
            logger.error(f"Error searching YouTube videos: {e}")
            return {
                "success": False,
                "error": "Search failed",
                "details": str(e),
                "videos": []
            }
    
    def get_video_details(self, video_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific video"""
        if not self.api_key:
            return {
                "success": False,
                "error": "No API key configured"
            }
        
        try:
            response = requests.get(
                f"{self.base_url}/videos",
                params={
                    "part": "snippet,statistics,contentDetails",
                    "id": video_id,
                    "key": self.api_key
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                items = data.get('items', [])
                
                if not items:
                    return {
                        "success": False,
                        "error": "Video not found"
                    }
                
                item = items[0]
                snippet = item['snippet']
                statistics = item.get('statistics', {})
                content_details = item.get('contentDetails', {})
                
                return {
                    "success": True,
                    "video": {
                        "id": video_id,
                        "title": snippet['title'],
                        "description": snippet['description'],
                        "channel": snippet['channelTitle'],
                        "published_at": snippet['publishedAt'],
                        "duration": content_details.get('duration'),
                        "view_count": statistics.get('viewCount'),
                        "like_count": statistics.get('likeCount'),
                        "comment_count": statistics.get('commentCount'),
                        "thumbnail": snippet['thumbnails'].get('maxres', snippet['thumbnails']['high']),
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                        "embed_url": f"https://www.youtube.com/embed/{video_id}"
                    },
                    "quota_used": 1  # Video details costs 1 quota unit
                }
            else:
                return {
                    "success": False,
                    "error": f"API error: {response.status_code}"
                }
                
        except Exception as e:
            logger.error(f"Error getting video details: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def search_artist_videos(
        self,
        artist_name: str,
        max_results: int = 20
    ) -> Dict[str, Any]:
        """Search for music videos by a specific artist"""
        # Search for official artist channel first
        query = f"{artist_name} official music video"
        return self.search_music_videos(query, max_results, "relevance")
    
    def get_music_video_url(self, artist: str, song: str) -> Optional[str]:
        """Get the best matching YouTube URL for a specific song"""
        query = f"{artist} {song}"
        result = self.search_music_videos(query, max_results=1)
        
        if result.get("success") and result.get("videos"):
            return result["videos"][0]["url"]
        return None
    
    @staticmethod
    def get_setup_instructions() -> Dict[str, Any]:
        """Get detailed setup instructions for YouTube API"""
        return {
            "service": "YouTube Data API v3",
            "steps": [
                {
                    "title": "Create Google Cloud Project",
                    "description": "Set up a Google Cloud project",
                    "instructions": [
                        "Go to Google Cloud Console (https://console.cloud.google.com/)",
                        "Create a new project or select an existing one",
                        "Note your project name/ID"
                    ]
                },
                {
                    "title": "Enable YouTube Data API",
                    "description": "Activate the YouTube Data API v3",
                    "instructions": [
                        "In the Google Cloud Console, go to 'APIs & Services' > 'Library'",
                        "Search for 'YouTube Data API v3'",
                        "Click on it and press 'Enable'"
                    ]
                },
                {
                    "title": "Create API Key",
                    "description": "Generate an API key for authentication",
                    "instructions": [
                        "Go to 'APIs & Services' > 'Credentials'",
                        "Click 'Create Credentials' > 'API Key'",
                        "Copy the generated API key",
                        "Optionally: Click 'Restrict Key' to limit to YouTube Data API only"
                    ]
                }
            ],
            "important_notes": [
                "Free tier includes 10,000 quota units per day",
                "Each search request costs 100 quota units",
                "Video details requests cost 1 quota unit each",
                "Quota resets daily at midnight Pacific Time"
            ],
            "testing": {
                "description": "Test your API key with MixView",
                "instructions": [
                    "Enter your API key in the setup wizard",
                    "Click 'Test Connection' to verify it works",
                    "If successful, you can search for music videos"
                ]
            }
        }