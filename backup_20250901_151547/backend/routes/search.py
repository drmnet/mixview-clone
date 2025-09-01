# Location: mixview/backend/routes/search.py
# Description: Search routes with fixed imports

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
import logging

# Fixed imports using relative imports
from database import get_db
from routes.auth import get_current_user
from models import User, Artist, Album, Track
from user_services import UserSpotifyService, UserLastFMService, UserDiscogsService

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/")
async def search_all(
    q: str = Query(..., min_length=1, description="Search query"),
    search_type: Optional[str] = Query("all", regex="^(all|artist|album|track)$"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Search across all music services for artists, albums, and tracks"""
    if len(q.strip()) == 0:
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
    
    try:
        # Initialize services
        spotify_service = UserSpotifyService(db, current_user.id)
        lastfm_service = UserLastFMService(db, current_user.id)
        discogs_service = UserDiscogsService(db, current_user.id)
        
        results = {
            "artists": [],
            "albums": [],
            "tracks": [],
            "query": q,
            "search_type": search_type
        }
        
        # Search based on type
        if search_type in ["all", "artist"]:
            artists = await search_artists(q, limit, spotify_service, lastfm_service, discogs_service, db)
            results["artists"] = artists
        
        if search_type in ["all", "album"]:
            albums = await search_albums(q, limit, spotify_service, lastfm_service, discogs_service, db)
            results["albums"] = albums
        
        if search_type in ["all", "track"]:
            tracks = await search_tracks(q, limit, spotify_service, lastfm_service, discogs_service, db)
            results["tracks"] = tracks
        
        logger.info(f"Search completed for user {current_user.username}: '{q}' (type: {search_type})")
        return results
        
    except Exception as e:
        logger.error(f"Search error for query '{q}': {e}")
        raise HTTPException(
            status_code=500,
            detail="Search failed"
        )

async def search_artists(q: str, limit: int, spotify: UserSpotifyService, lastfm: UserLastFMService, 
                        discogs: UserDiscogsService, db: Session) -> List[Dict[Any, Any]]:
    """Search for artists across all services"""
    artists = []
    seen_names = set()
    
    # Check database first
    db_artists = db.query(Artist).filter(Artist.name.ilike(f"%{q}%")).limit(limit).all()
    for artist in db_artists:
        if artist.name.lower() not in seen_names:
            artists.append({
                "id": artist.id,
                "name": artist.name,
                "image_url": artist.image_url,
                "spotify_id": artist.spotify_id,
                "lastfm_id": artist.lastfm_id,
                "discogs_id": artist.discogs_id,
                "description": artist.description,
                "apple_link": f"https://music.apple.com/us/search?term={artist.name.replace(' ', '+')}",
                "source": "database"
            })
            seen_names.add(artist.name.lower())
    
    # Search external services if we need more results
    if len(artists) < limit:
        try:
            # Spotify search
            if spotify.is_available():
                spotify_data = spotify.search_artist(q)
                if spotify_data and spotify_data.get('name', '').lower() not in seen_names:
                    artists.append({
                        "id": f"spotify_{spotify_data['id']}",
                        "name": spotify_data['name'],
                        "image_url": spotify_data['images'][0]['url'] if spotify_data.get('images') else None,
                        "spotify_id": spotify_data['id'],
                        "lastfm_id": None,
                        "discogs_id": None,
                        "description": None,
                        "apple_link": f"https://music.apple.com/us/search?term={spotify_data['name'].replace(' ', '+')}",
                        "source": "spotify"
                    })
                    seen_names.add(spotify_data['name'].lower())
        except Exception as e:
            logger.warning(f"Spotify artist search failed: {e}")
        
        try:
            # Last.fm search
            if lastfm.is_available():
                lastfm_data = lastfm.get_artist_info(q)
                if lastfm_data and lastfm_data.get('name', '').lower() not in seen_names:
                    artists.append({
                        "id": f"lastfm_{lastfm_data.get('mbid', q)}",
                        "name": lastfm_data['name'],
                        "image_url": lastfm_data['image'][-1]['#text'] if lastfm_data.get('image') else None,
                        "spotify_id": None,
                        "lastfm_id": lastfm_data.get('mbid'),
                        "discogs_id": None,
                        "description": lastfm_data.get('bio', {}).get('summary'),
                        "apple_link": f"https://music.apple.com/us/search?term={lastfm_data['name'].replace(' ', '+')}",
                        "source": "lastfm"
                    })
                    seen_names.add(lastfm_data['name'].lower())
        except Exception as e:
            logger.warning(f"Last.fm artist search failed: {e}")
        
        try:
            # Discogs search
            if discogs.is_available():
                discogs_data = discogs.search_artist(q)
                if discogs_data and discogs_data.get('title', '').lower() not in seen_names:
                    artists.append({
                        "id": f"discogs_{discogs_data['id']}",
                        "name": discogs_data['title'],
                        "image_url": None,
                        "spotify_id": None,
                        "lastfm_id": None,
                        "discogs_id": str(discogs_data['id']),
                        "description": None,
                        "apple_link": f"https://music.apple.com/us/search?term={discogs_data['title'].replace(' ', '+')}",
                        "source": "discogs"
                    })
                    seen_names.add(discogs_data['title'].lower())
        except Exception as e:
            logger.warning(f"Discogs artist search failed: {e}")
    
    return artists[:limit]

async def search_albums(q: str, limit: int, spotify: UserSpotifyService, lastfm: UserLastFMService,
                       discogs: UserDiscogsService, db: Session) -> List[Dict[Any, Any]]:
    """Search for albums across all services"""
    albums = []
    seen_titles = set()
    
    # Check database first
    db_albums = db.query(Album).filter(Album.title.ilike(f"%{q}%")).limit(limit).all()
    for album in db_albums:
        album_key = f"{album.title.lower()}_{album.artist.name.lower() if album.artist else ''}"
        if album_key not in seen_titles:
            albums.append({
                "id": album.id,
                "title": album.title,
                "release_year": album.release_year,
                "image_url": album.image_url,
                "spotify_id": album.spotify_id,
                "lastfm_id": album.lastfm_id,
                "discogs_id": album.discogs_id,
                "artist": {
                    "id": album.artist.id,
                    "name": album.artist.name
                } if album.artist else None,
                "apple_link": f"https://music.apple.com/us/search?term={album.artist.name if album.artist else ''} {album.title}".replace(' ', '+'),
                "source": "database"
            })
            seen_titles.add(album_key)
    
    return albums[:limit]

async def search_tracks(q: str, limit: int, spotify: UserSpotifyService, lastfm: UserLastFMService,
                       discogs: UserDiscogsService, db: Session) -> List[Dict[Any, Any]]:
    """Search for tracks across all services"""
    tracks = []
    seen_titles = set()
    
    # Check database first
    db_tracks = db.query(Track).filter(Track.title.ilike(f"%{q}%")).limit(limit).all()
    for track in db_tracks:
        track_key = f"{track.title.lower()}_{track.artist.name.lower() if track.artist else ''}"
        if track_key not in seen_titles:
            tracks.append({
                "id": track.id,
                "title": track.title,
                "duration_seconds": track.duration_seconds,
                "spotify_id": track.spotify_id,
                "lastfm_id": track.lastfm_id,
                "discogs_id": track.discogs_id,
                "apple_music_url": track.apple_music_url,
                "artist": {
                    "id": track.artist.id,
                    "name": track.artist.name
                } if track.artist else None,
                "album": {
                    "id": track.album.id,
                    "title": track.album.title
                } if track.album else None,
                "apple_link": f"https://music.apple.com/us/search?term={track.artist.name if track.artist else ''} {track.title}".replace(' ', '+'),
                "source": "database"
            })
            seen_titles.add(track_key)
    
    return tracks[:limit]
