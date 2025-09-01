# Location: mixview/backend/database/base.py
# Description: Defines the declarative base for all database models.

from sqlalchemy.ext.declarative import declarative_base

# This is the base class from which all models will inherit.
Base = declarative_base()
