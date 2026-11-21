from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from api.deps import (
    build_audit_actor,
    get_current_user,
    get_parking_service,
    operator_lot_scope,
    require_roles,
)
from api.schemas import PaymentStatusRequest, ShiftCloseRequest, ShiftOpenRequest
from models.responses import IdResponse, MessageResponse, PaginatedResponse, ShiftCloseResponse
from services.auth_service import AuthUser
from services.domain.base import calc_total_pages
from services.parking_service import ParkingService

router = APIRouter(tags=["Transactions & Shifts"])

_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value: Any) -> Any:
    """Neutralize spreadsheet formula injection in exported CSV cells."""
    if value is None or isinstance(value, (int, float)):
        return value
    text = str(value)
    stripped = text.lstrip(" ")
    if text.startswith(_CSV_FORMULA_PREFIXES) or (
        stripped and stripped.startswith(_CSV_FORMULA_PREFIXES)
    ):
        return f"'{text}"
    return text


@router.get(
    "/transactions",
    response_model=PaginatedResponse[dict[str, Any]],
    summary="Tra cứu lịch sử giao dịch có lọc SQL, sắp xếp và phân trang",
)
def list_transactions(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    vehicle_type_id: Optional[int] = Query(default=None, gt=0),
    keyword: Optional[str] = Query(default=None, max_length=60),
    status_filter: Optional[Literal["Thành công", "Hoàn tiền", "Thất bại"]] = None,
    payment_method: Optional[Literal["Tiền mặt", "Chuyển khoản"]] = None,
    sort_by: Literal["ma_gd", "giothanhtoan", "chiphi", "trangthai"] = "giothanhtoan",
    sort_dir: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> PaginatedResponse[dict[str, Any]]:
    emp_scope = user.employee_id if user.role.upper() == "OPERATOR" else None
    offset = (page - 1) * page_size
    total = service.count_transactions(
        date_from=start_date,
        date_to=end_date,
        vehicle_type_id=vehicle_type_id,
        keyword=keyword,
        status_filter=status_filter,
        payment_method=payment_method,
        employee_id=emp_scope,
    )
    rows = service.get_transactions(
        date_from=start_date,
        date_to=end_date,
        vehicle_type_id=vehicle_type_id,
        keyword=keyword,
        status_filter=status_filter,
        payment_method=payment_method,
        employee_id=emp_scope,
        sort_by=sort_by,
        sort_dir=sort_dir,
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


@router.get(
    "/transactions/export",
    summary="Xuất báo cáo giao dịch CSV (UTF-8 BOM) phía máy chủ",
)
def export_transactions_csv(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    vehicle_type_id: Optional[int] = Query(default=None, gt=0),
    keyword: Optional[str] = Query(default=None, max_length=60),
    status_filter: Optional[Literal["Thành công", "Hoàn tiền", "Thất bại"]] = None,
    payment_method: Optional[Literal["Tiền mặt", "Chuyển khoản"]] = None,
    limit: int = Query(default=2000, ge=1, le=10000),
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> StreamingResponse:
    rows = service.get_transactions(
        date_from=start_date,
        date_to=end_date,
        vehicle_type_id=vehicle_type_id,
        keyword=keyword,
        status_filter=status_filter,
        payment_method=payment_method,
        limit=limit,
        offset=0,
    )
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Mã GD",
            "Thời gian TT (UTC)",
            "Biển số",
            "Loại xe",
            "Mã thẻ",
            "Bãi đỗ",
            "Vị trí",
            "Loại giao dịch",
            "Phương thức TT",
            "Số tiền (VND)",
            "Trạng thái",
            "Thu ngân",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                _csv_safe(r.get("ma_gd", "")),
                _csv_safe(r.get("giothanhtoan", "")),
                _csv_safe(r.get("bienso", "")),
                _csv_safe(r.get("loaiphuongtien", "")),
                _csv_safe(r.get("mathe", "")),
                _csv_safe(r.get("tenbaido", "")),
                _csv_safe(r.get("vitri", "")),
                _csv_safe(r.get("hinhthuc", "")),
                _csv_safe(r.get("loaithanhtoan", "")),
                r.get("chiphi", 0),
                _csv_safe(r.get("trangthai", "")),
                _csv_safe(r.get("nhanvien", "")),
            ]
        )
    buf.seek(0)
    filename = f"giao_dich_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch(
    "/transactions/{payment_id}/status",
    response_model=MessageResponse,
    summary="Cập nhật trạng thái thanh toán (Thành công / Hoàn tiền / Thất bại)",
)
def update_transaction_status(
    request: Request,
    body: PaymentStatusRequest,
    payment_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT")),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    actor = build_audit_actor(request, user)
    service.update_payment_status(payment_id, body.status, actor=actor)
    return MessageResponse(message="Đã cập nhật trạng thái thanh toán.")


@router.get("/shifts/active", response_model=dict[str, Any], summary="Ca trực đang mở của tài khoản hiện tại")
def get_active_shift(
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> dict[str, Any]:
    return jsonable_encoder({"shift": service.get_active_shift(user.employee_id)})


@router.get(
    "/shifts",
    response_model=PaginatedResponse[dict[str, Any]],
    summary="Lịch sử ca làm việc & đối soát bàn giao quỹ",
)
def list_shifts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=200),
    user: AuthUser = Depends(require_roles("ADMIN", "ACCOUNTANT", "OPERATOR")),
    service: ParkingService = Depends(get_parking_service),
) -> PaginatedResponse[dict[str, Any]]:
    emp_scope = user.employee_id if user.role.upper() == "OPERATOR" else None
    offset = (page - 1) * page_size
    total = service.count_shifts(employee_id=emp_scope)
    rows = service.get_shifts(limit=page_size, offset=offset, employee_id=emp_scope)
    return PaginatedResponse(
        items=jsonable_encoder(rows),
        total=total,
        page=page,
        page_size=page_size,
        total_pages=calc_total_pages(total, page_size),
    )


@router.post(
    "/shifts/open",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Mở ca làm việc mới",
)
def open_shift(
    request: Request,
    body: ShiftOpenRequest,
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    actor = build_audit_actor(request, user)
    effective_lot_id = operator_lot_scope(user) or body.lot_id
    shift_id = service.open_shift(
        employee_id=user.employee_id,
        lot_id=effective_lot_id,
        opening_cash=body.opening_cash,
        note=body.note,
        actor=actor,
    )
    return IdResponse(id=shift_id)


@router.post(
    "/shifts/{shift_id}/close",
    response_model=ShiftCloseResponse,
    summary="Chốt ca làm việc và đối soát tiền mặt thực tế",
)
def close_shift(
    request: Request,
    body: ShiftCloseRequest,
    shift_id: int = Path(..., gt=0),
    user: AuthUser = Depends(get_current_user),
    service: ParkingService = Depends(get_parking_service),
) -> ShiftCloseResponse:
    actor = build_audit_actor(request, user)
    res = service.close_shift(shift_id, user.employee_id, body.actual_cash, body.note, actor=actor)
    return ShiftCloseResponse(**res)
