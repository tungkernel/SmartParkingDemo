from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Path, Query, status
from fastapi.encoders import jsonable_encoder

from api.deps import get_parking_service
from api.schemas import (
    CardCreateRequest,
    CardStatusRequest,
    CustomerUpdateRequest,
    EmployeeRequest,
    VehicleUpdateRequest,
)
from core.config import get_settings
from models.responses import CatalogsResponse, IdResponse, MessageResponse
from services.parking_service import ParkingService

router = APIRouter(tags=["Directory & Catalogs"])


@router.get("/catalogs", response_model=CatalogsResponse, summary="Danh mục nền hệ thống & cấu hình VietQR")
def get_catalogs(
    service: ParkingService = Depends(get_parking_service),
) -> CatalogsResponse:
    settings = get_settings()
    return CatalogsResponse(
        vehicle_types=jsonable_encoder(service.get_vehicle_types()),
        customer_types=jsonable_encoder(service.get_customer_types()),
        lots=jsonable_encoder(service.get_parking_lots()),
        employees=jsonable_encoder(service.get_employees()),
        vietqr={
            "bank_bin": settings.vietqr_bank_bin,
            "account_no": settings.vietqr_account_no,
            "account_name": settings.vietqr_account_name,
        },
    )


@router.get("/people/employees", response_model=list[dict[str, Any]], summary="Danh sách nhân viên")
def list_employees(
    keyword: Optional[str] = Query(default=None, max_length=60),
    limit: Optional[int] = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(
        service.get_employees_detail(keyword=keyword, limit=limit, offset=offset)
    )


@router.post(
    "/people/employees",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm nhân viên mới",
)
def create_employee(
    body: EmployeeRequest,
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    eid = service.create_employee(
        lot_id=body.lot_id,
        full_name=body.hoten,
        address=body.diachi,
        birth_date=body.birth_date,
        role=body.chucvu,
        phone=body.sdt,
        start_date=body.start_date,
        email=body.email,
        cccd=body.cccd,
    )
    return IdResponse(id=eid)


@router.put(
    "/people/employees/{emp_id}",
    response_model=MessageResponse,
    summary="Cập nhật hồ sơ nhân viên",
)
def update_employee(
    body: EmployeeRequest,
    emp_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.update_employee(
        emp_id=emp_id,
        lot_id=body.lot_id,
        full_name=body.hoten,
        address=body.diachi,
        role=body.chucvu,
        phone=body.sdt,
        email=body.email,
        cccd=body.cccd,
    )
    return MessageResponse(message="Đã cập nhật nhân viên.")


@router.delete(
    "/people/employees/{emp_id}",
    response_model=MessageResponse,
    summary="Xóa nhân viên chưa phát sinh dữ liệu",
)
def delete_employee(
    emp_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.delete_employee(emp_id)
    return MessageResponse(message="Đã xóa nhân viên.")


@router.get("/people/customers", response_model=list[dict[str, Any]], summary="Danh sách khách hàng vé tháng")
def list_customers(
    keyword: Optional[str] = Query(default=None, max_length=60),
    limit: Optional[int] = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(
        service.get_customers_detail(keyword=keyword, limit=limit, offset=offset)
    )


@router.put(
    "/people/customers/{customer_id}",
    response_model=MessageResponse,
    summary="Cập nhật thông tin khách hàng",
)
def update_customer(
    body: CustomerUpdateRequest,
    customer_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.update_customer(
        customer_id, body.hoten, body.sdt, body.cccd, body.customer_type_id
    )
    return MessageResponse(message="Đã cập nhật khách hàng.")


@router.delete(
    "/people/customers/{customer_id}",
    response_model=MessageResponse,
    summary="Xóa khách hàng chưa đăng ký vé tháng",
)
def delete_customer(
    customer_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.delete_customer(customer_id)
    return MessageResponse(message="Đã xóa khách hàng.")


@router.get("/people/walkins", response_model=list[dict[str, Any]], summary="Lịch sử khách vãng lai")
def list_walkins(
    keyword: Optional[str] = Query(default=None, max_length=60),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(
        service.get_walkin_visitors(limit=limit, offset=offset, keyword=keyword)
    )


@router.get("/cards", response_model=list[dict[str, Any]], summary="Kho thẻ xe RFID")
def list_cards(
    only_available: bool = False,
    exclude_pass_bound: bool = True,
    detail: bool = False,
    status_filter: Optional[int] = Query(default=None, ge=0, le=2),
    keyword: Optional[str] = Query(default=None, max_length=30),
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    if detail:
        return jsonable_encoder(
            service.get_cards_detail(
                status_filter=status_filter, keyword=keyword, limit=limit, offset=offset
            )
        )
    return jsonable_encoder(
        service.get_cards(only_available=only_available, exclude_pass_bound=exclude_pass_bound)
    )


@router.post(
    "/cards",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Phát hành thẻ RFID mới",
)
def create_card(
    body: CardCreateRequest,
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    cid = service.create_card(body.code)
    return IdResponse(id=cid)


@router.patch(
    "/cards/{card_id}/status",
    response_model=MessageResponse,
    summary="Cập nhật trạng thái thẻ RFID (1=Sẵn sàng, 2=Mất/Hỏng)",
)
def set_card_status(
    body: CardStatusRequest,
    card_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.set_card_status(card_id, body.status)
    return MessageResponse(message="Đã cập nhật trạng thái thẻ.")


@router.delete(
    "/cards/{card_id}",
    response_model=MessageResponse,
    summary="Xóa thẻ RFID chưa có lịch sử",
)
def delete_card(
    card_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.delete_card(card_id)
    return MessageResponse(message="Đã xóa thẻ xe.")


@router.get("/vehicles", response_model=list[dict[str, Any]], summary="Danh bạ phương tiện")
def list_vehicles(
    keyword: Optional[str] = Query(default=None, max_length=30),
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    service: ParkingService = Depends(get_parking_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(
        service.get_vehicles_detail(keyword=keyword, limit=limit, offset=offset)
    )


@router.put(
    "/vehicles/{vehicle_id}",
    response_model=MessageResponse,
    summary="Cập nhật biển số hoặc loại phương tiện",
)
def update_vehicle(
    body: VehicleUpdateRequest,
    vehicle_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.update_vehicle(vehicle_id, body.plate, body.vehicle_type_id)
    return MessageResponse(message="Đã cập nhật phương tiện.")


@router.delete(
    "/vehicles/{vehicle_id}",
    response_model=MessageResponse,
    summary="Xóa phương tiện chưa có lịch sử",
)
def delete_vehicle(
    vehicle_id: int = Path(..., gt=0),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    service.delete_vehicle(vehicle_id)
    return MessageResponse(message="Đã xóa phương tiện.")
