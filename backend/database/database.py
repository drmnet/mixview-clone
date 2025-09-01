# Location: mixview/backend/database/database.py
# Description: Database connection and session management with fixed imports

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import SQLAlchemyError
import logging
import os
import sys

# FIX: Change absolute import to relative import.
# The Dockerfile now copies the contents of the 'backend' directory directly
# into the container's '/app' directory, so there is no 'backend' package
# at the top level.
from .base import Base
# FIX: Removed the import of "Config" to break the circular dependency.
# Get the database URL from environment variables directly.
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set.")

logger = logging.getLogger(__name__)

# Database engine and session setup
engine = None
SessionLocal = None

def init_database():
    """Initialize database connection and create tables"""
    global engine, SessionLocal
    
    try:
        # Use postgresql+psycopg2 to ensure the correct driver is used
        database_url = DATABASE_URL
        if not database_url.startswith("postgresql+psycopg2"):
            database_url = database_url.replace("postgresql", "postgresql+psycopg2")

        engine = create_engine(database_url, echo=False)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        
        # Create all tables
        logger.info("Creating database tables...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized successfully")
        
        return True
        
    except SQLAlchemyError as e:
        logger.error(f"Database initialization failed: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during database init: {e}")
        return False

def get_db() -> Session:
    """Dependency to get database session"""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")
    
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_connection() -> bool:
    """Test database connection"""
    try:
        if engine is None:
            logger.error("Database engine not initialized")
            return False
            
        with engine.connect() as conn:
            # FIX: Use text() to explicitly mark the query as raw SQL
            conn.execute(text("SELECT 1"))
            logger.info("Database connection test successful")
            return True
            
    except SQLAlchemyError as e:
        logger.error(f"Database connection test failed: {e}")
        return False

def close_database():
    """Close database connections"""
    global engine, SessionLocal
    
    if engine:
        engine.dispose()
        logger.info("Database connections closed")
    
    engine = None
    SessionLocal = None
