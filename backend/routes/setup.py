# FILE: mixview/backend/routes/setup.py
# Setup wizard routes that integrate with your existing service management system

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List, Optional
import os
import logging
from pydantic import BaseModel

# Import your existing database and auth systems
from db_package.database import get_db
from db_package.models import User, SetupProgress, ServerConfiguration
from encryption import credential_encryption
from routes.auth import get_current_user

# Import your existing service management (if available)
try:
    from user_services import UserServiceManager
    HAS_USER_SERVICES = True
except ImportError:
    HAS_USER_SERVICES = False
    logging.warning("UserServiceManager not available - setup wizard will have limited functionality")

def encrypt_credential(value: str) -> str:
    """Encrypt a single credential value"""
    return credential_encryption.encrypt_credentials({'value': value})

def decrypt_credential(encrypted_value: str) -> str:
    """Decrypt a single credential value"""
    try:
        decrypted = credential_encryption.decrypt_credentials(encrypted_value)
        return decrypted.get('value', '')
    except:
        return ''

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/setup", tags=["setup"])

# Pydantic models
class SetupStatusResponse(BaseModel):
    setup_required: bool
    global_setup_complete: bool
    user_setup_complete: bool
    available_services: Dict[str, Any]
    configured_services: List[str]

class ServiceConfigRequest(BaseModel):
    service: str
    config: Dict[str, Any]

class SetupCompleteRequest(BaseModel):
    services_configured: List[str]

def get_service_configuration_info():
    """Get detailed service configuration information"""
    return {
        'spotify': {
            'name': 'Spotify',
            'description': 'Access your Spotify library and get personalized recommendations',
            'type': 'oauth',
            'requires_server_config': True,
            'configured': bool(os.getenv('SPOTIFY_CLIENT_ID') and os.getenv('SPOTIFY_CLIENT_SECRET')),
            'setup_steps': [
                {
                    'title': 'Create Spotify App',
                    'description': 'Register your application with Spotify',
                    'action_url': 'https://developer.spotify.com/dashboard/applications',
                    'instructions': [
                        'Go to Spotify Developer Dashboard',
                        'Click "Create App"',
                        'Fill in app details:',
                        '  - App name: MixView',
                        '  - App description: Music discovery application',
                        '  - Redirect URI: http://localhost:8001/oauth/spotify/callback',
                        'Accept terms and create app',
                        'Copy Client ID and Client Secret'
                    ]
                }
            ],
            'redirect_uri': f"{os.getenv('BACKEND_URL', 'http://localhost:8001')}/oauth/spotify/callback"
        },
        'lastfm': {
            'name': 'Last.fm',
            'description': 'Access rich music metadata and listening history',
            'type': 'api_key',
            'requires_server_config': False,
            'configured': False,  # Will be checked per-user
            'setup_steps': [
                {
                    'title': 'Create Last.fm API Account',
                    'description': 'Get your personal API key from Last.fm',
                    'action_url': 'https://www.last.fm/api/account/create',
                    'instructions': [
                        'Go to the Last.fm API account creation page',
                        'Fill out the form with your details',
                        'Copy your API key from the confirmation page'
                    ]
                }
            ]
        },
        'discogs': {
            'name': 'Discogs',
            'description': 'Access comprehensive music release database',
            'type': 'personal_token',
            'requires_server_config': False,
            'configured': False,  # Will be checked per-user
            'setup_steps': [
                {
                    'title': 'Generate Personal Access Token',
                    'description': 'Create a token for API access',
                    'action_url': 'https://www.discogs.com/settings/developers',
                    'instructions': [
                        'Go to your Discogs Developer Settings',
                        'Generate a new personal access token',
                        'Copy the generated token'
                    ]
                }
            ]
        },
        'apple_music': {
            'name': 'Apple Music',
            'description': 'Apple\'s music streaming service (search links only)',
            'type': 'built_in',
            'requires_server_config': False,
            'configured': True,
            'setup_steps': [
                {
                    'title': 'Ready to Use',
                    'description': 'Apple Music integration is built-in',
                    'instructions': ['No setup required!']
                }
            ]
        },
        'musicbrainz': {
            'name': 'MusicBrainz',
            'description': 'Open music encyclopedia',
            'type': 'built_in',
            'requires_server_config': False,
            'configured': True,
            'setup_steps': [
                {
                    'title': 'Ready to Use',
                    'description': 'MusicBrainz integration is built-in',
                    'instructions': ['No setup required!']
                }
            ]
        }
    }

def check_global_setup_complete():
    """Check if global server setup is complete"""
    required_vars = ['JWT_SECRET_KEY', 'CREDENTIAL_ENCRYPTION_KEY', 'DATABASE_URL']
    return all(os.getenv(var) for var in required_vars)

def get_configured_services():
    """Get list of globally configured services"""
    configured = ['apple_music', 'musicbrainz']  # Built-ins always available
    
    if os.getenv('SPOTIFY_CLIENT_ID') and os.getenv('SPOTIFY_CLIENT_SECRET'):
        configured.append('spotify')
    
    return configured

