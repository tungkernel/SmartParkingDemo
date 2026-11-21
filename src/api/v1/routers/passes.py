from __future__ import annotations

from typing import Any, Literal, Optional

import anyio
from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.encoders import jsonable_encoder

from api.deps import build_audit_actor, get_current_user, get_parking_service, require_roles
from api.schemas import (
    PassAssetsUpdateRequest,
    PassRegisterRequest,
    PassRenewRequest,
    TariffCreateRequest,
    TariffUpdateRequest,
)
from api.ws import ws_manager
from models.responses import IdResponse, MessageResponse, PaginatedResponse, PassRenewResponse
from services.auth_service import AuthUser
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
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> PaginatedResponse[dict[str, Any]]:
    offset = (page - 1) * page_size
    redact = user.role.upper() == "OPERATOR"
    total = service.count_monthly_passes(status_filter=status_filter, keyword=keyword)
    rows = service.get_monthly_passes(
        status_filter=status_filter,
        keyword=keyword,
        limit=page_size,
        offset=offset,
        redact_pii=redact,
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
    _user: AuthUser = Depends(get_current_user),
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
    request: Request,
    body: PassRegisterRequest,
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT", "OPERATOR")),
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    actor = build_audit_actor(request, user)
    pass_id = await anyio.to_thread.run_sync(
        lambda: service.register_monthly_pass(
            hoten=body.hoten,
            sdt=body.sdt,
            cccd=body.cccd,
            customer_type_id=body.customer_type_id,
            license_plate=body.license_plate,
            vehicle_type_id=body.vehicle_type_id,
            card_id=body.card_id,
            months=body.months,
            employee_id=user.employee_id,
            payment_method=body.payment_method,
            actor=actor,
        )
    )
    await ws_manager.broadcast("passes_updated", {"pass_id": pass_id})
    return IdResponse(id=pass_id)


@router.post(
    "/passes/{pass_id}/renew",
    response_model=PassRenewResponse,
    summary="Gia hạn vé tháng và ghi nhận thu phí",
)
async def renew_pass(
    request: Request,
    body: PassRenewRequest,
    pass_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT", "OPERATOR")),
    service: ParkingService = Depends(get_parking_service),
) -> PassRenewResponse:
    actor = build_audit_actor(request, user)
    res = await anyio.to_thread.run_sync(
        lambda: service.renew_monthly_pass(
            pass_id,
            body.months,
            employee_id=user.employee_id,
            payment_method=body.payment_method,
            actor=actor,
        )
    )
    await ws_manager.broadcast("passes_updated", {"pass_id": pass_id})
    return PassRenewResponse(**res)


@router.put(
    "/passes/{pass_id}/assets",
    response_model=MessageResponse,
    summary="Đổi biển số phương tiện hoặc cấp đổi thẻ RFID của vé tháng",
)
async def update_pass_assets(
    request: Request,
    body: PassAssetsUpdateRequest,
    pass_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    await anyio.to_thread.run_sync(
        lambda: service.update_monthly_pass_assets(
            pass_id, body.plate, body.vehicle_type_id, body.new_card_id, actor=actor
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
    request: Request,
    pass_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    await anyio.to_thread.run_sync(lambda: service.cancel_monthly_pass(pass_id, actor=actor))
    await ws_manager.broadcast("passes_updated", {"pass_id": pass_id})
    return MessageResponse(message="Đã hủy vé tháng.")


@router.get("/tariffs", response_model=list[dict[str, Any]], summary="Tra cứu bảng giá")
def list_tariffs(
    _user: AuthUser = Depends(get_current_user),
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
    request: Request,
    body: TariffCreateRequest,
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    actor = build_audit_actor(request, user)
    # Fixed positional/keyword mapping matching BillingService.create_tariff
    tid = service.create_tariff(
        ticket_type=body.ticket_type,
        unit_price=body.unit_price,
        vehicle_type_id=body.vehicle_type_id,
        customer_type_id=body.customer_type_id,
        actor=actor,
    )
    return IdResponse(id=tid)


@router.put("/tariffs/{tariff_id}", response_model=MessageResponse, summary="Cập nhật đơn giá")
def update_tariff(
    request: Request,
    body: TariffUpdateRequest,
    tariff_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    service.update_tariff(tariff_id, body.unit_price, actor=actor)
    return MessageResponse(message="Đã cập nhật đơn giá.")


@router.delete("/tariffs/{tariff_id}", response_model=MessageResponse, summary="Xóa biểu giá chưa sử dụng")
def delete_tariff(
    request: Request,
    tariff_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    service.delete_tariff(tariff_id, actor=actor)
    return MessageResponse(message="Đã xóa biểu giá.")
