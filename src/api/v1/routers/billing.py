from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Path, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from api.deps import get_parking_service
from api.schemas import PaymentStatusRequest
from models.responses import MessageResponse, PaginatedResponse
from services.domain.base import calc_total_pages
from services.parking_service import ParkingService

router = APIRouter(tags=["Transactions"])

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
    employee_id: Optional[int] = Query(default=None, gt=0),
    sort_by: Literal["ma_gd", "giothanhtoan", "chiphi", "trangthai"] = "giothanhtoan",
    sort_dir: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    service: ParkingService = Depends(get_parking_service),
) -> PaginatedResponse[dict[str, Any]]:
    offset = (page - 1) * page_size
    total = service.count_transactions(
        date_from=start_date,
        date_to=end_date,
        vehicle_type_id=vehicle_type_id,
        keyword=keyword,
        status_filter=status_filter,
        payment_method=payment_method,
        employee_id=employee_id,
    )
    rows = service.get_transactions(
        date_from=start_date,
        date_to=end_date,
        vehicle_type_id=vehicle_type_id,
        keyword=keyword,
        status_filter=status_filter,
        payment_method=payment_method,
        employee_id=employee_id,
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
    employee_id: Optional[int] = Query(default=None, gt=0),
    limit: int = Query(default=2000, ge=1, le=10000),
    service: ParkingService = Depends(get_parking_service),
) -> StreamingResponse:
    rows = service.get_transactions(
        date_from=start_date,
        date_to=end_date,
        vehicle_type_id=vehicle_type_id,
        keyword=keyword,
        status_filter=status_filter,
        payment_method=payment_method,
        employee_id=employee_id,
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
    body: PaymentStatusRequest,
    payment_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.update_payment_status(payment_id, body.status)
    return MessageResponse(message="Đã cập nhật trạng thái thanh toán.")
