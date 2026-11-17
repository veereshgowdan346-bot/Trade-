"""
AuraTrader-AngelOne - Centralized Rate Limiter for Angel One SmartAPI
Thread-safe token-bucket rate limiter implementing endpoint-specific rate limits.

Official Angel One SmartAPI Rate Limits:
- Order API (place/modify/cancel): 10 requests / second
- Quote / Market Data API: 10 requests / second
- Historical Data API: 3 requests / second
- General / Profile / RMS APIs: 10 requests / second
"""

import time
import threading
from enum import Enum
from typing import Dict, Optional


class ApiEndpoint(Enum):
    """Angel One SmartAPI endpoint categories with distinct rate limits."""
    ORDER = "ORDER"
    QUOTE = "QUOTE"
    HISTORICAL = "HISTORICAL"
    GENERAL = "GENERAL"


class TokenBucket:
    """Thread-safe Token Bucket rate limiter for an individual API endpoint category."""

    def __init__(self, rate: float, capacity: Optional[float] = None):
        """
        Args:
            rate: Tokens added per second.
            capacity: Maximum burst capacity (defaults to rate).
        """
        self.rate = float(rate)
        self.capacity = float(capacity if capacity is not None else rate)
        self.tokens = self.capacity
        self.last_update = time.time()
        self.lock = threading.Lock()
        self.total_requests = 0
        self.throttled_requests = 0

    def _refill(self) -> None:
        now = time.time()
        elapsed = now - self.last_update
        if elapsed > 0:
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            self.last_update = now

    def acquire(self, timeout: float = 5.0) -> bool:
        """
        Attempt to acquire a token, waiting up to timeout seconds if needed.

        Args:
            timeout: Maximum seconds to wait.

        Returns:
            True if token acquired, False if timed out.
        """
        deadline = time.time() + timeout
        while time.time() <= deadline:
            with self.lock:
                self._refill()
                if self.tokens >= 1.0:
                    self.tokens -= 1.0
                    self.total_requests += 1
                    return True

                # Calculate wait time until next token is available
                needed = 1.0 - self.tokens
                sleep_time = min(needed / self.rate, 0.1)

            self.throttled_requests += 1
            time.sleep(sleep_time)

        return False

    def try_acquire(self) -> bool:
        """Non-blocking token acquisition."""
        with self.lock:
            self._refill()
            if self.tokens >= 1.0:
                self.tokens -= 1.0
                self.total_requests += 1
                return True
            self.throttled_requests += 1
            return False


class SmartApiRateLimiter:
    """Centralized rate limiter managing all Angel One SmartAPI endpoint quotas."""

    DEFAULT_LIMITS: Dict[ApiEndpoint, float] = {
        ApiEndpoint.ORDER: 10.0,       # 10 req/sec for orders
        ApiEndpoint.QUOTE: 10.0,       # 10 req/sec for quotes
        ApiEndpoint.HISTORICAL: 3.0,   # 3 req/sec for historical data
        ApiEndpoint.GENERAL: 10.0,     # 10 req/sec for RMS, profile, etc.
    }

    def __init__(self, limits: Optional[Dict[ApiEndpoint, float]] = None):
        cfg = limits or self.DEFAULT_LIMITS
        self.buckets: Dict[ApiEndpoint, TokenBucket] = {
            endpoint: TokenBucket(rate=rate, capacity=rate)
            for endpoint, rate in cfg.items()
        }

    def acquire(self, endpoint: ApiEndpoint, timeout: float = 5.0) -> bool:
        """Acquire a token for the given endpoint category."""
        bucket = self.buckets.get(endpoint)
        if not bucket:
            return True
        return bucket.acquire(timeout=timeout)

    def try_acquire(self, endpoint: ApiEndpoint) -> bool:
        """Non-blocking token check."""
        bucket = self.buckets.get(endpoint)
        if not bucket:
            return True
        return bucket.try_acquire()

    def get_stats(self) -> Dict[str, dict]:
        """Return usage and throttling statistics."""
        return {
            ep.value: {
                "total_requests": bucket.total_requests,
                "throttled_requests": bucket.throttled_requests,
                "available_tokens": round(bucket.tokens, 2),
                "rate_per_sec": bucket.rate
            }
            for ep, bucket in self.buckets.items()
        }


# Global default rate limiter instance
smartapi_rate_limiter = SmartApiRateLimiter()

