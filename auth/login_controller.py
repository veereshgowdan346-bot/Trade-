"""
AuraTrader-AngelOne - Login Controller Module
Coordinates credential validation, user consent dialog, TOTP calculation, and asynchronous broker authentication.
"""
import logging
from typing import Optional, Dict, Any, Tuple
from PySide6.QtWidgets import QMessageBox, QWidget

from auth.credential_validator import CredentialValidator
from auth.totp_service import TOTPService
from auth.session_manager import SessionManager


class LoginController:
    """Controls authentication workflow and safety confirmation."""

    def __init__(self, parent_widget: Optional[QWidget] = None):
        self.parent = parent_widget
        self.logger = logging.getLogger(__name__)
        self.session_manager = SessionManager(self.logger)

    def confirm_user_consent(self, client_id: str) -> bool:
        """
        Display a clear consent dialog before transmitting credentials to Angel One.
        Satisfies Requirement 7: Explicit user approval before sending credentials.

        Returns:
            True if user grants consent, False otherwise.
        """
        consent_text = (
            "<h3>Angel One SmartAPI Authentication Consent</h3>"
            "<p>You are about to initiate an authenticated session with <b>Angel One SmartAPI</b>.</p>"
            "<p><b>Information to be sent:</b></p>"
            "<ul>"
            f"<li><b>Client Code:</b> {client_id}</li>"
            "<li><b>API Key:</b> [Masked SmartAPI Key]</li>"
            "<li><b>Login MPIN:</b> [Masked 4-Digit MPIN]</li>"
            "<li><b>TOTP:</b> [Current 6-Digit Time-Based OTP]</li>"
            "</ul>"
            "<p><b>Destination Endpoint:</b> <code>https://apiconnect.angelbroking.com/rest/secure/angelbroking/user/v1/loginByPassword</code></p>"
            "<p><i>Scope: Read-only account profile and live market data feed subscription. Paper Trading remains active; no real-money orders will be placed.</i></p>"
            "<p>Do you wish to proceed with authentication?</p>"
        )

        reply = QMessageBox.question(
            self.parent,
            "Confirm Broker Authentication",
            consent_text,
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        return reply == QMessageBox.Yes

    def prepare_authentication(
        self,
        client_id: str,
        api_key: str,
        mpin: str,
        totp_secret: str,
        is_auto_totp: bool,
        manual_otp: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Validate inputs and generate the active TOTP code for authentication.

        Returns:
            Tuple of (success: bool, totp_code: Optional[str], error_message: Optional[str])
        """
        # Step 1: Local validation of all 4 fields
        is_valid, val_err = CredentialValidator.validate_all(
            client_id=client_id,
            api_key=api_key,
            mpin=mpin,
            totp_secret=totp_secret,
            is_auto_totp=is_auto_totp,
            manual_otp=manual_otp
        )
        if not is_valid:
            return False, None, val_err

        # Step 2: Determine TOTP code to submit
        totp_code_to_use = None
        if is_auto_totp:
            try:
                totp_code_to_use, rem_sec, did_rollover = TOTPService.generate_synchronized_totp(
                    totp_secret,
                    min_validity_seconds=3.0
                )
                if did_rollover:
                    self.logger.info("Automatic TOTP was near window expiry; refreshed to next 30s code.")
            except Exception as e:
                return False, None, f"Failed to generate automatic TOTP: {e}"
        else:
            totp_code_to_use = str(manual_otp).strip()

        return True, totp_code_to_use, None

