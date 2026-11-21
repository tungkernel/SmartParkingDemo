from __future__ import annotations

from datetime import date, datetime
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class DTOBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(DTOBase):
    message: str


class IdResponse(DTOBase):
    id: int


class ErrorEnvelope(DTOBase):
    code: str
    detail: str
    request_id: str
    timestamp: str


class HealthResponse(DTOBase):
    ok: bool
    status: str
    message: str
    version: str


class AuthUserDTO(DTOBase):
    account_id: int
    employee_id: int
    username: str
    full_name: str
    role: str
    lot_id: Optional[int] = None
    token_version: int = 1
    must_change_password: bool = False


class TokenResponse(DTOBase):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int
    user: AuthUserDTO


class WsTicketResponse(DTOBase):
    ticket: str
    expires_in: int = 30


class OverviewMetricsDTO(DTOBase):
    total_slots: int
    available_slots: int
    occupied_slots: int
    active_vehicles: int
    total_revenue: int
    today_revenue: int
    active_monthly_passes: int


class FeeQuoteDTO(DTOBase):
    turn_id: int
    license_plate: str
    vehicle_type: str
    ticket_type: str
    checkin_time: datetime
    checkout_time: datetime
    duration_hours: float
    amount: int
    is_monthly_pass: bool
    monthly_pass_id: Optional[int] = None
    payment_method: Optional[str] = None


class PaginatedResponse(DTOBase, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class ShiftCloseResponse(DTOBase):
    shift_id: int
    expected_cash: int
    actual_cash: int
    transfer_total: int
    refund_total: int = 0
    diff: int


class PassRenewResponse(DTOBase):
    pass_id: int
    new_end_date: date
    amount: int


class ReconcileResponse(DTOBase):
    message: str
    slots_reconciled: int
    cards_reconciled: int


class OperationalAlertsDTO(DTOBase):
    overdue_turns: list[dict[str, Any]]
    expiring_passes: list[dict[str, Any]]
    lost_cards: list[dict[str, Any]]


class OverviewResponse(DTOBase):
    metrics: OverviewMetricsDTO
    lots: list[dict[str, Any]]
    zones: list[dict[str, Any]]


class AnalyticsSummaryDTO(DTOBase):
    daily: list[dict[str, Any]]
    by_vehicle_type: list[dict[str, Any]]
    by_lot: list[dict[str, Any]]
    pass_summary: dict[str, Any]


class CatalogsResponse(DTOBase):
    vehicle_types: list[dict[str, Any]]
    customer_types: list[dict[str, Any]]
    lots: list[dict[str, Any]]
    employees: list[dict[str, Any]]
    vietqr: dict[str, str]
