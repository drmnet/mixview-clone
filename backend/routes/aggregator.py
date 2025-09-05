# Location: mixview/backend/routes/aggregator.py
# Description: Aggregator routes with fixed imports

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
import logging
import sys
import os

# Add parent directory to path for imports
# (If you need to add the parent directory, use sys.path.append or similar here)

# Now import from parent directory
from db_package.database import get_db
from auth import get_current_user
from db_package.models import User, Artist, Album, Track
from aggregator import AggregationService

logger = logging.getLogger(__name__)
router = APIRouter()

# Serialization functions
def serialize_artist(artist: Artist) -> dict:
    return {
        "id": artist.id,
        "name": artist.name,
        "image_url": artist.image_url,
        "spotify_id": artist.spotify_id,
        "lastfm_id": artist.lastfm_id,
        "discogs_id": artist.discogs_id,
        "description": artist.description,
        "apple_link": f"https://music.apple.com/us/search?term={artist.name.replace(' ', '+')}"
    }

def serialize_album(album: Album) -> dict:
    return {
        "id": album.id,
        "title": album.title,
        "release_year": album.release_year,
        "image_url": album.image_url,
        "spotify_id": album.spotify_id,
        "lastfm_id": album.lastfm_id,
        "discogs_id": album.discogs_id,
        "artist": serialize_artist(album.artist) if album.artist else None,
        "apple_link": f"https://music.apple.com/us/search?term={album.artist.name if album.artist else ''} {album.title}".replace(' ', '+')
    }

def serialize_track(track: Track) -> dict:
    return {
        "id": track.id,
        "title": track.title,
        "duration_seconds": track.duration_seconds,
        "spotify_id": track.spotify_id,
        "lastfm_id": track.lastfm_id,
        "discogs_id": track.discogs_id,
        "apple_music_url": track.apple_music_url,
        "artist": serialize_artist(track.artist) if track.artist else None,
        "album": {"id": track.album.id, "title": track.album.title} if track.album else None,
        "apple_link": f"https://music.apple.com/us/search?term={track.artist.name if track.artist else ''} {track.title}".replace(' ', '+')
    }

