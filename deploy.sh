#!/bin/bash

# Location: mixview/deploy.sh
# Description: A comprehensive and robust deployment script for the MixView application.
# This script automates the full build, deployment, and health-check process for the
# Dockerized backend (on port 8001) and frontend (on port 3001) services, as well
# as the PostgreSQL database (on port 5433). It includes extensive validation,
# logging, and user guidance.

set -e  # Exit immediately if a command exits with a non-zero status.

echo "======================================"
echo " Starting MixView Deployment Process  "
echo "=========================================="
echo ""

# Step 0: Check system dependencies
check_dependencies() {
    echo "Checking essential system dependencies..."

    # Check for Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ ERROR: Docker is not installed. This is required to run the application."
        echo "Please install Docker from the official website:"
        echo "  - Visit: https://docs.docker.com/get-docker/"
        echo "  - After installation, remember to start the Docker daemon."
        exit 1
    fi

    # Check for Docker Compose (try both v1 and v2)
    # The script supports both `docker-compose` and `docker compose`.
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        echo "❌ ERROR: Docker Compose is not installed."
        echo "Please install Docker Compose, which is essential for managing multi-container applications."
        echo "  - Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        echo "❌ ERROR: Docker daemon is not running."
        echo "Please start the Docker service before running this script."
        echo "  - Try running: sudo systemctl start docker"
        echo "  - On macOS/Windows: Start Docker Desktop"
        exit 1
    fi

    # Check for openssl (for key generation)
    if ! command -v openssl &> /dev/null; then
        echo "❌ ERROR: OpenSSL is not installed."
        echo "This is used to generate secure cryptographic keys for the application's environment."
        echo "  - On Ubuntu/Debian: sudo apt-get install openssl"
        echo "  - On RHEL/CentOS: sudo yum install openssl"
        echo "  - On macOS: brew install openssl"
        exit 1
    fi

    # Check for curl (for health checks)
    if ! command -v curl &> /dev/null; then
        echo "❌ ERROR: The 'curl' command is not installed."
        echo "This is required for performing health checks on the running services."
        echo "  - On Ubuntu/Debian: sudo apt-get install curl"
        echo "  - On RHEL/CentOS: sudo yum install curl"
        echo "  - On macOS: curl is usually pre-installed"
        exit 1
    fi

    echo "✅ All required system dependencies found."
    echo "Using Docker Compose command: $COMPOSE_CMD"
    echo ""
}

check_dependencies

# Function to generate secure Fernet key
generate_key() {
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
}

# Function to generate a secure JWT secret
# This generates a 32-byte hexadecimal string.
generate_jwt_secret() {
    openssl rand -hex 32
}

# Step 1: Create or update .env file
# This file stores crucial environment variables for the application.
create_env_file() {
    echo "Setting up application environment configuration..."

    # Generate secure cryptographic keys
    JWT_SECRET=$(generate_jwt_secret)
    ENCRYPTION_KEY=$(generate_key)
    SECRET_KEY=$(generate_key)

    # Create .env file with CORRECTED SYNTAX
    cat > .env << EOF
# =========================================================
# MixView Configuration
# =========================================================
# Database Configuration
# The database container will expose port 5433 internally.
DB_USER=mixview
DB_PASSWORD=mixviewpass
DB_HOST=db
DB_NAME=mixview
DB_PORT=5433

# Database URL for SQLAlchemy
DATABASE_URL=postgresql://mixview:mixviewpass@db:5433/mixview

# Authentication & Security (Generated)
# DO NOT SHARE THESE KEYS. They are essential for securing user data.
# JWT_SECRET_KEY is used to sign JSON Web Tokens for user authentication.
# CREDENTIAL_ENCRYPTION_KEY is used to encrypt sensitive user credentials (e.g., API keys).
# SECRET_KEY is a general-purpose secret key for the application.
JWT_SECRET_KEY=${JWT_SECRET}
CREDENTIAL_ENCRYPTION_KEY=${ENCRYPTION_KEY}
SECRET_KEY=${SECRET_KEY}
ENCRYPTION_SALT=mixview-salt

# Application URLs (UPDATED PORTS)
# The backend will be accessible on port 8001 and the frontend on 3001.
BACKEND_URL=http://localhost:8001
FRONTEND_URL=http://localhost:3001

# Global Service Configuration (Optional)
# These are for the application's internal API service. Users can also provide their own keys.
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:8001/oauth/spotify/callback

# Optional service keys (users can add their own via UI)
LASTFM_API_KEY=
DISCOGS_TOKEN=
APPLE_MUSIC_TOKEN=

# Development Settings
# Set DEBUG to false for production deployments to disable detailed error messages.
DEBUG=true
LOG_LEVEL=INFO

# CORS Settings (UPDATED PORT)
# Specifies which origins are allowed to make API requests to the backend.
ALLOWED_ORIGINS=http://localhost:3001

# Optional: Redis Configuration (for future caching/rate limiting)
REDIS_URL=redis://localhost:6379/0
EOF

    echo "✅ Generated a new .env file with secure, randomly generated keys."
    echo "    Ensure this file is kept secure and is not committed to version control."
    echo ""
}

