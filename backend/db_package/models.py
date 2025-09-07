# Location: mixview/backend/db_package/models.py
# Description: Enhanced database models with setup completion tracking

import sqlalchemy
from sqlalchemy import (
    Column, Integer, String, Float, ForeignKey, Table, Boolean, DateTime, Text, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base

# Association tables for many-to-many relationships
artist_similarity = Table(
    'artist_similarity',
    Base.metadata,
    Column('artist_id', Integer, ForeignKey('artists.id'), primary_key=True),
    Column('related_artist_id', Integer, ForeignKey('artists.id'), primary_key=True),
    Column('weight', Float, default=0.0)
)

album_similarity = Table(
    'album_similarity',
    Base.metadata,
    Column('album_id', Integer, ForeignKey('albums.id'), primary_key=True),
    Column('related_album_id', Integer, ForeignKey('albums.id'), primary_key=True),
    Column('weight', Float, default=0.0)
)

track_similarity = Table(
    'track_similarity',
    Base.metadata,
    Column('track_id', Integer, ForeignKey('tracks.id'), primary_key=True),
    Column('related_track_id', Integer, ForeignKey('tracks.id'), primary_key=True),
    Column('weight', Float, default=0.0)
)

# User table
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    setup_progress = relationship("SetupProgress", back_populates="user", uselist=False)
    setup_completed = Column(Boolean, default=False)
    setup_completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    filters = relationship("Filter", back_populates="user", cascade="all, delete-orphan")
    service_credentials = relationship("UserServiceCredential", back_populates="user", cascade="all, delete-orphan")
    oauth_states = relationship("OAuthState", back_populates="user", cascade="all, delete-orphan")

# Filter table for user preferences
class Filter(Base):
    __tablename__ = "filters"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    filter_type = Column(String)
    value = Column(String)
    user = relationship("User", back_populates="filters")

# User-specific service credentials
class UserServiceCredential(Base):
    __tablename__ = "user_service_credentials"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    service_name = Column(String, nullable=False)
    credential_type = Column(String, nullable=False)
    encrypted_data = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User", back_populates="service_credentials")
    
    __table_args__ = (
        sqlalchemy.UniqueConstraint('user_id', 'service_name', name='unique_user_service'),
    )

# OAuth state management
class OAuthState(Base):
    __tablename__ = "oauth_states"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    service_name = Column(String, nullable=False)
    state_token = Column(String, unique=True, nullable=False)
    code_verifier = Column(String, nullable=True)
    redirect_uri = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False)
    
    user = relationship("User", back_populates="oauth_states")

# Artist table
class Artist(Base):
    __tablename__ = "artists"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    image_url = Column(String, nullable=True)
    spotify_id = Column(String, nullable=True)
    lastfm_id = Column(String, nullable=True)
    discogs_id = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    albums = relationship("Album", back_populates="artist")
    tracks = relationship("Track", back_populates="artist")
    related_artists = relationship(
        "Artist",
        secondary=artist_similarity,
        primaryjoin=id == artist_similarity.c.artist_id,
        secondaryjoin=id == artist_similarity.c.related_artist_id,
        backref="similar_to"
    )

# Album table
class Album(Base):
    __tablename__ = "albums"
    id = Column(Integer, primary_key=True)
    artist_id = Column(Integer, ForeignKey("artists.id"))
    title = Column(String, nullable=False)
    release_year = Column(Integer, nullable=True)
    image_url = Column(String, nullable=True)
    spotify_id = Column(String, nullable=True)
    lastfm_id = Column(String, nullable=True)
    discogs_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    artist = relationship("Artist", back_populates="albums")
    tracks = relationship("Track", back_populates="album")
    related_albums = relationship(
        "Album",
        secondary=album_similarity,
        primaryjoin=id == album_similarity.c.album_id,
        secondaryjoin=id == album_similarity.c.related_album_id,
        backref="similar_to"
    )

# Track table
class Track(Base):
    __tablename__ = "tracks"
    id = Column(Integer, primary_key=True)
    artist_id = Column(Integer, ForeignKey("artists.id"))
    album_id = Column(Integer, ForeignKey("albums.id"), nullable=True)
    title = Column(String, nullable=False)
    duration_seconds = Column(Integer, nullable=True)
    spotify_id = Column(String, nullable=True)
    lastfm_id = Column(String, nullable=True)
    discogs_id = Column(String, nullable=True)
    apple_music_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    artist = relationship("Artist", back_populates="tracks")
    album = relationship("Album", back_populates="tracks")
    related_tracks = relationship(
        "Track",
        secondary=track_similarity,
        primaryjoin=id == track_similarity.c.track_id,
        secondaryjoin=id == track_similarity.c.related_track_id,
        backref="similar_to"
    )

# Service configuration for system-wide settings
class ServiceConfig(Base):
    __tablename__ = "service_configs"
    service_name = Column(String, primary_key=True, index=True)
    client_id = Column(String, nullable=True)
    client_secret = Column(String, nullable=True)
    is_configured = Column(Boolean, default=False)
    
    def __repr__(self):
        return f"<ServiceConfig(service_name='{self.service_name}')>"
    
    # NEW: Setup progress tracking for users
class SetupProgress(Base):
    __tablename__ = "setup_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # Setup state
    setup_completed = Column(Boolean, default=False)
    current_step = Column(String, default="welcome")  # welcome, services, test, complete
    
    # Service configuration tracking
    configured_services = Column(JSON, default=list)  # List of configured service names
    
    # Timestamps
    setup_started_at = Column(DateTime(timezone=True), server_default=func.now())
    setup_completed_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationship to your existing User model
    user = relationship("User", back_populates="setup_progress")
    
    def __repr__(self):
        return f"<SetupProgress(user_id={self.user_id}, completed={self.setup_completed})>"

# Application configuration storage (add if you don't already have this)
class AppConfig(Base):
    __tablename__ = "app_config"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    value = Column(Text)
    description = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<AppConfig(key='{self.key}', value='{self.value[:50]}...')>"
    
class ServerConfiguration(Base):
    __tablename__ = "server_configuration"
    
    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String, unique=True, nullable=False, index=True)  # 'spotify', 'lastfm', etc.
    config_key = Column(String, nullable=False)  # 'client_id', 'client_secret', etc.
    config_value = Column(Text, nullable=False)  # Encrypted credential value
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Create composite unique constraint for service_name + config_key
    __table_args__ = (
        UniqueConstraint('service_name', 'config_key', name='_service_config_uc'),
    )
    
    def __repr__(self):
        return f"<ServerConfiguration(service_name='{self.service_name}', config_key='{self.config_key}')>"