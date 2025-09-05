# Location: mixview/backend/main.py
# Description: Fixed Main FastAPI application entry point with corrected CORS configuration

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
import time
import sys

# Add the current directory to Python path for absolute imports
))

# Fixed imports - use absolute imports instead of relative
from routes import auth, aggregator, search, oauth
from db_package import init_database, test_connection, close_database
from config import Config

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mixview")

# App Initialization
app = FastAPI(title="MixView Backend", version="1.0.0")

# FIXED: CORS Middleware Configuration
# Get allowed origins from environment variable
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3001,http://192.168.2.103:3001")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

# Add wildcard for development if needed
if os.getenv("DEBUG", "false").lower() == "true":
    allowed_origins.append("*")

logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # Specific origins instead of ["*"]
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicit methods
    allow_headers=["*"],
    expose_headers=["*"],  # Important: expose headers for responses
    max_age=3600,  # Cache preflight for 1 hour
)

# Exception Handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )

# Events
@app.on_event("startup")
async def on_startup():
    logger.info("MixView backend starting up...")

    # Fix: Retry logic for database connection to handle startup race conditions
    max_retries = 10
    retry_delay = 5  # seconds
    for i in range(max_retries):
        try:
            if init_database():
                logger.info("Database initialized successfully.")
                break
        except Exception as e:
            logger.error(f"Database init attempt {i+1} failed: {e}")
        
        if i < max_retries - 1:
            logger.warning(f"Database initialization failed. Retrying in {retry_delay}s... (Attempt {i+1}/{max_retries})")
            time.sleep(retry_delay)
    else:
        logger.error("Failed to initialize database after multiple retries. Continuing anyway...")
        # Don't exit - let the app start even if DB init fails

    # Now that the DB is initialized, test the connection
    if test_connection():
        logger.info("Database connection test passed.")
    else:
        logger.warning("Database connection test failed, but continuing...")
        
    # Validate configuration
    try:
        config_status = Config.validate_config()
        logger.info(f"Service configuration status: {config_status}")
    except Exception as e:
        logger.error(f"Config validation failed: {e}")
    
    logger.info("Application startup complete.")

@app.on_event("shutdown")
async def on_shutdown():
    logger.info("MixView backend shutting down...")
    try:
        close_database()
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

# Health Check
@app.get("/health")
async def health():
    try:
        config_status = Config.validate_config()
        db_status = test_connection()
        
        return {
            "status": "ok" if db_status else "degraded",
            "database": db_status,
            "services": {
                "spotify_oauth": bool(os.getenv("SPOTIFY_CLIENT_ID") and os.getenv("SPOTIFY_CLIENT_SECRET")),
                "apple_music": True,
                "musicbrainz": True,
            },
            "features": {
                "multi_user": True,
                "user_service_management": True,
                "oauth_flows": True,
                "credential_encryption": True
            },
            "cors_origins": allowed_origins,  # Add CORS info to health check
            "cors_config": {
                "credentials_enabled": "*" not in allowed_origins,
                "development_mode": os.getenv("DEBUG", "false").lower() == "true"
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "database": False
        }

# Routers
try:
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(aggregator.router, prefix="/aggregator", tags=["aggregator"])
    app.include_router(search.router, prefix="/search", tags=["search"])
    app.include_router(oauth.router, prefix="/oauth", tags=["oauth"])
    logger.info("All routers loaded successfully")
except Exception as e:
    logger.error(f"Failed to load routers: {e}")

# Setup status endpoint for first-run detection
@app.get("/setup/status")
async def setup_status():
    """Check if the application requires initial setup"""
    try:
        config_status = Config.validate_config()
        has_services = any(config_status.values())
        
        return {
            "requires_setup": not has_services,
            "services_configured": config_status,
            "reason": "No services configured" if not has_services else "Setup complete"
        }
    except Exception as e:
        logger.error(f"Setup status check failed: {e}")
        return {"requires_setup": True, "reason": f"Error checking setup: {str(e)}"}

# Root endpoint
@app.get("/")
async def root():
    return {"message": "MixView API", "version": "1.0.0", "docs": "/docs", "health": "/health"}

# FIXED: Explicit OPTIONS route handler for CORS preflight requests
@app.options("/{path:path}")
async def options_handler(path: str):
    """Handle CORS preflight requests"""
    return {"message": "CORS preflight successful"}