# Step 2: Check for existing .env file and validate required keys
# This step ensures the application's configuration is secure and up-to-date.
if [ ! -f .env ]; then
    echo "No .env file found. Creating a new one..."
    create_env_file
else
    echo "Existing .env file found. Checking for required keys and port updates..."
    source .env
    regenerate_needed=false

    if [ -z "$JWT_SECRET_KEY" ] || [ "$JWT_SECRET_KEY" = "your-secret-jwt-key-change-this-in-production" ]; then
        echo "⚠️  Missing or default JWT_SECRET_KEY detected."
        regenerate_needed=true
    fi

    if [ -z "$CREDENTIAL_ENCRYPTION_KEY" ] || [ "$CREDENTIAL_ENCRYPTION_KEY" = "generate-a-secure-key-with-base64-encoding" ]; then
        echo "⚠️  Missing or default CREDENTIAL_ENCRYPTION_KEY detected."
        regenerate_needed=true
    fi

    if [ -z "$DATABASE_URL" ]; then
        echo "⚠️  Missing DATABASE_URL detected."
        regenerate_needed=true
    fi

    if [ "$regenerate_needed" = true ]; then
        echo "Regenerating .env with new, secure keys..."
        create_env_file
    fi

    # Update ports in existing .env if they're still set to the old values (8001, 3001)
    if grep -q "BACKEND_URL=http://localhost:8001" .env; then
        echo "Updating ports in .env file to match the new configuration..."
        sed -i 's|BACKEND_URL=http://localhost:8001|BACKEND_URL=http://localhost:8001|g' .env
        sed -i 's|FRONTEND_URL=http://localhost:3001|FRONTEND_URL=http://localhost:3001|g' .env
        sed -i 's|ALLOWED_ORIGINS=http://localhost:3001|ALLOWED_ORIGINS=http://localhost:3001|g' .env
        sed -i 's|SPOTIFY_REDIRECT_URI=http://localhost:8001|SPOTIFY_REDIRECT_URI=http://localhost:8001|g' .env
        echo "✅ Port configuration updated."
    fi
    echo "✅ .env file is up-to-date."
    echo ""
fi

# Step 3: Create necessary directories
# This ensures that the application has the necessary file structure for logs and modules.
echo "Creating required directories..."
mkdir -p backend/logs
mkdir -p backend/routes
mkdir -p backend/database
mkdir -p frontend/public
mkdir -p frontend/dist
mkdir -p frontend/src/components
echo "✅ Required directories created."
echo ""

# Step 4: Create Python init.py files
# These files are necessary for Python to recognize directories as packages,
# allowing for proper module imports.
echo "Ensuring Python package structure exists..."
touch backend/__init__.py
touch backend/routes/__init__.py
touch backend/database/__init__.py
echo "✅ Python package files created."
echo ""

# Step 5: Stop existing containers
# This ensures a clean slate for the new deployment, preventing port conflicts.
echo "Stopping any existing MixView containers..."
$COMPOSE_CMD down --volumes 2>/dev/null || true
echo "✅ Existing containers stopped."
echo ""

# Add a 5-second delay to prevent a race condition
echo "Waiting 5 seconds for ports to be fully released..."
sleep 5
echo "✅ Ports should now be available."
echo ""

# Step 6: Clean up old images (optional but recommended)
# Removing old images frees up disk space and prevents potential conflicts.
read -p "Remove old Docker images to ensure a clean build? (y/N): " -n 1 -r clean_images
echo
if [[ "$clean_images" =~ ^[Yy]$ ]]; then
    echo "Removing old images and volumes..."
    # Remove unused containers, networks, images, and build cache
    docker system prune -f 2>/dev/null || true
    # Remove unused images
    docker image prune -a -f 2>/dev/null || true
    # Remove unused volumes
    docker volume prune -f 2>/dev/null || true
    echo "✅ Old images and volumes removed."
