# FILE LOCATION: mixview/backend/aggregator.py
# PURPOSE: Complete multi-service aggregation with intelligent name normalization
#          - TRUE multi-source aggregation (combines data from ALL services)
#          - Smart normalization prevents duplicates from name variations
#          - Database storage for faster retrieval
#          - Relationship computation and caching
#          - User filtering support
#          - Statistics and refresh capabilities

from typing import List, Optional, Set, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
import difflib
import re
import logging
import os

from db_package.models import Artist, Album, Track, User, Filter
from user_services import UserSpotifyService, UserLastFMService, UserDiscogsService
from normalization import MusicNameNormalizer, artists_match, albums_match, tracks_match

logger = logging.getLogger(__name__)

class AggregationService:
    """Multi-user aggregation service with TRUE multi-source data aggregation and smart normalization"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.spotify = UserSpotifyService(db, user_id)
        self.lastfm = UserLastFMService(db, user_id)
        self.discogs = UserDiscogsService(db, user_id)
        self.normalizer = MusicNameNormalizer()
    
    def get_available_services(self) -> List[str]:
        """Get list of services available for this user"""
        services = []
        if self.spotify.is_available():
            services.append('spotify')
        if self.lastfm.is_available():
            services.append('lastfm')
        if self.discogs.is_available():
            services.append('discogs')
        services.append('apple_music')
        services.append('musicbrainz')
        return services

    # ==================== PUBLIC API METHODS ====================

    def get_related_artists(self, artist_name: str, user_id: Optional[int] = None, top_n: int = 10) -> List[Artist]:
        """Get related artists using user's available services"""
        artist = self._find_existing_artist_fuzzy(artist_name)
        if not artist:
            artist = self._find_or_create_artist(artist_name)
        
        if not artist:
            logger.warning(f"Could not find artist: {artist_name}")
            return []

        if len(artist.related_artists) >= top_n:
            related = list(artist.related_artists)[:top_n]
        else:
            related = self._compute_artist_relationships(artist, top_n)
            for related_artist in related:
                if related_artist not in artist.related_artists:
                    artist.related_artists.append(related_artist)
            try:
                self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cache artist relationships: {e}")
                self.db.rollback()

        related = self._apply_artist_filters(self.user_id, related)
        return related[:top_n]

    def get_related_albums(self, album_title: str, artist_name: Optional[str] = None, user_id: Optional[int] = None, top_n: int = 10) -> List[Album]:
        """Get related albums using user's services"""
        album = self._find_existing_album_fuzzy(album_title, artist_name)
        
        if not album:
            album = self._find_or_create_album(album_title, artist_name)
        
        if not album:
            logger.warning(f"Could not find album: {album_title}")
            return []

        if len(album.related_albums) >= top_n:
            related = list(album.related_albums)[:top_n]
        else:
            related = self._compute_album_relationships(album, top_n)
            
            for related_album in related:
                if related_album not in album.related_albums:
                    album.related_albums.append(related_album)
            
            try:
                self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cache album relationships: {e}")
                self.db.rollback()

        related = self._apply_album_filters(self.user_id, related)
        return related[:top_n]

    def get_related_tracks(self, track_title: str, artist_name: Optional[str] = None, user_id: Optional[int] = None, top_n: int = 10) -> List[Track]:
        """Get related tracks using user's services"""
        track = self._find_existing_track_fuzzy(track_title, artist_name)
        
        if not track:
            track = self._find_or_create_track(track_title, artist_name)
        
        if not track:
            logger.warning(f"Could not find track: {track_title}")
            return []

        if len(track.related_tracks) >= top_n:
            related = list(track.related_tracks)[:top_n]
        else:
            related = self._compute_track_relationships(track, top_n)
            
            for related_track in related:
                if related_track not in track.related_tracks:
                    track.related_tracks.append(related_track)
            
            try:
                self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cache track relationships: {e}")
                self.db.rollback()

        related = self._apply_track_filters(self.user_id, related)
        return related[:top_n]

    def get_combined_nodes(self, artist_name: Optional[str] = None, album_title: Optional[str] = None, 
                          track_title: Optional[str] = None, user_id: Optional[int] = None) -> dict:
        """Get combined nodes for graph visualization"""
        nodes = {"artists": [], "albums": [], "tracks": []}
        
        try:
            if artist_name:
                nodes["artists"] = self.get_related_artists(artist_name, user_id)
            
            if album_title:
                nodes["albums"] = self.get_related_albums(album_title, artist_name, user_id)
            
            if track_title:
                nodes["tracks"] = self.get_related_tracks(track_title, artist_name, user_id)
                
        except Exception as e:
            logger.error(f"Error getting combined nodes: {e}")
        
        return nodes

    def refresh_artist_relationships(self, artist_id: int) -> int:
        """Force refresh relationships for an artist"""
        artist = self.db.query(Artist).filter(Artist.id == artist_id).first()
        if not artist:
            return 0
        
        artist.related_artists.clear()
        self.db.commit()
        
        new_related = self._compute_artist_relationships(artist, 20)
        for related_artist in new_related:
            artist.related_artists.append(related_artist)
        
        self.db.commit()
        return len(new_related)

    def refresh_album_relationships(self, album_id: int) -> int:
        """Force refresh relationships for an album"""
        album = self.db.query(Album).filter(Album.id == album_id).first()
        if not album:
            return 0
        
        album.related_albums.clear()
        self.db.commit()
        
        new_related = self._compute_album_relationships(album, 20)
        for related_album in new_related:
            album.related_albums.append(related_album)
        
        self.db.commit()
        return len(new_related)

    def refresh_track_relationships(self, track_id: int) -> int:
        """Force refresh relationships for a track"""
        track = self.db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return 0
        
        track.related_tracks.clear()
        self.db.commit()
        
        new_related = self._compute_track_relationships(track, 20)
        for related_track in new_related:
            track.related_tracks.append(related_track)
        
        self.db.commit()
        return len(new_related)

    def get_user_statistics(self) -> dict:
        """Get statistics for this user's data"""
        return {
            "artists_created": self.db.query(Artist).filter(Artist.created_by_user_id == self.user_id).count(),
            "albums_created": self.db.query(Album).filter(Album.created_by_user_id == self.user_id).count(),
            "tracks_created": self.db.query(Track).filter(Track.created_by_user_id == self.user_id).count(),
            "available_services": self.get_available_services(),
            "total_artists": self.db.query(Artist).count(),
            "total_albums": self.db.query(Album).count(),
            "total_tracks": self.db.query(Track).count()
        }

    # ==================== FUZZY MATCHING METHODS (WITH NORMALIZATION) ====================

    def _find_existing_artist_fuzzy(self, artist_name: str) -> Optional[Artist]:
        """Find existing artist using normalized fuzzy matching"""
        # Try exact match first (fastest)
        existing = self.db.query(Artist).filter_by(name=artist_name).first()
        if existing:
            return existing
        
        # Search through artists with fuzzy matching
        # Limit to 500 for performance
        all_artists = self.db.query(Artist).limit(500).all()
        
        for artist in all_artists:
            if artists_match(artist.name, artist_name):
                logger.info(f"Fuzzy matched '{artist_name}' to existing artist '{artist.name}'")
                return artist
        
        return None

    def _find_existing_album_fuzzy(self, album_title: str, artist_name: Optional[str] = None) -> Optional[Album]:
        """Find existing album using normalized fuzzy matching"""
        # If we have an artist, narrow the search
        if artist_name:
            artist = self._find_existing_artist_fuzzy(artist_name)
            if artist:
                # Check exact match first
                existing = self.db.query(Album).filter_by(
                    title=album_title,
                    artist_id=artist.id
                ).first()
                if existing:
                    return existing
                
                # Fuzzy match within this artist's albums
                for album in artist.albums:
                    if albums_match(album.title, album_title):
                        logger.info(f"Fuzzy matched '{album_title}' to existing album '{album.title}'")
                        return album
        
        # Try exact match across all albums
        existing = self.db.query(Album).filter_by(title=album_title).first()
        if existing:
            return existing
        
        # Fuzzy match across recent albums (performance limit)
        recent_albums = self.db.query(Album).order_by(Album.id.desc()).limit(200).all()
        for album in recent_albums:
            if albums_match(album.title, album_title):
                logger.info(f"Fuzzy matched '{album_title}' to existing album '{album.title}'")
                return album
        
        return None

    def _find_existing_track_fuzzy(self, track_title: str, artist_name: Optional[str] = None) -> Optional[Track]:
        """Find existing track using normalized fuzzy matching"""
        if artist_name:
            artist = self._find_existing_artist_fuzzy(artist_name)
            if artist:
                # Check exact match first
                existing = self.db.query(Track).filter_by(
                    title=track_title,
                    artist_id=artist.id
                ).first()
                if existing:
                    return existing
                
                # Fuzzy match within this artist's tracks
                for track in artist.tracks:
                    if tracks_match(track.title, track_title):
                        logger.info(f"Fuzzy matched '{track_title}' to existing track '{track.title}'")
                        return track
        
        # Try exact match
        existing = self.db.query(Track).filter_by(title=track_title).first()
        if existing:
            return existing
        
        # Fuzzy match across recent tracks
        recent_tracks = self.db.query(Track).order_by(Track.id.desc()).limit(200).all()
        for track in recent_tracks:
            if tracks_match(track.title, track_title):
                logger.info(f"Fuzzy matched '{track_title}' to existing track '{track.title}'")
                return track
        
        return None

    # ==================== ARTIST METHODS ====================

    def _find_or_create_artist(self, artist_name: str) -> Optional[Artist]:
        """Find or create artist - checks database first with fuzzy matching, then queries services"""
        # Use fuzzy matching to find existing
        existing = self._find_existing_artist_fuzzy(artist_name)
        if existing:
            return existing
        
        try:
            if self.spotify.is_available():
                spotify_data = self.spotify.search_artist(artist_name)
                if spotify_data:
                    return self._create_artist_from_spotify(spotify_data)
            
            if self.lastfm.is_available():
                lastfm_data = self.lastfm.get_artist_info(artist_name)
                if lastfm_data:
                    return self._create_artist_from_lastfm(lastfm_data)
            
            if self.discogs.is_available():
                discogs_data = self.discogs.search_artist(artist_name)
                if discogs_data:
                    return self._create_artist_from_discogs(discogs_data)
                
        except Exception as e:
            logger.error(f"Error searching for artist {artist_name}: {e}")
        
        return None

    def _create_artist_from_spotify(self, spotify_data: dict) -> Artist:
        """Create Artist from Spotify data with fuzzy matching"""
        # Check by service ID first (most reliable)
        existing = self.db.query(Artist).filter_by(spotify_id=spotify_data['id']).first()
        if existing:
            return existing
        
        # Fuzzy match by name
        existing = self._find_existing_artist_fuzzy(spotify_data['name'])
        if existing:
            # Update with Spotify data
            existing.spotify_id = spotify_data['id']
            if not existing.image_url and spotify_data.get('images'):
                existing.image_url = spotify_data['images'][0]['url']
            self.db.commit()
            logger.info(f"Updated existing artist '{existing.name}' with Spotify data")
            return existing
        
        # Create new artist
        artist = Artist(
            name=spotify_data['name'],
            spotify_id=spotify_data['id'],
            image_url=spotify_data['images'][0]['url'] if spotify_data.get('images') else None,
            created_by_user_id=self.user_id
        )
        self.db.add(artist)
        self.db.commit()
        self.db.refresh(artist)
        
        logger.info(f"Created new artist from Spotify: {artist.name} (user {self.user_id})")
        return artist

    def _create_artist_from_lastfm(self, lastfm_data: dict) -> Artist:
        """Create Artist from Last.fm data with fuzzy matching"""
        # Fuzzy match by name
        existing = self._find_existing_artist_fuzzy(lastfm_data['name'])
        if existing:
            # Update with Last.fm data
            if not existing.lastfm_id and lastfm_data.get('mbid'):
                existing.lastfm_id = lastfm_data['mbid']
            if not existing.description and lastfm_data.get('bio', {}).get('summary'):
                existing.description = lastfm_data['bio']['summary']
            if not existing.image_url and lastfm_data.get('image'):
                existing.image_url = lastfm_data['image'][-1]['#text']
            self.db.commit()
            logger.info(f"Updated existing artist '{existing.name}' with Last.fm data")
            return existing
        
        # Create new artist
        artist = Artist(
            name=lastfm_data['name'],
            lastfm_id=lastfm_data.get('mbid'),
            image_url=lastfm_data['image'][-1]['#text'] if lastfm_data.get('image') else None,
            description=lastfm_data.get('bio', {}).get('summary'),
            created_by_user_id=self.user_id
        )
        self.db.add(artist)
        self.db.commit()
        self.db.refresh(artist)
        
        logger.info(f"Created new artist from Last.fm: {artist.name} (user {self.user_id})")
        return artist

    def _create_artist_from_discogs(self, discogs_data: dict) -> Artist:
        """Create Artist from Discogs data with fuzzy matching"""
        # Check by service ID first
        existing = self.db.query(Artist).filter_by(discogs_id=str(discogs_data['id'])).first()
        if existing:
            return existing
        
        # Fuzzy match by name
        existing = self._find_existing_artist_fuzzy(discogs_data['title'])
        if existing:
            existing.discogs_id = str(discogs_data['id'])
            self.db.commit()
            logger.info(f"Updated existing artist '{existing.name}' with Discogs data")
            return existing
        
        # Create new artist
        artist = Artist(
            name=discogs_data['title'],
            discogs_id=str(discogs_data['id']),
            created_by_user_id=self.user_id
        )
        self.db.add(artist)
        self.db.commit()
        self.db.refresh(artist)
        
        logger.info(f"Created new artist from Discogs: {artist.name} (user {self.user_id})")
        return artist

    # ==================== ALBUM METHODS - TRUE MULTI-SOURCE AGGREGATION ====================

    def _find_or_create_album(self, album_title: str, artist_name: Optional[str] = None) -> Optional[Album]:
        """
        Find or create album using TRUE multi-source aggregation with fuzzy matching.
        Queries ALL available services and combines data into one enriched record.
        Stores in database for faster future retrieval.
        """
        # Use fuzzy matching to find existing
        existing = self._find_existing_album_fuzzy(album_title, artist_name)
        if existing:
            logger.info(f"Found existing album in database: {album_title}")
            return existing
        
        logger.info(f"Querying all services for album: {album_title}")
        aggregated_data = {
            'spotify_data': None,
            'lastfm_data': None,
            'discogs_data': None,
            'artist_name': artist_name,
            'title': album_title
        }
        
        if self.spotify.is_available():
            try:
                spotify_album = self.spotify.search_album(album_title, artist_name)
                if spotify_album:
                    aggregated_data['spotify_data'] = spotify_album
                    logger.info(f"✓ Spotify data found for: {album_title}")
            except Exception as e:
                logger.warning(f"Spotify album search failed: {e}")
        
        if self.lastfm.is_available() and artist_name:
            try:
                lastfm_album = self.lastfm.get_album_info(artist_name, album_title)
                if lastfm_album:
                    aggregated_data['lastfm_data'] = lastfm_album
                    logger.info(f"✓ Last.fm data found for: {album_title}")
            except Exception as e:
                logger.warning(f"Last.fm album search failed: {e}")
        
        if self.discogs.is_available():
            try:
                search_query = f"{artist_name} {album_title}" if artist_name else album_title
                discogs_results = self.discogs.search_release(search_query)
                if discogs_results and len(discogs_results) > 0:
                    for result in discogs_results[:3]:
                        if albums_match(result.get('title', ''), album_title):
                            aggregated_data['discogs_data'] = result
                            logger.info(f"✓ Discogs data found for: {album_title}")
                            break
            except Exception as e:
                logger.warning(f"Discogs album search failed: {e}")
        
        if aggregated_data['spotify_data'] or aggregated_data['lastfm_data'] or aggregated_data['discogs_data']:
            return self._create_album_from_aggregated_data(aggregated_data)
        
        logger.warning(f"No data found for album: {album_title}")
        return None

    def _create_album_from_aggregated_data(self, aggregated_data: Dict[str, Any]) -> Optional[Album]:
        """
        Create album by intelligently merging data from ALL available sources.
        Uses fuzzy matching to prevent duplicates from name variations.
        """
        try:
            spotify_data = aggregated_data.get('spotify_data')
            lastfm_data = aggregated_data.get('lastfm_data')
            discogs_data = aggregated_data.get('discogs_data')
            
            artist = None
            if aggregated_data.get('artist_name'):
                artist = self._find_or_create_artist(aggregated_data['artist_name'])
            elif spotify_data and spotify_data.get('artists'):
                artist = self._find_or_create_artist(spotify_data['artists'][0]['name'])
            
            title = (
                spotify_data.get('name') if spotify_data else
                lastfm_data.get('name') if lastfm_data else
                discogs_data.get('title') if discogs_data else
                aggregated_data.get('title')
            )
            
            image_url = None
            if spotify_data and spotify_data.get('images'):
                image_url = spotify_data['images'][0]['url']
            elif lastfm_data and lastfm_data.get('image'):
                images = [img for img in lastfm_data['image'] if img.get('#text')]
                if images:
                    image_url = images[-1]['#text']
            elif discogs_data:
                image_url = discogs_data.get('cover_image') or discogs_data.get('thumb')
            
            release_year = None
            if spotify_data and spotify_data.get('release_date'):
                try:
                    release_year = int(spotify_data['release_date'][:4])
                except:
                    pass
            if not release_year and discogs_data and discogs_data.get('year'):
                try:
                    release_year = int(discogs_data['year'])
                except:
                    pass
            
            spotify_id = spotify_data.get('id') if spotify_data else None
            lastfm_id = lastfm_data.get('mbid') if lastfm_data else None
            discogs_id = str(discogs_data.get('id')) if discogs_data else None
            
            # Check for existing by service IDs first
            existing = None
            if spotify_id:
                existing = self.db.query(Album).filter_by(spotify_id=spotify_id).first()
            if not existing and lastfm_id:
                existing = self.db.query(Album).filter_by(lastfm_id=lastfm_id).first()
            if not existing and discogs_id:
                existing = self.db.query(Album).filter_by(discogs_id=discogs_id).first()
            
            # Fuzzy match as fallback
            if not existing:
                existing = self._find_existing_album_fuzzy(title, artist.name if artist else None)
            
            if existing:
                # Update existing with new data
                if not existing.spotify_id and spotify_id:
                    existing.spotify_id = spotify_id
                if not existing.lastfm_id and lastfm_id:
                    existing.lastfm_id = lastfm_id
                if not existing.discogs_id and discogs_id:
                    existing.discogs_id = discogs_id
                if not existing.image_url and image_url:
                    existing.image_url = image_url
                if not existing.release_year and release_year:
                    existing.release_year = release_year
                self.db.commit()
                logger.info(f"Updated existing album with aggregated data: {title}")
                return existing
            
            # Create new album
            album = Album(
                title=title,
                artist_id=artist.id if artist else None,
                release_year=release_year,
                image_url=image_url,
                spotify_id=spotify_id,
                lastfm_id=lastfm_id,
                discogs_id=discogs_id,
                created_by_user_id=self.user_id
            )
            self.db.add(album)
            self.db.commit()
            self.db.refresh(album)
            
            sources = []
            if spotify_id: sources.append('Spotify')
            if lastfm_id: sources.append('Last.fm')
            if discogs_id: sources.append('Discogs')
            logger.info(f"Created new album with data from {', '.join(sources)}: {title}")
            
            return album
            
        except Exception as e:
            logger.error(f"Error creating album from aggregated data: {e}")
            self.db.rollback()
            return None

    # ==================== TRACK METHODS - TRUE MULTI-SOURCE AGGREGATION ====================

    def _find_or_create_track(self, track_title: str, artist_name: Optional[str] = None, 
                             album_title: Optional[str] = None) -> Optional[Track]:
        """
        Find or create track using TRUE multi-source aggregation with fuzzy matching.
        Queries ALL available services and combines data into one enriched record.
        """
        # Use fuzzy matching to find existing
        existing = self._find_existing_track_fuzzy(track_title, artist_name)
        if existing:
            logger.info(f"Found existing track in database: {track_title}")
            return existing
        
        logger.info(f"Querying all services for track: {track_title}")
        aggregated_data = {
            'spotify_data': None,
            'lastfm_data': None,
            'artist_name': artist_name,
            'album_title': album_title,
            'title': track_title
        }
        
        if self.spotify.is_available():
            try:
                spotify_track = self.spotify.search_track(track_title, artist_name)
                if spotify_track:
                    aggregated_data['spotify_data'] = spotify_track
                    logger.info(f"✓ Spotify data found for: {track_title}")
            except Exception as e:
                logger.warning(f"Spotify track search failed: {e}")
        
        if self.lastfm.is_available() and artist_name:
            try:
                lastfm_track = self.lastfm.get_track_info(artist_name, track_title)
                if lastfm_track:
                    aggregated_data['lastfm_data'] = lastfm_track
                    logger.info(f"✓ Last.fm data found for: {track_title}")
            except Exception as e:
                logger.warning(f"Last.fm track search failed: {e}")
        
        if aggregated_data['spotify_data'] or aggregated_data['lastfm_data']:
            return self._create_track_from_aggregated_data(aggregated_data)
        
        logger.warning(f"No data found for track: {track_title}")
        return None

    def _create_track_from_aggregated_data(self, aggregated_data: Dict[str, Any]) -> Optional[Track]:
        """
        Create track by intelligently merging data from ALL available sources.
        Uses fuzzy matching to prevent duplicates from name variations.
        """
        try:
            spotify_data = aggregated_data.get('spotify_data')
            lastfm_data = aggregated_data.get('lastfm_data')
            
            artist = None
            if aggregated_data.get('artist_name'):
                artist = self._find_or_create_artist(aggregated_data['artist_name'])
            elif spotify_data and spotify_data.get('artists'):
                artist = self._find_or_create_artist(spotify_data['artists'][0]['name'])
            
            album = None
            album_title = None
            if spotify_data and spotify_data.get('album'):
                album_title = spotify_data['album'].get('name')
            elif aggregated_data.get('album_title'):
                album_title = aggregated_data['album_title']
            
            if album_title and artist:
                album = self._find_or_create_album(album_title, artist.name)
            
            title = (
                spotify_data.get('name') if spotify_data else
                lastfm_data.get('name') if lastfm_data else
                aggregated_data.get('title')
            )
            
            duration_seconds = None
            if spotify_data and spotify_data.get('duration_ms'):
                duration_seconds = spotify_data['duration_ms'] // 1000
            
            spotify_id = spotify_data.get('id') if spotify_data else None
            lastfm_id = lastfm_data.get('mbid') if lastfm_data else None
            
            # Check for existing by service IDs
            existing = None
            if spotify_id:
                existing = self.db.query(Track).filter_by(spotify_id=spotify_id).first()
            if not existing and lastfm_id:
                existing = self.db.query(Track).filter_by(lastfm_id=lastfm_id).first()
            
            # Fuzzy match as fallback
            if not existing:
                existing = self._find_existing_track_fuzzy(title, artist.name if artist else None)
            
            if existing:
                # Update existing with new data
                if not existing.spotify_id and spotify_id:
                    existing.spotify_id = spotify_id
                if not existing.lastfm_id and lastfm_id:
                    existing.lastfm_id = lastfm_id
                if not existing.duration_seconds and duration_seconds:
                    existing.duration_seconds = duration_seconds
                if not existing.album_id and album:
                    existing.album_id = album.id
                self.db.commit()
                logger.info(f"Updated existing track with aggregated data: {title}")
                return existing
            
            # Create new track
            track = Track(
                title=title,
                artist_id=artist.id if artist else None,
                album_id=album.id if album else None,
                duration_seconds=duration_seconds,
                spotify_id=spotify_id,
                lastfm_id=lastfm_id,
                created_by_user_id=self.user_id
            )
            
            self.db.add(track)
            self.db.commit()
            self.db.refresh(track)
            
            sources = []
            if spotify_id: sources.append('Spotify')
            if lastfm_id: sources.append('Last.fm')
            logger.info(f"Created new track with data from {', '.join(sources)}: {title}")
            
            return track
            
        except Exception as e:
            logger.error(f"Error creating track from aggregated data: {e}")
            self.db.rollback()
            return None

    # ==================== RELATIONSHIP COMPUTATION METHODS ====================

    def _compute_artist_relationships(self, target_artist: Artist, top_n: int) -> List[Artist]:
        """Compute artist relationships using multiple similarity factors"""
        all_artists = self.db.query(Artist).filter(Artist.id != target_artist.id).limit(1000).all()
        
        if not all_artists:
            return []
        
        scored_artists = []
        for candidate in all_artists:
            score = self._compute_artist_similarity(target_artist, candidate)
            if score > 0.1:
                scored_artists.append((candidate, score))
        
        scored_artists.sort(key=lambda x: x[1], reverse=True)
        return [artist for artist, score in scored_artists[:top_n]]

    def _compute_artist_similarity(self, artist1: Artist, artist2: Artist) -> float:
        """Calculate similarity between two artists"""
        score = 0.0
        
        platform_score = 0.0
        if artist1.spotify_id and artist2.spotify_id:
            platform_score += 0.3
        if artist1.lastfm_id and artist2.lastfm_id:
            platform_score += 0.2
        if artist1.discogs_id and artist2.discogs_id:
            platform_score += 0.1
        score += min(platform_score, 0.4)
        
        # Use normalized name similarity
        name_score = self.normalizer.get_similarity_score(artist1.name, artist2.name)
        if name_score > 0.8:
            score += 0.2 * name_score
        
        if artist1.description and artist2.description:
            desc_similarity = self._text_similarity(artist1.description, artist2.description)
            score += 0.2 * desc_similarity
        
        album_similarity = self._compute_album_overlap(artist1, artist2)
        score += 0.2 * album_similarity
        
        duration_similarity = self._compute_duration_similarity(artist1, artist2)
        score += 0.1 * duration_similarity
        
        return min(score, 1.0)

    def _compute_album_relationships(self, target_album: Album, top_n: int) -> List[Album]:
        """Compute album relationships"""
        all_albums = self.db.query(Album).filter(Album.id != target_album.id).limit(500).all()
        
        if not all_albums:
            return []
        
        scored_albums = []
        for candidate in all_albums:
            score = self._compute_album_similarity(target_album, candidate)
            if score > 0.1:
                scored_albums.append((candidate, score))
        
        scored_albums.sort(key=lambda x: x[1], reverse=True)
        return [album for album, score in scored_albums[:top_n]]

    def _compute_album_similarity(self, album1: Album, album2: Album) -> float:
        """Calculate similarity between two albums"""
        score = 0.0
        
        if album1.spotify_id and album2.spotify_id:
            score += 0.3
        if album1.lastfm_id and album2.lastfm_id:
            score += 0.2
        if album1.discogs_id and album2.discogs_id:
            score += 0.1
        
        if album1.artist_id and album2.artist_id and album1.artist_id == album2.artist_id:
            score += 0.4
        
        if album1.release_year and album2.release_year:
            year_diff = abs(album1.release_year - album2.release_year)
            if year_diff <= 5:
                score += 0.1 * (1.0 - year_diff / 5.0)
        
        return min(score, 1.0)

    def _compute_track_relationships(self, target_track: Track, top_n: int) -> List[Track]:
        """Compute track relationships"""
        all_tracks = self.db.query(Track).filter(Track.id != target_track.id).limit(500).all()
        
        if not all_tracks:
            return []
        
        scored_tracks = []
        for candidate in all_tracks:
            score = self._compute_track_similarity(target_track, candidate)
            if score > 0.1:
                scored_tracks.append((candidate, score))
        
        scored_tracks.sort(key=lambda x: x[1], reverse=True)
        return [track for track, score in scored_tracks[:top_n]]

    def _compute_track_similarity(self, track1: Track, track2: Track) -> float:
        """Calculate similarity between two tracks"""
        score = 0.0
        
        if track1.spotify_id and track2.spotify_id:
            score += 0.3
        if track1.lastfm_id and track2.lastfm_id:
            score += 0.2
        
        if track1.artist_id and track2.artist_id and track1.artist_id == track2.artist_id:
            score += 0.3
        
        if track1.album_id and track2.album_id and track1.album_id == track2.album_id:
            score += 0.2
        
        if track1.duration_seconds and track2.duration_seconds:
            duration_diff = abs(track1.duration_seconds - track2.duration_seconds)
            if duration_diff <= 30:
                score += 0.2 * (1.0 - duration_diff / 30)
        
        # Use normalized title similarity
        title_score = self.normalizer.get_similarity_score(track1.title, track2.title)
        score += 0.1 * title_score
        
        return min(score, 1.0)

    # ==================== HELPER METHODS ====================

    def _text_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two text descriptions"""
        if not text1 or not text2:
            return 0.0
        
        words1 = set(re.findall(r'\w+', text1.lower()))
        words2 = set(re.findall(r'\w+', text2.lower()))
        
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union if union > 0 else 0.0

    def _compute_album_overlap(self, artist1: Artist, artist2: Artist) -> float:
        """Check for album name overlap between artists using normalization"""
        if not artist1.albums or not artist2.albums:
            return 0.0
        
        if not artist1.albums or not artist2.albums:
            return 0.0
        
        matched_count = 0
        for album1 in artist1.albums:
            for album2 in artist2.albums:
                if albums_match(album1.title, album2.title):
                    matched_count += 1
                    break
        
        max_possible = min(len(artist1.albums), len(artist2.albums))
        
        return matched_count / max_possible if max_possible > 0 else 0.0

    def _compute_duration_similarity(self, artist1: Artist, artist2: Artist) -> float:
        """Compare average track durations between artists"""
        tracks1 = [t for t in artist1.tracks if t.duration_seconds]
        tracks2 = [t for t in artist2.tracks if t.duration_seconds]
        
        if not tracks1 or not tracks2:
            return 0.0
        
        avg_duration1 = sum(t.duration_seconds for t in tracks1) / len(tracks1)
        avg_duration2 = sum(t.duration_seconds for t in tracks2) / len(tracks2)
        
        duration_diff = abs(avg_duration1 - avg_duration2)
        max_reasonable_diff = 120
        
        if duration_diff <= max_reasonable_diff:
            return 1.0 - (duration_diff / max_reasonable_diff)
        else:
            return 0.0

    # ==================== FILTER METHODS ====================

    def _apply_artist_filters(self, user_id: int, artists: List[Artist]) -> List[Artist]:
        """Apply user filters to artist list"""
        user = self.db.query(User).filter_by(id=user_id).first()
        if not user or not user.filters:
            return artists
        
        filtered = artists
        
        for filter_obj in user.filters:
            if filter_obj.filter_type == "exclude_genre":
                filtered = [a for a in filtered 
                          if not (a.description and filter_obj.value.lower() in a.description.lower())]
            elif filter_obj.filter_type == "exclude_artist":
                filtered = [a for a in filtered if a.name.lower() != filter_obj.value.lower()]
        
        return filtered

    def _apply_album_filters(self, user_id: int, albums: List[Album]) -> List[Album]:
        """Apply user filters to albums"""
        user = self.db.query(User).filter_by(id=user_id).first()
        if not user or not user.filters:
            return albums
        
        filtered = albums
        for filter_obj in user.filters:
            if filter_obj.filter_type == "exclude_genre":
                filtered = [a for a in filtered 
                          if not (a.title and filter_obj.value.lower() in a.title.lower())]
            elif filter_obj.filter_type == "exclude_album":
                filtered = [a for a in filtered if a.title.lower() != filter_obj.value.lower()]
        
        return filtered

    def _apply_track_filters(self, user_id: int, tracks: List[Track]) -> List[Track]:
        """Apply user filters to tracks"""
        user = self.db.query(User).filter_by(id=user_id).first()
        if not user or not user.filters:
            return tracks
        
        filtered = tracks
        for filter_obj in user.filters:
            if filter_obj.filter_type == "exclude_track":
                filtered = [t for t in filtered if t.title.lower() != filter_obj.value.lower()]
            elif filter_obj.filter_type == "min_duration":
                try:
                    min_duration = int(filter_obj.value)
                    filtered = [t for t in filtered if t.duration_seconds and t.duration_seconds >= min_duration]
                except ValueError:
                    continue
        
        return filtered