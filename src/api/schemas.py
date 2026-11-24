from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

PaymentMethodLiteral = Literal["Tiền mặt", "Chuyển khoản"]
PaymentStatusLiteral = Literal["Thành công", "Hoàn tiền", "Thất bại"]
TicketTypeLiteral = Literal["ngày", "tháng"]


class CheckInRequest(BaseModel):
    license_plate: str = Field(min_length=1, max_length=15)
    vehicle_type_id: int = Field(gt=0)
    slot_id: int = Field(gt=0)
    card_id: int = Field(gt=0)
    employee_id: Optional[int] = Field(default=None, gt=0)


class CheckOutRequest(BaseModel):
    employee_id: Optional[int] = Field(default=None, gt=0)
    payment_method: PaymentMethodLiteral = "Tiền mặt"
    lost_card: bool = False
    lost_card_fee: int = Field(default=0, ge=0, le=50_000_000)
    replacement_card_id: Optional[int] = Field(default=None, gt=0)


class MoveSlotRequest(BaseModel):
    new_slot_id: int = Field(gt=0)


class PaymentStatusRequest(BaseModel):
    status: PaymentStatusLiteral


class LotRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    location: str = Field(min_length=1, max_length=255)


class ZoneRequest(BaseModel):
    lot_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=20)


class AddSlotsRequest(BaseModel):
    zone_id: int = Field(gt=0)
    count: int = Field(ge=1, le=50)


class SlotMaintenanceRequest(BaseModel):
    maintenance: bool


class TariffCreateRequest(BaseModel):
    ticket_type: TicketTypeLiteral
    vehicle_type_id: int = Field(gt=0)
    customer_type_id: Optional[int] = Field(default=None, gt=0)
    unit_price: int = Field(ge=0, le=100_000_000)


class TariffUpdateRequest(BaseModel):
    unit_price: int = Field(ge=0, le=100_000_000)


class PassRegisterRequest(BaseModel):
    hoten: str = Field(min_length=1, max_length=60)
    sdt: str = Field(min_length=8, max_length=20)
    cccd: str = Field(min_length=9, max_length=15)
    customer_type_id: int = Field(gt=0)
    license_plate: str = Field(min_length=1, max_length=15)
    vehicle_type_id: int = Field(gt=0)
    card_id: int = Field(gt=0)
    months: int = Field(default=1, ge=1, le=12)
    payment_method: PaymentMethodLiteral = "Tiền mặt"
    employee_id: Optional[int] = Field(default=None, gt=0)


class PassRenewRequest(BaseModel):
    months: int = Field(default=1, ge=1, le=24)
    payment_method: PaymentMethodLiteral = "Tiền mặt"
    employee_id: Optional[int] = Field(default=None, gt=0)


class PassAssetsUpdateRequest(BaseModel):
    plate: str = Field(min_length=1, max_length=15)
    vehicle_type_id: int = Field(gt=0)
    new_card_id: int = Field(gt=0)


class EmployeeRequest(BaseModel):
    hoten: str = Field(min_length=1, max_length=60)
    chucvu: str = Field(min_length=1, max_length=30)
    sdt: str = Field(min_length=8, max_length=15)
    email: str = Field(default="", max_length=100)
    diachi: str = Field(default="", max_length=255)
    cccd: str = Field(default="", max_length=15)
    birth_date: Optional[date] = None
    start_date: Optional[date] = None
    lot_id: Optional[int] = Field(default=None, gt=0)


class CustomerUpdateRequest(BaseModel):
    hoten: str = Field(min_length=1, max_length=60)
    sdt: str = Field(min_length=8, max_length=20)
    cccd: str = Field(min_length=9, max_length=15)
    customer_type_id: int = Field(gt=0)


class CardCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=10)


class CardStatusRequest(BaseModel):
    status: Literal[1, 2]


class VehicleUpdateRequest(BaseModel):
    plate: str = Field(min_length=1, max_length=15)
    vehicle_type_id: int = Field(gt=0)
