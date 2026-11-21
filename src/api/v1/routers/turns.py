from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

import anyio
from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.encoders import jsonable_encoder

from api.deps import (
    build_audit_actor,
    get_current_user,
    get_parking_service,
    operator_lot_scope,
    require_roles,
)
from api.schemas import CheckInRequest, CheckOutRequest, MoveSlotRequest
from api.ws import ws_manager
from models.responses import FeeQuoteDTO, MessageResponse
from services.auth_service import AuthUser
from services.parking_service import ParkingService

router = APIRouter(tags=["Gate POS & Turns"])


def _resolve_gate_employee_id(user: AuthUser, requested_employee_id: Optional[int]) -> int:
    """Prevent OPERATOR/ACCOUNTANT accounts from attributing gate actions to another employee."""
    if user.role.upper() == "ADMIN" and requested_employee_id is not None:
        return requested_employee_id
    return user.employee_id


@router.get("/turns/active", response_model=list[dict[str, Any]], summary="Danh sách xe đang gửi trong bãi")
def list_active_turns(
    lot_id: Optional[int] = Query(default=None, gt=0),
    keyword: Optional[str] = Query(default=None, max_length=50),
    limit: Optional[int] = Query(default=None, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    effective_lot = operator_lot_scope(user) or lot_id
    return jsonable_encoder(
        service.get_active_turns(
            lot_id=effective_lot,
            keyword=keyword,
            limit=limit,
            offset=offset,
        )
    )


@router.post(
    "/turns/check-in",
    response_model=dict[str, int],
    status_code=status.HTTP_201_CREATED,
    summary="Ghi nhận xe vào bãi (atomic transaction)",
)
async def check_in(
    request: Request,
    body: CheckInRequest,
    user: AuthUser = Depends(require_roles("ADMIN", "OPERATOR", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> dict[str, int]:
    emp_id = _resolve_gate_employee_id(user, body.employee_id)
    actor = build_audit_actor(request, user)
    lot_scope = operator_lot_scope(user)
    turn_id = await anyio.to_thread.run_sync(
        lambda: service.check_in_vehicle(
            license_plate=body.license_plate,
            vehicle_type_id=body.vehicle_type_id,
            slot_id=body.slot_id,
            card_id=body.card_id,
            employee_id=emp_id,
            operator_lot_id=lot_scope,
            actor=actor,
        )
    )
    await ws_manager.broadcast("turn_checked_in", {"turn_id": turn_id, "slot_id": body.slot_id})
    return {"turn_id": turn_id}


@router.get("/turns/{turn_id}/quote", response_model=FeeQuoteDTO, summary="Ước tính phí check-out")
def fee_quote(
    turn_id: int = Path(..., gt=0),
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> FeeQuoteDTO:
    quote = service.get_fee_quote(turn_id, operator_lot_id=operator_lot_scope(user))
    return FeeQuoteDTO(**asdict(quote))


@router.post(
    "/turns/{turn_id}/check-out",
    response_model=FeeQuoteDTO,
    summary="Xác nhận xe ra bãi, ghi nhận thanh toán và giải phóng ô/thẻ",
)
async def check_out(
    request: Request,
    body: CheckOutRequest,
    turn_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "OPERATOR", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> FeeQuoteDTO:
    emp_id = _resolve_gate_employee_id(user, body.employee_id)
    actor = build_audit_actor(request, user)
    lot_scope = operator_lot_scope(user)
    quote = await anyio.to_thread.run_sync(
        lambda: service.check_out_vehicle(
            turn_id=turn_id,
            employee_id=emp_id,
            lost_card=body.lost_card,
            lost_card_fee=body.lost_card_fee,
            payment_method=body.payment_method,
            replacement_card_id=body.replacement_card_id,
            operator_lot_id=lot_scope,
            actor=actor,
        )
    )
    await ws_manager.broadcast(
        "turn_checked_out",
        {"turn_id": turn_id, "payment_method": body.payment_method},
    )
    return FeeQuoteDTO(**asdict(quote))


@router.post(
    "/turns/{turn_id}/move-slot",
    response_model=MessageResponse,
    summary="Chuyển xe đang gửi sang ô đỗ trống khác",
)
async def move_slot(
    request: Request,
    body: MoveSlotRequest,
    turn_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "OPERATOR")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    lot_scope = operator_lot_scope(user)
    await anyio.to_thread.run_sync(
        lambda: service.move_active_turn_slot(
            turn_id, body.new_slot_id, operator_lot_id=lot_scope, actor=actor
        )
    )
    await ws_manager.broadcast("slots_updated", {"turn_id": turn_id, "new_slot_id": body.new_slot_id})
    return MessageResponse(message="Đã chuyển vị trí đỗ.")


@router.post(
    "/turns/{turn_id}/cancel",
    response_model=MessageResponse,
    summary="Hủy lượt gửi xe chưa thanh toán do nhập nhầm",
)
async def cancel_turn(
    request: Request,
    turn_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "OPERATOR")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    lot_scope = operator_lot_scope(user)
    await anyio.to_thread.run_sync(
        lambda: service.cancel_active_turn(turn_id, operator_lot_id=lot_scope, actor=actor)
    )
    await ws_manager.broadcast("turn_cancelled", {"turn_id": turn_id})
    return MessageResponse(message="Đã hủy lượt gửi xe.")
