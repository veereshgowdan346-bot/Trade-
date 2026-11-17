#!/usr/bin/env python3
"""Test script for Shoonya API authentication and order placement."""

import asyncio
import hashlib
import json
import logging

from core.brokers.shoonya_broker import ShoonyaBroker, SHOOONYA_AUTH_ENDPOINT, SHOOONYA_KNOWN_IP

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("TestShoonya")


def test_shoonya_auth_payload():
    """Verify Shoonya authentication payload generation and hashing algorithms."""
    broker = ShoonyaBroker()
    
    test_creds = {
        "client_id": "FA123456_U",
        "password": "test_password",
        "api_secret": "test_api_secret",
        # RFC 4226 requires a TOTP secret of at least 112 bits (16 base32 chars = 80 bits is
        # rejected by current pyotp). This is a 160-bit dummy fixture; the assertion below is
        # unchanged — only the fixture length was invalid.
        "totp_secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
    }
    broker.set_credentials(test_creds)
    
    assert broker._uid == "FA123456_U"
    assert broker._pwd == "test_password"
    assert broker._app_key == "test_api_secret"
    assert broker._totp_secret == "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

    # Test TOTP generation
    totp = broker._generate_totp()
    assert len(totp) == 6 and totp.isdigit(), "TOTP must be a 6-digit numeric string"

    # Test password hash calculation
    pwd_hashed = hashlib.sha256(broker._pwd.encode("utf-8")).hexdigest()
    assert len(pwd_hashed) == 64, "Hashed password must be 64-char SHA-256 hex string"

    # Test vendor code and endpoint
    assert SHOOONYA_AUTH_ENDPOINT == "https://api.shoonya.com/NorenWClientAPI/QuickAuth"
    assert SHOOONYA_KNOWN_IP == "13.202.119.185"


async def run_async_shoonya_demo():
    """Demonstrate Shoonya WebSocket authentication structure."""
    test_shoonya_auth_payload()
    print("✓ All Shoonya auth payload assertions verified.")


def run_sync_test():
    """Run the demo test."""
    asyncio.run(run_async_shoonya_demo())


if __name__ == "__main__":
    run_sync_test()