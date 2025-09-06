# Location: mixview/backend/routes/setup.py
# Description: Setup wizard integration routes

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime
import logging

from db_package.database import get_db
from routes.auth import get_current_user
from db_package.models import User, SetupProgress, UserServiceCredential
from user_services import UserServiceManager
import os

logger = logging.getLogger(__name__)
router = APIRouter()

# Request/Response models
class SetupCompleteRequest(BaseModel):
    steps_completed: List[str] = []
    services_configured: Dict[str, bool] = {}

class SetupStatusResponse(BaseModel):
    requires_setup: bool
    user_setup_completed: bool
    global_setup_completed: bool
    services_configured: Dict[str, bool]
    reason: str

class ServiceConfigurationStatus(BaseModel):
    spotify_available: bool
    lastfm_configurable: bool
    discogs_configurable: bool
    youtube_configurable: bool
    total_available_services: int

@router.get("/status")
async def get_setup_status(
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check if the application or user requires initial setup.
    Can be called without authentication for global setup check.
    """
    try:
        # Check global service configuration
        spotify_configured = bool(
            os.getenv('SPOTIFY_CLIENT_ID') and 
            os.getenv('SPOTIFY_CLIENT_SECRET')
        )
        
        # If no user is logged in, check global setup only
        if not current_user:
            return {
                "requires_setup": not spotify_configured,
                "user_setup_completed": False,
                "global_setup_completed": spotify_configured,
                "services_configured": {
                    "spotify": spotify_configured,
                    "lastfm": False,
                    "discogs": False,
                    "youtube": False,
                    "apple_music": True,  # Always available
                    "musicbrainz": True   # Always available
                },
                "reason": "No user logged in - showing global setup status"
            }
        
        # Get user-specific setup progress
        setup_progress = db.query(SetupProgress).filter(
            SetupProgress.user_id == current_user.id
        ).first()
        
        # Get user's service configurations
        service_manager = UserServiceManager(db)
        user_services = service_manager.get_user_service_status(current_user.id)
        
        # Check if user has any configurable services set up
        configurable_services = ['spotify', 'lastfm', 'discogs', 'youtube']
        user_has_services = any(user_services.get(service, False) for service in configurable_services)
        
        # Determine if setup is required
        user_setup_completed = (
            setup_progress and setup_progress.is_completed
        ) or current_user.setup_completed
        
        # If user has no setup progress but has services configured, consider setup complete
        if not user_setup_completed and user_has_services:
            user_setup_completed = True
            # Create or update setup progress
            if not setup_progress:
                setup_progress = SetupProgress(
                    user_id=current_user.id,
                    is_completed=True,
                    completed_at=datetime.utcnow(),
                    services_configured=user_services
                )
                db.add(setup_progress)
            else:
                setup_progress.is_completed = True
                setup_progress.completed_at = datetime.utcnow()
                setup_progress.services_configured = user_services
            
            # Update user record
            current_user.setup_completed = True
            current_user.setup_completed_at = datetime.utcnow()
            db.commit()
        
        return {
            "requires_setup": not user_setup_completed,
            "user_setup_completed": user_setup_completed,
            "global_setup_completed": spotify_configured,
            "services_configured": {
                **user_services,
                "spotify_server_configured": spotify_configured
            },
            "reason": "Setup complete" if user_setup_completed else "User setup required"
        }
        
    except Exception as e:
        logger.error(f"Setup status check failed: {e}")
        return {
            "requires_setup": True,
            "user_setup_completed": False,
            "global_setup_completed": False,
            "services_configured": {},
            "reason": f"Error checking setup: {str(e)}"
        }

@router.post("/complete")
async def complete_setup(
    setup_data: SetupCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark initial setup as complete for the current user"""
    try:
        # Get or create setup progress
        setup_progress = db.query(SetupProgress).filter(
            SetupProgress.user_id == current_user.id
        ).first()
        
        if not setup_progress:
            setup_progress = SetupProgress(
                user_id=current_user.id,
                is_completed=True,
                completed_at=datetime.utcnow(),
                steps_completed=setup_data.steps_completed,
                services_configured=setup_data.services_configured
            )
            db.add(setup_progress)
        else:
            setup_progress.is_completed = True
            setup_progress.completed_at = datetime.utcnow()
            setup_progress.steps_completed = setup_data.steps_completed
            setup_progress.services_configured = setup_data.services_configured
        
        # Update user record
        current_user.setup_completed = True
        current_user.setup_completed_at = datetime.utcnow()
        
        db.commit()
        
        logger.info(f"Setup completed for user {current_user.username}")
        
        return {
            "message": "Setup completed successfully",
            "completed_at": setup_progress.completed_at,
            "steps_completed": setup_progress.steps_completed,
            "services_configured": setup_progress.services_configured
        }
        
    except Exception as e:
        logger.error(f"Setup completion failed for user {current_user.id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete setup"
        )

@router.get("/configuration")
async def get_service_configuration_info():
    """Get information about available service configurations"""
    return {
        "spotify": {
            "name": "Spotify",
            "type": "oauth",
            "server_configured": bool(
                os.getenv('SPOTIFY_CLIENT_ID') and 
                os.getenv('SPOTIFY_CLIENT_SECRET')
            ),
            "user_configurable": False,
            "description": "Connect your Spotify account for music library access"
        },
        "lastfm": {
            "name": "Last.fm",
            "type": "api_key",
            "server_configured": True,  # No server config needed
            "user_configurable": True,
            "description": "Rich music metadata and scrobbling data"
        },
        "discogs": {
            "name": "Discogs",
            "type": "token",
            "server_configured": True,  # No server config needed
            "user_configurable": True,
            "description": "Comprehensive music release database"
        },
        "youtube": {
            "name": "YouTube",
            "type": "api_key",
            "server_configured": True,  # No server config needed
            "user_configurable": True,
            "description": "YouTube music videos and data"
        },
        "apple_music": {
            "name": "Apple Music",
            "type": "built_in",
            "server_configured": True,
            "user_configurable": False,
            "description": "Search links to Apple Music (always available)"
        },
        "musicbrainz": {
            "name": "MusicBrainz",
            "type": "built_in",
            "server_configured": True,
            "user_configurable": False,
            "description": "Open music encyclopedia (always available)"
        }
    }

@router.get("/progress")
async def get_setup_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed setup progress for the current user"""
    try:
        setup_progress = db.query(SetupProgress).filter(
            SetupProgress.user_id == current_user.id
        ).first()
        
        if not setup_progress:
            return {
                "exists": False,
                "is_completed": False,
                "steps_completed": [],
                "services_configured": {},
                "created_at": None,
                "completed_at": None
            }
        
        return {
            "exists": True,
            "is_completed": setup_progress.is_completed,
            "steps_completed": setup_progress.steps_completed or [],
            "services_configured": setup_progress.services_configured or {},
            "created_at": setup_progress.created_at,
            "completed_at": setup_progress.completed_at
        }
        
    except Exception as e:
        logger.error(f"Failed to get setup progress for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve setup progress"
        )

@router.post("/reset")
async def reset_setup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reset setup progress for the current user (for testing/debugging)"""
    try:
        # Remove setup progress
        setup_progress = db.query(SetupProgress).filter(
            SetupProgress.user_id == current_user.id
        ).first()
        
        if setup_progress:
            db.delete(setup_progress)
        
        # Reset user setup status
        current_user.setup_completed = False
        current_user.setup_completed_at = None
        
        db.commit()
        
        logger.info(f"Setup reset for user {current_user.username}")
        
        return {
            "message": "Setup progress reset successfully",
            "user_id": current_user.id
        }
        
    except Exception as e:
        logger.error(f"Setup reset failed for user {current_user.id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset setup"
        )

@router.get("/health")
async def setup_health_check():
    """Health check for setup-related functionality"""
    try:
        # Check environment variables
        spotify_configured = bool(
            os.getenv('SPOTIFY_CLIENT_ID') and 
            os.getenv('SPOTIFY_CLIENT_SECRET')
        )
        
        database_configured = bool(os.getenv('DATABASE_URL'))
        
        return {
            "status": "healthy",
            "checks": {
                "spotify_oauth": "configured" if spotify_configured else "not_configured",
                "database": "configured" if database_configured else "not_configured",
                "setup_endpoints": "operational"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Setup health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }