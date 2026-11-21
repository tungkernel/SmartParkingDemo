from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder

from api.deps import get_parking_service, require_roles
from models.responses import AnalyticsSummaryDTO, PaginatedResponse
from services.auth_service import AuthUser
from services.domain.base import calc_total_pages
from services.parking_service import ParkingService

router = APIRouter(tags=["Analytics & Audit"])


@router.get(
    "/analytics/summary",
    response_model=AnalyticsSummaryDTO,
    summary="Báo cáo doanh thu theo ngày, loại xe, bãi đỗ và vé tháng",
)
def analytics_summary(
    days: int = Query(default=30, ge=7, le=365),
    _user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> AnalyticsSummaryDTO:
    return AnalyticsSummaryDTO(
        daily=jsonable_encoder(service.get_daily_revenue(days=days)),
        by_vehicle_type=jsonable_encoder(service.get_revenue_by_vehicle_type()),
        by_lot=jsonable_encoder(service.get_revenue_by_lot()),
        pass_summary=jsonable_encoder(service.get_monthly_pass_revenue_summary()),
    )


@router.get(
    "/audit-logs",
    response_model=PaginatedResponse[dict[str, Any]],
    summary="Nhật ký kiểm toán hệ thống có lọc và phân trang",
)
def get_audit_logs(
    action: Optional[str] = Query(default=None, max_length=60),
    entity_type: Optional[str] = Query(default=None, max_length=40),
    actor_username: Optional[str] = Query(default=None, max_length=50),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    _user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> PaginatedResponse[dict[str, Any]]:
    offset = (page - 1) * page_size
    total = service.count_audit_logs(
        action=action, entity_type=entity_type, actor_username=actor_username
    )
    rows = service.get_audit_logs(
        limit=page_size,
        offset=offset,
        action=action,
        entity_type=entity_type,
        actor_username=actor_username,
    )
    return PaginatedResponse(
        items=jsonable_encoder(rows),
        total=total,
        page=page,
        page_size=page_size,
        total_pages=calc_total_pages(total, page_size),
    )