@router.get("/related")
async def get_related_content(
    artist_name: Optional[str] = Query(None),
    album_title: Optional[str] = Query(None),
    track_title: Optional[str] = Query(None),
    top_n: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get related artists, albums, and tracks using user's configured services"""
    if not any([artist_name, album_title, track_title]):
        raise HTTPException(
            status_code=400,
            detail="At least one of artist_name, album_title, or track_title must be provided"
        )
    
    try:
        # Use user-specific aggregation service
        aggregation_service = AggregationService(db, current_user.id)
        
        # Check available services
        available_services = aggregation_service.get_available_services()
        if not available_services:
            raise HTTPException(
                status_code=400,
                detail="No music services configured. Please configure at least one service in settings."
            )
        
        # Get related content
        related_artists = []
        related_albums = []
        related_tracks = []
        
        if artist_name:
            artists = aggregation_service.get_related_artists(artist_name, top_n=top_n)
            related_artists = [serialize_artist(artist) for artist in artists]
        
        if album_title:
            albums = aggregation_service.get_related_albums(album_title, artist_name=artist_name, top_n=top_n)
            related_albums = [serialize_album(album) for album in albums]
        
        if track_title:
            tracks = aggregation_service.get_related_tracks(track_title, artist_name=artist_name, top_n=top_n)
            related_tracks = [serialize_track(track) for track in tracks]
        
        logger.info(f"Retrieved related content for user {current_user.username} using services: {available_services}")
        
        return {
            "artists": related_artists,
            "albums": related_albums,
            "tracks": related_tracks,
            "query": {
                "artist_name": artist_name,
                "album_title": album_title,
                "track_title": track_title
            },
            "available_services": available_services,
            "user_id": current_user.id
        }
        
    except Exception as e:
        logger.error(f"Error getting related content: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve related content"
        )

@router.get("/combined")
async def get_combined_nodes(
    artist_name: Optional[str] = Query(None),
    album_title: Optional[str] = Query(None),
    track_title: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get combined nodes for graph visualization using user's services"""
    try:
        aggregation_service = AggregationService(db, current_user.id)
        
        # Check available services
        available_services = aggregation_service.get_available_services()
        if not available_services:
            return {
                "artists": [],
                "albums": [],
                "tracks": [],
                "message": "No music services configured. Please set up your services in the settings.",
                "available_services": []
            }
        
        nodes = aggregation_service.get_combined_nodes(
            artist_name=artist_name,
            album_title=album_title,
            track_title=track_title
        )
        
        # Serialize the nodes
        serialized_nodes = {
            "artists": [serialize_artist(artist) for artist in nodes["artists"]],
            "albums": [serialize_album(album) for album in nodes["albums"]],
            "tracks": [serialize_track(track) for track in nodes["tracks"]],
            "available_services": available_services
        }
        
        logger.info(f"Retrieved combined nodes for user {current_user.username} using services: {available_services}")
        return serialized_nodes
        
    except Exception as e:
        logger.error(f"Error getting combined nodes: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve combined nodes"
        )

@router.get("/services/status")
async def get_user_services_for_aggregation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's service status for aggregation"""
    try:
        aggregation_service = AggregationService(db, current_user.id)
        available_services = aggregation_service.get_available_services()
        
        return {
            "available_services": available_services,
            "total_services": len(available_services),
            "recommendations": {
                "spotify": "spotify" in available_services,
                "lastfm": "lastfm" in available_services,
                "discogs": "discogs" in available_services,
                "apple_music": True  # Always available
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting service status: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get service status"
        )

@router.get("/artist/{artist_id}")
async def get_artist_details(
    artist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific artist"""
    artist = db.query(Artist).filter(Artist.id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    # Get related artists using user's services
    aggregation_service = AggregationService(db, current_user.id)
    related_artists = aggregation_service.get_related_artists(artist.name, top_n=10)
    
    return {
        "artist": serialize_artist(artist),
        "albums": [serialize_album(album) for album in artist.albums],
        "tracks": [serialize_track(track) for track in artist.tracks],
        "related_artists": [serialize_artist(ra) for ra in related_artists],
        "available_services": aggregation_service.get_available_services()
    }

@router.get("/album/{album_id}")
async def get_album_details(
    album_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific album"""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    
    # Get related albums using user's services
    aggregation_service = AggregationService(db, current_user.id)
    related_albums = aggregation_service.get_related_albums(
        album.title, artist_name=album.artist.name if album.artist else None, top_n=10
    )
    
    return {
        "album": serialize_album(album),
        "tracks": [serialize_track(track) for track in album.tracks],
        "related_albums": [serialize_album(ra) for ra in related_albums],
        "available_services": aggregation_service.get_available_services()
    }

@router.get("/track/{track_id}")
async def get_track_details(
    track_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific track"""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    
    # Get related tracks using user's services
    aggregation_service = AggregationService(db, current_user.id)
    related_tracks = aggregation_service.get_related_tracks(
        track.title, artist_name=track.artist.name if track.artist else None, top_n=10
    )
    
    return {
        "track": serialize_track(track),
        "related_tracks": [serialize_track(rt) for rt in related_tracks],
        "available_services": aggregation_service.get_available_services()
    }

@router.post("/refresh/{entity_type}/{entity_id}")
async def refresh_relationships(
    entity_type: str,
    entity_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Force refresh of relationships for a specific entity"""
    if entity_type not in ["artist", "album", "track"]:
        raise HTTPException(
            status_code=400,
            detail="entity_type must be one of: artist, album, track"
        )
    
    try:
        aggregation_service = AggregationService(db, current_user.id)
        
        if entity_type == "artist":
            artist = db.query(Artist).filter(Artist.id == entity_id).first()
            if not artist:
                raise HTTPException(status_code=404, detail="Artist not found")
            
            # Clear existing relationships and recompute
            artist.related_artists.clear()
            db.commit()
            
            related = aggregation_service.get_related_artists(artist.name, top_n=20)
            
        elif entity_type == "album":
            album = db.query(Album).filter(Album.id == entity_id).first()
            if not album:
                raise HTTPException(status_code=404, detail="Album not found")
            
            # Clear existing relationships and recompute
            album.related_albums.clear()
            db.commit()
            
            related = aggregation_service.get_related_albums(
                album.title, artist_name=album.artist.name if album.artist else None, top_n=20
            )
            
        else:  # track
            track = db.query(Track).filter(Track.id == entity_id).first()
            if not track:
                raise HTTPException(status_code=404, detail="Track not found")
            
            # Clear existing relationships and recompute
            track.related_tracks.clear()
            db.commit()
            
            related = aggregation_service.get_related_tracks(
                track.title, artist_name=track.artist.name if track.artist else None, top_n=20
            )
        
        logger.info(f"Refreshed {entity_type} relationships for entity {entity_id} (user {current_user.id})")
        return {
            "message": f"Relationships refreshed for {entity_type} {entity_id}",
            "related_count": len(related),
            "available_services": aggregation_service.get_available_services()
        }
        
    except Exception as e:
        logger.error(f"Error refreshing relationships: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to refresh relationships"
        )

@router.get("/stats")
async def get_user_aggregation_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get aggregation statistics for current user"""
    try:
        aggregation_service = AggregationService(db, current_user.id)
        available_services = aggregation_service.get_available_services()
        
        # Get counts of entities created by this user
        user_artists = db.query(Artist).filter(Artist.created_by_user_id == current_user.id).count()
        user_albums = db.query(Album).filter(Album.created_by_user_id == current_user.id).count()
        user_tracks = db.query(Track).filter(Track.created_by_user_id == current_user.id).count()
        
        # Get total counts in database
        total_artists = db.query(Artist).count()
        total_albums = db.query(Album).count()
        total_tracks = db.query(Track).count()
        
        return {
            "user_stats": {
                "artists_added": user_artists,
                "albums_added": user_albums,
                "tracks_added": user_tracks
            },
            "database_stats": {
                "total_artists": total_artists,
                "total_albums": total_albums,
                "total_tracks": total_tracks
            },
            "service_stats": {
                "available_services": available_services,
                "service_count": len(available_services)
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting aggregation stats: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get aggregation statistics"
        )
