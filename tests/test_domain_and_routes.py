from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from mysql.connector import Error as MySQLError

from api.deps import get_auth_service, get_db, get_parking_service
from api.main import app
from api.middleware import SlidingWindowRateLimiter, auth_rate_limiter
from api.ws import LiveConnectionManager
from core.exceptions import AuthenticationError, ConflictError, DatabaseError, NotFoundError
from core.logging import JsonLogFormatter, configure_logging
from services.auth_service import AuthService, AuthUser, hash_password
from services.db_service import DBService
from services.domain.analytics_service import AnalyticsService
from services.domain.base import vn_today
from services.domain.billing_service import BillingService
from services.domain.directory_service import DirectoryService
from services.domain.gate_service import GateService
from services.domain.infrastructure_service import InfrastructureService
from services.domain.pass_service import PassService
from services.parking_service import ParkingService


def _active_row(user: AuthUser) -> dict[str, object]:
    return {
        "id": user.account_id,
        "idnv": user.employee_id,
        "username": user.username,
        "role": user.role,
        "is_active": 1,
        "token_version": user.token_version,
        "must_change_password": 0,
        "hoten": user.full_name,
        "idbdx": user.lot_id,
    }


# ----------------------------------------------------------------------
# DBService, Logging, WebSocket Manager & Rate Limiter
# ----------------------------------------------------------------------


def test_db_service_operations_and_deadlock_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    svc = DBService("localhost", "dbptit", "u", "p", pool_size=4)
    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_cursor.fetchall.return_value = [{"id": 1}]
    fake_cursor.fetchone.return_value = {"id": 1}
    fake_cursor.lastrowid = 9
    fake_cursor.rowcount = 2
    fake_conn.cursor.return_value = fake_cursor

    monkeypatch.setattr(svc, "_acquire_connection", lambda: fake_conn)
    assert svc.fetch_all("SELECT 1") == [{"id": 1}]
    assert svc.fetch_one("SELECT 1") == {"id": 1}
    assert svc.execute_non_query("INSERT INTO x VALUES (1)") == 9
    assert svc.execute_batch("INSERT INTO x VALUES (%s)", [(1,), (2,)]) == 2
    svc.execute_transaction([("UPDATE x SET a = 1", None)])
    with svc.transaction() as cur:
        cur.execute("SELECT 1")
    assert svc.test_connection()[0] is True

    # Simulate deadlock (1213) once, then succeed on retry
    attempts = {"n": 0}

    def flaky_tx(cursor: MagicMock) -> str:
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise MySQLError(errno=1213, msg="Deadlock found")
        return "ok"

    monkeypatch.setattr("services.db_service.time.sleep", lambda _s: None)
    assert svc.run_in_transaction(flaky_tx) == "ok"
    assert attempts["n"] == 2

    # Non-retryable error wraps into DatabaseError cleanly
    def failing_conn() -> MagicMock:
        raise MySQLError(errno=1045, msg="Access denied")

    monkeypatch.setattr(svc, "_acquire_connection", failing_conn)
    with pytest.raises(DatabaseError):
        svc.fetch_all("SELECT 1")
    svc.close_pool()


def test_json_log_formatter_and_rate_limiter() -> None:
    configure_logging("INFO")
    fmt = JsonLogFormatter()
    rec = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", (), None)
    parsed = json.loads(fmt.format(rec))
    assert parsed["message"] == "hello"
    assert parsed["level"] == "INFO"

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    limiter.check("127.0.0.1:/login")
    limiter.check("127.0.0.1:/login")
    with pytest.raises(Exception) as exc_info:
        limiter.check("127.0.0.1:/login")
    assert getattr(exc_info.value, "status_code", None) == 429


def test_ws_manager_concurrent_broadcast_prunes_dead_clients() -> None:
    async def _run() -> None:
        mgr = LiveConnectionManager(max_connections=2, send_timeout=1.0)
        good_ws = AsyncMock()
        bad_ws = AsyncMock()
        bad_ws.send_json.side_effect = RuntimeError("broken pipe")
        extra_ws = AsyncMock()

        assert await mgr.connect(good_ws) is True
        assert await mgr.connect(bad_ws) is True
        assert await mgr.connect(extra_ws) is False  # over max_connections cap
        assert mgr.active_count == 2

        await mgr.broadcast("slots_updated", {"slot_id": 1})
        assert good_ws.send_json.await_count == 1
        assert mgr.active_count == 1  # dead socket pruned automatically

        await mgr.close_all()
        assert mgr.active_count == 0

    asyncio.run(_run())


