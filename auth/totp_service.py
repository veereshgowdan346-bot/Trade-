"""
AuraTrader-AngelOne - TOTP Service Module
Handles RFC 6238 TOTP generation, Base32 validation, 30s countdown, and safe rollover.
"""
import base64
import re
import time
from typing import Optional, Tuple, Callable
import pyotp


class TOTPService:
    """Provides RFC 6238 Time-based One-Time Password generation and verification."""

    MANUAL_OTP_PATTERN = re.compile(r"^\d{6}$")

    @classmethod
    def sanitize_secret(cls, secret: Optional[str]) -> str:
        """Strip whitespace and convert secret to uppercase Base32."""
        if not secret:
            return ""
        return str(secret).strip().replace(" ", "").upper()

    @classmethod
    def validate_secret(cls, secret: Optional[str]) -> Tuple[bool, Optional[str]]:
        """
        Validate that the secret key is non-empty and a valid Base32 string.

        Returns:
            Tuple of (is_valid: bool, error_message: Optional[str])
        """
        clean = cls.sanitize_secret(secret)
        if not clean:
            return False, "TOTP Secret Key cannot be empty."

        try:
            missing_padding = len(clean) % 8
            padded = clean + ("=" * ((8 - missing_padding) % 8))
            decoded = base64.b32decode(padded, casefold=True)
            if len(decoded) == 0:
                return False, "TOTP Secret Key is invalid (decoded key is empty)."
        except Exception as e:
            return False, f"Invalid Base32 TOTP secret format: {e}"

        return True, None

    @classmethod
    def get_remaining_seconds(cls, time_func: Optional[Callable[[], float]] = None) -> float:
        """Get seconds remaining in the current 30-second TOTP window."""
        now = time_func() if time_func else time.time()
        rem = 30.0 - (now % 30.0)
        return round(rem, 1)

    @classmethod
    def get_current_totp(
        cls,
        secret: str,
        time_func: Optional[Callable[[], float]] = None
    ) -> Tuple[str, float]:
        """
        Calculate current 6-digit TOTP code and remaining seconds in window.

        Returns:
            Tuple of (code: str, remaining_seconds: float)
        """
        is_valid, err = cls.validate_secret(secret)
        if not is_valid:
            raise ValueError(err)

        clean = cls.sanitize_secret(secret)
        now = time_func() if time_func else time.time()
        remaining = 30.0 - (now % 30.0)

        totp = pyotp.TOTP(clean)
        code = totp.at(int(now)) if hasattr(totp, "at") else totp.now()
        if not code or len(code) != 6 or not code.isdigit():
            raise ValueError("Failed to generate a valid 6-digit numeric TOTP code.")

        return code, round(remaining, 1)

    @classmethod
    def generate_synchronized_totp(
        cls,
        secret: str,
        min_validity_seconds: float = 3.0,
        time_func: Optional[Callable[[], float]] = None,
        sleep_func: Optional[Callable[[float], None]] = None
    ) -> Tuple[str, float, bool]:
        """
        Generate TOTP with rollover protection for broker authentication.

        If fewer than min_validity_seconds remain in the current window,
        waits for the next window so the code remains valid during network transit.

        Returns:
            Tuple of (code: str, remaining_seconds: float, did_rollover: bool)
        """
        is_valid, err = cls.validate_secret(secret)
        if not is_valid:
            raise ValueError(err)

        clean = cls.sanitize_secret(secret)
        get_time = time_func or time.time
        do_sleep = sleep_func or time.sleep

        now = get_time()
        remaining = 30.0 - (now % 30.0)
        did_rollover = False

        if remaining < min_validity_seconds:
            sleep_time = remaining + 0.2
            do_sleep(sleep_time)
            now = get_time()
            remaining = 30.0 - (now % 30.0)
            did_rollover = True

        totp = pyotp.TOTP(clean)
        code = totp.at(int(now)) if hasattr(totp, "at") else totp.now()
        if not code or len(code) != 6 or not code.isdigit():
            raise ValueError("Failed to generate a valid 6-digit numeric TOTP code.")

        return code, round(remaining, 1), did_rollover

    @classmethod
    def validate_manual_otp(cls, otp: Optional[str]) -> Tuple[bool, Optional[str]]:
        """
        Validate a manually entered 6-digit numeric OTP.

        Returns:
            Tuple of (is_valid: bool, error_message: Optional[str])
        """
        if not otp:
            return False, "Manual OTP code is required."

        clean = str(otp).strip()
        if not clean.isdigit():
            return False, "Manual OTP must contain 6 numeric digits only."

        if len(clean) != 6:
            return False, f"Manual OTP must be exactly 6 digits (received {len(clean)} digits)."

        if not cls.MANUAL_OTP_PATTERN.match(clean):
            return False, "Invalid manual OTP format."

        return True, None

