from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

_SRC_DIR = str(Path(__file__).resolve().parents[1])
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from api.deps import get_db
from api.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from api.v1 import build_v1_router
from api.v1.routers import health as health_router
from api.ws import handle_live_websocket, ws_manager
from core.config import get_settings
from core.exceptions import (
    ConflictError,
    DatabaseError,
    NotFoundError,
    ValidationError,
)
from core.logging import configure_logging

logger = logging.getLogger(__name__)
_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _error_payload(request: Request, code: str, detail: str) -> dict[str, str]:
    req_id = getattr(request.state, "request_id", "-")
    return {
        "code": code,
        "detail": detail,
        "request_id": req_id,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    try:
        yield
    finally:
        await ws_manager.close_all()
        try:
            get_db().close_pool()
        except Exception:
            logger.debug("DB pool not initialized during shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="Smart Parking System API",
        version=settings.app_version,
        description="REST v1 & WebSocket API for Smart Parking Management (PTIT - 13-table ERD)",
        lifespan=lifespan,
    )

    application.add_middleware(SecurityHeadersMiddleware)
    application.add_middleware(RequestContextMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-ID"],
    )

    # Specific subclasses of ValidationError must be registered before ValidationError
    @application.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content=_error_payload(request, "NOT_FOUND", str(exc)))

    @application.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content=_error_payload(request, "CONFLICT", str(exc)))

    @application.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400, content=_error_payload(request, "VALIDATION_ERROR", str(exc))
        )

    @application.exception_handler(DatabaseError)
    async def db_error_handler(request: Request, exc: DatabaseError) -> JSONResponse:
        logger.error("DatabaseError on %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content=_error_payload(
                request,
                "DATABASE_UNAVAILABLE",
                "Hệ thống cơ sở dữ liệu tạm thời gián đoạn. Vui lòng thử lại sau.",
            ),
        )

    @application.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        headers = dict(exc.headers) if exc.headers else None
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(request, f"HTTP_{exc.status_code}", detail),
            headers=headers,
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception on %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content=_error_payload(
                request, "INTERNAL_SERVER_ERROR", "Đã xảy ra lỗi hệ thống không mong muốn."
            ),
        )

    # Root health probes for uptime monitoring & reverse proxies
    application.include_router(health_router.router)

    # Primary versioned API (/api/v1)
    v1_router = build_v1_router()
    application.include_router(v1_router, prefix="/api/v1")

    # Backward-compatible unversioned alias (/api) hidden from OpenAPI docs
    application.include_router(v1_router, prefix="/api", include_in_schema=False)

    @application.websocket("/ws/live")
    async def websocket_live(ws: WebSocket) -> None:
        await handle_live_websocket(ws)

    # Serve compiled React SPA assets + History API catch-all fallback
    if _FRONTEND_DIST.exists():
        assets_dir = _FRONTEND_DIST / "assets"
        if assets_dir.exists():
            application.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

        @application.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            if full_path in ("api", "ws", "health") or full_path.startswith(
                ("api/", "ws/", "health/")
            ):
                raise HTTPException(status_code=404, detail="Không tìm thấy đường dẫn API.")
            candidate = (_FRONTEND_DIST / full_path).resolve()
            if full_path and candidate.is_file() and _FRONTEND_DIST.resolve() in candidate.parents:
                return FileResponse(candidate)
            index_file = _FRONTEND_DIST / "index.html"
            if index_file.exists():
                return FileResponse(index_file)
            raise HTTPException(status_code=404, detail="Frontend build chưa tồn tại.")

    return application


app = create_app()
