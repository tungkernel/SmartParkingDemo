from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class EntityBase(BaseModel):
    """Base Pydantic model for all 16 `dbptit` database entities."""

    model_config = ConfigDict(from_attributes=True)


class BaiDoXe(EntityBase):
    id: int
    tenbaido: str
    diadiem: Optional[str] = None


class KhuVucDo(EntityBase):
    id: int
    idbdx: int
    ten: str


class ViTriDo(EntityBase):
    id: int
    idkvd: int
    sothutu: int
    trangthai: int = 1  # 1=Trống, 0=Đang đỗ, 2=Bảo trì


class LoaiPhuongTien(EntityBase):
    id: int
    tenloai: str


class LoaiKhachHang(EntityBase):
    id: int
    tenloai: str


class BangGia(EntityBase):
    id: int
    loaive: str
    dongia: int
    idlpt: Optional[int] = None
    idlkh: Optional[int] = None


class KhachHang(EntityBase):
    id: int
    hoten: str
    sdt: Optional[str] = None
    cccd: Optional[str] = None
    idlkh: Optional[int] = None


class PhuongTien(EntityBase):
    id: int
    bienso: str
    idlpt: Optional[int] = None


class NhanVien(EntityBase):
    id: int
    idbdx: Optional[int] = None
    hoten: Optional[str] = None
    diachi: Optional[str] = None
    ngaysinh: Optional[date] = None
    chucvu: str
    sdt: str
    ngaybatdau: Optional[date] = None
    email: Optional[str] = None
    cccd: Optional[str] = None


class TheXe(EntityBase):
    id: int
    maso: str
    trangthai: int = 1  # 1=Sẵn sàng, 0=Đang dùng, 2=Mất/Hỏng


class VeThang(EntityBase):
    id: int
    ngaybatdau: date
    ngayketthuc: date
    idtx: Optional[int] = None
    idpt: Optional[int] = None
    idbg: Optional[int] = None
    idkh: Optional[int] = None


class LuotDo(EntityBase):
    id: int
    idvtd: int
    giovao: datetime
    giora: Optional[datetime] = None
    idnv: int
    idpt: Optional[int] = None
    idtx: Optional[int] = None
    idbg: Optional[int] = None


class ThanhToan(EntityBase):
    id: int
    idld: Optional[int] = None
    chiphi: int
    giothanhtoan: datetime
    trangthai: str = "Thành công"
    idnv: int
    loaithanhtoan: str = "Tiền mặt"
    idvt: Optional[int] = None


class TaiKhoan(EntityBase):
    id: int
    idnv: int
    username: str
    role: Literal["ADMIN", "ACCOUNTANT", "OPERATOR"] = "OPERATOR"
    is_active: bool = True
    token_version: int = 1
    must_change_password: bool = False
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CaLamViec(EntityBase):
    id: int
    idnv: int
    idbdx: Optional[int] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    opening_cash: int = 0
    expected_cash: int = 0
    actual_cash: Optional[int] = None
    transfer_total: int = 0
    note: Optional[str] = None
    status: Literal["OPEN", "CLOSED"] = "OPEN"


class AuditLog(EntityBase):
    id: int
    actor_id: Optional[int] = None
    actor_username: str
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    ip_address: Optional[str] = None
    details_json: Optional[str] = None
    created_at: datetime
