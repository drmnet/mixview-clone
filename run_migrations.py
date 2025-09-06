#!/usr/bin/env python3
# Location: mixview/run_migrations.py
# Description: Enhanced database migration script using Alembic

import os
import sys
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "backend"))

def run_alembic_migrations():
    """Run Alembic database migrations"""
    try:
        from alembic.config import Config
        from alembic import command
        
        # Set up Alembic configuration
        alembic_cfg = Config("alembic.ini")
        
        # Override database URL from environment if available
        database_url = os.getenv('DATABASE_URL')
        if database_url:
            alembic_cfg.set_main_option('sqlalchemy.url', database_url)
            logger.info(f"Using database URL from environment")
        
        logger.info("Running Alembic database migrations...")
        
        # Run migrations to latest revision
        command.upgrade(alembic_cfg, "head")
        
        logger.info("✅ Database migrations completed successfully")
        return True
        
    except ImportError as e:
        logger.error(f"Alembic not available: {e}")
        logger.info("Falling back to direct database initialization...")
        return False
    except Exception as e:
        logger.error(f"❌ Database migration failed: {e}")
        return False

def run_direct_initialization():
    """Fallback to direct database initialization"""
    try:
        from backend.db_package.database import init_database
        from backend.config import Config
        
        logger.info("Performing direct database initialization...")
        
        # Validate configuration
        config_status = Config.validate_config()
        logger.info(f"Configuration status: {config_status}")
        
        # Initialize database
        if init_database():
            logger.info("✅ Direct database initialization successful")
            return True
        else:
            logger.error("❌ Direct database initialization failed")
            return False
            
    except ImportError as e:
        logger.error(f"Failed to import required modules: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Direct initialization failed: {e}")
        return False

def check_alembic_setup():
    """Check if Alembic is properly set up"""
    alembic_ini = Path("alembic.ini")
    alembic_dir = Path("alembic")
    
    if not alembic_ini.exists():
        logger.warning("alembic.ini not found")
        return False
    
    if not alembic_dir.exists():
        logger.warning("alembic directory not found")
        return False
    
    if not (alembic_dir / "env.py").exists():
        logger.warning("alembic/env.py not found")
        return False
    
    return True

def main():
    """Main migration runner"""
    logger.info("🚀 Starting MixView database migration process")
    
    # Check if we're in the right directory
    if not Path("backend").exists():
        logger.error("❌ 'backend' directory not found. Run this script from the mixview root directory.")
        sys.exit(1)
    
    success = False
    
    # Try Alembic first if it's set up
    if check_alembic_setup():
        logger.info("📋 Alembic configuration found, attempting migration...")
        success = run_alembic_migrations()
    else:
        logger.info("⚠️ Alembic not configured, using direct initialization...")
    
    # Fallback to direct initialization if Alembic failed
    if not success:
        logger.info("🔄 Attempting direct database initialization...")
        success = run_direct_initialization()
    
    if success:
        logger.info("🎉 Database setup completed successfully!")
        
        # Additional setup steps
        logger.info("💡 Next steps:")
        logger.info("  1. Start the application: ./deploy.sh")
        logger.info("  2. Create a user account")
        logger.info("  3. Configure your music service API keys")
        logger.info("  4. Start discovering music!")
        
    else:
        logger.error("💥 Database setup failed!")
        logger.info("🔧 Troubleshooting steps:")
        logger.info("  1. Check DATABASE_URL environment variable")
        logger.info("  2. Ensure PostgreSQL is running")
        logger.info("  3. Verify database credentials")
        logger.info("  4. Check network connectivity to database")
        sys.exit(1)

if __name__ == "__main__":
    main()