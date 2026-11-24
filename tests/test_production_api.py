from __future__ import annotations

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

from api.deps import get_db, get_parking_service
from api.main import app
from core.exceptions import DatabaseError, NotFoundError
from services.db_service import DBService
from services.domain.base import FeeQuote, OverviewMetrics
from services.parking_service import ParkingService


class TestFastAPIv1SingleManagerRoutes(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_db = MagicMock(spec=DBService)
        self.mock_db.test_connection.return_value = (True, "Kết nối cơ sở dữ liệu thành công.")
        self.mock_parking = MagicMock(spec=ParkingService)

        app.dependency_overrides[get_db] = lambda: self.mock_db
        app.dependency_overrides[get_parking_service] = lambda: self.mock_parking
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_health_probes_return_200_and_503_safely(self) -> None:
        res_live = self.client.get("/health/live")
        self.assertEqual(res_live.status_code, 200)
        self.assertIn("X-Request-ID", res_live.headers)
        self.assertEqual(res_live.headers.get("X-Content-Type-Options"), "nosniff")

        self.mock_db.test_connection.return_value = (False, "Không thể kết nối tới cơ sở dữ liệu.")
        res_ready = self.client.get("/health/ready")
        self.assertEqual(res_ready.status_code, 503)
        self.assertFalse(res_ready.json()["ok"])

    def test_removed_auth_shifts_and_audit_routes_return_404(self) -> None:
        self.assertEqual(self.client.get("/api/v1/auth/login").status_code, 404)
        self.assertIn(
            self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "x"}).status_code,
            (404, 405),
        )
        self.assertEqual(self.client.get("/api/v1/accounts").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/shifts").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/shifts/active").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/audit-logs").status_code, 404)

    def test_manager_routes_work_directly_without_authentication(self) -> None:
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
        res_ov = self.client.get("/api/v1/overview")
        self.assertEqual(res_ov.status_code, 200)
        self.mock_parking.get_overview_metrics.assert_called_once_with()

        self.mock_parking.get_daily_revenue.return_value = []
        self.mock_parking.get_revenue_by_vehicle_type.return_value = []
        self.mock_parking.get_revenue_by_lot.return_value = []
        self.mock_parking.get_monthly_pass_revenue_summary.return_value = {}
        self.assertEqual(self.client.get("/api/v1/analytics/summary?days=30").status_code, 200)

        self.mock_parking.get_walkin_visitors.return_value = []
        self.assertEqual(self.client.get("/api/v1/people/walkins").status_code, 200)

        self.mock_parking.get_vehicle_types.return_value = []
        self.mock_parking.get_customer_types.return_value = []
        self.mock_parking.get_employees.return_value = []
        res_cat = self.client.get("/api/v1/catalogs")
        self.assertEqual(res_cat.status_code, 200)
        self.mock_parking.get_employees.assert_called_once_with()

    def test_checkin_and_checkout_resolve_explicit_and_default_employee_id(self) -> None:
        self.mock_parking.resolve_employee_id.return_value = 1002
        self.mock_parking.check_in_vehicle.return_value = 77
        res_in = self.client.post(
            "/api/v1/turns/check-in",
            json={
                "license_plate": "29A-123.45",
                "vehicle_type_id": 2,
                "slot_id": 10,
                "card_id": 5,
                "employee_id": 1002,
            },
        )
        self.assertEqual(res_in.status_code, 201)
        self.mock_parking.resolve_employee_id.assert_called_with(1002, preferred_role="bảo vệ")
        self.assertEqual(self.mock_parking.check_in_vehicle.call_args.kwargs["employee_id"], 1002)

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.mock_parking.resolve_employee_id.return_value = 2001
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
            json={"payment_method": "Chuyển khoản"},
        )
        self.assertEqual(res_out.status_code, 200)
        self.mock_parking.resolve_employee_id.assert_called_with(None, preferred_role="thu ngân")
        self.assertEqual(self.mock_parking.check_out_vehicle.call_args.kwargs["employee_id"], 2001)
        self.assertEqual(
            self.mock_parking.check_out_vehicle.call_args.kwargs["payment_method"],
            "Chuyển khoản",
        )

    def test_passes_register_and_renew_pass_employee_id(self) -> None:
        self.mock_parking.resolve_employee_id.return_value = 2002
        self.mock_parking.register_monthly_pass.return_value = 33
        res_reg = self.client.post(
            "/api/v1/passes",
            json={
                "hoten": "KH A",
                "sdt": "0912345678",
                "cccd": "001204000123",
                "customer_type_id": 1,
                "license_plate": "29A12345",
                "vehicle_type_id": 2,
                "card_id": 5,
                "months": 1,
                "payment_method": "Tiền mặt",
                "employee_id": 2002,
            },
        )
        self.assertEqual(res_reg.status_code, 201)
        self.assertEqual(self.mock_parking.register_monthly_pass.call_args.kwargs["employee_id"], 2002)

    def test_create_tariff_create_employee_and_transactions_filters(self) -> None:
        self.mock_parking.create_tariff.return_value = 12
        res_t = self.client.post(
            "/api/v1/tariffs",
            json={"ticket_type": "ngày", "vehicle_type_id": 2, "customer_type_id": 1, "unit_price": 5000},
        )
        self.assertEqual(res_t.status_code, 201)
        self.assertEqual(self.mock_parking.create_tariff.call_args.kwargs["unit_price"], 5000)

        self.mock_parking.create_employee.return_value = 2005
        res_e = self.client.post(
            "/api/v1/people/employees",
            json={"hoten": "Nguyễn Văn Mới", "chucvu": "Bảo vệ", "sdt": "0912345678", "lot_id": 1},
        )
        self.assertEqual(res_e.status_code, 201)
        self.assertEqual(self.mock_parking.create_employee.call_args.kwargs["full_name"], "Nguyễn Văn Mới")

        self.mock_parking.count_transactions.return_value = 2
        self.mock_parking.get_transactions.return_value = [{"ma_gd": 1}, {"ma_gd": 2}]
        res_tx = self.client.get(
            "/api/v1/transactions?page=1&page_size=20&keyword=29A&employee_id=2001&payment_method=Ti%E1%BB%81n%20m%E1%BA%B7t"
        )
        self.assertEqual(res_tx.status_code, 200)
        self.assertEqual(self.mock_parking.get_transactions.call_args.kwargs["employee_id"], 2001)
        self.assertEqual(self.mock_parking.get_transactions.call_args.kwargs["payment_method"], "Tiền mặt")

        # DatabaseError must NOT leak raw SQL text to client
        self.mock_parking.get_overview_metrics.side_effect = DatabaseError("SELECT secret FROM internal_tbl failed")
        res_db = self.client.get("/api/v1/overview")
        self.assertEqual(res_db.status_code, 503)
        self.assertNotIn("internal_tbl", res_db.text)

        # NotFoundError maps to 404
        self.mock_parking.get_fee_quote.side_effect = NotFoundError("Không tìm thấy lượt đỗ.")
        res_nf = self.client.get("/api/v1/turns/999/quote")
        self.assertEqual(res_nf.status_code, 404)

    def test_csv_export_escapes_formulas_and_direct_websocket_validates_origin(self) -> None:
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
        csv_res = self.client.get("/api/v1/transactions/export?employee_id=2001")
        self.assertEqual(csv_res.status_code, 200)
        self.assertEqual(self.mock_parking.get_transactions.call_args.kwargs["employee_id"], 2001)
        self.assertIn("'=CMD|", csv_res.text)
        self.assertIn("' +SUM(A1:A2)", csv_res.text)
        self.assertIn("'@admin", csv_res.text)

        # Direct WebSocket connection succeeds without ticket and responds pong to ping
        with self.client.websocket_connect("/ws/live") as ws:
            ws.send_text("ping")
            self.assertEqual(ws.receive_json(), {"event": "pong"})

        # Disallowed WebSocket origin must still be rejected
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(
                "/ws/live",
                headers={"Origin": "https://evil.example.com"},
            ):
                pass


if __name__ == "__main__":
    unittest.main()