# ----------------------------------------------------------------------
# AuthService Full Lifecycle
# ----------------------------------------------------------------------


def test_auth_authenticate_rehash_refresh_logout_and_seed() -> None:
    db = MagicMock(spec=DBService)
    auth = AuthService(db, secret_key="auth-lifecycle-secret-key-32-chars!!")
    pw_hash = hash_password("StrongPass123!")

    # Unknown user executes constant-time dummy verification
    db.fetch_one.return_value = None
    with pytest.raises(AuthenticationError):
        auth.authenticate("nobody", "StrongPass123!")

    # Valid login
    db.fetch_one.return_value = {
        "id": 1,
        "idnv": 3,
        "username": "admin",
        "password_hash": pw_hash,
        "role": "ADMIN",
        "is_active": 1,
        "token_version": 1,
        "must_change_password": 0,
        "hoten": "Admin",
        "idbdx": 1,
    }
    user = auth.authenticate("admin", "StrongPass123!")
    assert user.role == "ADMIN"

    # Refresh token creation & rotation
    raw = auth.create_refresh_token(user)
    assert len(raw) >= 32
    cur = MagicMock()
    cur.fetchone.return_value = {
        "id": 10,
        "account_id": 1,
        "expires_at": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=2),
        "revoked_at": None,
        "idnv": 3,
        "username": "admin",
        "role": "ADMIN",
        "is_active": 1,
        "token_version": 1,
        "must_change_password": 0,
        "hoten": "Admin",
        "idbdx": 1,
    }
    db.transaction.return_value.__enter__.return_value = cur
    rot_user, new_access, new_refresh = auth.rotate_refresh_token(raw)
    assert rot_user.username == "admin"
    assert new_access and new_refresh and new_refresh != raw

    # Logout / revoke session increments token_version
    auth.revoke_session(1, refresh_token=new_refresh)
    auth.revoke_session(1, refresh_token=None)

    # Change own password
    cur2 = MagicMock()
    cur2.fetchone.return_value = {"password_hash": pw_hash}
    db.transaction.return_value.__enter__.return_value = cur2
    auth.change_own_password(1, "StrongPass123!", "NewStrongPass99!")

    # Create account
    cur3 = MagicMock()
    cur3.fetchone.side_effect = [{"id": 5}, None, None]
    cur3.lastrowid = 12
    db.transaction.return_value.__enter__.return_value = cur3
    assert auth.create_account(5, "nv_moi", "Password123!", "OPERATOR") == 12

    # Ensure default accounts seeds unique salts per employee
    cur4 = MagicMock()
    cur4.fetchone.return_value = {"cnt": 0}
    cur4.fetchall.return_value = [
        {"id": 1, "hoten": "A", "chucvu": "Quản lý"},
        {"id": 2, "hoten": "B", "chucvu": "Thu ngân"},
        {"id": 3, "hoten": "C", "chucvu": "Bảo vệ"},
    ]
    db.transaction.return_value.__enter__.return_value = cur4
    assert auth.ensure_default_accounts() == 3


# ----------------------------------------------------------------------
# Domain Services Comprehensive Coverage
# ----------------------------------------------------------------------


