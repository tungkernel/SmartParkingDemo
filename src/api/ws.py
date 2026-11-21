from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional, Protocol

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder

from core.config import get_settings
from core.exceptions import AuthenticationError
from services.auth_service import AuthService, AuthUser

logger = logging.getLogger(__name__)


class EventBroker(Protocol):
    """Pluggable broker interface allowing seamless swap to Redis Pub/Sub across multiple workers."""

    async def publish(self, message: dict[str, Any]) -> None: ...


class LiveConnectionManager:
    """Thread/async-safe WebSocket manager with concurrent timed broadcasts and connection cap."""

    def __init__(self, max_connections: int = 500, send_timeout: float = 2.0) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._max_connections = max_connections
        self._send_timeout = send_timeout

    @property
    def active_count(self) -> int:
        return len(self._connections)

    async def connect(self, ws: WebSocket) -> bool:
        async with self._lock:
            if len(self._connections) >= self._max_connections:
                await ws.close(code=1013, reason="Server connection limit reached")
                return False
            await ws.accept()
            self._connections.add(ws)
            return True

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(ws)

    async def close_all(self) -> None:
        async with self._lock:
            targets = list(self._connections)
            self._connections.clear()
        for ws in targets:
            try:
                await ws.close(code=1001, reason="Server shutting down")
            except Exception:
                logger.debug("Ignoring close error during shutdown", exc_info=True)

    async def _send_one(self, ws: WebSocket, message: dict[str, Any]) -> Optional[WebSocket]:
        try:
            await asyncio.wait_for(ws.send_json(message), timeout=self._send_timeout)
            return None
        except Exception:
            return ws

    async def broadcast(
        self,
        event_type: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> None:
        async with self._lock:
            targets = list(self._connections)
        if not targets:
            return

        message = jsonable_encoder(
            {
                "event": event_type,
                "payload": payload or {},
                "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
        )
        results = await asyncio.gather(
            *(self._send_one(ws, message) for ws in targets),
            return_exceptions=False,
        )
        dead = [ws for ws in results if ws is not None]
        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.discard(ws)


ws_manager = LiveConnectionManager(max_connections=get_settings().ws_max_connections)


def _is_origin_allowed(origin: Optional[str]) -> bool:
    if not origin:
        return True
    allowed = get_settings().cors_origins_list
    if not allowed:
        return True
    return origin in allowed


async def handle_live_websocket(ws: WebSocket, auth: AuthService) -> None:
    """Authenticated WebSocket handler supporting single-use ticket or Bearer token + ping/pong."""
    origin = ws.headers.get("origin")
    if not _is_origin_allowed(origin):
        await ws.close(code=4403, reason="Origin not allowed")
        return

    ticket = ws.query_params.get("ticket")
    auth_header = ws.headers.get("authorization", "")
    user: Optional[AuthUser] = None
    try:
        if ticket:
            user = auth.ws_tickets.consume(ticket)
        elif auth_header.lower().startswith("bearer "):
            user = await asyncio.to_thread(auth.verify_active_token, auth_header[7:].strip())
        else:
            await ws.close(code=4401, reason="Authentication required")
            return
    except AuthenticationError:
        await ws.close(code=4401, reason="Invalid or expired credentials")
        return

    accepted = await ws_manager.connect(ws)
    if not accepted:
        return

    logger.debug("WebSocket connected for user=%s", user.username)
    try:
        while True:
            try:
                text = await asyncio.wait_for(ws.receive_text(), timeout=90.0)
            except asyncio.TimeoutError:
                await asyncio.wait_for(ws.send_json({"event": "ping"}), timeout=2.0)
                continue
            if text.strip().lower() == "ping":
                await asyncio.wait_for(ws.send_json({"event": "pong"}), timeout=2.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket closed unexpectedly for user=%s", user.username, exc_info=True)
    finally:
        await ws_manager.disconnect(ws)
