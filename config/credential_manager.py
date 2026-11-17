"""
Secure Credential Manager for AuraTrader-AngelOne
Handles encrypted storage for API Key, Client ID, PIN/TOTP
"""

import os
import secrets
import re
import json
import base64
import hashlib
import logging
from pathlib import Path
from typing import Optional, Dict, List, Any
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from datetime import datetime

# --- Sensitive Secret Redaction Filter & Utility ---

SENSITIVE_PATTERNS = [
    # JWT tokens
    (re.compile(r'eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+'), '[REDACTED_JWT]'),
    # Bearer tokens
    (re.compile(r'(Bearer\s+)[a-zA-Z0-9_\-\.]{15,}', re.IGNORECASE), r'\1[REDACTED_TOKEN]'),
    # 6-digit numeric OTP / TOTP codes in messages
    (re.compile(r'((?:totp|otp|code)\s*(?:code)?\s*[:=]?\s*)\b\d{6}\b', re.IGNORECASE), r'\1[REDACTED_OTP]'),
    # 4-digit MPIN in messages
    (re.compile(r'((?:mpin)\s*[:=]?\s*)\b\d{4}\b', re.IGNORECASE), r'\1[REDACTED_MPIN]'),
    # Quoted or unquoted key-value secret patterns
    (re.compile(r'((?:["\']|\b)(?:mpin|password|pin|trading_pin|totp|totp_secret|apiKey|api_key|secret|refreshToken|feedToken|session_token|auth_token)(?:["\']|\b)\s*[:=]\s*["\']?)([^"\'\s,;}]+)(["\']?)', re.IGNORECASE), r'\1[REDACTED]\3'),
]


def redact_secrets(text: Any) -> str:
    """Sanitize strings by redacting API keys, passwords, PINs, TOTP secrets, and JWTs."""
    if not isinstance(text, str):
        text = str(text)
    for pattern, repl in SENSITIVE_PATTERNS:
        text = pattern.sub(repl, text)
    return text


class SecretRedactionFilter(logging.Filter):
    """Logging filter that redacts sensitive credentials from all logging output."""
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_secrets(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: redact_secrets(v) if isinstance(v, str) else v for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(redact_secrets(v) if isinstance(v, str) else v for v in record.args)
        return True


# --- Windows DPAPI Key Protection ---

def dpapi_protect(data: bytes) -> bytes:
    """Encrypt raw bytes using Windows Data Protection API (DPAPI)."""
    try:
        import ctypes
        import ctypes.wintypes
        class DATA_BLOB(ctypes.Structure):
            _fields_ = [('cbData', ctypes.wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_byte))]

        blob_in = DATA_BLOB(len(data), ctypes.cast(ctypes.c_char_p(data), ctypes.POINTER(ctypes.c_byte)))
        blob_out = DATA_BLOB()
        if ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(blob_in), "auratrader_key", None, None, None, 0, ctypes.byref(blob_out)
        ):
            out = ctypes.string_at(blob_out.pbData, blob_out.cbData)
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)
            return out
    except Exception:
        pass
    return data


def dpapi_unprotect(cipher: bytes) -> bytes:
    """Decrypt DPAPI-protected key bytes back to plaintext key bytes."""
    try:
        import ctypes
        import ctypes.wintypes
        class DATA_BLOB(ctypes.Structure):
            _fields_ = [('cbData', ctypes.wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_byte))]

        blob_in = DATA_BLOB(len(cipher), ctypes.cast(ctypes.c_char_p(cipher), ctypes.POINTER(ctypes.c_byte)))
        blob_out = DATA_BLOB()
        if ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)
        ):
            out = ctypes.string_at(blob_out.pbData, blob_out.cbData)
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)
            return out
    except Exception:
        pass
    return cipher


