# Location: mixview/backend/routes/oauth.py
# Description: OAuth routes with fixed imports - COMPLETE VERSION

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any, Optional
import os
import logging
import requests

# Fixed imports using relative imports
from db_package import get_db
from routes.auth import get_current_user
from models import User
from user_services import (
    UserServiceManager, SpotifyOAuthManager, 
    UserSpotifyService, UserLastFMService, UserDiscogsService
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Request models
class ServiceCredentials(BaseModel):
    service_name: str
    credentials: Dict[str, Any]

class LastFMCredentials(BaseModel):
    api_key: str

class DiscogsCredentials(BaseModel):
    token: str

# Response models
class ServiceStatus(BaseModel):
    service_name: str
    is_connected: bool
    credential_type: Optional[str] = None
    connected_at: Optional[str] = None
    expires_at: Optional[str] = None

@router.get("/services/status")
async def get_user_services_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get status of all services for current user"""
    try:
        service_manager = UserServiceManager(db)
        status = service_manager.get_user_service_status(current_user.id)
        
        # Get detailed status for each service
        detailed_status = []
        for service_name, is_connected in status.items():
            service_info = {
                "service_name": service_name,
                "is_connected": is_connected,
                "credential_type": None,
                "connected_at": None,
                "expires_at": None
            }
            
            if is_connected and service_name not in ['apple_music', 'musicbrainz']:
                credentials = service_manager.get_user_credentials(current_user.id, service_name)
                if credentials:
                    # Don't expose actual credentials
                    service_info["credential_type"] = "oauth" if "access_token" in credentials else "api_key"
                    service_info["expires_at"] = credentials.get("expires_at")
            
            detailed_status.append(service_info)
        
        return {"services": detailed_status}
        
    except Exception as e:
        logger.error(f"Error getting service status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get service status")

# Spotify OAuth Flow
@router.get("/spotify/auth")
async def spotify_auth_start(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start Spotify OAuth flow"""
    try:
        client_id = os.getenv('SPOTIFY_CLIENT_ID')
        if not client_id:
            raise HTTPException(
                status_code=503, 
                detail="Spotify OAuth not configured on server"
            )
        
        redirect_uri = f"{os.getenv('BACKEND_URL', 'http://localhost:8001')}/oauth/spotify/callback"
        
        auth_url = SpotifyOAuthManager.get_spotify_auth_url(
            db, current_user.id, client_id, redirect_uri
        )
        
        return {"auth_url": auth_url}
        
    except Exception as e:
        logger.error(f"Spotify auth start failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start Spotify authorization")

@router.get("/spotify/callback")
async def spotify_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Handle Spotify OAuth callback"""
    if error:
        logger.warning(f"Spotify OAuth error: {error}")
        return RedirectResponse(
            url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3001')}?error=spotify_auth_failed"
        )
    
    try:
        client_id = os.getenv('SPOTIFY_CLIENT_ID')
        client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')
        
        if not client_id or not client_secret:
            raise HTTPException(
                status_code=503,
                detail="Spotify OAuth credentials not configured"
            )
        
        user_id = SpotifyOAuthManager.handle_oauth_callback(
            db, code, state, client_id, client_secret
        )
        
        if user_id:
            return RedirectResponse(
                url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3001')}?spotify_connected=true"
            )
        else:
            return RedirectResponse(
                url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3001')}?error=spotify_connection_failed"
            )
            
    except Exception as e:
        logger.error(f"Spotify callback failed: {e}")
        return RedirectResponse(
            url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3001')}?error=spotify_callback_error"
        )

# Manual credential input endpoints
@router.post("/lastfm/credentials")
async def store_lastfm_credentials(
    credentials: LastFMCredentials,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Store Last.fm API key for user"""
    try:
        service_manager = UserServiceManager(db)
        
        # Test the API key first
        test_url = "http://ws.audioscrobbler.com/2.0/"
        test_params = {
            "method": "artist.getinfo",
            "artist": "Radiohead",  # Test with known artist
            "api_key": credentials.api_key,
            "format": "json"
        }
        
        response = requests.get(test_url, params=test_params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if "error" in data:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid Last.fm API key: {data.get('message', 'Unknown error')}"
            )
        
        # Store credentials
        success = service_manager.store_user_credentials(
            current_user.id,
            'lastfm',
            {'api_key': credentials.api_key},
            'api_key'
        )
        
        if success:
            return {"message": "Last.fm credentials stored successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to store credentials")
            
    except requests.RequestException as e:
        logger.error(f"Last.fm API test failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to validate Last.fm API key")
    except Exception as e:
        logger.error(f"Error storing Last.fm credentials: {e}")
        raise HTTPException(status_code=500, detail="Failed to store Last.fm credentials")

@router.post("/discogs/credentials")
async def store_discogs_credentials(
    credentials: DiscogsCredentials,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Store Discogs token for user"""
    try:
        service_manager = UserServiceManager(db)
        
        # Test the token first
        test_url = "https://api.discogs.com/database/search"
        headers = {"Authorization": f"Discogs token={credentials.token}"}
        test_params = {"q": "Beatles", "type": "artist"}
        
        response = requests.get(test_url, headers=headers, params=test_params, timeout=10)
        response.raise_for_status()
        
        # Store credentials
        success = service_manager.store_user_credentials(
            current_user.id,
            'discogs',
            {'token': credentials.token},
            'token'
        )
        
        if success:
            return {"message": "Discogs credentials stored successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to store credentials")
            
    except requests.RequestException as e:
        logger.error(f"Discogs API test failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to validate Discogs token")
    except Exception as e:
        logger.error(f"Error storing Discogs credentials: {e}")
        raise HTTPException(status_code=500, detail="Failed to store Discogs credentials")

@router.delete("/services/{service_name}")
async def remove_service_credentials(
    service_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove credentials for a specific service"""
    valid_services = ['spotify', 'lastfm', 'discogs']
    
    if service_name not in valid_services:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid service name. Must be one of: {', '.join(valid_services)}"
        )
    
    try:
        service_manager = UserServiceManager(db)
        success = service_manager.remove_user_credentials(current_user.id, service_name)
        
        if success:
            return {"message": f"{service_name.title()} credentials removed successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to remove credentials")
            
    except Exception as e:
        logger.error(f"Error removing {service_name} credentials: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove {service_name} credentials")

@router.post("/services/test/{service_name}")
async def test_service_connection(
    service_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test connection to a specific service"""
    valid_services = ['spotify', 'lastfm', 'discogs']
    
    if service_name not in valid_services:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid service name. Must be one of: {', '.join(valid_services)}"
        )
    
    try:
        if service_name == 'spotify':
            service = UserSpotifyService(db, current_user.id)
            if service.is_available():
                test_result = service.search_artist("Beatles")
                return {
                    "service": service_name,
                    "status": "connected",
                    "test_successful": test_result is not None,
                    "message": "Spotify connection working" if test_result else "Spotify connected but search failed"
                }
        
        elif service_name == 'lastfm':
            service = UserLastFMService(db, current_user.id)
            if service.is_available():
                test_result = service.get_artist_info("Beatles")
                return {
                    "service": service_name,
                    "status": "connected",
                    "test_successful": test_result is not None,
                    "message": "Last.fm connection working" if test_result else "Last.fm connected but API call failed"
                }
        
        elif service_name == 'discogs':
            service = UserDiscogsService(db, current_user.id)
            if service.is_available():
                test_result = service.search_artist("Beatles")
                return {
                    "service": service_name,
                    "status": "connected", 
                    "test_successful": test_result is not None,
                    "message": "Discogs connection working" if test_result else "Discogs connected but search failed"
                }
        
        # Service not configured
        return {
            "service": service_name,
            "status": "not_connected",
            "test_successful": False,
            "message": f"{service_name.title()} credentials not found"
        }
        
    except Exception as e:
        logger.error(f"Error testing {service_name} connection: {e}")
        return {
            "service": service_name,
            "status": "error",
            "test_successful": False,
            "message": f"Error testing {service_name}: {str(e)}"
        }

@router.get("/services/help/{service_name}")
async def get_service_setup_help(service_name: str):
    """Get setup instructions for a specific service"""
    help_info = {
        'spotify': {
            'name': 'Spotify',
            'description': 'Connect to Spotify for music data and recommendations',
            'auth_type': 'oauth',
            'instructions': [
                '1. Click "Connect Spotify" to start OAuth flow',
                '2. Log in to your Spotify account',
                '3. Authorize MixView to access your data',
                '4. You will be redirected back automatically'
            ],
            'required_scopes': ['user-read-private', 'user-read-email', 'user-library-read', 'user-top-read'],
            'setup_url': 'https://developer.spotify.com/dashboard'
        },
        'lastfm': {
            'name': 'Last.fm',
            'description': 'Access rich music metadata and listening history',
            'auth_type': 'api_key',
            'instructions': [
                '1. Go to Last.fm API account creation page',
                '2. Create a new API account',
                '3. Copy your API key',
                '4. Paste it in the form below'
            ],
            'setup_url': 'https://www.last.fm/api/account/create'
        },
        'discogs': {
            'name': 'Discogs',
            'description': 'Access comprehensive music release database',
            'auth_type': 'token',
            'instructions': [
                '1. Go to Discogs developer settings',
                '2. Create a new personal access token',
                '3. Copy the token',
                '4. Paste it in the form below'
            ],
            'setup_url': 'https://www.discogs.com/settings/developers'
        }
    }
    
    if service_name not in help_info:
        raise HTTPException(status_code=404, detail="Service not found")
    
    return help_info[service_name]

# Additional endpoints for advanced OAuth management
@router.get("/services/refresh/{service_name}")
async def refresh_service_credentials(
    service_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Refresh OAuth tokens for a service (currently only supports Spotify)"""
    if service_name != 'spotify':
        raise HTTPException(
            status_code=400,
            detail="Token refresh currently only supported for Spotify"
        )
    
    try:
        service_manager = UserServiceManager(db)
        credentials = service_manager.get_user_credentials(current_user.id, service_name)
        
        if not credentials:
            raise HTTPException(
                status_code=404,
                detail=f"{service_name.title()} credentials not found"
            )
        
        if not credentials.get('refresh_token'):
            raise HTTPException(
                status_code=400,
                detail="No refresh token available. Please reconnect the service."
            )
        
        # TODO: Implement actual token refresh logic
        # This would require the OAuth client credentials
        logger.warning(f"Token refresh requested for {service_name} but not implemented")
        
        return {
            "message": f"{service_name.title()} token refresh not yet implemented",
            "recommendation": "Please disconnect and reconnect the service"
        }
        
    except Exception as e:
        logger.error(f"Error refreshing {service_name} credentials: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh {service_name} credentials"
        )

@router.get("/services/debug/{service_name}")
async def debug_service_credentials(
    service_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Debug endpoint to check service credential status (sanitized output)"""
    valid_services = ['spotify', 'lastfm', 'discogs']
    
    if service_name not in valid_services:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid service name. Must be one of: {', '.join(valid_services)}"
        )
    
    try:
        service_manager = UserServiceManager(db)
        credentials = service_manager.get_user_credentials(current_user.id, service_name)
        
        if not credentials:
            return {
                "service": service_name,
                "status": "not_configured",
                "has_credentials": False,
                "credential_keys": [],
                "expires_at": None
            }
        
        # Return sanitized credential info (no actual values)
        return {
            "service": service_name,
            "status": "configured",
            "has_credentials": True,
            "credential_keys": list(credentials.keys()),
            "expires_at": credentials.get("expires_at"),
            "credential_type": "oauth" if "access_token" in credentials else "api_key"
        }
        
    except Exception as e:
        logger.error(f"Error debugging {service_name} credentials: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to debug {service_name} credentials"
        )

# Batch operations
@router.post("/services/test/all")
async def test_all_service_connections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test connections to all configured services"""
    services = ['spotify', 'lastfm', 'discogs']
    results = {}
    
    for service_name in services:
        try:
            if service_name == 'spotify':
                service = UserSpotifyService(db, current_user.id)
                if service.is_available():
                    test_result = service.search_artist("Beatles")
                    results[service_name] = {
                        "status": "connected",
                        "test_successful": test_result is not None,
                        "message": "Working" if test_result else "Connected but search failed"
                    }
                else:
                    results[service_name] = {
                        "status": "not_connected",
                        "test_successful": False,
                        "message": "Not configured"
                    }
            
            elif service_name == 'lastfm':
                service = UserLastFMService(db, current_user.id)
                if service.is_available():
                    test_result = service.get_artist_info("Beatles")
                    results[service_name] = {
                        "status": "connected",
                        "test_successful": test_result is not None,
                        "message": "Working" if test_result else "Connected but API call failed"
                    }
                else:
                    results[service_name] = {
                        "status": "not_connected",
                        "test_successful": False,
                        "message": "Not configured"
                    }
            
            elif service_name == 'discogs':
                service = UserDiscogsService(db, current_user.id)
                if service.is_available():
                    test_result = service.search_artist("Beatles")
                    results[service_name] = {
                        "status": "connected",
                        "test_successful": test_result is not None,
                        "message": "Working" if test_result else "Connected but search failed"
                    }
                else:
                    results[service_name] = {
                        "status": "not_connected",
                        "test_successful": False,
                        "message": "Not configured"
                    }
                    
        except Exception as e:
            results[service_name] = {
                "status": "error",
                "test_successful": False,
                "message": f"Error: {str(e)}"
            }
    
    # Count successes
    successful_tests = sum(1 for result in results.values() if result["test_successful"])
    total_configured = sum(1 for result in results.values() if result["status"] in ["connected", "error"])
    
    return {
        "results": results,
        "summary": {
            "total_services": len(services),
            "configured_services": total_configured,
            "successful_tests": successful_tests,
            "all_working": successful_tests == total_configured and total_configured > 0
        }
    }

@router.delete("/services/all")
async def remove_all_service_credentials(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove all service credentials for the current user"""
    services = ['spotify', 'lastfm', 'discogs']
    results = {}
    
    try:
        service_manager = UserServiceManager(db)
        
        for service_name in services:
            try:
                success = service_manager.remove_user_credentials(current_user.id, service_name)
                results[service_name] = {
                    "removed": success,
                    "message": "Removed successfully" if success else "No credentials found"
                }
            except Exception as e:
                results[service_name] = {
                    "removed": False,
                    "message": f"Error: {str(e)}"
                }
        
        successful_removals = sum(1 for result in results.values() if result["removed"])
        
        return {
            "results": results,
            "summary": {
                "total_services": len(services),
                "removed_services": successful_removals,
                "message": f"Removed credentials for {successful_removals} services"
            }
        }
        
    except Exception as e:
        logger.error(f"Error removing all service credentials: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to remove service credentials"
        )

# Service management utilities
@router.get("/services/available")
async def get_available_services():
    """Get list of all available services and their configuration requirements"""
    services = {
        'spotify': {
            'name': 'Spotify',
            'description': 'Music streaming service with comprehensive API',
            'auth_type': 'oauth2',
            'requires_server_config': True,
            'user_configurable': False,
            'features': ['search', 'recommendations', 'user_library', 'playlists'],
            'status': 'available' if os.getenv('SPOTIFY_CLIENT_ID') else 'server_config_required'
        },
        'lastfm': {
            'name': 'Last.fm',
            'description': 'Music database and scrobbling service',
            'auth_type': 'api_key',
            'requires_server_config': False,
            'user_configurable': True,
            'features': ['artist_info', 'album_info', 'track_info', 'similar_artists'],
            'status': 'available'
        },
        'discogs': {
            'name': 'Discogs',
            'description': 'Music database and marketplace',
            'auth_type': 'token',
            'requires_server_config': False,
            'user_configurable': True,
            'features': ['artist_info', 'release_info', 'marketplace_data'],
            'status': 'available'
        },
        'apple_music': {
            'name': 'Apple Music',
            'description': 'Apple\'s music streaming service (search links only)',
            'auth_type': 'none',
            'requires_server_config': False,
            'user_configurable': False,
            'features': ['search_links'],
            'status': 'available'
        },
        'musicbrainz': {
            'name': 'MusicBrainz',
            'description': 'Open music encyclopedia',
            'auth_type': 'none',
            'requires_server_config': False,
            'user_configurable': False,
            'features': ['metadata', 'relationships'],
            'status': 'available'
        }
    }
    
    return {
        "services": services,
        "summary": {
            "total_services": len(services),
            "oauth_services": len([s for s in services.values() if s['auth_type'] == 'oauth2']),
            "user_configurable": len([s for s in services.values() if s['user_configurable']]),
            "always_available": len([s for s in services.values() if s['auth_type'] == 'none'])
        }
    }

@router.get("/services/configuration")
async def get_service_configuration_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed configuration status for all services"""
    try:
        service_manager = UserServiceManager(db)
        user_status = service_manager.get_user_service_status(current_user.id)
        
        # Server-side configuration check
        server_config = {
            'spotify_configured': bool(os.getenv('SPOTIFY_CLIENT_ID') and os.getenv('SPOTIFY_CLIENT_SECRET')),
            'backend_url': os.getenv('BACKEND_URL', 'http://localhost:8001'),
            'frontend_url': os.getenv('FRONTEND_URL', 'http://localhost:3001'),
        }
        
        # Combine user and server status
        detailed_status = {}
        for service_name, is_user_connected in user_status.items():
            detailed_status[service_name] = {
                'user_connected': is_user_connected,
                'server_configured': True,  # Default for most services
                'available': True,
                'requires_action': False,
                'action_type': None
            }
            
            # Special handling for Spotify
            if service_name == 'spotify':
                detailed_status[service_name]['server_configured'] = server_config['spotify_configured']
                detailed_status[service_name]['available'] = server_config['spotify_configured']
                if not server_config['spotify_configured']:
                    detailed_status[service_name]['requires_action'] = True
                    detailed_status[service_name]['action_type'] = 'server_config'
                elif not is_user_connected:
                    detailed_status[service_name]['requires_action'] = True
                    detailed_status[service_name]['action_type'] = 'user_oauth'
            
            # Special handling for user-configurable services
            elif service_name in ['lastfm', 'discogs']:
                if not is_user_connected:
                    detailed_status[service_name]['requires_action'] = True
                    detailed_status[service_name]['action_type'] = 'user_credentials'
        
        return {
            'user_services': detailed_status,
            'server_config': server_config,
            'summary': {
                'total_services': len(user_status),
                'user_connected': sum(user_status.values()),
                'server_ready': server_config['spotify_configured'],
                'fully_configured': sum(1 for status in detailed_status.values() 
                                      if status['user_connected'] and status['server_configured'])
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting service configuration: {e}")
        raise HTTPException(status_code=500, detail="Failed to get service configuration")

# Health check endpoint for OAuth services
@router.get("/health")
async def oauth_health_check():
    """Health check for OAuth service functionality"""
    health_status = {
        'oauth_system': 'operational',
        'spotify_oauth': 'available' if os.getenv('SPOTIFY_CLIENT_ID') else 'not_configured',
        'credential_storage': 'operational',
        'encryption': 'operational'
    }
    
    # Test encryption system
    try:
        from ..encryption import credential_encryption
        test_data = {'test': 'value'}
        encrypted = credential_encryption.encrypt_credentials(test_data)
        decrypted = credential_encryption.decrypt_credentials(encrypted)
        if decrypted != test_data:
            health_status['encryption'] = 'error'
    except Exception as e:
        logger.error(f"Encryption health check failed: {e}")
        health_status['encryption'] = 'error'
    
    overall_status = 'healthy' if all(
        status in ['operational', 'available'] 
        for status in health_status.values()
    ) else 'degraded'
    
    return {
        'status': overall_status,
        'components': health_status,
        'timestamp': datetime.utcnow().isoformat()
    }

# Import datetime for health check
from datetime import datetime
