from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from typing import Callable

from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

from api.deps import extract_client_ip
from core.config import get_settings
from core.logging import request_id_ctx

logger = logging.getLogger("smart_parking.http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach X-Request-ID correlation header and emit structured access logs."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        req_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        token = request_id_ctx.set(req_id)
        request.state.request_id = req_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            client_ip = extract_client_ip(request)
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = req_id
        logger.info(
            "HTTP %s %s -> %s (%.2fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client_ip": client_ip,
            },
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply baseline HTTP security response headers."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        return response


class SlidingWindowRateLimiter:
    """Bounded, thread-safe in-memory sliding-window rate limiter for auth endpoints."""

    def __init__(
        self,
        max_requests: int = 10,
        window_seconds: int = 60,
        max_keys: int = 10_000,
    ) -> None:
        self._max = max_requests
        self._window = window_seconds
        self._max_keys = max(100, int(max_keys))
        self._lock = threading.Lock()
        self._buckets: dict[str, deque[float]] = {}
        self._last_sweep = time.monotonic()

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._last_sweep = time.monotonic()

    def _sweep_locked(self, now: float, cutoff: float) -> None:
        stale_keys: list[str] = []
        for k, q in self._buckets.items():
            while q and q[0] <= cutoff:
                q.popleft()
            if not q:
                stale_keys.append(k)
        for k in stale_keys:
            self._buckets.pop(k, None)
        self._last_sweep = now

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            if (now - self._last_sweep) >= self._window or len(self._buckets) >= self._max_keys:
                self._sweep_locked(now, cutoff)
            q = self._buckets.get(key)
            if q is None:
                if len(self._buckets) >= self._max_keys:
                    oldest_key = min(
                        self._buckets.items(),
                        key=lambda kv: kv[1][-1] if kv[1] else 0.0,
                    )[0]
                    self._buckets.pop(oldest_key, None)
                q = deque()
                self._buckets[key] = q
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= self._max:
                retry_after = max(1, int(self._window - (now - q[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau.",
                    headers={"Retry-After": str(retry_after)},
                )
            q.append(now)


_settings = get_settings()
auth_rate_limiter = SlidingWindowRateLimiter(
    max_requests=_settings.rate_limit_login_max,
    window_seconds=_settings.rate_limit_window_seconds,
)


def rate_limit_auth(request: Request) -> None:
    """FastAPI dependency enforcing rate limits on sensitive authentication endpoints."""
    client_ip = extract_client_ip(request)
    auth_rate_limiter.check(f"{client_ip}:{request.url.path}")
