# Location: mixview/backend/__init__.py
# Description: Backend package initialization with proper model exports

__version__ = "1.0.0"

# Import all models for easy access
from .db_package.models import (
    User, Artist, Album, Track, Filter, 
    UserServiceCredential, OAuthState
)

__all__ = [
    'User', 'Artist', 'Album', 'Track', 'Filter',
    'UserServiceCredential', 'OAuthState'
]