"""
AuraTrader-AngelOne - Session Manager Module
Coordinates session generation, token retention, and broker state management.
"""
import logging
from typing import Optional, Dict, Any, Tuple


class SessionManager:
    """Manages SmartAPI session lifecycle, token retention, and broker responses."""

    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger(__name__)
        self.jwt_token: Optional[str] = None
        self.feed_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.session_token: Optional[str] = None
        self.user_profile: Optional[Dict[str, Any]] = None

    def clear(self) -> None:
        """Clear active session and retained tokens."""
        self.jwt_token = None
        self.feed_token = None
        self.refresh_token = None
        self.session_token = None
        self.user_profile = None

    def process_login_result(self, result: Any) -> Tuple[bool, str]:
        """
        Process the raw response returned by SmartConnect.generateSession().

        Expected successful response structure:
        {
            "status": True,
            "message": "SUCCESS",
            "errorcode": "",
            "data": {
                "jwtToken": "Bearer ...",
                "refreshToken": "...",
                "feedToken": "..."
            }
        }

        Returns:
            Tuple of (success: bool, message: str)
        """
        if not isinstance(result, dict):
            self.clear()
            return False, f"Unexpected response from Angel One API: {result}"

        status = result.get("status")
        message = result.get("message", "Authentication failed")
        errorcode = result.get("errorcode", "")

        if status is True and "data" in result and isinstance(result["data"], dict):
            data = result["data"]
            self.jwt_token = data.get("jwtToken")
            self.feed_token = data.get("feedToken")
            self.refresh_token = data.get("refreshToken")
            self.session_token = self.jwt_token
            self.user_profile = data

            if not self.jwt_token or not self.feed_token:
                self.logger.warning("Authentication succeeded but missing tokens in response data.")
                return True, "Authenticated with Angel One (Partial token data received)"

            self.logger.info("Angel One SmartAPI session established successfully.")
            return True, "Successfully authenticated with Angel One SmartAPI."

        # Handle failure cases with clear user feedback
        self.clear()
        if "Please enter four digit MPIN" in message or errorcode in ("AB1010", "AB1004"):
            user_msg = (
                f"Authentication Rejected by Angel One: {message}\n\n"
                "Root Cause: The 4-digit MPIN entered does not match your Angel One mobile PIN.\n"
                "Please verify your 4-digit numeric MPIN (used in the Angel One mobile app) and try again."
            )
        elif "Invalid Totp" in message or "TOTP" in message:
            user_msg = (
                f"Authentication Rejected by Angel One: {message}\n\n"
                "Root Cause: The TOTP code was rejected by the broker.\n"
                "Please ensure your system clock is accurate and your TOTP Secret Key is correctly configured."
            )
        else:
            user_msg = f"Authentication Failed: {message} {f'[{errorcode}]' if errorcode else ''}"

        self.logger.error(f"Session generation failed: {message} [{errorcode}]")
        return False, user_msg