def check_user_service_status(user_id: int, db: Session) -> Dict[str, bool]:
    """Check which services the user has configured"""
    if not HAS_USER_SERVICES:
        return {}
    
    try:
        service_manager = UserServiceManager(db)
        return service_manager.get_user_service_status(user_id)
    except Exception as e:
        logger.error(f"Error checking user service status: {e}")
        return {}

@router.get("/status", response_model=SetupStatusResponse)
async def get_setup_status(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """Check setup status - works both authenticated and unauthenticated"""
    try:
        global_setup_complete = check_global_setup_complete()
        configured_services = get_configured_services()
        available_services = get_service_configuration_info()
        
        # Check user-specific setup if authenticated
        user_setup_complete = True
        if current_user:
            # Check if user has setup progress record
            user_progress = db.query(SetupProgress).filter(
                SetupProgress.user_id == current_user.id
            ).first()
            
            user_setup_complete = bool(user_progress and user_progress.setup_completed)
            
            # Update service status with user-specific info
            if HAS_USER_SERVICES:
                user_services = check_user_service_status(current_user.id, db)
                for service_name in available_services:
                    if service_name in user_services:
                        available_services[service_name]['user_configured'] = user_services[service_name]
        
        # Determine if setup is required
        setup_required = not global_setup_complete or (current_user and not user_setup_complete)
        
        return SetupStatusResponse(
            setup_required=setup_required,
            global_setup_complete=global_setup_complete,
            user_setup_complete=user_setup_complete,
            available_services=available_services,
            configured_services=configured_services
        )
        
    except Exception as e:
        logger.error(f"Error checking setup status: {e}")
        return SetupStatusResponse(
            setup_required=True,
            global_setup_complete=False,
            user_setup_complete=False,
            available_services=get_service_configuration_info(),
            configured_services=[]
        )

@router.get("/configuration")
async def get_setup_configuration():
    """Get detailed service configuration information"""
    return {
        "services": get_service_configuration_info(),
        "setup_flow": {
            "steps": [
                {"id": "welcome", "title": "Welcome to MixView"},
                {"id": "services", "title": "Configure Services"},
                {"id": "test", "title": "Test Connections"},
                {"id": "complete", "title": "Setup Complete"}
            ]
        }
    }

@router.post("/service-config")
async def save_service_configuration(
    request: ServiceConfigRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save service configuration using your existing service management"""
    try:
        if not HAS_USER_SERVICES:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Service management not available"
            )
        
        service = request.service.lower()
        config = request.config
        
        # Use your existing UserServiceManager
        service_manager = UserServiceManager(db)
        
        # Store credentials using your existing system
        success = False
        if service == "lastfm" and "api_key" in config:
            success = service_manager.store_user_credentials(
                current_user.id, "lastfm", {"api_key": config["api_key"]}, "api_key"
            )
        elif service == "discogs" and "token" in config:
            success = service_manager.store_user_credentials(
                current_user.id, "discogs", {"token": config["token"]}, "token"
            )
        
        if success:
            # Update setup progress
            progress = db.query(SetupProgress).filter(
                SetupProgress.user_id == current_user.id
            ).first()
            
            if not progress:
                progress = SetupProgress(user_id=current_user.id)
                db.add(progress)
            
            if not progress.configured_services:
                progress.configured_services = []
            
            if service not in progress.configured_services:
                progress.configured_services.append(service)
            
            db.commit()
            
            return {"success": True, "message": f"{service.title()} configuration saved"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to save {service} configuration"
            )
        
    except Exception as e:
        logger.error(f"Error saving service configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save {request.service} configuration"
        )

@router.get("/progress")
async def get_setup_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's setup progress"""
    progress = db.query(SetupProgress).filter(
        SetupProgress.user_id == current_user.id
    ).first()
    
    if not progress:
        return {
            "setup_completed": False,
            "configured_services": [],
            "current_step": "welcome",
            "completion_percentage": 0
        }
    
    configured_count = len(progress.configured_services or [])
    total_services = 4  # spotify, lastfm, discogs, youtube
    completion_percentage = min((configured_count / total_services) * 100, 100)
    
    return {
        "setup_completed": progress.setup_completed,
        "configured_services": progress.configured_services or [],
        "current_step": progress.current_step or "welcome",
        "completion_percentage": completion_percentage
    }

@router.post("/complete")
async def complete_setup(
    request: SetupCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark setup as complete for the user"""
    try:
        progress = db.query(SetupProgress).filter(
            SetupProgress.user_id == current_user.id
        ).first()
        
        if not progress:
            progress = SetupProgress(user_id=current_user.id)
            db.add(progress)
        
        progress.setup_completed = True
        progress.configured_services = request.services_configured
        progress.current_step = "complete"
        
        db.commit()
        
        logger.info(f"Setup completed for user {current_user.id}")
        
        return {
            "success": True,
            "message": "Setup completed successfully!",
            "configured_services": request.services_configured
        }
        
    except Exception as e:
        logger.error(f"Error completing setup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete setup"
        )

@router.post("/reset")
async def reset_setup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reset setup progress (useful for testing)"""
    try:
        progress = db.query(SetupProgress).filter(
            SetupProgress.user_id == current_user.id
        ).first()
        
        if progress:
            progress.setup_completed = False
            progress.configured_services = []
            progress.current_step = "welcome"
            db.commit()
        
        return {"success": True, "message": "Setup reset successfully"}
        
    except Exception as e:
        logger.error(f"Error resetting setup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset setup"
        )
    
@router.post("/server-config")
async def save_server_config(
    config_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save server configuration (OAuth credentials) through enhanced setup UI"""
    try:
        service_name = config_data.get('service_name')
        credentials = config_data.get('credentials', {})
        
        if not service_name or not credentials:
            raise HTTPException(status_code=400, detail="Service name and credentials required")
        
        logger.info(f"Saving server config for {service_name}")
        
        # Save each credential securely
        for key, value in credentials.items():
            if not value or not value.strip():
                continue
                
            # Check if configuration already exists
            existing_config = db.query(ServerConfiguration).filter(
                ServerConfiguration.service_name == service_name,
                ServerConfiguration.config_key == key
            ).first()
            
            if existing_config:
                # Update existing
                existing_config.config_value = encrypt_credential(value.strip())
                existing_config.updated_at = func.now()
                logger.info(f"Updated {service_name} {key}")
            else:
                # Create new
                new_config = ServerConfiguration(
                    service_name=service_name,
                    config_key=key,
                    config_value=encrypt_credential(value.strip())
                )
                db.add(new_config)
                logger.info(f"Created {service_name} {key}")
        
        db.commit()
        
        return {
            "success": True,
            "message": f"{service_name.title()} server configuration saved successfully"
        }
        
    except Exception as e:
        logger.error(f"Error saving server config: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save server configuration")

@router.delete("/server-config/{service_name}")
async def delete_server_config(
    service_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete server configuration for a service"""
    try:
        deleted_count = db.query(ServerConfiguration).filter(
            ServerConfiguration.service_name == service_name
        ).delete()
        
        db.commit()
        logger.info(f"Deleted {deleted_count} server configurations for {service_name}")
        
        return {
            "success": True,
            "message": f"Server configuration deleted for {service_name}",
            "deleted_count": deleted_count
        }
        
    except Exception as e:
        logger.error(f"Error deleting server config: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete server configuration")

@router.get("/server-config/{service_name}")
async def get_server_config_status(
    service_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if server configuration exists for a service - used by enhanced setup components"""
    try:
        configs = db.query(ServerConfiguration).filter(
            ServerConfiguration.service_name == service_name
        ).all()
        
        configured_keys = [config.config_key for config in configs]
        
        # Define required keys for each service
        required_keys = {
            'spotify': ['client_id', 'client_secret'],
            'lastfm': [],  # Last.fm doesn't need server config
            'discogs': [],  # Discogs doesn't need server config
            'youtube': []  # YouTube doesn't need server config
        }
        
        service_required = required_keys.get(service_name, [])
        is_configured = all(key in configured_keys for key in service_required)
        
        return {
            "service_name": service_name,
            "is_configured": is_configured,
            "configured_keys": configured_keys,
            "required_keys": service_required,
            "requires_server_config": len(service_required) > 0
        }
        
    except Exception as e:
        logger.error(f"Error checking server config: {e}")
        raise HTTPException(status_code=500, detail="Failed to check server configuration")

@router.get("/status/public")
async def get_public_setup_status(db: Session = Depends(get_db)):
    """Public setup status check - works without authentication"""
    try:
        global_setup_complete = check_global_setup_complete()
        configured_services = get_configured_services()
        available_services = get_service_configuration_info()
        
        # Check if any real services are configured (exclude built-ins)
        real_services_configured = len([s for s in configured_services if s not in ['apple_music', 'musicbrainz']]) > 0
        
        # Setup is required if either global setup incomplete OR no real services configured
        setup_required = not global_setup_complete or not real_services_configured
        
        return {
            "setup_required": setup_required,
            "global_setup_complete": global_setup_complete,
            "available_services": available_services,
            "configured_services": configured_services
        }
    except Exception as e:
        logger.error(f"Public setup status check failed: {e}")
        return {"setup_required": True, "error": str(e)}
    
def get_server_credential(service_name: str, credential_key: str, db: Session) -> str:
    """Get decrypted server credential from database for OAuth routes"""
    try:
        config = db.query(ServerConfiguration).filter(
            ServerConfiguration.service_name == service_name,
            ServerConfiguration.config_key == credential_key
        ).first()
        
        if config:
            return decrypt_credential(config.config_value)
        return None
        
    except Exception as e:
        logger.error(f"Error retrieving server credential: {e}")
        return None