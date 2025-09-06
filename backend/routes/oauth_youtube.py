# Location: mixview/backend/routes/oauth_youtube.py
# Description: YouTube-specific OAuth routes to add to the main oauth.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import logging

from db_package.database import get_db
from routes.auth import get_current_user
from db_package.models import User
from user_services import UserServiceManager
from youtube_service import validate_youtube_api_key, get_youtube_service_info

logger = logging.getLogger(__name__)
router = APIRouter()

class YouTubeCredentials(BaseModel):
    api_key: str

# Add these endpoints to your main oauth.py file:

@router.post("/youtube/credentials")
async def store_youtube_credentials(
    credentials: YouTubeCredentials,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Store YouTube Data API key for user"""
    try:
        service_manager = UserServiceManager(db)
        
        # Validate the API key first
        if not validate_youtube_api_key(credentials.api_key):
            raise HTTPException(
                status_code=400,
                detail="Invalid YouTube API key. Please check your key and try again."
            )
        
        # Store credentials
        success = service_manager.store_user_credentials(
            current_user.id,
            'youtube',
            {'api_key': credentials.api_key},
            'api_key'
        )
        
        if success:
            return {"message": "YouTube credentials stored successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to store credentials")
            
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"Error storing YouTube credentials: {e}")
        raise HTTPException(status_code=500, detail="Failed to store YouTube credentials")

@router.get("/youtube/help")
async def get_youtube_setup_help():
    """Get YouTube API setup instructions"""
    return get_youtube_service_info()

# Update the test endpoint in oauth.py to include YouTube:
def test_youtube_connection(current_user, db):
    """Test YouTube connection - add this to the existing test function"""
    from youtube_service import UserYouTubeService
    
    service = UserYouTubeService(db, current_user.id)
    if service.is_available():
        test_result = service.search_videos("music", max_results=1)
        return {
            "status": "connected",
            "test_successful": test_result is not None and len(test_result) > 0,
            "message": "YouTube connection working" if test_result else "YouTube connected but search failed"
        }
    else:
        return {
            "status": "not_connected",
            "test_successful": False,
            "message": "YouTube API key not found"
        }

# Update the services list in oauth.py to include YouTube:
SUPPORTED_SERVICES = ['spotify', 'lastfm', 'discogs', 'youtube']

# Add to get_available_services endpoint in oauth.py:
def get_youtube_service_config():
    return {
        'youtube': {
            'name': 'YouTube',
            'description': 'YouTube music videos and content',
            'auth_type': 'api_key',
            'requires_server_config': False,
            'user_configurable': True,
            'features': ['video_search', 'channel_search', 'playlist_access'],
            'status': 'available'
        }
    }