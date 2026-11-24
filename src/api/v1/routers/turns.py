from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

import anyio
from fastapi import APIRouter, Depends, Path, Query, status
from fastapi.encoders import jsonable_encoder

from api.deps import get_parking_service
from api.schemas import CheckInRequest, CheckOutRequest, MoveSlotRequest
from api.ws import ws_manager
from models.responses import FeeQuoteDTO, MessageResponse
from services.parking_service import ParkingService

router = APIRouter(tags=["Gate POS & Turns"])


@router.get("/turns/active", response_model=list[dict[str, Any]], summary="Danh sách xe đang gửi trong bãi")
def list_active_turns(
    lot_id: Optional[int] = Query(default=None, gt=0),
    keyword: Optional[str] = Query(default=None, max_length=50),
    limit: Optional[int] = Query(default=None, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(
        service.get_active_turns(
            lot_id=lot_id,
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
    body: CheckInRequest,
    service: ParkingService = Depends(get_parking_service),
) -> dict[str, int]:
    def _exec() -> int:
        emp_id = service.resolve_employee_id(body.employee_id, preferred_role="bảo vệ")
        return service.check_in_vehicle(
            license_plate=body.license_plate,
            vehicle_type_id=body.vehicle_type_id,
            slot_id=body.slot_id,
            card_id=body.card_id,
            employee_id=emp_id,
        )

    turn_id = await anyio.to_thread.run_sync(_exec)
    await ws_manager.broadcast("turn_checked_in", {"turn_id": turn_id, "slot_id": body.slot_id})
    return {"turn_id": turn_id}


@router.get("/turns/{turn_id}/quote", response_model=FeeQuoteDTO, summary="Ước tính phí check-out")
def fee_quote(
    turn_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> FeeQuoteDTO:
    quote = service.get_fee_quote(turn_id)
    return FeeQuoteDTO(**asdict(quote))


@router.post(
    "/turns/{turn_id}/check-out",
    response_model=FeeQuoteDTO,
    summary="Xác nhận xe ra bãi, ghi nhận thanh toán và giải phóng ô/thẻ",
)
async def check_out(
    body: CheckOutRequest,
    turn_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> FeeQuoteDTO:
    def _exec():
        emp_id = service.resolve_employee_id(body.employee_id, preferred_role="thu ngân")
        return service.check_out_vehicle(
            turn_id=turn_id,
            employee_id=emp_id,
            lost_card=body.lost_card,
            lost_card_fee=body.lost_card_fee,
            payment_method=body.payment_method,
            replacement_card_id=body.replacement_card_id,
        )

    quote = await anyio.to_thread.run_sync(_exec)
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
    body: MoveSlotRequest,
    turn_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    await anyio.to_thread.run_sync(lambda: service.move_active_turn_slot(turn_id, body.new_slot_id))
    await ws_manager.broadcast("slots_updated", {"turn_id": turn_id, "new_slot_id": body.new_slot_id})
    return MessageResponse(message="Đã chuyển vị trí đỗ.")


@router.post(
    "/turns/{turn_id}/cancel",
    response_model=MessageResponse,
    summary="Hủy lượt gửi xe chưa thanh toán do nhập nhầm",
)
async def cancel_turn(
    turn_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    await anyio.to_thread.run_sync(lambda: service.cancel_active_turn(turn_id))
    await ws_manager.broadcast("turn_cancelled", {"turn_id": turn_id})
    return MessageResponse(message="Đã hủy lượt gửi xe.")
