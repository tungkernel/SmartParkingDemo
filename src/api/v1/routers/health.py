from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from api.deps import get_db
from core.config import get_settings
from models.responses import HealthResponse
from services.db_service import DBService

router = APIRouter(tags=["Health"])


@router.get("/health/live", response_model=HealthResponse, summary="Liveness probe")
def health_live() -> HealthResponse:
    return HealthResponse(
        ok=True,
        status="alive",
        message="Service is running.",
        version=get_settings().app_version,
    )


@router.get("/health/ready", response_model=HealthResponse, summary="Readiness probe")
def health_ready(response: Response, db: DBService = Depends(get_db)) -> HealthResponse:
    ok, msg = db.test_connection()
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        ok=ok,
        status="ready" if ok else "degraded",
        message=msg,
        version=get_settings().app_version,
    )


@router.get("/health", response_model=HealthResponse, summary="Combined health check")
def health_check(response: Response, db: DBService = Depends(get_db)) -> HealthResponse:
    return health_ready(response=response, db=db)
