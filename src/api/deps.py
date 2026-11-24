from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, Request

from core.config import Settings, get_settings
from core.exceptions import DatabaseError
from services.db_service import DBService
from services.parking_service import ParkingService


def _load_db_service(settings: Settings) -> DBService:
    try:
        params = settings.resolve_db_params()
    except RuntimeError as exc:
        raise DatabaseError(str(exc)) from exc
    return DBService(**params)  # type: ignore[arg-type]


@lru_cache(maxsize=1)
def get_db() -> DBService:
    return _load_db_service(get_settings())


def get_parking_service(db: DBService = Depends(get_db)) -> ParkingService:
    return ParkingService(db)


def extract_client_ip(request: Request) -> str:
    """Resolve client IP without trusting spoofable X-Forwarded-For unless peer is a trusted proxy."""
    peer_ip = (request.client.host if request.client else "unknown")[:64]
    trusted_proxies = get_settings().trusted_proxy_set
    if trusted_proxies and ("*" in trusted_proxies or peer_ip in trusted_proxies):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    return peer_ip
