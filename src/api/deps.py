from __future__ import annotations

from functools import lru_cache
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import Settings, get_settings
from core.exceptions import AuthenticationError, DatabaseError
from services.auth_service import AuthService, AuthUser
from services.db_service import DBService
from services.domain.base import AuditActor
from services.parking_service import ParkingService

_bearer_scheme = HTTPBearer(auto_error=False)
_WWW_AUTH_HEADERS = {"WWW-Authenticate": "Bearer"}


def _load_db_service(settings: Settings) -> DBService:
    try:
        params = settings.resolve_db_params()
    except RuntimeError as exc:
        raise DatabaseError(str(exc)) from exc
    return DBService(**params)  # type: ignore[arg-type]


@lru_cache(maxsize=1)
def get_db() -> DBService:
    return _load_db_service(get_settings())


@lru_cache(maxsize=1)
def _cached_auth_secret() -> str:
    return get_settings().resolve_auth_secret()


def get_parking_service(db: DBService = Depends(get_db)) -> ParkingService:
    return ParkingService(db)


def get_auth_service(db: DBService = Depends(get_db)) -> AuthService:
    return AuthService(db, secret_key=_cached_auth_secret(), settings=get_settings())


def extract_client_ip(request: Request) -> str:
    """Resolve client IP without trusting spoofable X-Forwarded-For unless peer is a trusted proxy."""
    peer_ip = (request.client.host if request.client else "unknown")[:64]
    trusted_proxies = get_settings().trusted_proxy_set
    if trusted_proxies and ("*" in trusted_proxies or peer_ip in trusted_proxies):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    return peer_ip


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    auth: AuthService = Depends(get_auth_service),
) -> AuthUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vui lòng đăng nhập để tiếp tục.",
            headers=_WWW_AUTH_HEADERS,
        )
    try:
        return auth.verify_active_token(credentials.credentials)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers=_WWW_AUTH_HEADERS,
        ) from exc


def require_roles(*roles: str) -> Callable[[AuthUser], AuthUser]:
    allowed = {r.upper() for r in roles}

    def _checker(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role.upper() not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thực hiện thao tác này.",
            )
        return user

    return _checker


def build_audit_actor(request: Request, user: AuthUser) -> AuditActor:
    return AuditActor(
        account_id=user.account_id,
        username=user.username,
        ip_address=extract_client_ip(request),
    )


def operator_lot_scope(user: AuthUser) -> Optional[int]:
    """Enforce assigned lot scoping for OPERATOR accounts; ADMIN/ACCOUNTANT see all lots."""
    if user.role.upper() == "OPERATOR" and user.lot_id is not None:
        return user.lot_id
    return None