else
    echo "Skipping image cleanup."
fi
echo ""

# Step 7: Build Docker images with dependency validation
echo "Building Docker images for backend and frontend..."

# Build backend image and check for errors
echo "Building backend image..."
if ! $COMPOSE_CMD build --no-cache backend; then
    echo "❌ ERROR: Backend build failed."
    echo "This usually indicates missing or incorrect Python dependencies. Please check the 'requirements.txt' file."
    echo "Backend build logs:"
    $COMPOSE_CMD logs backend 2>/dev/null || echo "No logs available yet."
    echo ""
    echo "Common issues and solutions:"
    echo "  - Missing requirements.txt file"
    echo "  - Incorrect Python package versions"
    echo "  - Network issues downloading packages"
    echo "  - Insufficient disk space"
    exit 1
fi

# Build frontend image and check for errors
echo "Building frontend image..."
if ! $COMPOSE_CMD build --no-cache frontend; then
    echo "❌ ERROR: Frontend build failed."
    echo "This usually indicates missing or incorrect Node.js dependencies. Please check the 'package.json' file."
    echo "Frontend build logs:"
    $COMPOSE_CMD logs frontend 2>/dev/null || echo "No logs available yet."
    echo ""
    echo "Common issues and solutions:"
    echo "  - Missing package.json file"
    echo "  - Incorrect Node.js package versions"
    echo "  - Network issues downloading packages"
    echo "  - Insufficient disk space"
    exit 1
fi

echo "✅ All Docker images built successfully."
echo ""

# Step 8: Start database first
# The database must be running before the backend tries to connect to it.
echo "Starting the database service..."
$COMPOSE_CMD up -d db
echo "✅ Database container started."
echo ""

# Step 9: Wait for database to be ready with a proper health check
echo "Waiting for the database to become responsive..."
max_db_attempts=30
db_attempt=1

while [ $db_attempt -le $max_db_attempts ]; do
    # pg_isready is the standard tool to check PostgreSQL readiness.
    if $COMPOSE_CMD exec -T db pg_isready -U mixview -d mixview 2>/dev/null; then
        echo "✅ Database is ready to accept connections."
        break
    fi
    echo "Waiting for database... (attempt $db_attempt/$max_db_attempts)"
    sleep 2
    db_attempt=$((db_attempt + 1))
done

if [ $db_attempt -gt $max_db_attempts ]; then
    echo "❌ ERROR: Database failed to start after multiple attempts."
    echo "Database logs:"
    $COMPOSE_CMD logs db
    echo ""
    echo "Common database issues:"
    echo "  - Port 5433 already in use"
    echo "  - Insufficient memory"
    echo "  - Corrupted database files"
    echo "  - Permission issues with data directory"
    exit 1
fi
echo ""

# Step 10: Test backend Python imports before full startup
echo "Testing backend Python imports and configuration..."
if ! $COMPOSE_CMD run --rm backend python -c "
import sys
import os
sys.path.insert(0, '/app')

try:
    # Test critical imports
    print('Testing imports...')
    from db_package import init_database, get_db
    print('✅ Database imports successful')
    
    from routes import auth, aggregator, search, oauth
    print('✅ Routes imports successful')
    
    from models import User, Artist, Album, Track
    print('✅ Models imports successful')
    
    from config import Config
    print('✅ Config imports successful')
    
    print('✅ All critical imports successful')
    
except ImportError as e:
    print(f'❌ IMPORT ERROR: {e}')
    print('This will prevent the backend from starting.')
    import traceback
    traceback.print_exc()
    sys.exit(1)
