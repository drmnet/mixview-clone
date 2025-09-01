# Location: mixview/run_migrations.py
# Description: This is the main entrypoint script for database initialization.
# It sets the Python path correctly before importing and running the init function.

import os
import sys
import logging

# Set up logging for this script
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Add the project's root directory to the Python path.
# This allows for absolute imports like `from backend.database.database`.
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

# Now import the initialization function from the correct location
try:
    from backend.database.database import init_database
except ImportError as e:
    logging.error(f"Failed to import init_database: {e}")
    logging.info(f"Current sys.path: {sys.path}")
    sys.exit(1)

if __name__ == "__main__":
    logging.info("Starting database schema initialization...")
    if init_database():
        logging.info("✅ Database schema initialized successfully.")
    else:
        logging.error("❌ Database schema initialization failed.")
        sys.exit(1)
