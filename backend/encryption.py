# Location: mixview/backend/encryption.py
# Description: Credential encryption with fixed imports

import os
import json
import base64
from typing import Dict, Any, Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import logging

logger = logging.getLogger(__name__)

class CredentialEncryption:
    """Handles encryption and decryption of user service credentials"""
    
    def __init__(self):
        self.encryption_key = self._get_or_create_key()
        self.cipher_suite = Fernet(self.encryption_key)
    
    def _get_or_create_key(self) -> bytes:
        """Get encryption key from environment or generate one"""
        key_env = os.getenv('CREDENTIAL_ENCRYPTION_KEY')
        
        if key_env:
            try:
                # Fernet expects a base64-encoded key as bytes
                return key_env.encode()
            except Exception as e:
                logger.warning(f"Invalid encryption key in environment: {e}")
        
        # Fallback: Generate a new key from SECRET_KEY.
        password = os.getenv('SECRET_KEY', 'default-secret-change-this').encode()
        salt = os.getenv('ENCRYPTION_SALT', 'mixview-salt').encode()
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        
        # Generate the key and encode it properly for Fernet
        key = base64.urlsafe_b64encode(kdf.derive(password))

        logger.warning(
            "Generated new encryption key from SECRET_KEY. "
            "Set CREDENTIAL_ENCRYPTION_KEY in environment for consistency and security."
        )
        return key
    
    def encrypt_credentials(self, credentials: Dict[str, Any]) -> str:
        """Encrypt credentials dictionary to string"""
        try:
            json_str = json.dumps(credentials)
            encrypted_bytes = self.cipher_suite.encrypt(json_str.encode())
            return encrypted_bytes.decode()
        except Exception as e:
            logger.error(f"Failed to encrypt credentials: {e}")
            raise
    
    def decrypt_credentials(self, encrypted_data: str) -> Dict[str, Any]:
        """Decrypt credentials string to dictionary"""
        try:
            decrypted_bytes = self.cipher_suite.decrypt(encrypted_data.encode())
            return json.loads(decrypted_bytes.decode())
        except Exception as e:
            logger.error(f"Failed to decrypt credentials: {e}")
            return {}

# Global instance
credential_encryption = CredentialEncryption()
