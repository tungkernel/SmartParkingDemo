from __future__ import annotations

from typing import Any, Literal, Optional

import anyio
from fastapi import APIRouter, Depends, Path, Query, status
from fastapi.encoders import jsonable_encoder

from api.deps import get_parking_service
from api.schemas import (
    PassAssetsUpdateRequest,
    PassRegisterRequest,
    PassRenewRequest,
    TariffCreateRequest,
    TariffUpdateRequest,
)
from api.ws import ws_manager
from models.responses import IdResponse, MessageResponse, PaginatedResponse, PassRenewResponse
from services.domain.base import calc_total_pages
from services.parking_service import ParkingService

router = APIRouter(tags=["Monthly Passes & Tariffs"])


@router.get(
    "/passes",
    response_model=PaginatedResponse[dict[str, Any]],
    summary="Danh sách vé tháng có lọc trạng thái, tìm kiếm và phân trang",
)
def list_passes(
    status_filter: Optional[Literal["active", "expired"]] = None,
    keyword: Optional[str] = Query(default=None, max_length=60),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    service: ParkingService = Depends(get_parking_service),
) -> PaginatedResponse[dict[str, Any]]:
    offset = (page - 1) * page_size
    total = service.count_monthly_passes(status_filter=status_filter, keyword=keyword)
    rows = service.get_monthly_passes(
        status_filter=status_filter,
        keyword=keyword,
        limit=page_size,
        offset=offset,
    )
    return PaginatedResponse(
        items=jsonable_encoder(rows),
        total=total,
        page=page,
        page_size=page_size,
        total_pages=calc_total_pages(total, page_size),
    )


@router.get("/passes/summary", response_model=dict[str, Any], summary="Thống kê tổng hợp vé tháng")
def passes_summary(
    service: ParkingService = Depends(get_parking_service),
) -> dict[str, Any]:
    return jsonable_encoder(service.get_monthly_pass_revenue_summary())


@router.post(
    "/passes",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký vé tháng mới và ghi nhận thanh toán",
)
async def register_pass(
    body: PassRegisterRequest,
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    def _exec() -> int:
        emp_id = service.resolve_employee_id(body.employee_id, preferred_role="thu ngân")
        return service.register_monthly_pass(
            hoten=body.hoten,
            sdt=body.sdt,
            cccd=body.cccd,
            customer_type_id=body.customer_type_id,
            license_plate=body.license_plate,
            vehicle_type_id=body.vehicle_type_id,
            card_id=body.card_id,
            months=body.months,
            employee_id=emp_id,
            payment_method=body.payment_method,
        )

    pass_id = await anyio.to_thread.run_sync(_exec)
    await ws_manager.broadcast("passes_updated", {"pass_id": pass_id})
    return IdResponse(id=pass_id)


@router.post(
    "/passes/{pass_id}/renew",
    response_model=PassRenewResponse,
    summary="Gia hạn vé tháng và ghi nhận thu phí",
)
async def renew_pass(
    body: PassRenewRequest,
    pass_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> PassRenewResponse:
    def _exec() -> dict[str, Any]:
        emp_id = service.resolve_employee_id(body.employee_id, preferred_role="thu ngân")
        return service.renew_monthly_pass(
            pass_id,
            body.months,
            employee_id=emp_id,
            payment_method=body.payment_method,
        )

    res = await anyio.to_thread.run_sync(_exec)
    await ws_manager.broadcast("passes_updated", {"pass_id": pass_id})
    return PassRenewResponse(**res)


@router.put(
    "/passes/{pass_id}/assets",
    response_model=MessageResponse,
    summary="Đổi biển số phương tiện hoặc cấp đổi thẻ RFID của vé tháng",
)
async def update_pass_assets(
    body: PassAssetsUpdateRequest,
    pass_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    await anyio.to_thread.run_sync(
        lambda: service.update_monthly_pass_assets(
            pass_id, body.plate, body.vehicle_type_id, body.new_card_id
        )
    )
    await ws_manager.broadcast("passes_updated", {"pass_id": pass_id})
    return MessageResponse(message="Đã cập nhật xe và thẻ vé tháng.")


@router.delete(
    "/passes/{pass_id}",
    response_model=MessageResponse,
    summary="Hủy vé tháng trước hạn",
)
async def cancel_pass(
    pass_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    await anyio.to_thread.run_sync(lambda: service.cancel_monthly_pass(pass_id))
    await ws_manager.broadcast("passes_updated", {"pass_id": pass_id})
    return MessageResponse(message="Đã hủy vé tháng.")


@router.get("/tariffs", response_model=list[dict[str, Any]], summary="Tra cứu bảng giá")
def list_tariffs(
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(service.get_tariffs())


@router.post(
    "/tariffs",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm biểu giá mới",
)
def create_tariff(
    body: TariffCreateRequest,
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    tid = service.create_tariff(
        ticket_type=body.ticket_type,
        unit_price=body.unit_price,
        vehicle_type_id=body.vehicle_type_id,
        customer_type_id=body.customer_type_id,
    )
    return IdResponse(id=tid)


@router.put("/tariffs/{tariff_id}", response_model=MessageResponse, summary="Cập nhật đơn giá")
def update_tariff(
    body: TariffUpdateRequest,
    tariff_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.update_tariff(tariff_id, body.unit_price)
    return MessageResponse(message="Đã cập nhật đơn giá.")


@router.delete("/tariffs/{tariff_id}", response_model=MessageResponse, summary="Xóa biểu giá chưa sử dụng")
def delete_tariff(
    tariff_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.delete_tariff(tariff_id)
    return MessageResponse(message="Đã xóa biểu giá.")
