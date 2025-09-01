# Location: mixview/backend/database/models.py
# Description: Database models for MixView backend, including service credentials.

from sqlalchemy import Column, String, Boolean
from .base import Base

class ServiceConfig(Base):
    """
    Database model for storing service credentials.
    This table will hold API keys and secrets for various services.
    """
    __tablename__ = "service_configs"

    # The service name acts as the primary key (e.g., "spotify", "lastfm").
    service_name = Column(String, primary_key=True, index=True)
    
    # Store the client ID and secret for the service.
    client_id = Column(String, nullable=True)
    client_secret = Column(String, nullable=True)
    
    # A flag to easily check if the service is fully configured.
    is_configured = Column(Boolean, default=False)
    
    def __repr__(self):
        return f"<ServiceConfig(service_name='{self.service_name}')>"
