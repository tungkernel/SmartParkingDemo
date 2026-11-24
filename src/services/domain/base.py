from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from core.exceptions import ValidationError

VN_TZ = timezone(timedelta(hours=7))
VALID_PAYMENT_METHODS = ("Tiền mặt", "Chuyển khoản")
MAX_PLATE_LEN = 15


@dataclass(frozen=True)
class OverviewMetrics:
    """Aggregated KPI metrics for the main dashboard."""

    total_slots: int
    available_slots: int
    occupied_slots: int
    active_vehicles: int
    total_revenue: int
    today_revenue: int
    active_monthly_passes: int


@dataclass(frozen=True)
class FeeQuote:
    """Calculated fee summary for a parking turn checkout."""

    turn_id: int
    license_plate: str
    vehicle_type: str
    ticket_type: str
    checkin_time: datetime
    checkout_time: datetime
    duration_hours: float
    amount: int
    is_monthly_pass: bool
    monthly_pass_id: Optional[int]
    payment_method: Optional[str] = None


def utc_now() -> datetime:
    """Return naive UTC datetime matching MySQL/TiDB DATETIME stored in +00:00."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_now_str() -> str:
    """Return UTC timestamp string formatted for MySQL/TiDB DATETIME columns."""
    return utc_now().strftime("%Y-%m-%d %H:%M:%S")


def vn_today() -> date:
    """Return current calendar date in Asia/Ho_Chi_Minh (UTC+7)."""
    return datetime.now(VN_TZ).date()


def vn_day_utc_bounds(day: date) -> tuple[str, str]:
    """Return half-open [start_utc, end_utc) strings covering one Vietnam calendar day."""
    start_vn = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=VN_TZ)
    end_vn = start_vn + timedelta(days=1)
    start_utc = start_vn.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_vn.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc.strftime("%Y-%m-%d %H:%M:%S"), end_utc.strftime("%Y-%m-%d %H:%M:%S")


def vn_date_range_utc_bounds(
    date_from: Optional[date],
    date_to: Optional[date],
) -> tuple[Optional[str], Optional[str]]:
    """Convert inclusive Vietnam dates into half-open [start_utc, end_utc) SQL bounds."""
    start_str: Optional[str] = None
    end_str: Optional[str] = None
    if date_from is not None:
        start_str = vn_day_utc_bounds(date_from)[0]
    if date_to is not None:
        end_str = vn_day_utc_bounds(date_to)[1]
    return start_str, end_str


def normalize_plate(plate: str) -> str:
    """Normalize and validate license plate against widened phuongtien.bienso (max 15 chars)."""
    normalized = plate.strip().upper().replace(" ", "")
    if not normalized:
        raise ValidationError("Biển số xe không được để trống.")
    if len(normalized) > MAX_PLATE_LEN:
        raise ValidationError(f"Biển số xe tối đa {MAX_PLATE_LEN} ký tự (ví dụ: 29A-123.45).")
    if not all(ch.isalnum() or ch in "-." for ch in normalized):
        raise ValidationError("Biển số xe chỉ được chứa chữ, số, dấu '-' hoặc '.'.")
    return normalized


def normalize_payment_method(method: Optional[str]) -> str:
    """Validate and normalize payment method label."""
    cleaned = (method or "Tiền mặt").strip()
    if cleaned not in VALID_PAYMENT_METHODS:
        raise ValidationError(
            f"Phương thức thanh toán chỉ hỗ trợ: {', '.join(VALID_PAYMENT_METHODS)}."
        )
    return cleaned


def require_text(value: str, label: str, max_len: int) -> str:
    """Validate non-empty text within database column length."""
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError(f"{label} không được để trống.")
    if len(cleaned) > max_len:
        raise ValidationError(f"{label} tối đa {max_len} ký tự.")
    return cleaned


def calc_total_pages(total: int, page_size: int) -> int:
    if page_size <= 0:
        return 1
    return max(1, math.ceil(total / page_size))
