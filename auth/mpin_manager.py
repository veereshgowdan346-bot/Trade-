"""
AuraTrader-AngelOne - MPIN Management Module
Handles validation, formatting, and masking for Angel One 4-Digit MPIN.
"""
import re
from typing import Optional, Tuple


class MPINManager:
    """Manages validation, sanitization, and security of Angel One 4-Digit MPIN."""

    MPIN_PATTERN = re.compile(r"^\d{4}$")

    @classmethod
    def sanitize(cls, mpin: Optional[str]) -> str:
        """Strip surrounding whitespace from MPIN."""
        if not mpin:
            return ""
        return str(mpin).strip()

    @classmethod
    def validate(cls, mpin: Optional[str]) -> Tuple[bool, Optional[str]]:
        """
        Validate that the MPIN is exactly four numeric digits.

        Returns:
            Tuple of (is_valid: bool, error_message: Optional[str])
        """
        clean = cls.sanitize(mpin)
        if not clean:
            return False, "Angel One 4-Digit MPIN is required."

        if not clean.isdigit():
            return False, "MPIN must contain numeric digits only (0-9)."

        if len(clean) != 4:
            return False, f"MPIN must be exactly 4 digits (received {len(clean)} digits)."

        if not cls.MPIN_PATTERN.match(clean):
            return False, "Invalid MPIN format. Please enter your 4-digit Angel One MPIN."

        return True, None

    @classmethod
    def mask(cls, mpin: Optional[str]) -> str:
        """Return masked representation of MPIN for safe display."""
        clean = cls.sanitize(mpin)
        if not clean:
            return ""
        return "•" * len(clean)

