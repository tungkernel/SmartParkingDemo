from __future__ import annotations

import asyncio
import json
import logging
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from mysql.connector import Error as MySQLError

from api.deps import get_db, get_parking_service
from api.main import app
from api.ws import LiveConnectionManager
from core.exceptions import ConflictError, DatabaseError, NotFoundError
from core.logging import JsonLogFormatter, configure_logging
from services.db_service import DBService
from services.domain.analytics_service import AnalyticsService
from services.domain.base import vn_today
from services.domain.billing_service import BillingService
from services.domain.directory_service import DirectoryService
from services.domain.gate_service import GateService
from services.domain.infrastructure_service import InfrastructureService
from services.domain.pass_service import PassService
from services.parking_service import ParkingService

# ----------------------------------------------------------------------
# DBService, Logging & WebSocket Manager
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

    attempts = {"n": 0}

    def flaky_tx(cursor: MagicMock) -> str:
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise MySQLError(errno=1213, msg="Deadlock found")
        return "ok"

    monkeypatch.setattr("services.db_service.time.sleep", lambda _s: None)
    assert svc.run_in_transaction(flaky_tx) == "ok"
    assert attempts["n"] == 2

    def failing_conn() -> MagicMock:
        raise MySQLError(errno=1045, msg="Access denied")

    monkeypatch.setattr(svc, "_acquire_connection", failing_conn)
    with pytest.raises(DatabaseError):
        svc.fetch_all("SELECT 1")
    svc.close_pool()


def test_json_log_formatter() -> None:
    configure_logging("INFO")
    fmt = JsonLogFormatter()
    rec = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", (), None)
    parsed = json.loads(fmt.format(rec))
    assert parsed["message"] == "hello"
    assert parsed["level"] == "INFO"


def test_ws_manager_concurrent_broadcast_prunes_dead_clients() -> None:
    async def _run() -> None:
        mgr = LiveConnectionManager(max_connections=2, send_timeout=1.0)
        good_ws = AsyncMock()
        bad_ws = AsyncMock()
        bad_ws.send_json.side_effect = RuntimeError("broken pipe")
        extra_ws = AsyncMock()

        assert await mgr.connect(good_ws) is True
        assert await mgr.connect(bad_ws) is True
        assert await mgr.connect(extra_ws) is False
        assert mgr.active_count == 2

        await mgr.broadcast("slots_updated", {"slot_id": 1})
        assert good_ws.send_json.await_count == 1
        assert mgr.active_count == 1

        await mgr.close_all()
        assert mgr.active_count == 0

    asyncio.run(_run())


# ----------------------------------------------------------------------
# Domain Services Comprehensive Coverage (13-Table ERD)
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
    cur.fetchone.side_effect = [{"id": 5}, None, None]
    infra.delete_parking_lot(5)
    cur.fetchone.side_effect = [{"id": 5}, None, {"id": 99}]
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
    cur.fetchone.side_effect = [{"id": 10, "idkvd": 2, "trangthai": 1}]
    infra.set_slot_maintenance(10, True)
    cur.fetchone.side_effect = [{"id": 10, "trangthai": 1}, None]
    infra.delete_slot(10)
    infra.get_slots(lot_id=1, zone_id=2, status_filter=1, keyword="29A", limit=10, offset=0)

    directory = DirectoryService(db)
    db.fetch_all.return_value = [
        {"id": 1, "hoten": "NV1", "sdt": "0912345678", "cccd": "001095000111", "email": "a@b.c", "diachi": "HN", "ngaysinh": "2000-01-01"}
    ]
    emps = directory.get_employees_detail(keyword="NV", limit=10)
    assert emps[0]["cccd"] == "001095000111"
    cur.fetchone.side_effect = [None, {"next_id": 2005}]
    assert directory.create_employee(1, "NV Mới", "Hà Nội", date(1999, 1, 1), "Bảo vệ", "0912345678", date(2026, 1, 1), "a@b.vn", "001122334455") == 2005
    cur.fetchone.side_effect = [{"id": 2005}, None]
    directory.update_employee(2005, 1, "NV Mới 2", "Hà Nội", "Thu ngân", "0912345678", "a@b.vn", "001122334455")
    cur.fetchone.side_effect = [{"id": 2005}, None, None]
    directory.delete_employee(2005)
    db.fetch_all.return_value = [{"id": 1, "hoten": "KH1", "sdt": "0912345678", "cccd": "001095000111"}]
    custs = directory.get_customers_detail(keyword="KH")
    assert custs[0]["sdt"] == "0912345678"
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
        {"id": 5, "ngayketthuc": vn_today(), "idbg": 4},
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

    analytics = AnalyticsService(db)
    db.fetch_one.side_effect = None
    db.fetch_one.return_value = {"total_slots": 10, "available_slots": 8, "occupied_slots": 2, "active_count": 2, "total_revenue": 1000, "today_revenue": 500, "active_passes": 1, "cnt": 1}
    assert analytics.get_overview_metrics(lot_id=1).available_slots == 8
    assert analytics.get_overview_metrics(lot_id=None).total_slots == 10
    analytics.get_daily_revenue(days=7)
    analytics.get_operational_alerts(overdue_hours=24, pass_expiring_days=7, lot_id=1)

    gate = GateService(db)
    gate.get_active_turns(lot_id=1, keyword="29A", limit=20)
    gate.count_active_turns(lot_id=1, keyword="29A")
    cur.fetchone.side_effect = [{"id": 10, "idvtd": 1, "idtx": 2}, None]
    gate.cancel_active_turn(10)


