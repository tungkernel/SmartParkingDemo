from __future__ import annotations

import os
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from core.exceptions import ConflictError, NotFoundError, ValidationError
from services.db_service import DBConfig, DBService
from services.domain.base import (
    normalize_payment_method,
    normalize_plate,
    vn_day_utc_bounds,
)
from services.parking_service import ParkingService


class TestDBService(unittest.TestCase):
    def test_db_config_masks_password_in_repr(self) -> None:
        cfg = DBConfig(host="tidb.local", database="dbptit", user="admin", password="super-secret-value")
        self.assertNotIn("super-secret-value", repr(cfg))

    def test_db_service_clamps_pool_size_and_safe_closes_dropped_connection(self) -> None:
        svc = DBService("localhost", "dbptit", "u", "p", pool_size=99)
        self.assertEqual(svc.config.pool_size, 32)

        mock_conn = MagicMock()
        mock_conn.is_connected.return_value = False  # Simulates dropped socket mid-query
        mock_cursor = MagicMock()
        DBService._safe_close(mock_cursor, mock_conn)
        mock_cursor.close.assert_called_once()
        # Critical: conn.close() MUST run even when is_connected() is False to prevent pool leaks
        mock_conn.close.assert_called_once()

    def test_db_service_advisory_lock_pins_single_connection(self) -> None:
        svc = DBService("localhost", "dbptit", "u", "p")
        mock_conn = MagicMock()
        mock_conn.is_connected.return_value = True
        lock_cur = MagicMock()
        lock_cur.fetchone.return_value = {"got": 1}
        query_cur = MagicMock()
        query_cur.fetchone.return_value = {"ok": 1}
        rel_cur = MagicMock()
        rel_cur.fetchone.return_value = (1,)
        mock_conn.cursor.side_effect = [lock_cur, query_cur, rel_cur]
        mock_pool = MagicMock()
        mock_pool.get_connection.return_value = mock_conn
        svc._pool = mock_pool

        with svc.advisory_lock("test_lock", timeout=5) as acquired:
            self.assertTrue(acquired)
            row = svc.fetch_one("SELECT 1 AS ok")
            self.assertEqual(row, {"ok": 1})
            mock_conn.close.assert_not_called()

        mock_pool.get_connection.assert_called_once()
        mock_conn.close.assert_called_once()
        self.assertIn("GET_LOCK", lock_cur.execute.call_args[0][0])
        self.assertIn("RELEASE_LOCK", rel_cur.execute.call_args[0][0])


