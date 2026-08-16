"""
Request rate limiting (Phase 8b).

A public URL means `/login` is a brute-force target and `/register` is an
account-spam target, so both get a tight budget; everything else gets a loose
one that only trips on genuine hammering.

This is a sliding-window counter held in process — the same scope as the
WebSocket registry, and appropriate for the single-worker free-tier deploy this
targets. Two consequences worth stating plainly rather than discovering later:
restarting the app forgets every counter, and running two workers doubles the
effective limit. Redis is the fix when either matters.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

# Off in tests (which register dozens of users from one address); on otherwise.
ENABLED = os.getenv("RATE_LIMIT_ENABLED", "1") == "1"

# Only trust X-Forwarded-For when something in front of us is actually setting
# it. Trusting it unconditionally would let any client forge an address and get
# a fresh budget per request — worse than no limit at all.
TRUST_PROXY = os.getenv("TRUST_PROXY", "0") == "1"

# (max requests, window seconds)
AUTH_LIMIT = (int(os.getenv("RATE_LIMIT_AUTH", "10")), 300)      # 10 per 5 min
WRITE_LIMIT = (int(os.getenv("RATE_LIMIT_WRITE", "120")), 60)    # 120 per min
GLOBAL_LIMIT = (int(os.getenv("RATE_LIMIT_GLOBAL", "600")), 60)  # 600 per min


class SlidingWindow:
    """Per-key timestamps of recent hits, trimmed to the window on each check.

    Exact rather than approximate (no bucket-boundary burst), and the memory is
    bounded by the limit itself: a key can never hold more timestamps than its
    own allowance.
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: float, now: float | None = None) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until retry."""
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[key]
            cutoff = now - window
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= limit:
                return max(0.0, hits[0] + window - now)
            hits.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindow()


def client_key(request: Request) -> str:
    if TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Left-most entry is the original client; the rest are proxies.
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _bucket_for(path: str, method: str) -> tuple[str, tuple[int, float]] | None:
    """Which budget a request draws from, or None to skip limiting."""
    if path in ("/login", "/register"):
        return "auth", AUTH_LIMIT
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        return "write", WRITE_LIMIT
    return None


def enforce(request: Request) -> None:
    """Raise 429 if this request exceeds its budget. Called by the middleware."""
    if not ENABLED:
        return

    ip = client_key(request)
    path = request.url.path

    specific = _bucket_for(path, request.method)
    checks = [("global", GLOBAL_LIMIT)]
    if specific:
        checks.append(specific)

    for name, (limit, window) in checks:
        retry_after = limiter.check(f"{name}:{ip}", limit, window)
        if retry_after is not None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests — slow down and try again shortly",
                headers={"Retry-After": str(int(retry_after) + 1)},
            )