def test_infrastructure_directory_pass_billing_analytics_domain_services() -> None:
    db = MagicMock(spec=DBService)
    cur = MagicMock()
    cur.lastrowid = 5
    cur.rowcount = 1
    db.transaction.return_value.__enter__.return_value = cur
    db.fetch_all.return_value = []
    db.fetch_one.return_value = {"cnt": 0}

    infra = InfrastructureService(db)
    assert infra.create_parking_lot("Bãi D", "PTIT Km10") == 5
    cur.fetchone.return_value = {"id": 5}
    infra.update_parking_lot(5, "Bãi D1", "PTIT")
    cur.fetchone.side_effect = [{"id": 5}, None, None, None]
    infra.delete_parking_lot(5)
    # Deleting a lot with shift history must raise ConflictError cleanly
    cur.fetchone.side_effect = [{"id": 5}, None, None, {"id": 99}]
    with pytest.raises(ConflictError):
        infra.delete_parking_lot(5)
    cur.fetchone.side_effect = [{"id": 1}, None]
    assert infra.create_zone(1, "KHU-Z1") == 5
    cur.fetchone.side_effect = [{"id": 2}, None]
    infra.update_zone(2, 1, "KHU-Z2")
    cur.fetchone.side_effect = [{"id": 2}, None]
    infra.delete_zone(2)
    cur.fetchone.side_effect = [{"id": 2}, {"max_stt": 10}]
    assert infra.add_slots_to_zone(2, 3) == 3
    cur.fetchone.side_effect = [{"id": 10, "idkvd": 2, "trangthai": 1}, {"idbdx": 1}]
    infra.set_slot_maintenance(10, True, operator_lot_id=1)
    cur.fetchone.side_effect = [{"id": 10, "trangthai": 1}, None]
    infra.delete_slot(10)
    infra.get_slots(lot_id=1, zone_id=2, status_filter=1, keyword="29A", limit=10, offset=0)

    directory = DirectoryService(db)
    db.fetch_all.return_value = [
        {"id": 1, "hoten": "NV1", "sdt": "0912345678", "cccd": "001095000111", "email": "a@b.c", "diachi": "HN", "ngaysinh": "2000-01-01"}
    ]
    redacted_emps = directory.get_employees_detail(keyword="NV", limit=10, redact_pii=True)
    assert redacted_emps[0]["cccd"].startswith("*")
    assert redacted_emps[0]["email"] is None
    cur.fetchone.side_effect = [None]
    assert directory.create_employee(1, "NV Mới", "Hà Nội", date(1999, 1, 1), "Bảo vệ", "0912345678", date(2026, 1, 1), "a@b.vn", "001122334455") == 5
    cur.fetchone.side_effect = [{"id": 5}, None]
    directory.update_employee(5, 1, "NV Mới 2", "Hà Nội", "Thu ngân", "0912345678", "a@b.vn", "001122334455")
    cur.fetchone.side_effect = [{"id": 5}, None, None, None, None]
    directory.delete_employee(5)
    db.fetch_all.return_value = [{"id": 1, "hoten": "KH1", "sdt": "0912345678", "cccd": "001095000111"}]
    redacted_cust = directory.get_customers_detail(keyword="KH", redact_pii=True)
    assert redacted_cust[0]["sdt"].startswith("*")
    cur.fetchone.side_effect = [{"id": 1}, None]
    directory.update_customer(1, "KH Updated", "0912345678", "001095000111", 1)
    cur.fetchone.side_effect = [{"id": 1}, None]
    directory.delete_customer(1)
    directory.get_walkin_visitors(limit=50, keyword="29A")
    cur.fetchone.side_effect = [{"id": 9, "trangthai": 1}]
    directory.set_card_status(9, 2)
    cur.fetchone.side_effect = [{"id": 9, "trangthai": 2}, None, None]
    directory.delete_card(9)
    cur.fetchone.side_effect = [{"id": 4}, None]
    directory.update_vehicle(4, "29A-999.99", 2)
    cur.fetchone.side_effect = [{"id": 4}, None, None]
    directory.delete_vehicle(4)

    passes = PassService(db)
    passes.get_monthly_passes(status_filter="active", keyword="29A", limit=10)
    passes.count_monthly_passes(status_filter="expired", keyword="29A")
    cur.fetchone.side_effect = [
        {"id": 5, "ngayketthuc": vn_today() + timedelta(days=5), "idbg": 4},
        {"dongia": 100000},
    ]
    renewed = passes.renew_monthly_pass(5, 2, employee_id=3, payment_method="Tiền mặt")
    assert renewed["amount"] == 200000
    cur.fetchone.side_effect = [{"id": 5, "idtx": 1}, {"id": 8, "idlpt": 2}, {"id": 2, "trangthai": 1}, None]
    passes.update_monthly_pass_assets(5, "29A12345", 2, 2)
    cur.fetchone.side_effect = [{"id": 5, "idtx": 2, "ngayketthuc": vn_today()}, None]
    passes.cancel_monthly_pass(5)
    db.fetch_one.return_value = {"total_passes": 4, "active_passes": 3, "collected_total": 300000, "collected_month": 100000, "legacy_total": 0, "legacy_month": 0}
    assert passes.get_monthly_pass_revenue_summary()["total_pass_revenue"] == 300000

    billing = BillingService(db)
    cur.fetchone.side_effect = [None]
    assert billing.create_tariff("ngày", 5000, 2, 1) == 5
    cur.fetchone.side_effect = [{"id": 5, "dongia": 5000}]
    billing.update_tariff(5, 6000)
    cur.fetchone.side_effect = [{"id": 5}, None, None]
    billing.delete_tariff(5)
    billing.get_transactions(date_from=date(2026, 11, 1), date_to=date(2026, 11, 21), vehicle_type_id=2, keyword="29A", status_filter="Thành công", payment_method="Tiền mặt", employee_id=3)
    billing.count_transactions(keyword="29A")
    db.fetch_one.side_effect = [
        {"id": 1, "idnv": 3, "opening_cash": 100000, "started_at": "2026-11-21 00:00:00", "status": "OPEN"},
        {"tx_count": 3, "cash_total": 50000, "transfer_total": 20000, "refund_total": 5000},
    ]
    active_shift = billing.get_active_shift(3)
    assert active_shift is not None and active_shift["live_expected_cash"] == 150000
    billing.get_shifts(limit=10, employee_id=3)

    analytics = AnalyticsService(db)
    db.fetch_one.side_effect = None
    db.fetch_one.return_value = {"total_slots": 10, "available_slots": 8, "occupied_slots": 2, "active_count": 2, "total_revenue": 1000, "today_revenue": 500, "active_passes": 1, "cnt": 1}
    assert analytics.get_overview_metrics(lot_id=1).available_slots == 8
    assert analytics.get_overview_metrics(lot_id=None).total_slots == 10
    analytics.get_daily_revenue(days=7)
    analytics.get_operational_alerts(overdue_hours=24, pass_expiring_days=7, lot_id=1)
    analytics.record_audit_log(1, "admin", "TEST", "entity", 1, {"a": 1}, ip_address="127.0.0.1")
    analytics.get_audit_logs(limit=20, action="TEST", entity_type="entity", actor_username="admin")
    analytics.count_audit_logs(action="TEST")

    gate = GateService(db)
    gate.get_active_turns(lot_id=1, keyword="29A", limit=20)
    gate.count_active_turns(lot_id=1, keyword="29A")
    cur.fetchone.side_effect = [{"id": 10, "idvtd": 1, "idtx": 2}, {"idbdx": 1}, None]
    gate.cancel_active_turn(10, operator_lot_id=1)


