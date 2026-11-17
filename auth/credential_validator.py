"""
AuraTrader-AngelOne - Credential Validator Module
Validates Angel One credentials locally before initiating broker network calls.
"""
from typing import Optional, Tuple, Dict, Any
from auth.mpin_manager import MPINManager
from auth.totp_service import TOTPService


class CredentialValidator:
    """Performs local validation on all Angel One login credentials."""

    @classmethod
    def validate_client_id(cls, client_id: Optional[str]) -> Tuple[bool, Optional[str]]:
        """Validate Angel One client code."""
        if not client_id or not str(client_id).strip():
            return False, "Angel One Client ID is required (e.g. S1234567)."
        clean = str(client_id).strip()
        if len(clean) < 3 or len(clean) > 20:
            return False, "Client ID must be between 3 and 20 characters."
        return True, None

    @classmethod
    def validate_api_key(cls, api_key: Optional[str]) -> Tuple[bool, Optional[str]]:
        """Validate SmartAPI application key."""
        if not api_key or not str(api_key).strip():
            return False, "SmartAPI API Key is required."
        clean = str(api_key).strip()
        if len(clean) < 8:
            return False, "API Key appears too short (must be a valid SmartAPI key)."
        return True, None

    @classmethod
    def validate_mpin(cls, mpin: Optional[str]) -> Tuple[bool, Optional[str]]:
        """Validate Angel One 4-digit MPIN."""
        return MPINManager.validate(mpin)

    @classmethod
    def validate_all(
        cls,
        client_id: Optional[str],
        api_key: Optional[str],
        mpin: Optional[str],
        totp_secret: Optional[str] = None,
        is_auto_totp: bool = True,
        manual_otp: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate all credentials required for Angel One SmartAPI login.

        Args:
            client_id: Angel One client code
            api_key: SmartAPI key
            mpin: 4-Digit numeric MPIN
            totp_secret: Base32 secret key (used if is_auto_totp is True)
            is_auto_totp: Whether automatic TOTP generation is enabled
            manual_otp: 6-digit code (used if is_auto_totp is False)

        Returns:
            Tuple of (is_valid: bool, error_message: Optional[str])
        """
        ok, err = cls.validate_client_id(client_id)
        if not ok:
            return False, err

        ok, err = cls.validate_api_key(api_key)
        if not ok:
            return False, err

        ok, err = cls.validate_mpin(mpin)
        if not ok:
            return False, err

        if is_auto_totp:
            ok, err = TOTPService.validate_secret(totp_secret)
            if not ok:
                return False, f"Automatic TOTP Error: {err}"
        else:
            ok, err = TOTPService.validate_manual_otp(manual_otp)
            if not ok:
                return False, f"Manual OTP Error: {err}"

        return True, None

