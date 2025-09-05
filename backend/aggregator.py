# Location: mixview/backend/aggregator.py
# Description: Multi-user aggregation service with fixed imports

from typing import List, Optional, Set
from sqlalchemy.orm import Session
from sqlalchemy import text
import difflib
import re
import logging
import os

# Fixed imports using relative imports
from db_package.models import Artist, Album, Track, User, Filter
from routes.user_services import UserSpotifyService, UserLastFMService, UserDiscogsService

logger = logging.getLogger(__name__)

class AggregationService:
    """Multi-user aggregation service"""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.spotify = UserSpotifyService(db, user_id)
        self.lastfm = UserLastFMService(db, user_id)
        self.discogs = UserDiscogsService(db, user_id)
    
    def get_available_services(self) -> List[str]:
        """Get list of services available for this user"""
        services = []
        if self.spotify.is_available():
            services.append('spotify')
        if self.lastfm.is_available():
            services.append('lastfm')
        if self.discogs.is_available():
            services.append('discogs')
        services.append('apple_music')  # Always available
        services.append('musicbrainz')  # Always available
        return services

    def get_related_artists(self, artist_name: str, user_id: Optional[int] = None, top_n: int = 10) -> List[Artist]:
        """Get related artists using user's available services"""
        # user_id parameter kept for compatibility but use self.user_id
        
        # First find the target artist
        artist = self.db.query(Artist).filter_by(name=artist_name).first()
        if not artist:
            # Try to find from user's available services
            artist = self._find_or_create_artist(artist_name)
        
        if not artist:
            logger.warning(f"Could not find artist: {artist_name}")
            return []

        # Check if we have cached relationships with sufficient data
        if len(artist.related_artists) >= top_n:
            related = list(artist.related_artists)[:top_n]
        else:
            # Compute new relationships
            related = self._compute_artist_relationships(artist, top_n)
            
            # Cache the relationships
            for related_artist in related:
                if related_artist not in artist.related_artists:
                    artist.related_artists.append(related_artist)
            
            try:
                self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cache artist relationships: {e}")
                self.db.rollback()

        # Apply user filters
        related = self._apply_artist_filters(self.user_id, related)
        
        return related[:top_n]

    def _find_or_create_artist(self, artist_name: str) -> Optional[Artist]:
        """Find artist from user's available services or create new entry"""
        try:
            # Try user's available services in order of preference
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
        """Create Artist from Spotify data"""
        # Check if artist already exists by spotify_id
        existing = self.db.query(Artist).filter_by(spotify_id=spotify_data['id']).first()
        if existing:
            return existing
        
        # Check by name
        existing = self.db.query(Artist).filter_by(name=spotify_data['name']).first()
        if existing:
            # Update with Spotify data
            existing.spotify_id = spotify_data['id']
            existing.image_url = existing.image_url or (
                spotify_data['images'][0]['url'] if spotify_data.get('images') else None
            )
            self.db.commit()
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
        """Create Artist from Last.fm data"""
        # Check if artist already exists by name
        existing = self.db.query(Artist).filter_by(name=lastfm_data['name']).first()
        if existing:
            # Update with Last.fm data
            if not existing.lastfm_id and lastfm_data.get('mbid'):
                existing.lastfm_id = lastfm_data['mbid']
            if not existing.description and lastfm_data.get('bio', {}).get('summary'):
                existing.description = lastfm_data['bio']['summary']
            if not existing.image_url and lastfm_data.get('image'):
                existing.image_url = lastfm_data['image'][-1]['#text']
            self.db.commit()
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
        """Create Artist from Discogs data"""
        # Check if artist already exists by discogs_id
        existing = self.db.query(Artist).filter_by(discogs_id=str(discogs_data['id'])).first()
        if existing:
            return existing
        
        # Check by name
        existing = self.db.query(Artist).filter_by(name=discogs_data['title']).first()
        if existing:
            # Update with Discogs ID
            existing.discogs_id = str(discogs_data['id'])
            self.db.commit()
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

    def _compute_artist_relationships(self, target_artist: Artist, top_n: int) -> List[Artist]:
        """Compute artist relationships using multiple similarity factors"""
        # Get all artists for comparison (limit for performance)
        all_artists = self.db.query(Artist).filter(Artist.id != target_artist.id).limit(1000).all()
        
        if not all_artists:
            return []
        
        scored_artists = []
        
        for candidate in all_artists:
            score = self._compute_artist_similarity(target_artist, candidate)
            if score > 0.1:  # Only include artists with meaningful similarity
                scored_artists.append((candidate, score))
        
        # Sort by score and return top N
        scored_artists.sort(key=lambda x: x[1], reverse=True)
        return [artist for artist, score in scored_artists[:top_n]]

    def _compute_artist_similarity(self, artist1: Artist, artist2: Artist) -> float:
        """Improved artist similarity calculation"""
        score = 0.0
        
        # 1. Multi-platform presence (indicates reliability)
        platform_score = 0.0
        if artist1.spotify_id and artist2.spotify_id:
            platform_score += 0.3
        if artist1.lastfm_id and artist2.lastfm_id:
            platform_score += 0.2
        if artist1.discogs_id and artist2.discogs_id:
            platform_score += 0.1
        
        score += min(platform_score, 0.4)
        
        # 2. Name similarity
        name_similarity = difflib.SequenceMatcher(None, 
                                                 artist1.name.lower(), 
                                                 artist2.name.lower()).ratio()
        if name_similarity > 0.8:
            score += 0.2 * name_similarity
        
        # 3. Description/bio similarity
        if artist1.description and artist2.description:
            desc_similarity = self._text_similarity(artist1.description, artist2.description)
            score += 0.2 * desc_similarity
        
        # 4. Album overlap
        album_similarity = self._compute_album_overlap(artist1, artist2)
        score += 0.2 * album_similarity
        
        # 5. Track duration patterns
        duration_similarity = self._compute_duration_similarity(artist1, artist2)
        score += 0.1 * duration_similarity
        
        return min(score, 1.0)

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
        """Check for album name overlap between artists"""
        if not artist1.albums or not artist2.albums:
            return 0.0
        
        albums1 = {album.title.lower() for album in artist1.albums}
        albums2 = {album.title.lower() for album in artist2.albums}
        
        if not albums1 or not albums2:
            return 0.0
        
        exact_matches = len(albums1.intersection(albums2))
        
        # Check for similar album titles
        similar_matches = 0
        for album1 in albums1:
            for album2 in albums2:
                if difflib.SequenceMatcher(None, album1, album2).ratio() > 0.8:
                    similar_matches += 1
                    break
        
        total_matches = exact_matches + (similar_matches * 0.5)
        max_possible = min(len(albums1), len(albums2))
        
        return total_matches / max_possible if max_possible > 0 else 0.0

    def _compute_duration_similarity(self, artist1: Artist, artist2: Artist) -> float:
        """Compare average track durations between artists"""
        tracks1 = [t for t in artist1.tracks if t.duration_seconds]
        tracks2 = [t for t in artist2.tracks if t.duration_seconds]
        
        if not tracks1 or not tracks2:
            return 0.0
        
        avg_duration1 = sum(t.duration_seconds for t in tracks1) / len(tracks1)
        avg_duration2 = sum(t.duration_seconds for t in tracks2) / len(tracks2)
        
        duration_diff = abs(avg_duration1 - avg_duration2)
        max_reasonable_diff = 120  # 2 minutes
        
        if duration_diff <= max_reasonable_diff:
            return 1.0 - (duration_diff / max_reasonable_diff)
        else:
            return 0.0

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

    def get_related_albums(self, album_title: str, artist_name: Optional[str] = None, user_id: Optional[int] = None, top_n: int = 10) -> List[Album]:
        """Get related albums using user's services"""
        query = self.db.query(Album).filter_by(title=album_title)
        if artist_name:
            query = query.join(Artist).filter(Artist.name == artist_name)
        
        album = query.first()
        
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
        query = self.db.query(Track).filter_by(title=track_title)
        if artist_name:
            query = query.join(Artist).filter(Artist.name == artist_name)
        
        track = query.first()
        
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

    # Helper methods for album and track operations
    def _find_or_create_album(self, album_title: str, artist_name: Optional[str] = None) -> Optional[Album]:
        """Find or create album using available services"""
        try:
            # Try to get album data from available services
            if self.spotify.is_available():
                # Would implement Spotify album search
                pass
            
            if self.lastfm.is_available():
                # Would implement Last.fm album search
                pass
            
            if self.discogs.is_available():
                # Would implement Discogs album search
                pass
                
        except Exception as e:
            logger.error(f"Error searching for album {album_title}: {e}")
        
        return None

    def _find_or_create_track(self, track_title: str, artist_name: Optional[str] = None) -> Optional[Track]:
        """Find or create track using available services"""
        try:
            # Try to get track data from available services
            if self.spotify.is_available():
                # Would implement Spotify track search
                pass
            
            if self.lastfm.is_available():
                # Would implement Last.fm track search
                pass
                
        except Exception as e:
            logger.error(f"Error searching for track {track_title}: {e}")
        
        return None

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
        
        # Platform presence
        if album1.spotify_id and album2.spotify_id:
            score += 0.3
        if album1.lastfm_id and album2.lastfm_id:
            score += 0.2
        if album1.discogs_id and album2.discogs_id:
            score += 0.1
        
        # Same artist
        if album1.artist_id == album2.artist_id:
            score += 0.4
        
        # Similar release years
        if album1.release_year and album2.release_year:
            year_diff = abs(album1.release_year - album2.release_year)
            if year_diff <= 2:
                score += 0.2 * (1.0 - year_diff / 2)
        
        # Title similarity
        title_similarity = difflib.SequenceMatcher(None, 
                                                  album1.title.lower(), 
                                                  album2.title.lower()).ratio()
        score += 0.2 * title_similarity
        
        return min(score, 1.0)

    def _compute_track_relationships(self, target_track: Track, top_n: int) -> List[Track]:
        """Compute track relationships"""
        all_tracks = self.db.query(Track).filter(Track.id != target_track.id).limit(500).all()
        
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
        
        # Platform presence
        if track1.spotify_id and track2.spotify_id:
            score += 0.3
        if track1.lastfm_id and track2.lastfm_id:
            score += 0.2
        
        # Same artist or album
        if track1.artist_id == track2.artist_id:
            score += 0.4
        elif track1.album_id and track2.album_id and track1.album_id == track2.album_id:
            score += 0.5
        
        # Duration similarity
        if track1.duration_seconds and track2.duration_seconds:
            duration_diff = abs(track1.duration_seconds - track2.duration_seconds)
            if duration_diff <= 30:  # Within 30 seconds
                score += 0.2 * (1.0 - duration_diff / 30)
        
        # Title similarity
        title_similarity = difflib.SequenceMatcher(None, 
                                                  track1.title.lower(), 
                                                  track2.title.lower()).ratio()
        score += 0.1 * title_similarity
        
        return min(score, 1.0)

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

    def refresh_artist_relationships(self, artist_id: int) -> int:
        """Force refresh relationships for an artist"""
        artist = self.db.query(Artist).filter(Artist.id == artist_id).first()
        if not artist:
            return 0
        
        # Clear existing relationships
        artist.related_artists.clear()
        self.db.commit()
        
        # Recompute relationships
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
        
        # Clear existing relationships
        album.related_albums.clear()
        self.db.commit()
        
        # Recompute relationships
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
        
        # Clear existing relationships
        track.related_tracks.clear()
        self.db.commit()
        
        # Recompute relationships
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