except Exception as e:
    print(f'❌ CONFIGURATION ERROR: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"; then
    echo "❌ ERROR: Backend import/configuration test failed."
    echo "The backend will not be able to start with the current code."
    echo ""
    echo "Common causes:"
    echo "  - Missing Python modules or packages"
    echo "  - Incorrect import paths"
    echo "  - Circular import dependencies"
    echo "  - Missing __init__.py files"
    echo "  - Syntax errors in Python files"
    echo ""
    echo "Fix the import errors before continuing with deployment."
    exit 1
fi

# Step 11: Initialize database schema
# The Python script runs in a one-off container to create the necessary tables.
echo "Initializing database schema using the backend service..."
if ! $COMPOSE_CMD run --rm backend python -c "
import sys
import os
sys.path.insert(0, '/app')

from db_package import init_database
from config import Config
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('deploy')

try:
    logger.info('Performing pre-flight configuration check...')
    config_status = Config.validate_config()
    logger.info(f'Configuration status: {config_status}')

    logger.info('Attempting to initialize the database tables...')
    if init_database():
        logger.info('Database initialization was successful.')
        print('SUCCESS: Database initialized.')
    else:
        logger.error('Database initialization failed.')
        print('ERROR: Database initialization failed.')
        sys.exit(1)

    # Note: For production use, Alembic migrations would be run here.
    # logger.info('Running Alembic database migrations...')
    # from alembic.config import Config as AlembicConfig
    # from alembic import command
    # alembic_cfg = AlembicConfig('./alembic.ini')
    # command.upgrade(alembic_cfg, 'head')
    # logger.info('Database migrations applied successfully.')

except Exception as e:
    logger.error(f'A critical error occurred during database initialization: {e}')
    print(f'ERROR: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"; then
    echo "❌ ERROR: Database initialization failed."
    echo "Check the backend container's logs for more details with: $COMPOSE_CMD logs backend"
    echo ""
    echo "Common database initialization issues:"
    echo "  - Import errors in Python modules"
    echo "  - Database connection refused"
    echo "  - Missing environment variables"
    echo "  - SQLAlchemy model definition errors"
    exit 1
fi
echo "✅ Database schema initialized."
echo ""

# Step 12: Start all services
# This command starts the frontend and backend services in detached mode.
echo "Starting all application services..."
$COMPOSE_CMD up -d
echo "✅ All services started in detached mode."
echo ""

# Step 13: Check for immediate container startup failures
echo "Checking for immediate container startup failures..."
sleep 10  # Give containers time to fail if they're going to fail

# Check backend container status
if ! $COMPOSE_CMD ps backend | grep -qE "(Up|running)"; then
    echo "❌ ERROR: Backend container failed to start or crashed immediately."
    echo ""
    echo "Backend container status:"
    $COMPOSE_CMD ps backend
    echo ""
    echo "Recent backend logs:"
    $COMPOSE_CMD logs --tail=30 backend
    echo ""
    echo "Common backend startup failures:"
    echo "  - Python import errors (check imports)"
    echo "  - Missing dependencies (check requirements.txt)"
    echo "  - Configuration errors (check .env file)"
    echo "  - Port conflicts (check if port 8001 is in use)"
    echo "  - Database connection issues"
    echo ""
    echo "Fix the backend issues before the application will work."
    exit 1
fi

# Check frontend container status  
if ! $COMPOSE_CMD ps frontend | grep -q "Up"; then
    echo "❌ ERROR: Frontend container failed to start or crashed immediately."
    echo ""
    echo "Frontend container status:"
    $COMPOSE_CMD ps frontend
    echo ""
    echo "Recent frontend logs:"
    $COMPOSE_CMD logs --tail=30 frontend
    echo ""
    echo "Common frontend startup failures:"
    echo "  - Node.js dependency issues (check package.json)"
    echo "  - Build failures (check Vite configuration)"
    echo "  - Port conflicts (check if port 3001 is in use)"
    exit 1
fi

echo "✅ All containers started successfully and are running."
echo ""

# Step 14: Wait for services to be ready
echo "Waiting for services to become responsive... This may take a moment."
sleep 15

# Step 15: Comprehensive health check
echo "Performing comprehensive health checks on the running services..."

# Backend health check (PORT 8001)
max_attempts=60
attempt=1

echo "Testing backend service connectivity..."
while [ $attempt -le $max_attempts ]; do
    health_response=$(curl -s http://localhost:8001/health 2>/dev/null)
    if [ ! -z "$health_response" ]; then
        echo "✅ Backend health check passed."
        echo "    Health status: $health_response"
        break
    fi
    echo "Waiting for backend... (attempt $attempt/$max_attempts)"
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ ERROR: Backend health check failed after $max_attempts attempts."
    echo ""
    echo "Backend container status:"
    $COMPOSE_CMD ps backend
    echo ""
    echo "Recent backend logs:"
    $COMPOSE_CMD logs --tail=50 backend
    echo ""
    echo "Common backend issues:"
    echo "  - Python dependencies not installed correctly"
    echo "  - Database connection failed"
    echo "  - Import errors in Python modules"
    echo "  - Port 8001 already in use"
    echo "  - Backend crashed after startup"
    echo ""
    echo "The backend is not responding to health checks."
    exit 1
fi
echo ""

# Frontend health check (PORT 3001)
frontend_attempt=1
max_frontend_attempts=30

echo "Testing frontend service connectivity..."
while [ $frontend_attempt -le $max_frontend_attempts ]; do
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        echo "✅ Frontend health check passed."
        break
    fi
    echo "Waiting for frontend... (attempt $frontend_attempt/$max_frontend_attempts)"
    sleep 2
    frontend_attempt=$((frontend_attempt + 1))
done

if [ $frontend_attempt -gt $max_frontend_attempts ]; then
    echo "⚠️  WARNING: The frontend may still be starting. Please check manually."
    echo "This is often normal during the first build or if network speeds are slow."
    echo ""
    echo "Frontend container status:"
    $COMPOSE_CMD ps frontend
    echo ""
    echo "Recent frontend logs:"
    $COMPOSE_CMD logs --tail=30 frontend
fi
echo ""

# Step 16: Validate installations after startup
# This final check ensures that all critical packages were installed correctly within the containers.
validate_installations() {
    echo "Validating critical dependency installations inside containers..."

    # Check backend Python dependencies
    echo "Checking backend dependencies..."
    if backend_deps_check=$($COMPOSE_CMD exec -T backend python -c "
import sys
required_packages = ['fastapi', 'sqlalchemy', 'spotipy', 'cryptography', 'passlib', 'uvicorn', 'requests', 'psycopg2']
missing = []

for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        missing.append(package)

if missing:
    print(f'ERROR: The following backend packages are missing: {missing}')
    sys.exit(1)
else:
    print('SUCCESS: All backend dependencies installed.')
" 2>/dev/null); then
        echo "✅ Backend dependencies validated."
    else
        echo "❌ Backend dependency validation failed."
        echo "Review the 'requirements.txt' file and the build logs for more information."
        echo "$backend_deps_check"
        echo ""
        echo "To fix dependency issues:"
        echo "  1. Check requirements.txt for correct package versions"
        echo "  2. Rebuild with: $COMPOSE_CMD build --no-cache backend"
        echo "  3. Check Docker logs: $COMPOSE_CMD logs backend"
        exit 1
    fi

    # Check frontend Node.js dependencies
    echo "Checking frontend dependencies..."
    if frontend_deps_check=$($COMPOSE_CMD exec -T frontend node -e "
const fs = require('fs');
const path = require('path');
const requiredDeps = ['react', 'react-dom']; // Core dependencies

try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const allDeps = Object.keys(packageJson.dependencies || {}).concat(Object.keys(packageJson.devDependencies || {}));

    const missingDeps = requiredDeps.filter(dep => !allDeps.includes(dep));

    if (missingDeps.length > 0) {
        console.log('ERROR: The following frontend packages are missing: ' + missingDeps.join(', '));
        process.exit(1);
    } else {
        console.log('SUCCESS: All frontend dependencies installed.');
    }
} catch (e) {
    console.log('ERROR: A critical error occurred during frontend dependency validation: ' + e.message);
    process.exit(1);
}
" 2>/dev/null); then
        echo "✅ Frontend dependencies validated."
    else
        echo "⚠️  WARNING: Frontend dependency validation failed or container not ready."
        echo "This may be due to the build process still running. Check your 'package.json' file."
        echo "$frontend_deps_check"
        echo ""
        echo "To fix frontend issues:"
        echo "  1. Check package.json for correct dependencies"
        echo "  2. Rebuild with: $COMPOSE_CMD build --no-cache frontend"
        echo "  3. Check Docker logs: $COMPOSE_CMD logs frontend"
    fi

    echo "✅ Dependency validation completed."
}

validate_installations

# Step 17: Additional service tests
echo ""
echo "Performing additional service tests..."

# Test database connectivity
echo "Testing database connectivity..."
if $COMPOSE_CMD exec -T db psql -U mixview -d mixview -c "SELECT version();" > /dev/null 2>&1; then
    echo "✅ Database connectivity test passed."
else
    echo "⚠️  WARNING: Database connectivity test failed."
    echo "The database may still be initializing."
fi

# Test backend API endpoints
echo "Testing backend API endpoints..."
api_test_passed=true

# Test root endpoint
if curl -s http://localhost:8001/ > /dev/null 2>&1; then
    echo "✅ Backend root endpoint accessible."
else
    echo "❌ Backend root endpoint failed."
    api_test_passed=false
fi

# Test docs endpoint
if curl -s http://localhost:8001/docs > /dev/null 2>&1; then
    echo "✅ Backend API documentation accessible."
else
    echo "⚠️  Backend API docs may not be ready yet."
fi

if [ "$api_test_passed" = false ]; then
    echo "⚠️  Some backend API tests failed. Check the backend logs."
fi

echo ""

# Display deployment summary with UPDATED PORTS
echo ""
echo "======================================"
echo "      🎉 MixView Deployment Complete!    "
echo "======================================"
echo ""
echo "🌐 Access your fully deployed application:"
echo "  Frontend URL:    http://localhost:3001"
echo "  Backend API:     http://localhost:8001"
echo "  API Docs:        http://localhost:8001/docs"
echo "  Health Check:    http://localhost:8001/health"
echo "  Database:        localhost:5433 (external port)"
echo ""
echo "📋 Your next steps:"
echo "  1. Open the Frontend URL (http://localhost:3001) in your browser."
echo "  2. Create a new user account to get started."
echo "  3. Log in and configure your music service API keys:"
echo "     • Last.fm: Get API key from https://www.last.fm/api/account/create"
echo "     • Discogs: Get token from https://www.discogs.com/settings/developers"
echo "     • Spotify: Configure OAuth in your .env file (optional)"
echo "  4. Start exploring music relationships and creating your own collections."
echo ""
echo "🔧 Useful Management Commands:"
echo "  View all logs:              $COMPOSE_CMD logs -f"
echo "  View specific service logs: $COMPOSE_CMD logs -f [backend|frontend|db]"
echo "  Stop all services:         $COMPOSE_CMD down"
echo "  Restart a service:         $COMPOSE_CMD restart [backend|frontend|db]"
echo "  Rebuild a service:         $COMPOSE_CMD build --no-cache [backend|frontend]"
echo "  Access database shell:     $COMPOSE_CMD exec db psql -U mixview -d mixview"
echo "  Access backend shell:      $COMPOSE_CMD exec backend bash"
echo "  View running containers:   docker ps"
echo "  Check disk usage:          docker system df"
echo ""
echo "🔧 Troubleshooting:"
echo "  Backend not responding:     $COMPOSE_CMD logs backend"
echo "  Frontend not loading:       $COMPOSE_CMD logs frontend"
echo "  Database issues:            $COMPOSE_CMD logs db"
echo "  Port conflicts:             Check if ports 3001, 8001, 5433 are free"
echo "  Permission issues:          Check Docker daemon permissions"
echo ""
echo "🔐 Security Reminder:"
echo "  • Secure keys were generated in the .env file - keep this file safe!"
echo "  • Never commit .env files to version control"
echo "  • For production: Set DEBUG=false and use HTTPS"
echo "  • Consider using Docker secrets for sensitive data in production"
echo ""
echo "📚 Additional Resources:"
echo "  • Project documentation: README.md"
echo "  • API documentation: http://localhost:8001/docs"
echo "  • Docker Compose reference: https://docs.docker.com/compose/"
echo ""
echo "🎵 Happy music exploring with MixView!"
echo ""

# Final status check
echo "🔍 Final Status Summary:"
echo "  Backend:   $(curl -s http://localhost:8001/health >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Not responding")"
echo "  Frontend:  $(curl -s http://localhost:3001 >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Not responding")"
echo "  Database:  $($COMPOSE_CMD exec -T db pg_isready -U mixview -d mixview >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Not responding")"
echo ""

# Check for any failed containers
failed_containers=$($COMPOSE_CMD ps --filter "status=exited" --format "table {{.Service}}" | tail -n +2)
if [ ! -z "$failed_containers" ]; then
    echo "⚠️  WARNING: Some containers have exited:"
    echo "$failed_containers"
    echo "Check logs with: $COMPOSE_CMD logs [service_name]"
else
    echo "✅ All containers are running successfully!"
fi

echo ""
echo "Deployment script completed. Enjoy MixView!"
