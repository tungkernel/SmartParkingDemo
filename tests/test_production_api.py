from __future__ import annotations

import base64
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from api.deps import get_auth_service, get_db, get_parking_service
from api.main import app
from api.middleware import auth_rate_limiter
from core.config import Settings
from core.exceptions import AuthenticationError, ConflictError, DatabaseError, NotFoundError
from services.auth_service import (
    PBKDF2_ITERATIONS,
    AuthService,
    AuthUser,
    hash_password,
    verify_password,
)
from services.db_service import DBService
from services.domain.base import FeeQuote, OverviewMetrics
from services.parking_service import ParkingService


def _mock_active_account_row(user: AuthUser) -> dict[str, object]:
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


class TestAuthSecurityAndShifts(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_db = MagicMock(spec=DBService)
        self.auth = AuthService(self.mock_db, secret_key="unit-test-strong-secret-key-32chars!")
        self.parking = ParkingService(self.mock_db)

    def test_password_hash_uses_600k_iterations_and_enforces_length(self) -> None:
        hashed = hash_password("Secret@1234")
        self.assertTrue(hashed.startswith(f"pbkdf2_sha256${PBKDF2_ITERATIONS}$"))
        self.assertTrue(verify_password("Secret@1234", hashed))
        self.assertFalse(verify_password("WrongPass!", hashed))
        with self.assertRaises(ValueError):
            hash_password("short")
        with self.assertRaises(ValueError):
            hash_password("x" * 129)

    def test_production_config_fails_fast_without_auth_secret(self) -> None:
        prod = Settings(app_env="production", auth_secret_key=None)
        with self.assertRaises(RuntimeError):
            prod.resolve_auth_secret()

    def test_jwt_rejects_bad_header_missing_claims_and_revoked_version(self) -> None:
        user = AuthUser(1, 3, "admin", "Lê Minh Cường", "ADMIN", 1, token_version=2)
        token = self.auth.create_token(user, ttl_seconds=600)
        decoded = self.auth.verify_token(token)
        self.assertEqual(decoded.username, "admin")
        self.assertEqual(decoded.token_version, 2)

        # Tampered alg=none header must be rejected
        bad_header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
        _, payload_b64, sig_b64 = token.split(".")
        with self.assertRaises(AuthenticationError):
            self.auth.verify_token(f"{bad_header}.{payload_b64}.{sig_b64}")

        # Revoked token_version in DB must fail verify_active_token immediately
        self.mock_db.fetch_one.return_value = {**_mock_active_account_row(user), "token_version": 3}
        with self.assertRaises(AuthenticationError):
            self.auth.verify_active_token(token)

    def test_update_account_blocks_disabling_last_admin(self) -> None:
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {"id": 1, "role": "ADMIN", "is_active": 1},  # target account
            {"cnt": 0},                                   # 0 other active admins
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        with self.assertRaises(ConflictError):
            self.auth.update_account(1, is_active=False)

    def test_open_and_close_shift_transactional(self) -> None:
        open_cursor = MagicMock()
        open_cursor.fetchone.side_effect = [{"id": 3}, None]  # employee exists, no open shift
        open_cursor.lastrowid = 55
        self.mock_db.transaction.return_value.__enter__.return_value = open_cursor
        shift_id = self.parking.open_shift(employee_id=3, lot_id=1, opening_cash=500000)
        self.assertEqual(shift_id, 55)

        close_cursor = MagicMock()
        close_cursor.fetchone.side_effect = [
            {"id": 55, "idnv": 3, "opening_cash": 500000, "started_at": "2026-11-21 01:00:00", "status": "OPEN"},
            {"cash_total": 120000, "transfer_total": 80000, "refund_total": 10000},
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = close_cursor
        res = self.parking.close_shift(55, 3, actual_cash=620000, note="Đủ tiền")
        self.assertEqual(res["expected_cash"], 620000)
        self.assertEqual(res["refund_total"], 10000)
        self.assertEqual(res["diff"], 0)


class TestFastAPIv1Routes(unittest.TestCase):
    def setUp(self) -> None:
        auth_rate_limiter.reset()
        self.mock_db = MagicMock(spec=DBService)
        self.mock_db.test_connection.return_value = (True, "Kết nối cơ sở dữ liệu thành công.")
        self.auth = AuthService(self.mock_db, secret_key="api-test-strong-secret-key-32chars!")
        self.mock_parking = MagicMock(spec=ParkingService)

        self.admin = AuthUser(1, 3, "admin", "Lê Minh Cường", "ADMIN", 1)
        self.accountant = AuthUser(2, 4, "thungan", "Trần Thu Ngân", "ACCOUNTANT", 1)
        self.operator = AuthUser(3, 1001, "baove", "Nguyễn Văn An", "OPERATOR", 1)

        app.dependency_overrides[get_db] = lambda: self.mock_db
        app.dependency_overrides[get_auth_service] = lambda: self.auth
        app.dependency_overrides[get_parking_service] = lambda: self.mock_parking
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        auth_rate_limiter.reset()

    def _auth_headers(self, user: AuthUser) -> dict[str, str]:
        self.mock_db.fetch_one.return_value = _mock_active_account_row(user)
        return {"Authorization": f"Bearer {self.auth.create_token(user)}"}

    def test_health_probes_return_200_and_503_safely(self) -> None:
        res_live = self.client.get("/health/live")
        self.assertEqual(res_live.status_code, 200)
        self.assertIn("X-Request-ID", res_live.headers)
        self.assertEqual(res_live.headers.get("X-Content-Type-Options"), "nosniff")

        self.mock_db.test_connection.return_value = (False, "Không thể kết nối tới cơ sở dữ liệu.")
        res_ready = self.client.get("/health/ready")
        self.assertEqual(res_ready.status_code, 503)
        self.assertFalse(res_ready.json()["ok"])

    def test_unauthenticated_returns_401_with_www_authenticate(self) -> None:
        res = self.client.get("/api/v1/overview")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.headers.get("WWW-Authenticate"), "Bearer")
        self.assertIn("request_id", res.json())

    def test_rbac_matrix_across_roles(self) -> None:
        # OPERATOR blocked from accounts, analytics, and walkins
        op_headers = self._auth_headers(self.operator)
        self.assertEqual(self.client.get("/api/v1/accounts", headers=op_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/analytics/summary", headers=op_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/people/walkins", headers=op_headers).status_code, 403)

        # ACCOUNTANT allowed on analytics & audit-logs, blocked on admin /accounts
        acc_headers = self._auth_headers(self.accountant)
        self.assertEqual(self.client.get("/api/v1/accounts", headers=acc_headers).status_code, 403)
        self.mock_parking.get_daily_revenue.return_value = []
        self.mock_parking.get_revenue_by_vehicle_type.return_value = []
        self.mock_parking.get_revenue_by_lot.return_value = []
        self.mock_parking.get_monthly_pass_revenue_summary.return_value = {}
        self.assertEqual(
            self.client.get("/api/v1/analytics/summary?days=30", headers=acc_headers).status_code,
            200,
        )

        # ADMIN allowed on accounts & analytics
        adm_headers = self._auth_headers(self.admin)
        self.mock_db.fetch_all.return_value = []
        self.assertEqual(self.client.get("/api/v1/accounts", headers=adm_headers).status_code, 200)

    def test_operator_cannot_spoof_employee_id_on_checkin_and_checkout(self) -> None:
        op_headers = self._auth_headers(self.operator)
        self.mock_parking.check_in_vehicle.return_value = 77
        res_in = self.client.post(
            "/api/v1/turns/check-in",
            headers=op_headers,
            json={
                "license_plate": "29A-123.45",
                "vehicle_type_id": 2,
                "slot_id": 10,
                "card_id": 5,
                "employee_id": 9999,  # Attempted impersonation!
            },
        )
        self.assertEqual(res_in.status_code, 201)
        # Service MUST receive operator's own employee_id (1001), NOT 9999
        self.assertEqual(self.mock_parking.check_in_vehicle.call_args.kwargs["employee_id"], 1001)
        self.assertEqual(self.mock_parking.check_in_vehicle.call_args.kwargs["operator_lot_id"], 1)

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.mock_parking.check_out_vehicle.return_value = FeeQuote(
            turn_id=77,
            license_plate="29A-123.45",
            vehicle_type="xe máy",
            ticket_type="Vé ngày",
            checkin_time=now - timedelta(hours=1),
            checkout_time=now,
            duration_hours=1.0,
            amount=5000,
            is_monthly_pass=False,
            monthly_pass_id=None,
            payment_method="Chuyển khoản",
        )
        res_out = self.client.post(
            "/api/v1/turns/77/check-out",
            headers=op_headers,
            json={"employee_id": 9999, "payment_method": "Chuyển khoản"},
        )
        self.assertEqual(res_out.status_code, 200)
        self.assertEqual(self.mock_parking.check_out_vehicle.call_args.kwargs["employee_id"], 1001)
        self.assertEqual(
            self.mock_parking.check_out_vehicle.call_args.kwargs["payment_method"],
            "Chuyển khoản",
        )

    def test_fixed_create_tariff_and_create_employee_endpoints(self) -> None:
        adm_headers = self._auth_headers(self.admin)
        self.mock_parking.create_tariff.return_value = 12
        res_t = self.client.post(
            "/api/v1/tariffs",
            headers=adm_headers,
            json={"ticket_type": "ngày", "vehicle_type_id": 2, "customer_type_id": 1, "unit_price": 5000},
        )
        self.assertEqual(res_t.status_code, 201)
        kwargs_t = self.mock_parking.create_tariff.call_args.kwargs
        self.assertEqual(kwargs_t["unit_price"], 5000)
        self.assertEqual(kwargs_t["vehicle_type_id"], 2)

        self.mock_parking.create_employee.return_value = 2005
        res_e = self.client.post(
            "/api/v1/people/employees",
            headers=adm_headers,
            json={"hoten": "Nguyễn Văn Mới", "chucvu": "Bảo vệ", "sdt": "0912345678", "lot_id": 1},
        )
        self.assertEqual(res_e.status_code, 201)
        self.assertEqual(self.mock_parking.create_employee.call_args.kwargs["full_name"], "Nguyễn Văn Mới")

    def test_paginated_transactions_and_error_handlers(self) -> None:
        adm_headers = self._auth_headers(self.admin)
        self.mock_parking.count_transactions.return_value = 2
        self.mock_parking.get_transactions.return_value = [{"ma_gd": 1}, {"ma_gd": 2}]
        res = self.client.get("/api/v1/transactions?page=1&page_size=20&keyword=29A", headers=adm_headers)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["total"], 2)
        self.assertEqual(len(body["items"]), 2)

        # DatabaseError must NOT leak raw SQL text to client
        self.mock_parking.get_overview_metrics.side_effect = DatabaseError("SELECT secret FROM internal_tbl failed")
        res_db = self.client.get("/api/v1/overview", headers=adm_headers)
        self.assertEqual(res_db.status_code, 503)
        self.assertNotIn("internal_tbl", res_db.text)

        # NotFoundError maps to 404
        self.mock_parking.get_fee_quote.side_effect = NotFoundError("Không tìm thấy lượt đỗ.")
        res_nf = self.client.get("/api/v1/turns/999/quote", headers=adm_headers)
        self.assertEqual(res_nf.status_code, 404)

    def test_websocket_requires_authentication_and_accepts_ticket(self) -> None:
        # Unauthenticated WS connection must be rejected
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws/live"):
                pass

        # Authenticated single-use ticket succeeds and responds pong to ping
        adm_headers = self._auth_headers(self.admin)
        t_res = self.client.post("/api/v1/auth/ws-ticket", headers=adm_headers)
        self.assertEqual(t_res.status_code, 200)
        ticket = t_res.json()["ticket"]

        with self.client.websocket_connect(f"/ws/live?ticket={ticket}") as ws:
            ws.send_text("ping")
            self.assertEqual(ws.receive_json(), {"event": "pong"})

        # Reusing the same single-use ticket must fail
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(f"/ws/live?ticket={ticket}"):
                pass

    def test_overview_uses_operator_lot_scope_and_returns_valid_schema(self) -> None:
        op_headers = self._auth_headers(self.operator)
        self.mock_parking.get_overview_metrics.return_value = OverviewMetrics(
            total_slots=30,
            available_slots=20,
            occupied_slots=10,
            active_vehicles=10,
            total_revenue=500000,
            today_revenue=50000,
            active_monthly_passes=5,
        )
        self.mock_parking.get_parking_lots.return_value = []
        self.mock_parking.get_zones_summary.return_value = []
        res = self.client.get("/api/v1/overview", headers=op_headers)
        self.assertEqual(res.status_code, 200)
        self.mock_parking.get_overview_metrics.assert_called_with(lot_id=1)

    def test_operator_scope_pii_redaction_and_extended_rbac(self) -> None:
        op_headers = self._auth_headers(self.operator)
        # Extended RBAC denials for OPERATOR
        self.assertEqual(self.client.post("/api/v1/lots", headers=op_headers, json={"name": "X", "location": "Y"}).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/zones", headers=op_headers, json={"lot_id": 1, "name": "Z"}).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/slots/reconcile", headers=op_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/transactions/export", headers=op_headers).status_code, 403)
        self.assertEqual(self.client.patch("/api/v1/transactions/1/status", headers=op_headers, json={"status": "Hoàn tiền"}).status_code, 403)
        self.assertEqual(self.client.delete("/api/v1/passes/1", headers=op_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/audit-logs", headers=op_headers).status_code, 403)

        # Quote enforces operator_lot_id
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.mock_parking.get_fee_quote.return_value = FeeQuote(
            turn_id=10,
            license_plate="29A12345",
            vehicle_type="xe máy",
            ticket_type="Vé ngày",
            checkin_time=now,
            checkout_time=now,
            duration_hours=0.1,
            amount=5000,
            is_monthly_pass=False,
            monthly_pass_id=None,
        )
        self.assertEqual(self.client.get("/api/v1/turns/10/quote", headers=op_headers).status_code, 200)
        self.assertEqual(self.mock_parking.get_fee_quote.call_args.kwargs["operator_lot_id"], 1)

        # open_shift enforces operator's assigned lot even if body requests lot 99
        self.mock_parking.open_shift.return_value = 44
        res_shift = self.client.post(
            "/api/v1/shifts/open",
            headers=op_headers,
            json={"lot_id": 99, "opening_cash": 100000},
        )
        self.assertEqual(res_shift.status_code, 201)
        self.assertEqual(self.mock_parking.open_shift.call_args.kwargs["lot_id"], 1)

        # PII redaction enabled for OPERATOR on /alerts, /catalogs, and /passes
        self.mock_parking.get_operational_alerts.return_value = {
            "overdue_turns": [],
            "expiring_passes": [],
            "lost_cards": [],
        }
        self.assertEqual(self.client.get("/api/v1/alerts", headers=op_headers).status_code, 200)
        self.assertTrue(self.mock_parking.get_operational_alerts.call_args.kwargs["redact_pii"])

        self.mock_parking.get_vehicle_types.return_value = []
        self.mock_parking.get_customer_types.return_value = []
        self.mock_parking.get_parking_lots.return_value = []
        self.mock_parking.get_employees.return_value = []
        self.assertEqual(self.client.get("/api/v1/catalogs", headers=op_headers).status_code, 200)
        self.assertTrue(self.mock_parking.get_employees.call_args.kwargs["redact_pii"])

        self.mock_parking.count_monthly_passes.return_value = 0
        self.mock_parking.get_monthly_passes.return_value = []
        self.assertEqual(self.client.get("/api/v1/passes", headers=op_headers).status_code, 200)
        self.assertTrue(self.mock_parking.get_monthly_passes.call_args.kwargs["redact_pii"])

    def test_auth_routes_rate_limit_ignores_spoofed_xff_and_csv_escapes_formulas(self) -> None:
        # Login route + rate limiting cannot be bypassed via spoofed X-Forwarded-For
        hashed = hash_password("StrongPass123!")
        self.mock_db.fetch_one.return_value = {
            **_mock_active_account_row(self.admin),
            "password_hash": hashed,
        }
        self.mock_db.execute_non_query.return_value = 1

        res_ok = self.client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "StrongPass123!"},
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertIn("refresh_token", res_ok.json())

        # Empty-body logout works cleanly
        adm_headers = self._auth_headers(self.admin)
        tx_cur = MagicMock()
        self.mock_db.transaction.return_value.__enter__.return_value = tx_cur
        self.assertEqual(self.client.post("/api/v1/auth/logout", headers=adm_headers).status_code, 200)

        # Spoofing X-Forwarded-For across attempts still hits the same peer-IP bucket and triggers 429
        auth_rate_limiter.reset()
        self.mock_db.fetch_one.return_value = None  # failed login
        statuses = []
        for idx in range(11):
            r = self.client.post(
                "/api/v1/auth/login",
                headers={"X-Forwarded-For": f"10.0.0.{idx + 1}"},
                json={"username": "unknown", "password": "badpassword"},
            )
            statuses.append(r.status_code)
        self.assertEqual(statuses[-1], 429)

        # CSV export neutralizes formula injection cells
        auth_rate_limiter.reset()
        adm_headers = self._auth_headers(self.admin)
        self.mock_parking.get_transactions.return_value = [
            {
                "ma_gd": 1,
                "giothanhtoan": "2026-11-21 08:00:00",
                "bienso": "=CMD|' /C calc'!A0",
                "loaiphuongtien": "xe máy",
                "mathe": "001",
                "tenbaido": " +SUM(A1:A2)",
                "vitri": "A-1",
                "hinhthuc": "Vé ngày",
                "loaithanhtoan": "Tiền mặt",
                "chiphi": 5000,
                "trangthai": "Thành công",
                "nhanvien": "@admin",
            }
        ]
        csv_res = self.client.get("/api/v1/transactions/export", headers=adm_headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("'=CMD|", csv_res.text)
        self.assertIn("' +SUM(A1:A2)", csv_res.text)
        self.assertIn("'@admin", csv_res.text)

        # Disallowed WebSocket origin must be rejected
        t_res = self.client.post("/api/v1/auth/ws-ticket", headers=adm_headers)
        ticket = t_res.json()["ticket"]
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(
                f"/ws/live?ticket={ticket}",
                headers={"Origin": "https://evil.example.com"},
            ):
                pass


if __name__ == "__main__":
    unittest.main()
