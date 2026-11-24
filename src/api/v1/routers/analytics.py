from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder

from api.deps import get_parking_service
from models.responses import AnalyticsSummaryDTO
from services.parking_service import ParkingService

router = APIRouter(tags=["Analytics"])


@router.get(
    "/analytics/summary",
    response_model=AnalyticsSummaryDTO,
    summary="Báo cáo doanh thu theo ngày, loại xe, bãi đỗ và vé tháng",
)
def analytics_summary(
    days: int = Query(default=30, ge=7, le=365),
    service: ParkingService = Depends(get_parking_service),
) -> AnalyticsSummaryDTO:
    return AnalyticsSummaryDTO(
        daily=jsonable_encoder(service.get_daily_revenue(days=days)),
        by_vehicle_type=jsonable_encoder(service.get_revenue_by_vehicle_type()),
        by_lot=jsonable_encoder(service.get_revenue_by_lot()),
        pass_summary=jsonable_encoder(service.get_monthly_pass_revenue_summary()),
    )