class CredentialManager:
    """
    Manages secure storage and retrieval of Angel One API credentials.
    Uses encryption at rest with user-provided master password.
    Supports multiple credential profiles for different accounts.
    """

    CRED_DIR = Path.home() / ".auratrader" / "credentials"
    CRED_FILE = Path.home() / ".auratrader" / "encrypted_credentials.enc"
    KEY_FILE = Path.home() / ".auratrader" / "key.bin"
    # SEC-002: per-installation random master key. Previously the manager fell back to a CONSTANT
    # default password published in this repository, which meant any vault created without VAULT_KEY
    # was encrypted with a publicly known key. The constant is gone; a random key is generated once
    # and stored with owner-only permissions.
    MASTER_KEY_FILE = Path.home() / ".auratrader" / "master.key"
    SALT_FILE = Path.home() / ".auratrader" / "salt.bin"
    PROFILES_FILE = Path.home() / ".auratrader" / "credential_profiles.json"
    SELECTED_PROFILE_FILE = Path.home() / ".auratrader" / "selected_profile.json"

    def _load_or_create_master_key(self) -> str:
        """Return the per-installation master key, creating it on first use (SEC-002).

        Never returns a constant: a hardcoded fallback would make every vault decryptable with a key
        that is public in the repository. If the key file already exists it is reused so existing
        vaults stay readable.
        """
        path = self.MASTER_KEY_FILE
        try:
            if path.exists():
                value = path.read_text(encoding="utf-8").strip()
                if value:
                    return value
            path.parent.mkdir(parents=True, exist_ok=True)
            value = secrets.token_hex(32)
            # Create with owner-only permissions from the outset (no chmod-after-write race).
            fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(value)
            os.chmod(str(path), 0o600)
            return value
        except OSError as exc:
            raise RuntimeError(
                "VAULT_KEY is not set and a local master key could not be created; refusing to "
                "encrypt credentials with a predictable key"
            ) from exc

    def __init__(self, master_password: Optional[str] = None):
        """
        Initialize the credential manager.

        Args:
            master_password: Master password for encryption. If None, will prompt on first use.
        """
        self._fernet: Optional[Fernet] = None
        if master_password is None:
            master_password = os.environ.get("VAULT_KEY") or self._load_or_create_master_key()
        self._master_password = master_password
        self._ensure_credential_directory()
        self._ensure_credential_profiles()

    def _ensure_credential_directory(self) -> None:
        """Ensure the credential storage directory exists."""
        self.CRED_FILE.parent.mkdir(parents=True, exist_ok=True)
        self.CRED_DIR.mkdir(parents=True, exist_ok=True)

    def _ensure_credential_profiles(self) -> None:
        """Ensure credential profiles file exists."""
        if not self.PROFILES_FILE.exists():
            self._save_profiles({})

    def _load_profiles(self) -> Dict[str, Dict[str, Any]]:
        """Load credential profiles from storage."""
        if self.PROFILES_FILE.exists():
            try:
                with open(self.PROFILES_FILE, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {}
        return {}

    def _save_profiles(self, profiles: Dict[str, Dict[str, Any]]) -> None:
        """Save credential profiles to storage."""
        with open(self.PROFILES_FILE, 'w') as f:
            json.dump(profiles, f, indent=2)

    def get_selected_profile_name(self) -> Optional[str]:
        """Get the name of the currently selected credential profile."""
        if self.SELECTED_PROFILE_FILE.exists():
            try:
                with open(self.SELECTED_PROFILE_FILE, 'r') as f:
                    data = json.load(f)
                    return data.get('profile_name')
            except (json.JSONDecodeError, IOError, KeyError):
                return None
        return None

    def select_profile(self, profile_name: str, master_password: Optional[str] = None) -> bool:
        """
        Select a credential profile as active.

        Args:
            profile_name: Name of the profile to select
            master_password: Master password for decryption

        Returns:
            True if profile exists and was selected
        """
        profiles = self._load_profiles()
        selected_profiles = self.get_available_profiles()

        # Allow 'default' as a special case
        if profile_name == "default":
            data = {
                'profile_name': profile_name,
                'selected_at': datetime.now().isoformat()
            }
            with open(self.SELECTED_PROFILE_FILE, 'w') as f:
                json.dump(data, f, indent=2)
            return True

        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' does not exist. Please select a valid profile.")

        data = {
            'profile_name': profile_name,
            'selected_at': datetime.now().isoformat()
        }
        with open(self.SELECTED_PROFILE_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        return True

    def clear_selected_profile(self) -> None:
        """Clear the currently selected profile."""
        if self.SELECTED_PROFILE_FILE.exists():
            os.remove(self.SELECTED_PROFILE_FILE)

    def get_available_profiles(self) -> List[str]:
        """Get list of available credential profile names."""
        profiles = self._load_profiles()
        # Always ensure 'default' is always in the list
        if "default" not in profiles:
            # Create default entry if no credentials exist yet
            profiles["default"] = {
                'name': 'default',
                'created_at': datetime.now().isoformat(),
                'client_id': 'Default Profile'
            }
            self._save_profiles(profiles)

        if not profiles:
            # Should not happen, but safety first
            return ["default"]

        # Return all profiles (including default)
        all_profiles = list(profiles.keys())
        if all_profiles:
            # Ensure default is always first
            if "default" in all_profiles:
                all_profiles.remove("default")
                all_profiles.insert(0, "default")
        return all_profiles

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        """
        Derive encryption key from password using PBKDF2.

        Args:
            password: Master password
            salt: Salt for key derivation

        Returns:
            Derived key suitable for Fernet
        """
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        return key

    def _get_fernet(self) -> Fernet:
        """Get or create Fernet instance for encryption/decryption."""
        if self._fernet is not None:
            return self._fernet

        if not self.KEY_FILE.exists() or not self.SALT_FILE.exists():
            raise ValueError("Credentials not initialized. Run setup first.")

        with open(self.KEY_FILE, 'rb') as f:
            raw_key = f.read()

        key = dpapi_unprotect(raw_key)
        self._fernet = Fernet(key)
        return self._fernet

    def setup(self) -> bool:
        """
        Initial setup - create encrypted storage.
        Prompts user for master password and API credentials.

        Returns:
            True if setup successful
        """
        import getpass
        import tempfile

        print("=== AuraTrader-AngelOne Credential Setup ===")

        # Get master password
        master_pwd = getpass.getpass("Create master password (will be used to encrypt credentials): ")
        confirm_pwd = getpass.getpass("Confirm master password: ")

        if master_pwd != confirm_pwd:
            print("Passwords do not match!")
            return False

        if len(master_pwd) < 8:
            print("Master password must be at least 8 characters!")
            return False

        # Generate salt
        salt = os.urandom(16)
        key = self._derive_key(master_pwd, salt)

        # Save salt
        with open(self.SALT_FILE, 'wb') as f:
            f.write(salt)

        # Save key
        with open(self.KEY_FILE, 'wb') as f:
            f.write(key)

        # Get API credentials from user
        print("\n=== Enter your Angel One API Credentials ===")
        client_id = input("Client ID: ").strip()
        api_key = input("API Key: ").strip()

        # Store in temporary file and encrypt
        creds = {
            "client_id": client_id,
            "api_key": api_key,
            "totp_secret": None,  # Optional - for 2FA
            "pin": None,  # Will be set separately if needed
            "last_updated": str(Path().stat().st_mtime) if Path().exists() else None
        }

        # Encrypt and save
        fernet = Fernet(key)
        encrypted_data = fernet.encrypt(json.dumps(creds).encode())

        with open(self.CRED_FILE, 'wb') as f:
            f.write(encrypted_data)

        print("\n✓ Credentials saved successfully!")
        return True

    def has_saved_credentials(self) -> bool:
        """Check if credential files exist."""
        return self.CRED_FILE.exists() and self.SALT_FILE.exists()

    def load(self, master_password: Optional[str] = None, profile_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Load and decrypt credentials for a specific profile.

        Args:
            master_password: Master password for decryption
            profile_name: Name of the credential profile to load (optional, uses selected or default)

        Returns:
            Dictionary of credentials

        Raises:
            ValueError: If no credentials found or profile doesn't exist
        """
        # Determine which profile to load
        profiles = self._load_profiles()

        if profile_name is None:
            # Check for selected profile
            profile_name = self.get_selected_profile_name()
            if profile_name is None:
                # Fall back to default mode - single credential file
                profile_name = "default"

        # Find profile file
        profile_file = self.CRED_DIR / f"{profile_name}.enc"
        profile_key_file = self.CRED_DIR / f"{profile_name}.key"
        profile_salt_file = self.CRED_DIR / f"{profile_name}.salt"

        # Check if profile exists
        if profile_name != "default" and not profile_file.exists():
            raise ValueError(f"Profile '{profile_name}' does not exist. No credentials found.")

        # Handle default profile (uses old single file approach)
        if profile_name == "default":
            return self._load_default_credentials(master_password)

        # Load profile-specific credentials
        if not profile_key_file.exists() or not profile_salt_file.exists():
            raise ValueError(f"Profile '{profile_name}' is not properly initialized. Run setup first.")

        with open(profile_file, 'rb') as f:
            encrypted_data = f.read()

        try:
            with open(profile_key_file, 'rb') as f:
                raw_key = f.read()
            key = dpapi_unprotect(raw_key)
            fernet = Fernet(key)
            decrypted_data = fernet.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode())
        except Exception as e:
            # Try with master password
            if profile_salt_file.exists():
                with open(profile_salt_file, 'rb') as f:
                    salt = f.read()
                if master_password is None:
                    if self._master_password:
                        master_password = self._master_password
                    else:
                        import getpass
                        try:
                            master_password = getpass.getpass(f"Enter master password for profile '{profile_name}': ")
                        except Exception:
                            master_password = None
                if not master_password:
                    raise ValueError(f"Master password required to decrypt profile '{profile_name}'. Insecure fallback removed.")
                key = self._derive_key(master_password, salt)
                fernet = Fernet(key)
                decrypted_data = fernet.decrypt(encrypted_data)
                return json.loads(decrypted_data.decode())
            raise ValueError(f"Failed to decrypt credentials for profile '{profile_name}': {e}")

    def _load_default_credentials(self, master_password: Optional[str] = None) -> Dict[str, Any]:
        """Load credentials from the default single-file storage."""
        if not self.CRED_FILE.exists():
            raise ValueError("No credentials found. Run setup first.")

        if master_password is None:
            if self._master_password:
                master_password = self._master_password
            else:
                import getpass
                try:
                    master_password = getpass.getpass("Enter master password: ")
                except Exception:
                    master_password = None

        with open(self.CRED_FILE, 'rb') as f:
            encrypted_data = f.read()

        try:
            fernet = self._get_fernet()
            decrypted_data = fernet.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode())
        except Exception:
            # Fall back to deriving key from provided master_password
            if self.SALT_FILE.exists() and master_password:
                with open(self.SALT_FILE, 'rb') as f:
                    salt = f.read()
                key = self._derive_key(master_password, salt)
                fernet = Fernet(key)
                decrypted_data = fernet.decrypt(encrypted_data)
                return json.loads(decrypted_data.decode())
            raise ValueError("Master password required to decrypt credentials. Insecure fallback removed.")

    def save_profile(self, profile_name: str, credentials: Dict[str, Any], master_password: Optional[str] = None) -> bool:
        """
        Save credentials to a named profile.

        Args:
            profile_name: Name for this credential profile
            credentials: Dictionary of credentials to save
            master_password: Master password for encryption

        Returns:
            True if save successful
        """
        if not profile_name or not profile_name.strip():
            raise ValueError("Profile name cannot be empty")

        profile_name = profile_name.strip()

        if master_password is None:
            if self._master_password:
                master_password = self._master_password
            else:
                import getpass
                try:
                    master_password = getpass.getpass("Enter master password: ")
                except Exception:
                    master_password = None
                if not master_password:
                    raise ValueError("Master password required to encrypt credential profile.")

        # Generate salt and key
        salt = os.urandom(16)
        key = self._derive_key(master_password, salt)

        # Save profile files
        profile_file = self.CRED_DIR / f"{profile_name}.enc"
        profile_key_file = self.CRED_DIR / f"{profile_name}.key"
        profile_salt_file = self.CRED_DIR / f"{profile_name}.salt"

        # Add timestamp
        credentials['last_updated'] = datetime.now().isoformat()

        fernet = Fernet(key)
        encrypted_data = fernet.encrypt(json.dumps(credentials).encode())

        # Protect key with Windows DPAPI before writing to disk
        protected_key = dpapi_protect(key)

        with open(profile_file, 'wb') as f:
            f.write(encrypted_data)
        with open(profile_key_file, 'wb') as f:
            f.write(protected_key)
        with open(profile_salt_file, 'wb') as f:
            f.write(salt)

        # Update profiles list
        profiles = self._load_profiles()
        if profile_name not in profiles:
            profiles[profile_name] = {
                'name': profile_name,
                'created_at': datetime.now().isoformat(),
                'client_id': credentials.get('client_id', 'Unknown')
            }
            self._save_profiles(profiles)

        return True

    def delete_profile(self, profile_name: str) -> bool:
        """
        Delete a credential profile.

        Args:
            profile_name: Name of the profile to delete

        Returns:
            True if deletion successful
        """
        if profile_name == "default":
            raise ValueError("Cannot delete the default profile")

        profiles = self._load_profiles()
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' does not exist")

        # Check if this is the currently selected profile
        selected = self.get_selected_profile_name()
        if selected == profile_name:
            self.clear_selected_profile()

        # Delete profile files
        profile_file = self.CRED_DIR / f"{profile_name}.enc"
        profile_key_file = self.CRED_DIR / f"{profile_name}.key"
        profile_salt_file = self.CRED_DIR / f"{profile_name}.salt"

        for f in [profile_file, profile_key_file, profile_salt_file]:
            if f.exists():
                os.remove(f)

        # Update profiles list
        del profiles[profile_name]
        self._save_profiles(profiles)

        return True

    def rename_profile(self, old_name: str, new_name: str) -> bool:
        """
        Rename a credential profile.

        Args:
            old_name: Current profile name
            new_name: New profile name

        Returns:
            True if rename successful
        """
        profiles = self._load_profiles()
        if old_name not in profiles:
            raise ValueError(f"Profile '{old_name}' does not exist")
        if new_name in profiles:
            raise ValueError(f"Profile '{new_name}' already exists")

        # Rename profile files
        profile_file = self.CRED_DIR / f"{old_name}.enc"
        profile_key_file = self.CRED_DIR / f"{old_name}.key"
        profile_salt_file = self.CRED_DIR / f"{old_name}.salt"

        new_profile_file = self.CRED_DIR / f"{new_name}.enc"
        new_profile_key_file = self.CRED_DIR / f"{new_name}.key"
        new_profile_salt_file = self.CRED_DIR / f"{new_name}.salt"

        for old_f, new_f in [(profile_file, new_profile_file),
                             (profile_key_file, new_profile_key_file),
                             (profile_salt_file, new_profile_salt_file)]:
            if old_f.exists():
                import shutil
                shutil.move(str(old_f), str(new_f))

        # Update profiles list
        profiles[new_name] = profiles.pop(old_name)
        profiles[new_name]['name'] = new_name
        profiles[new_name]['renamed_at'] = datetime.now().isoformat()
        self._save_profiles(profiles)

        # Update selection if needed
        selected = self.get_selected_profile_name()
        if selected == old_name:
            self.select_profile(new_name)

        return True

    def save(self, credentials: Dict[str, Any], master_password: Optional[str] = None) -> bool:
        """
        Save and encrypt credentials.

        Args:
            credentials: Dictionary of credentials to save
            master_password: Master password for encryption

        Returns:
            True if save successful
        """
        if master_password is None:
            if self._master_password:
                master_password = self._master_password
            else:
                import getpass
                try:
                    master_password = getpass.getpass("Enter master password: ")
                except Exception:
                    master_password = None
                if not master_password:
                    raise ValueError("Master password required to encrypt credentials.")

        # Ensure salt exists
        if not self.SALT_FILE.exists():
            salt = os.urandom(16)
            with open(self.SALT_FILE, 'wb') as f:
                f.write(salt)
        else:
            with open(self.SALT_FILE, 'rb') as f:
                salt = f.read()

        key = self._derive_key(master_password, salt)
        protected_key = dpapi_protect(key)
        with open(self.KEY_FILE, 'wb') as f:
            f.write(protected_key)

        fernet = Fernet(key)
        self._fernet = fernet

        # Add timestamp
        from datetime import datetime
        credentials['last_updated'] = datetime.now().isoformat()

        encrypted_data = fernet.encrypt(json.dumps(credentials).encode())

        with open(self.CRED_FILE, 'wb') as f:
            f.write(encrypted_data)

        return True

    def update_field(self, field: str, value: str, master_password: Optional[str] = None) -> bool:
        """
        Update a specific credential field.

        Args:
            field: Field name to update
            value: New value for the field
            master_password: Master password

        Returns:
            True if update successful
        """
        creds = self.load(master_password)
        creds[field] = value
        return self.save(creds, master_password)

    def delete(self) -> bool:
        """
        Securely delete all stored credentials.

        Returns:
            True if deletion successful
        """
        import getpass

        confirm = input("Type 'DELETE' to confirm credential deletion: ")
        if confirm != "DELETE":
            return False

        # Overwrite files before deletion
        if self.CRED_FILE.exists():
            with open(self.CRED_FILE, 'wb') as f:
                f.write(b'\x00' * 1024)  # Overwrite
            os.remove(self.CRED_FILE)

        if self.KEY_FILE.exists():
            os.remove(self.KEY_FILE)

        if self.SALT_FILE.exists():
            os.remove(self.SALT_FILE)

        # Remove directory if empty
        try:
            self.CRED_FILE.parent.rmdir()
        except OSError:
            pass

        return True

    def reset_password(self, old_password: str, new_password: str) -> bool:
        """
        Change master password.

        Args:
            old_password: Current master password
            new_password: New master password

        Returns:
            True if password change successful
        """
        if len(new_password) < 8:
            raise ValueError("New password must be at least 8 characters")

        # Load existing credentials
        creds = self.load(old_password)

        # Generate new salt and key
        new_salt = os.urandom(16)
        new_key = self._derive_key(new_password, new_salt)

        # Save new salt and key
        with open(self.SALT_FILE, 'wb') as f:
            f.write(new_salt)

        with open(self.KEY_FILE, 'wb') as f:
            f.write(new_key)

        # Re-encrypt with new key
        fernet = Fernet(new_key)
        encrypted_data = fernet.encrypt(json.dumps(creds).encode())

        with open(self.CRED_FILE, 'wb') as f:
            f.write(encrypted_data)

        self._fernet = None  # Reset cached instance
        return True


class ConfigManager:
    """
    Manages application configuration settings.
    """

    CONFIG_FILE = Path.home() / ".auratrader" / "config.json"

    DEFAULT_CONFIG = {
        "paper_trading": True,
        "log_level": "INFO",
        "max_daily_loss": 500.0,
        "max_per_trade_risk": 100.0,
        "stop_loss_pct": 2.0,
        "trailing_stop_pct": 1.0,
        "brokerage_per_order": 40.0,  # ₹40 (₹20 buy + ₹20 sell)
        "default_slippage_pct": 0.1,
        "data_cache_size": 1000,
        "ws_reconnect_delay": 5,
        "ws_max_reconnect_delay": 60,
        "api_timeout": 30,
        "strategy_defaults": {
            "vwap_enabled": True,
            "ema_crossover_enabled": True,
            "supertrend_enabled": True
        }
    }

    def __init__(self):
        self._config = self.DEFAULT_CONFIG.copy()
        self._load()

    def _load(self) -> None:
        """Load configuration from file."""
        if self.CONFIG_FILE.exists():
            try:
                with open(self.CONFIG_FILE, 'r') as f:
                    loaded = json.load(f)
                    self._config.update(loaded)
            except (json.JSONDecodeError, IOError):
                pass  # Use defaults

    def save(self) -> None:
        """Save current configuration to file."""
        self.CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(self.CONFIG_FILE, 'w') as f:
            json.dump(self._config, f, indent=2)

    def get(self, key: str, default: Any = None) -> Any:
        """Get a configuration value."""
        return self._config.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set a configuration value."""
        self._config[key] = value
        self.save()

    def update(self, updates: Dict[str, Any]) -> None:
        """Update multiple configuration values."""
        self._config.update(updates)
        self.save()


# Global instances
credential_manager: Optional[CredentialManager] = None
config_manager = ConfigManager()


def get_credentials(force_setup: bool = False, master_password: Optional[str] = None) -> Dict[str, Any]:
    """
    Get credentials, optionally forcing setup.

    Args:
        force_setup: If True, always run setup
        master_password: Master password for decryption

    Returns:
        Dictionary of credentials
    """
    global credential_manager
    if credential_manager is None:
        credential_manager = CredentialManager(master_password)
    return credential_manager.load(master_password)