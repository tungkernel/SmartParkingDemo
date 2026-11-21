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
from api.schemas import AddSlotsRequest, LotRequest, SlotMaintenanceRequest, ZoneRequest
from api.ws import ws_manager
from models.responses import (
    IdResponse,
    MessageResponse,
    OperationalAlertsDTO,
    OverviewMetricsDTO,
    OverviewResponse,
    ReconcileResponse,
)
from services.auth_service import AuthUser
from services.parking_service import ParkingService

router = APIRouter(tags=["Overview & Infrastructure"])


@router.get("/overview", response_model=OverviewResponse, summary="Tổng quan KPI, bãi và khu vực")
def get_overview(
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> OverviewResponse:
    lot_scope = operator_lot_scope(user)
    metrics = service.get_overview_metrics(lot_id=lot_scope)
    return OverviewResponse(
        metrics=OverviewMetricsDTO(**asdict(metrics)),
        lots=jsonable_encoder(service.get_parking_lots(lot_id=lot_scope)),
        zones=jsonable_encoder(service.get_zones_summary(lot_id=lot_scope)),
    )


@router.get("/alerts", response_model=OperationalAlertsDTO, summary="Cảnh báo vận hành thời gian thực")
def get_alerts(
    overdue_hours: int = Query(default=24, ge=1, le=720),
    pass_expiring_days: int = Query(default=7, ge=1, le=60),
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> OperationalAlertsDTO:
    data = service.get_operational_alerts(
        overdue_hours=overdue_hours,
        pass_expiring_days=pass_expiring_days,
        lot_id=operator_lot_scope(user),
        redact_pii=(user.role.upper() == "OPERATOR"),
    )
    return OperationalAlertsDTO(**jsonable_encoder(data))


@router.get("/lots", response_model=list[dict[str, Any]], summary="Danh sách bãi đỗ xe")
def list_lots(
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(service.get_parking_lots(lot_id=operator_lot_scope(user)))


@router.post(
    "/lots",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm bãi đỗ xe mới",
)
async def create_lot(
    request: Request,
    body: LotRequest,
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    actor = build_audit_actor(request, user)
    lot_id = await anyio.to_thread.run_sync(
        lambda: service.create_parking_lot(body.name, body.location, actor=actor)
    )
    await ws_manager.broadcast("infrastructure_updated", {"lot_id": lot_id})
    return IdResponse(id=lot_id)


@router.put("/lots/{lot_id}", response_model=MessageResponse, summary="Cập nhật bãi đỗ xe")
async def update_lot(
    request: Request,
    body: LotRequest,
    lot_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    await anyio.to_thread.run_sync(
        lambda: service.update_parking_lot(lot_id, body.name, body.location, actor=actor)
    )
    await ws_manager.broadcast("infrastructure_updated", {"lot_id": lot_id})
    return MessageResponse(message="Đã cập nhật bãi đỗ.")


@router.delete("/lots/{lot_id}", response_model=MessageResponse, summary="Xóa bãi đỗ xe")
async def delete_lot(
    request: Request,
    lot_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    await anyio.to_thread.run_sync(lambda: service.delete_parking_lot(lot_id, actor=actor))
    await ws_manager.broadcast("infrastructure_updated", {"lot_id": lot_id})
    return MessageResponse(message="Đã xóa bãi đỗ.")


@router.get("/zones", response_model=list[dict[str, Any]], summary="Danh sách khu vực đỗ")
def list_zones(
    lot_id: Optional[int] = Query(default=None, gt=0),
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    effective_lot = operator_lot_scope(user) or lot_id
    return jsonable_encoder(service.get_zones_summary(lot_id=effective_lot))


@router.post(
    "/zones",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm khu vực đỗ mới",
)
async def create_zone(
    request: Request,
    body: ZoneRequest,
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    actor = build_audit_actor(request, user)
    zone_id = await anyio.to_thread.run_sync(
        lambda: service.create_zone(body.lot_id, body.name, actor=actor)
    )
    await ws_manager.broadcast("infrastructure_updated", {"zone_id": zone_id})
    return IdResponse(id=zone_id)


@router.put("/zones/{zone_id}", response_model=MessageResponse, summary="Cập nhật khu vực đỗ")
async def update_zone(
    request: Request,
    body: ZoneRequest,
    zone_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    await anyio.to_thread.run_sync(
        lambda: service.update_zone(zone_id, body.lot_id, body.name, actor=actor)
    )
    await ws_manager.broadcast("infrastructure_updated", {"zone_id": zone_id})
    return MessageResponse(message="Đã cập nhật khu vực.")


@router.delete("/zones/{zone_id}", response_model=MessageResponse, summary="Xóa khu vực đỗ")
async def delete_zone(
    request: Request,
    zone_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    await anyio.to_thread.run_sync(lambda: service.delete_zone(zone_id, actor=actor))
    await ws_manager.broadcast("infrastructure_updated", {"zone_id": zone_id})
    return MessageResponse(message="Đã xóa khu vực.")


@router.get("/slots", response_model=list[dict[str, Any]], summary="Danh sách ô đỗ lọc tại SQL")
def list_slots(
    lot_id: Optional[int] = Query(default=None, gt=0),
    zone_id: Optional[int] = Query(default=None, gt=0),
    status_filter: Optional[int] = Query(default=None, ge=0, le=2),
    keyword: Optional[str] = Query(default=None, max_length=50),
    limit: Optional[int] = Query(default=None, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    effective_lot = operator_lot_scope(user) or lot_id
    return jsonable_encoder(
        service.get_slots(
            lot_id=effective_lot,
            zone_id=zone_id,
            status_filter=status_filter,
            keyword=keyword,
            limit=limit,
            offset=offset,
        )
    )


@router.post(
    "/slots",
    response_model=dict[str, int],
    status_code=status.HTTP_201_CREATED,
    summary="Thêm hàng loạt ô đỗ mới vào khu vực",
)
async def add_slots(
    request: Request,
    body: AddSlotsRequest,
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> dict[str, int]:
    actor = build_audit_actor(request, user)
    created = await anyio.to_thread.run_sync(
        lambda: service.add_slots_to_zone(body.zone_id, body.count, actor=actor)
    )
    await ws_manager.broadcast("infrastructure_updated", {"zone_id": body.zone_id})
    return {"created": created}


@router.patch(
    "/slots/{slot_id}/maintenance",
    response_model=MessageResponse,
    summary="Bật/tắt chế độ bảo trì ô đỗ",
)
async def set_slot_maintenance(
    request: Request,
    body: SlotMaintenanceRequest,
    slot_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "OPERATOR")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    lot_scope = operator_lot_scope(user)
    await anyio.to_thread.run_sync(
        lambda: service.set_slot_maintenance(
            slot_id, body.maintenance, operator_lot_id=lot_scope, actor=actor
        )
    )
    await ws_manager.broadcast("slots_updated", {"slot_id": slot_id})
    return MessageResponse(message="Đã cập nhật trạng thái vị trí.")


@router.delete("/slots/{slot_id}", response_model=MessageResponse, summary="Xóa ô đỗ chưa phát sinh lượt")
async def delete_slot(
    request: Request,
    slot_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    await anyio.to_thread.run_sync(lambda: service.delete_slot(slot_id, actor=actor))
    await ws_manager.broadcast("slots_updated", {"slot_id": slot_id})
    return MessageResponse(message="Đã xóa vị trí đỗ.")


@router.post(
    "/slots/reconcile",
    response_model=ReconcileResponse,
    summary="Đối soát và giải phóng ô đỗ & thẻ RFID mồ côi",
)
async def reconcile_slots(
    request: Request,
    user: AuthUser = Depends(require_roles("ADMIN")),
    service: ParkingService = Depends(get_parking_service),
) -> ReconcileResponse:
    actor = build_audit_actor(request, user)
    stats = await anyio.to_thread.run_sync(lambda: service.reconcile_slot_states(actor=actor))
    await ws_manager.broadcast("slots_updated", stats)
    return ReconcileResponse(
        message="Đã đồng bộ trạng thái ô đỗ và thẻ xe.",
        slots_reconciled=stats["slots_reconciled"],
        cards_reconciled=stats["cards_reconciled"],
    )
