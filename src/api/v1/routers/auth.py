from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Path, Request, status
from fastapi.encoders import jsonable_encoder

from api.deps import (
    extract_client_ip,
    get_auth_service,
    get_current_user,
    get_parking_service,
    require_roles,
)
from api.middleware import rate_limit_auth
from api.schemas import (
    AccountCreateRequest,
    AccountUpdateRequest,
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
)
from core.config import get_settings
from core.exceptions import AuthenticationError
from models.responses import (
    AuthUserDTO,
    IdResponse,
    MessageResponse,
    TokenResponse,
    WsTicketResponse,
)
from services.auth_service import AuthService, AuthUser
from services.parking_service import ParkingService

router = APIRouter(tags=["Auth & Accounts"])


@router.post(
    "/auth/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit_auth)],
    summary="Đăng nhập và nhận cặp Access/Refresh token",
)
def login(
    request: Request,
    body: LoginRequest,
    auth: AuthService = Depends(get_auth_service),
    service: ParkingService = Depends(get_parking_service),
) -> TokenResponse:
    client_ip = extract_client_ip(request)
    try:
        user = auth.authenticate(body.username, body.password)
    except AuthenticationError:
        try:
            service.record_audit_log(
                None,
                body.username.strip().lower()[:50] or "anonymous",
                "LOGIN_FAILED",
                "taikhoan",
                None,
                {"username": body.username.strip().lower()},
                ip_address=client_ip,
            )
        except Exception:
            pass
        raise

    access_token = auth.create_token(user)
    refresh_token = auth.create_refresh_token(user)
    try:
        service.record_audit_log(
            user.account_id,
            user.username,
            "LOGIN_SUCCESS",
            "taikhoan",
            user.account_id,
            {"role": user.role},
            ip_address=client_ip,
        )
    except Exception:
        pass

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=get_settings().auth_access_ttl_seconds,
        user=AuthUserDTO(**asdict(user)),
    )


@router.post(
    "/auth/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit_auth)],
    summary="Làm mới access token bằng refresh token rotation",
)
def refresh_tokens(
    body: RefreshTokenRequest,
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    user, access_token, new_refresh = auth.rotate_refresh_token(body.refresh_token)
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        token_type="bearer",
        expires_in=get_settings().auth_access_ttl_seconds,
        user=AuthUserDTO(**asdict(user)),
    )


@router.post(
    "/auth/logout",
    response_model=MessageResponse,
    summary="Đăng xuất và thu hồi phiên hiện tại",
)
def logout(
    request: Request,
    body: Optional[LogoutRequest] = Body(default=None),
    user: AuthUser = Depends(get_current_user),
    auth: AuthService = Depends(get_auth_service),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    refresh_token = body.refresh_token if body is not None else None
    auth.revoke_session(user.account_id, refresh_token=refresh_token)
    try:
        service.record_audit_log(
            user.account_id,
            user.username,
            "LOGOUT",
            "taikhoan",
            user.account_id,
            {"all_sessions": refresh_token is None},
            ip_address=extract_client_ip(request),
        )
    except Exception:
        pass
    return MessageResponse(message="Đã đăng xuất và thu hồi phiên thành công.")


@router.get("/auth/me", response_model=AuthUserDTO, summary="Thông tin tài khoản hiện tại")
def me(user: AuthUser = Depends(get_current_user)) -> AuthUserDTO:
    return AuthUserDTO(**asdict(user))


@router.post(
    "/auth/ws-ticket",
    response_model=WsTicketResponse,
    summary="Cấp vé xác thực dùng một lần cho WebSocket /ws/live",
)
def issue_ws_ticket(
    user: AuthUser = Depends(get_current_user),
    auth: AuthService = Depends(get_auth_service),
) -> WsTicketResponse:
    ticket = auth.ws_tickets.issue(user)
    return WsTicketResponse(ticket=ticket, expires_in=30)


@router.post(
    "/auth/change-password",
    response_model=MessageResponse,
    dependencies=[Depends(rate_limit_auth)],
    summary="Đổi mật khẩu cá nhân",
)
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    user: AuthUser = Depends(get_current_user),
    auth: AuthService = Depends(get_auth_service),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    auth.change_own_password(user.account_id, body.old_password, body.new_password)
    service.record_audit_log(
        user.account_id,
        user.username,
        "CHANGE_PASSWORD",
        "taikhoan",
        user.account_id,
        {},
        ip_address=extract_client_ip(request),
    )
    return MessageResponse(message="Đổi mật khẩu thành công. Vui lòng đăng nhập lại.")


@router.get("/accounts", response_model=list[dict[str, Any]], summary="Danh sách tài khoản hệ thống")
def list_accounts(
    _user: AuthUser = Depends(require_roles("ADMIN")),
    auth: AuthService = Depends(get_auth_service),
) -> list[dict[str, Any]]:
    return jsonable_encoder(auth.list_accounts())


@router.post(
    "/accounts",
    response_model=IdResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo tài khoản nhân viên mới",
)
def create_account(
    request: Request,
    body: AccountCreateRequest,
    user: AuthUser = Depends(require_roles("ADMIN")),
    auth: AuthService = Depends(get_auth_service),
    service: ParkingService = Depends(get_parking_service),
) -> IdResponse:
    acc_id = auth.create_account(body.employee_id, body.username, body.password, body.role)
    service.record_audit_log(
        user.account_id,
        user.username,
        "CREATE_ACCOUNT",
        "taikhoan",
        acc_id,
        {"username": body.username, "role": body.role, "employee_id": body.employee_id},
        ip_address=extract_client_ip(request),
    )
    return IdResponse(id=acc_id)


@router.patch(
    "/accounts/{account_id}",
    response_model=MessageResponse,
    summary="Cập nhật vai trò, trạng thái khóa hoặc đặt lại mật khẩu tài khoản",
)
def update_account(
    request: Request,
    body: AccountUpdateRequest,
    account_id: int = Path(..., gt=0),
    user: AuthUser = Depends(require_roles("ADMIN")),
    auth: AuthService = Depends(get_auth_service),
    service: ParkingService = Depends(get_parking_service),
) -> MessageResponse:
    auth.update_account(
        account_id,
        role=body.role,
        is_active=body.is_active,
        new_password=body.new_password,
    )
    service.record_audit_log(
        user.account_id,
        user.username,
        "UPDATE_ACCOUNT",
        "taikhoan",
        account_id,
        {"role": body.role, "is_active": body.is_active, "password_reset": bool(body.new_password)},
        ip_address=extract_client_ip(request),
    )
    return MessageResponse(message="Đã cập nhật tài khoản.")