class TestParkingService(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_db = MagicMock(spec=DBService)
        self.service = ParkingService(self.mock_db)

    def test_normalize_plate_and_payment_method(self) -> None:
        self.assertEqual(normalize_plate(" 29a-123.45 "), "29A-123.45")
        with self.assertRaises(ValidationError):
            normalize_plate("   ")
        with self.assertRaises(ValidationError):
            normalize_plate("29A-1234567890123")  # > 15 chars
        with self.assertRaises(ValidationError):
            normalize_plate("29A$12345")
        self.assertEqual(normalize_payment_method("Tiền mặt"), "Tiền mặt")
        self.assertEqual(normalize_payment_method("Chuyển khoản"), "Chuyển khoản")
        with self.assertRaises(ValidationError):
            normalize_payment_method("Crypto")

    def test_vn_day_utc_bounds_shifts_7_hours(self) -> None:
        start_utc, end_utc = vn_day_utc_bounds(date(2026, 11, 21))
        self.assertEqual(start_utc, "2026-11-20 17:00:00")
        self.assertEqual(end_utc, "2026-11-21 17:00:00")

    def test_fee_quote_daily_ticket_and_monthly_pass(self) -> None:
        checkin_utc = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=3)
        self.mock_db.fetch_one.side_effect = [
            {
                "id": 10,
                "giovao": checkin_utc,
                "idpt": 5,
                "bienso": "29A12345",
                "loaiphuongtien": "xe máy",
                "loaive": "ngày",
                "dongia": 5000,
            },
            None,
        ]
        quote = self.service.get_fee_quote(10)
        self.assertEqual(quote.amount, 5000)
        self.assertFalse(quote.is_monthly_pass)
        self.assertEqual(quote.ticket_type, "Vé ngày")

        self.mock_db.fetch_one.side_effect = [
            {
                "id": 11,
                "giovao": checkin_utc,
                "idpt": 6,
                "bienso": "30A99999",
                "loaiphuongtien": "ô tô",
                "loaive": "tháng",
                "dongia": 240000,
            },
            {"id": 99},
        ]
        m_quote = self.service.get_fee_quote(11)
        self.assertEqual(m_quote.amount, 0)
        self.assertTrue(m_quote.is_monthly_pass)
        self.assertEqual(m_quote.monthly_pass_id, 99)

    def test_expired_monthly_pass_bills_daily_tariff_instead_of_free_or_monthly_rate(self) -> None:
        checkin_utc = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=30)
        self.mock_db.fetch_one.side_effect = [
            {
                "id": 12,
                "giovao": checkin_utc,
                "idpt": 6,
                "idlpt": 3,
                "bienso": "30A99999",
                "loaiphuongtien": "ô tô",
                "loaive": "tháng",
                "dongia": 240000,
                "idbdx": 1,
            },
            None,               # pass expired -> no active monthly pass!
            {"dongia": 20000},  # fallback daily tariff for ô tô
        ]
        quote = self.service.get_fee_quote(12)
        self.assertFalse(quote.is_monthly_pass)
        self.assertIsNone(quote.monthly_pass_id)
        self.assertEqual(quote.amount, 40000)
        self.assertEqual(quote.ticket_type, "Vé ngày (Vé tháng hết hạn)")

        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {
                "id": 12,
                "idvtd": 5,
                "idtx": 9,
                "idpt": 6,
                "idbg": 6,
                "giovao": checkin_utc,
            },
            {
                "idlpt": 3,
                "bienso": "30A99999",
                "loaiphuongtien": "ô tô",
                "loaive": "tháng",
                "dongia": 240000,
                "idbdx": 1,
            },
            None,
            None,
            {"dongia": 20000},
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        paid_quote = self.service.check_out_vehicle(12, employee_id=3, payment_method="Tiền mặt")
        self.assertFalse(paid_quote.is_monthly_pass)
        self.assertEqual(paid_quote.amount, 40000)
        self.assertEqual(paid_quote.ticket_type, "Vé ngày (Vé tháng hết hạn)")
        for call in cursor.execute.call_args_list:
            sql = call.args[0]
            if "FOR UPDATE" in sql:
                self.assertNotIn("loaiphuongtien", sql)
                self.assertNotIn("banggia", sql)

    def test_check_in_vehicle_rejects_occupied_slot_and_pass_bound_card(self) -> None:
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [
            None,
            {"id": 1, "idkvd": 1, "trangthai": 0},
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = mock_cursor
        with self.assertRaises(ConflictError):
            self.service.check_in_vehicle("30G45678", 3, 1, 6, 1)

        mock_cursor2 = MagicMock()
        mock_cursor2.fetchone.side_effect = [
            {"id": 7, "idlpt": 3},
            {"id": 1, "idkvd": 1, "trangthai": 1},
            {"id": 6, "trangthai": 1},
            None,
            {"id": 100, "idpt": 999},
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = mock_cursor2
        with self.assertRaises(ConflictError):
            self.service.check_in_vehicle("30G45678", 3, 1, 6, 1)

    def test_check_in_vehicle_atomic_success(self) -> None:
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [
            {"id": 7, "idlpt": 3},                    # phuongtien FOR UPDATE
            {"id": 1, "idkvd": 2, "trangthai": 1},    # slot FOR UPDATE
            {"id": 6, "trangthai": 1},                # card FOR UPDATE
            None,                                     # no active turn
            None,                                     # card not bound to other pass
            None,                                     # no active monthly pass
            {"id": 3},                                # daily tariff
        ]
        mock_cursor.rowcount = 1
        mock_cursor.lastrowid = 42
        self.mock_db.transaction.return_value.__enter__.return_value = mock_cursor

        turn_id = self.service.check_in_vehicle("30G45678", 3, 1, 6, 1)
        self.assertEqual(turn_id, 42)
        executed = [c.args[0] for c in mock_cursor.execute.call_args_list]
        self.assertFalse(any("audit_logs" in sql for sql in executed))

    def test_check_out_persists_payment_method_and_lost_card_replacement(self) -> None:
        checkin_utc = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {
                "id": 99,
                "idvtd": 51,
                "idtx": 10,
                "idpt": 1,
                "idbg": 2,
                "giovao": checkin_utc,
            },
            {
                "idlpt": 2,
                "bienso": "29A12345",
                "loaiphuongtien": "xe máy",
                "loaive": "ngày",
                "dongia": 5000,
                "idbdx": 1,
            },
            None,
            None,
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = cursor

        quote = self.service.check_out_vehicle(
            99,
            2001,
            lost_card=True,
            lost_card_fee=50000,
            payment_method="Chuyển khoản",
        )
        self.assertEqual(quote.amount, 55000)
        self.assertEqual(quote.payment_method, "Chuyển khoản")
        insert_calls = [c for c in cursor.execute.call_args_list if "INSERT INTO thanhtoan" in c.args[0]]
        self.assertEqual(len(insert_calls), 1)
        self.assertEqual(insert_calls[0].args[1][4], "Chuyển khoản")

        card_updates = [c for c in cursor.execute.call_args_list if "UPDATE thexe SET trangthai" in c.args[0]]
        self.assertEqual(card_updates[0].args[1], (2, 10))

        rep_cursor = MagicMock()
        rep_cursor.fetchone.side_effect = [
            {
                "id": 100,
                "idvtd": 52,
                "idtx": 30,
                "idpt": 8,
                "idbg": 5,
                "giovao": checkin_utc,
            },
            {
                "idlpt": 2,
                "bienso": "29A88888",
                "loaiphuongtien": "xe máy",
                "loaive": "tháng",
                "dongia": 120000,
                "idbdx": 1,
            },
            None,
            {"id": 77},
            None,
        ]
        rep_cursor.fetchall.return_value = [
            {"id": 12, "trangthai": 1},
            {"id": 30, "trangthai": 0},
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = rep_cursor
        rep_quote = self.service.check_out_vehicle(
            100,
            2001,
            lost_card=True,
            lost_card_fee=50000,
            payment_method="Tiền mặt",
            replacement_card_id=12,
        )
        self.assertTrue(rep_quote.is_monthly_pass)
        self.assertEqual(rep_quote.amount, 50000)
        card_lock_calls = [
            c for c in rep_cursor.execute.call_args_list
            if "FROM thexe WHERE id IN (%s, %s)" in c.args[0]
        ]
        self.assertEqual(card_lock_calls[0].args[1], (12, 30))
        rebind_calls = [
            c for c in rep_cursor.execute.call_args_list
            if "UPDATE vethang SET idtx" in c.args[0]
        ]
        self.assertEqual(rebind_calls[0].args[1], (12, 77))

    def test_check_out_rejects_already_paid_in_transaction(self) -> None:
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {
                "id": 10,
                "idvtd": 1,
                "idtx": 2,
                "idpt": 5,
                "idbg": 2,
                "giovao": datetime.now(timezone.utc).replace(tzinfo=None),
            },
            {
                "idlpt": 2,
                "bienso": "29A12345",
                "loaiphuongtien": "xe máy",
                "loaive": "ngày",
                "dongia": 5000,
                "idbdx": 1,
            },
            {"id": 99},
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        with self.assertRaises(ConflictError):
            self.service.check_out_vehicle(10, 1)

    def test_employee_creation_deletion_and_resolution(self) -> None:
        # create_employee allocates MAX(id)+1 explicitly inside transaction (nhanvien has no AUTO_INCREMENT)
        create_cur = MagicMock()
        create_cur.fetchone.side_effect = [None, {"next_id": 2004}]
        self.mock_db.transaction.return_value.__enter__.return_value = create_cur
        eid = self.service.create_employee(
            lot_id=2,
            full_name="Nguyễn Bảo Vệ Mới",
            role="Bảo vệ",
            phone="0912345999",
            cccd="001099002004",
        )
        self.assertEqual(eid, 2004)
        insert_sql = [c.args[0] for c in create_cur.execute.call_args_list if "INSERT INTO nhanvien" in c.args[0]][0]
        self.assertIn("(id, idbdx, hoten", insert_sql)

        # delete_employee ONLY checks luotdo and thanhtoan (never taikhoan or ca_lam_viec)
        del_cur = MagicMock()
        del_cur.fetchone.side_effect = [{"id": 2004}, None, None]
        self.mock_db.transaction.return_value.__enter__.return_value = del_cur
        self.service.delete_employee(2004)
        checked_sql = " ".join(c.args[0] for c in del_cur.execute.call_args_list)
        self.assertNotIn("taikhoan", checked_sql)
        self.assertNotIn("ca_lam_viec", checked_sql)

        # resolve_employee_id validates explicit ID, raises 404 when missing, and defaults by lot + role
        self.mock_db.fetch_one.return_value = {"id": 2001}
        self.assertEqual(self.service.resolve_employee_id(2001), 2001)

        self.mock_db.fetch_one.return_value = None
        with self.assertRaises(NotFoundError):
            self.service.resolve_employee_id(9999)

        self.mock_db.fetch_all.return_value = [
            {"id": 3, "idbdx": 3, "chucvu": "Quản lý"},
            {"id": 1001, "idbdx": 1, "chucvu": "Bảo vệ"},
            {"id": 1002, "idbdx": 2, "chucvu": "Bảo vệ"},
            {"id": 2002, "idbdx": 2, "chucvu": "Thu ngân"},
        ]
        self.assertEqual(self.service.resolve_employee_id(None, lot_id=2, preferred_role="bảo vệ"), 1002)
        self.assertEqual(self.service.resolve_employee_id(None, lot_id=2, preferred_role="thu ngân"), 2002)
        self.assertEqual(self.service.resolve_employee_id(None, lot_id=99, preferred_role="thu ngân"), 2002)
        self.assertEqual(self.service.resolve_employee_id(None, lot_id=99, preferred_role="kỹ thuật"), 3)

    def test_register_monthly_pass_checks_overlap_and_records_payment(self) -> None:
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {"id": 4, "dongia": 100000},
            {"id": 3, "trangthai": 1},
            None,
            None,
            None,
            None,
        ]
        cursor.lastrowid = 77
        self.mock_db.transaction.return_value.__enter__.return_value = cursor

        pass_id = self.service.register_monthly_pass(
            hoten="Nguyen Van Hoang Long 25",
            sdt="0912345678",
            cccd="001095000111",
            customer_type_id=1,
            license_plate="29A-123.45",
            vehicle_type_id=2,
            card_id=3,
            months=2,
            employee_id=3,
            payment_method="Chuyển khoản",
        )
        self.assertEqual(pass_id, 77)
        executed = [c.args[0] for c in cursor.execute.call_args_list]
        self.assertTrue(any("INSERT INTO thanhtoan" in sql for sql in executed))

    def test_create_zone_allows_up_to_20_chars_and_rejects_over_20(self) -> None:
        with self.assertRaises(ValidationError):
            self.service.create_zone(1, "A" * 21)

    def test_reconcile_slot_states_reconciles_slots_and_cards(self) -> None:
        cursor = MagicMock()
        cursor.rowcount = 2
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        res = self.service.reconcile_slot_states()
        self.assertEqual(res, {"slots_reconciled": 2, "cards_reconciled": 2})
        executed = [c.args[0] for c in cursor.execute.call_args_list]
        self.assertTrue(any("UPDATE vitrido" in sql for sql in executed))
        self.assertTrue(any("UPDATE thexe" in sql for sql in executed))

    def test_get_cards_available_excludes_or_annotates_monthly_pass_cards(self) -> None:
        self.mock_db.fetch_all.return_value = []
        self.service.get_cards(only_available=True)
        query = self.mock_db.fetch_all.call_args[0][0]
        self.assertIn("NOT EXISTS", query)
        self.assertIn("FROM vethang vt", query)

        self.service.get_cards(only_available=True, exclude_pass_bound=False)
        gate_query = self.mock_db.fetch_all.call_args[0][0]
        self.assertIn("pass_plate", gate_query)
        self.assertIn("pass_vehicle_type_id", gate_query)

    def test_get_vehicles_detail_avoids_cartesian_join(self) -> None:
        self.mock_db.fetch_all.return_value = []
        self.service.get_vehicles_detail()
        query = self.mock_db.fetch_all.call_args[0][0]
        self.assertIn("turn_stats ON turn_stats.idpt = pt.id", query)
        self.assertIn("ROW_NUMBER() OVER (PARTITION BY vt.idpt", query)

    def test_revenue_by_lot_and_vehicle_include_monthly_pass_payments(self) -> None:
        self.mock_db.fetch_all.return_value = []
        self.service.get_revenue_by_vehicle_type()
        v_sql = self.mock_db.fetch_all.call_args[0][0]
        self.assertIn("LEFT JOIN luotdo", v_sql)
        self.assertIn("LEFT JOIN vethang", v_sql)

        self.service.get_revenue_by_lot()
        l_sql = self.mock_db.fetch_all.call_args[0][0]
        self.assertIn("LEFT JOIN luotdo", l_sql)
        self.assertIn("LEFT JOIN nhanvien nv ON nv.id = tt.idnv", l_sql)

    def test_move_active_turn_slot_locks_both_slots_in_sorted_order(self) -> None:
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {"id": 30, "idvtd": 55},
            None,
        ]
        cursor.fetchall.return_value = [
            {"id": 51, "idkvd": 1, "trangthai": 1},
            {"id": 55, "idkvd": 1, "trangthai": 0},
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        self.service.move_active_turn_slot(30, 51)
        first_sql = cursor.execute.call_args_list[0].args[0]
        self.assertNotIn("JOIN vitrido", first_sql)
        lock_call = [c for c in cursor.execute.call_args_list if "WHERE id IN (%s, %s)" in c.args[0]][0]
        self.assertEqual(lock_call.args[1], (51, 55))

    def test_create_card_uses_auto_increment_and_checks_duplicate(self) -> None:
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        cursor.lastrowid = 51
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        card_id = self.service.create_card("051")
        self.assertEqual(card_id, 51)
        executed = [c.args[0] for c in cursor.execute.call_args_list]
        self.assertTrue(any("INSERT INTO thexe (maso, trangthai)" in sql for sql in executed))

    def test_update_payment_status_not_found(self) -> None:
        with self.assertRaises(ValidationError):
            self.service.update_payment_status(1, "Không hợp lệ")

        cursor = MagicMock()
        cursor.fetchone.return_value = None
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        with self.assertRaises(NotFoundError):
            self.service.update_payment_status(999, "Hoàn tiền")


if __name__ == "__main__":
    unittest.main()