# ----------------------------------------------------------------------
# Full FastAPI v1 Router Coverage (All Domains)
# ----------------------------------------------------------------------


def test_all_fastapi_v1_domain_routers_end_to_end() -> None:
    mock_db = MagicMock(spec=DBService)
    mock_db.test_connection.return_value = (True, "OK")
    mock_svc = MagicMock(spec=ParkingService)
    mock_svc.resolve_employee_id.return_value = 2001

    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_parking_service] = lambda: mock_svc

    try:
        client = TestClient(app)

        # Infrastructure endpoints
        mock_svc.get_operational_alerts.return_value = {"overdue_turns": [], "expiring_passes": [], "lost_cards": []}
        assert client.get("/api/v1/alerts").status_code == 200
        mock_svc.get_parking_lots.return_value = []
        assert client.get("/api/v1/lots").status_code == 200
        mock_svc.create_parking_lot.return_value = 9
        assert client.post("/api/v1/lots", json={"name": "Bãi X", "location": "PTIT"}).status_code == 201
        assert client.put("/api/v1/lots/9", json={"name": "Bãi X2", "location": "PTIT"}).status_code == 200
        assert client.delete("/api/v1/lots/9").status_code == 200
        mock_svc.get_zones_summary.return_value = []
        assert client.get("/api/v1/zones").status_code == 200
        mock_svc.create_zone.return_value = 4
        assert client.post("/api/v1/zones", json={"lot_id": 1, "name": "KHU-M"}).status_code == 201
        assert client.put("/api/v1/zones/4", json={"lot_id": 1, "name": "KHU-N"}).status_code == 200
        assert client.delete("/api/v1/zones/4").status_code == 200
        mock_svc.get_slots.return_value = []
        assert client.get("/api/v1/slots?status_filter=1").status_code == 200
        mock_svc.add_slots_to_zone.return_value = 5
        assert client.post("/api/v1/slots", json={"zone_id": 1, "count": 5}).status_code == 201
        assert client.patch("/api/v1/slots/1/maintenance", json={"maintenance": True}).status_code == 200
        assert client.delete("/api/v1/slots/1").status_code == 200
        mock_svc.reconcile_slot_states.return_value = {"slots_reconciled": 1, "cards_reconciled": 1}
        assert client.post("/api/v1/slots/reconcile").status_code == 200

        # Turns move & cancel
        mock_svc.get_active_turns.return_value = []
        assert client.get("/api/v1/turns/active").status_code == 200
        assert client.post("/api/v1/turns/1/move-slot", json={"new_slot_id": 2}).status_code == 200
        assert client.post("/api/v1/turns/1/cancel").status_code == 200

        # Billing export CSV & update status
        mock_svc.get_transactions.return_value = [
            {"ma_gd": 1, "giothanhtoan": "2026-11-21 08:00:00", "bienso": "29A12345", "loaiphuongtien": "xe máy", "mathe": "001", "tenbaido": "Bãi A", "vitri": "A1-1", "hinhthuc": "Vé ngày", "loaithanhtoan": "Tiền mặt", "chiphi": 5000, "trangthai": "Thành công", "nhanvien": "Admin"}
        ]
        csv_res = client.get("/api/v1/transactions/export")
        assert csv_res.status_code == 200
        assert "29A12345" in csv_res.text
        assert client.patch("/api/v1/transactions/1/status", json={"status": "Hoàn tiền"}).status_code == 200

        # Passes & Tariffs
        mock_svc.count_monthly_passes.return_value = 0
        mock_svc.get_monthly_passes.return_value = []
        assert client.get("/api/v1/passes").status_code == 200
        mock_svc.get_monthly_pass_revenue_summary.return_value = {"total_passes": 0}
        assert client.get("/api/v1/passes/summary").status_code == 200
        mock_svc.register_monthly_pass.return_value = 33
        assert client.post(
            "/api/v1/passes",
            json={"hoten": "KH A", "sdt": "0912345678", "cccd": "001204000123", "customer_type_id": 1, "license_plate": "29A12345", "vehicle_type_id": 2, "card_id": 5, "months": 1, "payment_method": "Tiền mặt"},
        ).status_code == 201
        mock_svc.renew_monthly_pass.return_value = {"pass_id": 33, "new_end_date": date(2027, 1, 1), "amount": 100000}
        assert client.post("/api/v1/passes/33/renew", json={"months": 1, "payment_method": "Chuyển khoản"}).status_code == 200
        assert client.put("/api/v1/passes/33/assets", json={"plate": "29A12345", "vehicle_type_id": 2, "new_card_id": 6}).status_code == 200
        assert client.delete("/api/v1/passes/33").status_code == 200
        mock_svc.get_tariffs.return_value = []
        assert client.get("/api/v1/tariffs").status_code == 200
        assert client.put("/api/v1/tariffs/1", json={"unit_price": 7000}).status_code == 200
        assert client.delete("/api/v1/tariffs/1").status_code == 200

        # Directory
        mock_svc.get_vehicle_types.return_value = []
        mock_svc.get_customer_types.return_value = []
        mock_svc.get_employees.return_value = []
        cat_res = client.get("/api/v1/catalogs")
        assert cat_res.status_code == 200 and "vietqr" in cat_res.json()
        mock_svc.get_employees_detail.return_value = []
        assert client.get("/api/v1/people/employees").status_code == 200
        assert client.put("/api/v1/people/employees/1", json={"hoten": "A", "chucvu": "Bảo vệ", "sdt": "0912345678"}).status_code == 200
        assert client.delete("/api/v1/people/employees/1").status_code == 200
        mock_svc.get_customers_detail.return_value = []
        assert client.get("/api/v1/people/customers").status_code == 200
        assert client.put("/api/v1/people/customers/1", json={"hoten": "B", "sdt": "0912345678", "cccd": "001204000123", "customer_type_id": 1}).status_code == 200
        assert client.delete("/api/v1/people/customers/1").status_code == 200
        mock_svc.get_walkin_visitors.return_value = []
        assert client.get("/api/v1/people/walkins").status_code == 200
        mock_svc.get_cards.return_value = []
        mock_svc.get_cards_detail.return_value = []
        assert client.get("/api/v1/cards?only_available=true").status_code == 200
        assert client.get("/api/v1/cards?detail=true").status_code == 200
        mock_svc.create_card.return_value = 99
        assert client.post("/api/v1/cards", json={"code": "099"}).status_code == 201
        assert client.patch("/api/v1/cards/99/status", json={"status": 2}).status_code == 200
        assert client.delete("/api/v1/cards/99").status_code == 200
        mock_svc.get_vehicles_detail.return_value = []
        assert client.get("/api/v1/vehicles").status_code == 200
        assert client.put("/api/v1/vehicles/1", json={"plate": "29A12345", "vehicle_type_id": 2}).status_code == 200
        assert client.delete("/api/v1/vehicles/1").status_code == 200

        # ConflictError & NotFoundError mapping
        mock_svc.delete_parking_lot.side_effect = ConflictError("Đang có khu vực")
        assert client.delete("/api/v1/lots/1").status_code == 409
        mock_svc.delete_zone.side_effect = NotFoundError("Không tồn tại")
        assert client.delete("/api/v1/zones/999").status_code == 404
    finally:
        app.dependency_overrides.clear()