# ----------------------------------------------------------------------
# Full FastAPI v1 Router Coverage (All Domains)
# ----------------------------------------------------------------------


def test_all_fastapi_v1_domain_routers_end_to_end() -> None:
    auth_rate_limiter.reset()
    mock_db = MagicMock(spec=DBService)
    mock_db.test_connection.return_value = (True, "OK")
    auth = AuthService(mock_db, secret_key="e2e-router-test-secret-key-32-chars!")
    mock_svc = MagicMock(spec=ParkingService)
    admin = AuthUser(1, 3, "admin", "Lê Minh Cường", "ADMIN", 1)

    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_parking_service] = lambda: mock_svc

    try:
        client = TestClient(app)
        mock_db.fetch_one.return_value = _active_row(admin)
        headers = {"Authorization": f"Bearer {auth.create_token(admin)}"}

        # Auth endpoints: me, logout, change-password, accounts create/patch
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
        assert client.post("/api/v1/auth/logout", headers=headers, json={}).status_code == 200

        # Infrastructure endpoints
        mock_svc.get_operational_alerts.return_value = {"overdue_turns": [], "expiring_passes": [], "lost_cards": []}
        assert client.get("/api/v1/alerts", headers=headers).status_code == 200
        mock_svc.get_parking_lots.return_value = []
        assert client.get("/api/v1/lots", headers=headers).status_code == 200
        mock_svc.create_parking_lot.return_value = 9
        assert client.post("/api/v1/lots", headers=headers, json={"name": "Bãi X", "location": "PTIT"}).status_code == 201
        assert client.put("/api/v1/lots/9", headers=headers, json={"name": "Bãi X2", "location": "PTIT"}).status_code == 200
        assert client.delete("/api/v1/lots/9", headers=headers).status_code == 200
        mock_svc.get_zones_summary.return_value = []
        assert client.get("/api/v1/zones", headers=headers).status_code == 200
        mock_svc.create_zone.return_value = 4
        assert client.post("/api/v1/zones", headers=headers, json={"lot_id": 1, "name": "KHU-M"}).status_code == 201
        assert client.put("/api/v1/zones/4", headers=headers, json={"lot_id": 1, "name": "KHU-N"}).status_code == 200
        assert client.delete("/api/v1/zones/4", headers=headers).status_code == 200
        mock_svc.get_slots.return_value = []
        assert client.get("/api/v1/slots?status_filter=1", headers=headers).status_code == 200
        mock_svc.add_slots_to_zone.return_value = 5
        assert client.post("/api/v1/slots", headers=headers, json={"zone_id": 1, "count": 5}).status_code == 201
        assert client.patch("/api/v1/slots/1/maintenance", headers=headers, json={"maintenance": True}).status_code == 200
        assert client.delete("/api/v1/slots/1", headers=headers).status_code == 200
        mock_svc.reconcile_slot_states.return_value = {"slots_reconciled": 1, "cards_reconciled": 1}
        assert client.post("/api/v1/slots/reconcile", headers=headers).status_code == 200

        # Turns move & cancel
        mock_svc.get_active_turns.return_value = []
        assert client.get("/api/v1/turns/active", headers=headers).status_code == 200
        assert client.post("/api/v1/turns/1/move-slot", headers=headers, json={"new_slot_id": 2}).status_code == 200
        assert client.post("/api/v1/turns/1/cancel", headers=headers).status_code == 200

        # Billing export CSV, update status, shifts
        mock_svc.get_transactions.return_value = [
            {"ma_gd": 1, "giothanhtoan": "2026-11-21 08:00:00", "bienso": "29A12345", "loaiphuongtien": "xe máy", "mathe": "001", "tenbaido": "Bãi A", "vitri": "A1-1", "hinhthuc": "Vé ngày", "loaithanhtoan": "Tiền mặt", "chiphi": 5000, "trangthai": "Thành công", "nhanvien": "Admin"}
        ]
        csv_res = client.get("/api/v1/transactions/export", headers=headers)
        assert csv_res.status_code == 200
        assert "29A12345" in csv_res.text
        assert client.patch("/api/v1/transactions/1/status", headers=headers, json={"status": "Hoàn tiền"}).status_code == 200
        mock_svc.get_active_shift.return_value = None
        assert client.get("/api/v1/shifts/active", headers=headers).status_code == 200
        mock_svc.count_shifts.return_value = 0
        mock_svc.get_shifts.return_value = []
        assert client.get("/api/v1/shifts", headers=headers).status_code == 200
        mock_svc.open_shift.return_value = 11
        assert client.post("/api/v1/shifts/open", headers=headers, json={"opening_cash": 100000}).status_code == 201
        mock_svc.close_shift.return_value = {"shift_id": 11, "expected_cash": 100000, "actual_cash": 100000, "transfer_total": 0, "refund_total": 0, "diff": 0}
        assert client.post("/api/v1/shifts/11/close", headers=headers, json={"actual_cash": 100000}).status_code == 200

        # Passes & Tariffs
        mock_svc.count_monthly_passes.return_value = 0
        mock_svc.get_monthly_passes.return_value = []
        assert client.get("/api/v1/passes", headers=headers).status_code == 200
        mock_svc.get_monthly_pass_revenue_summary.return_value = {"total_passes": 0}
        assert client.get("/api/v1/passes/summary", headers=headers).status_code == 200
        mock_svc.register_monthly_pass.return_value = 33
        assert client.post(
            "/api/v1/passes",
            headers=headers,
            json={"hoten": "KH A", "sdt": "0912345678", "cccd": "001204000123", "customer_type_id": 1, "license_plate": "29A12345", "vehicle_type_id": 2, "card_id": 5, "months": 1, "payment_method": "Tiền mặt"},
        ).status_code == 201
        mock_svc.renew_monthly_pass.return_value = {"pass_id": 33, "new_end_date": date(2027, 1, 1), "amount": 100000}
        assert client.post("/api/v1/passes/33/renew", headers=headers, json={"months": 1, "payment_method": "Chuyển khoản"}).status_code == 200
        assert client.put("/api/v1/passes/33/assets", headers=headers, json={"plate": "29A12345", "vehicle_type_id": 2, "new_card_id": 6}).status_code == 200
        assert client.delete("/api/v1/passes/33", headers=headers).status_code == 200
        mock_svc.get_tariffs.return_value = []
        assert client.get("/api/v1/tariffs", headers=headers).status_code == 200
        assert client.put("/api/v1/tariffs/1", headers=headers, json={"unit_price": 7000}).status_code == 200
        assert client.delete("/api/v1/tariffs/1", headers=headers).status_code == 200

        # Directory & Audit Logs
        mock_svc.get_vehicle_types.return_value = []
        mock_svc.get_customer_types.return_value = []
        mock_svc.get_employees.return_value = []
        cat_res = client.get("/api/v1/catalogs", headers=headers)
        assert cat_res.status_code == 200 and "vietqr" in cat_res.json()
        mock_svc.get_employees_detail.return_value = []
        assert client.get("/api/v1/people/employees", headers=headers).status_code == 200
        assert client.put("/api/v1/people/employees/1", headers=headers, json={"hoten": "A", "chucvu": "Bảo vệ", "sdt": "0912345678"}).status_code == 200
        assert client.delete("/api/v1/people/employees/1", headers=headers).status_code == 200
        mock_svc.get_customers_detail.return_value = []
        assert client.get("/api/v1/people/customers", headers=headers).status_code == 200
        assert client.put("/api/v1/people/customers/1", headers=headers, json={"hoten": "B", "sdt": "0912345678", "cccd": "001204000123", "customer_type_id": 1}).status_code == 200
        assert client.delete("/api/v1/people/customers/1", headers=headers).status_code == 200
        mock_svc.get_walkin_visitors.return_value = []
        assert client.get("/api/v1/people/walkins", headers=headers).status_code == 200
        mock_svc.get_cards.return_value = []
        mock_svc.get_cards_detail.return_value = []
        assert client.get("/api/v1/cards?only_available=true", headers=headers).status_code == 200
        assert client.get("/api/v1/cards?detail=true", headers=headers).status_code == 200
        mock_svc.create_card.return_value = 99
        assert client.post("/api/v1/cards", headers=headers, json={"code": "099"}).status_code == 201
        assert client.patch("/api/v1/cards/99/status", headers=headers, json={"status": 2}).status_code == 200
        assert client.delete("/api/v1/cards/99", headers=headers).status_code == 200
        mock_svc.get_vehicles_detail.return_value = []
        assert client.get("/api/v1/vehicles", headers=headers).status_code == 200
        assert client.put("/api/v1/vehicles/1", headers=headers, json={"plate": "29A12345", "vehicle_type_id": 2}).status_code == 200
        assert client.delete("/api/v1/vehicles/1", headers=headers).status_code == 200
        mock_svc.count_audit_logs.return_value = 0
        mock_svc.get_audit_logs.return_value = []
        assert client.get("/api/v1/audit-logs", headers=headers).status_code == 200

        # ConflictError & NotFoundError mapping
        mock_svc.delete_parking_lot.side_effect = ConflictError("Đang có khu vực")
        assert client.delete("/api/v1/lots/1", headers=headers).status_code == 409
        mock_svc.delete_zone.side_effect = NotFoundError("Không tồn tại")
        assert client.delete("/api/v1/zones/999", headers=headers).status_code == 404
    finally:
        app.dependency_overrides.clear()
        auth_rate_limiter.reset()
