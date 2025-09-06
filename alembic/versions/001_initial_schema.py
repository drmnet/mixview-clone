# Location: mixview/alembic/versions/001_initial_schema.py
# Description: Initial database schema migration

"""Initial schema with setup tracking

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('setup_completed', sa.Boolean(), nullable=True),
        sa.Column('setup_completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('username')
    )
    
    # Create setup_progress table
    op.create_table('setup_progress',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('is_completed', sa.Boolean(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('steps_completed', sa.JSON(), nullable=True),
        sa.Column('services_configured', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    
    # Create user_service_credentials table
    op.create_table('user_service_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('service_name', sa.String(), nullable=False),
        sa.Column('credential_type', sa.String(), nullable=False),
        sa.Column('encrypted_data', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'service_name', name='unique_user_service')
    )
    
    # Create oauth_states table
    op.create_table('oauth_states',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('service_name', sa.String(), nullable=False),
        sa.Column('state_token', sa.String(), nullable=False),
        sa.Column('code_verifier', sa.String(), nullable=True),
        sa.Column('redirect_uri', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_used', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('state_token')
    )
    
    # Create artists table
    op.create_table('artists',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('image_url', sa.String(), nullable=True),
        sa.Column('spotify_id', sa.String(), nullable=True),
        sa.Column('lastfm_id', sa.String(), nullable=True),
        sa.Column('discogs_id', sa.String(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Create albums table
    op.create_table('albums',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('artist_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('release_year', sa.Integer(), nullable=True),
        sa.Column('image_url', sa.String(), nullable=True),
        sa.Column('spotify_id', sa.String(), nullable=True),
        sa.Column('lastfm_id', sa.String(), nullable=True),
        sa.Column('discogs_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['artist_id'], ['artists.id'], ),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create tracks table
    op.create_table('tracks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('artist_id', sa.Integer(), nullable=True),
        sa.Column('album_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('spotify_id', sa.String(), nullable=True),
        sa.Column('lastfm_id', sa.String(), nullable=True),
        sa.Column('discogs_id', sa.String(), nullable=True),
        sa.Column('apple_music_url', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['album_id'], ['albums.id'], ),
        sa.ForeignKeyConstraint(['artist_id'], ['artists.id'], ),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create filters table
    op.create_table('filters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('filter_type', sa.String(), nullable=True),
        sa.Column('value', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create service_configs table
    op.create_table('service_configs',
        sa.Column('service_name', sa.String(), nullable=False),
        sa.Column('client_id', sa.String(), nullable=True),
        sa.Column('client_secret', sa.String(), nullable=True),
        sa.Column('is_configured', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('service_name')
    )
    op.create_index(op.f('ix_service_configs_service_name'), 'service_configs', ['service_name'], unique=False)
    
    # Create similarity association tables
    op.create_table('artist_similarity',
        sa.Column('artist_id', sa.Integer(), nullable=False),
        sa.Column('related_artist_id', sa.Integer(), nullable=False),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['artist_id'], ['artists.id'], ),
        sa.ForeignKeyConstraint(['related_artist_id'], ['artists.id'], ),
        sa.PrimaryKeyConstraint('artist_id', 'related_artist_id')
    )
    
    op.create_table('album_similarity',
        sa.Column('album_id', sa.Integer(), nullable=False),
        sa.Column('related_album_id', sa.Integer(), nullable=False),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['album_id'], ['albums.id'], ),
        sa.ForeignKeyConstraint(['related_album_id'], ['albums.id'], ),
        sa.PrimaryKeyConstraint('album_id', 'related_album_id')
    )
    
    op.create_table('track_similarity',
        sa.Column('track_id', sa.Integer(), nullable=False),
        sa.Column('related_track_id', sa.Integer(), nullable=False),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], ),
        sa.ForeignKeyConstraint(['related_track_id'], ['tracks.id'], ),
        sa.PrimaryKeyConstraint('track_id', 'related_track_id')
    )


def downgrade() -> None:
    # Drop similarity tables
    op.drop_table('track_similarity')
    op.drop_table('album_similarity')
    op.drop_table('artist_similarity')
    
    # Drop main tables
    op.drop_index(op.f('ix_service_configs_service_name'), table_name='service_configs')
    op.drop_table('service_configs')
    op.drop_table('filters')
    op.drop_table('tracks')
    op.drop_table('albums')
    op.drop_table('artists')
    op.drop_table('oauth_states')
    op.drop_table('user_service_credentials')
    op.drop_table('setup_progress')
    op.drop_table('users')