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
    AuditActor,
    normalize_payment_method,
    normalize_plate,
    vn_day_utc_bounds,
)
from services.migration_service import MigrationService
from services.parking_service import ParkingService


class TestDBServiceAndMigrations(unittest.TestCase):
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
            # Connection MUST stay pinned and NOT returned to pool mid-lock
            mock_conn.close.assert_not_called()

        # Exactly one connection borrowed, released once after RELEASE_LOCK
        mock_pool.get_connection.assert_called_once()
        mock_conn.close.assert_called_once()
        self.assertIn("GET_LOCK", lock_cur.execute.call_args[0][0])
        self.assertIn("RELEASE_LOCK", rel_cur.execute.call_args[0][0])

    def test_migration_service_runs_all_6_steps_and_is_idempotent(self) -> None:
        mock_db = MagicMock(spec=DBService)
        mock_db.advisory_lock.return_value.__enter__.return_value = True
        existing_legacy_tables = {
            "thanhtoan",
            "phuongtien",
            "baidoxe",
            "khuvucdo",
            "banggia",
            "loaikhachhang",
            "loaiphuongtien",
            "khachhang",
            "nhanvien",
            "luotdo",
            "vethang",
        }
        created_tables: set[str] = set()

        def fake_fetch_one(sql: str, params=None):
            if "information_schema.tables" in sql:
                tname = params[0]
                return {"cnt": 1 if (tname in existing_legacy_tables or tname in created_tables) else 0}
            if "information_schema.columns" in sql and "COUNT(*)" in sql:
                return {"cnt": 0}
            if "information_schema.columns" in sql:
                table, col = params[0], params[1]
                if table == "thanhtoan" and col == "idld":
                    return {"data_type": "int", "max_len": None, "is_nullable": "NO", "extra": ""}
                if table == "thanhtoan" and col == "loaithanhtoan":
                    return {"data_type": "tinyint", "max_len": None, "is_nullable": "YES", "extra": ""}
                if table == "nhanvien" and col == "id":
                    return {"data_type": "int", "max_len": None, "is_nullable": "NO", "extra": ""}
                return {"data_type": "varchar", "max_len": 10, "is_nullable": "YES", "extra": ""}
            if "information_schema.statistics" in sql:
                return {"cnt": 0}
            if "HAVING COUNT(*) > 1" in sql:
                return {"cnt": 0}
            return {"cnt": 0}

        def fake_exec(sql: str, params=None):
            if "CREATE TABLE `" in sql:
                tname = sql.split("CREATE TABLE `", 1)[1].split("`", 1)[0]
                created_tables.add(tname)
                self.assertIn("COLLATE=utf8mb4_bin", sql)
            return 1

        mock_db.fetch_one.side_effect = fake_fetch_one
        mock_db.execute_non_query.side_effect = fake_exec
        mock_db.fetch_all.return_value = []

        applied = MigrationService(mock_db).ensure_production_schema()
        mock_db.advisory_lock.assert_called_once()
        self.assertIn("create_table_taikhoan", applied)
        self.assertIn("create_table_refresh_tokens", applied)
        self.assertIn("nullable_thanhtoan_idld", applied)
        self.assertIn("normalize_thanhtoan_loaithanhtoan", applied)
        self.assertIn("widen_phuongtien_bienso", applied)
        self.assertIn("nhanvien_id_auto_increment", applied)
        self.assertIn("add_uk_thanhtoan_idld", applied)
        self.assertIn("add_idx_thanhtoan_shift_recon", applied)

        # Second run with all 6 versions recorded must be a no-op
        mock_db.execute_non_query.reset_mock()
        mock_db.fetch_all.return_value = [{"version": f"00{i}"} for i in range(1, 7)]
        second = MigrationService(mock_db).ensure_production_schema()
        self.assertEqual(second, [])
        mock_db.execute_non_query.assert_not_called()


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

        # Verify operator cross-lot quote rejection
        self.mock_db.fetch_one.side_effect = [
            {
                "id": 10,
                "giovao": checkin_utc,
                "idpt": 5,
                "bienso": "29A12345",
                "loaiphuongtien": "xe máy",
                "loaive": "ngày",
                "dongia": 5000,
                "idbdx": 2,
            }
        ]
        with self.assertRaises(ValidationError):
            self.service.get_fee_quote(10, operator_lot_id=1)

    def test_expired_monthly_pass_bills_daily_tariff_instead_of_free_or_monthly_rate(self) -> None:
        checkin_utc = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=30)
        # Check-in occurred with monthly tariff (dongia=240000), but pass expired before checkout
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
        # 30 hours -> 2 days * 20,000 VND (NOT 0 VND and NOT 2 * 240,000 VND!)
        self.assertEqual(quote.amount, 40000)
        self.assertEqual(quote.ticket_type, "Vé ngày (Vé tháng hết hạn)")

        # Verify the same fallback inside transactional check_out_vehicle (single-table luotdo FOR UPDATE)
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
            None,               # not already paid
            None,               # pass expired
            {"dongia": 20000},  # daily tariff lookup in TX
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        paid_quote = self.service.check_out_vehicle(12, employee_id=3, payment_method="Tiền mặt")
        self.assertFalse(paid_quote.is_monthly_pass)
        self.assertEqual(paid_quote.amount, 40000)
        self.assertEqual(paid_quote.ticket_type, "Vé ngày (Vé tháng hết hạn)")
        # Ensure no FOR UPDATE lock is taken on shared lookup tables (loaiphuongtien/banggia)
        for call in cursor.execute.call_args_list:
            sql = call.args[0]
            if "FOR UPDATE" in sql:
                self.assertNotIn("loaiphuongtien", sql)
                self.assertNotIn("banggia", sql)

    def test_check_in_vehicle_rejects_occupied_slot_and_pass_bound_card(self) -> None:
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [
            None,                                     # phuongtien FOR UPDATE
            {"id": 1, "idkvd": 1, "trangthai": 0},    # slot occupied
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = mock_cursor
        with self.assertRaises(ConflictError):
            self.service.check_in_vehicle("30G45678", 3, 1, 6, 1)

        # Card bound to another vehicle's monthly pass must be rejected
        mock_cursor2 = MagicMock()
        mock_cursor2.fetchone.side_effect = [
            {"id": 7, "idlpt": 3},                    # phuongtien FOR UPDATE
            {"id": 1, "idkvd": 1, "trangthai": 1},    # slot free
            {"id": 6, "trangthai": 1},                # card status=1
            None,                                     # no active turn for vehicle
            {"id": 100, "idpt": 999},                 # card belongs to another vehicle's pass!
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = mock_cursor2
        with self.assertRaises(ConflictError):
            self.service.check_in_vehicle("30G45678", 3, 1, 6, 1)

    def test_check_in_vehicle_atomic_success_with_audit(self) -> None:
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [
            {"id": 7, "idlpt": 3},                    # phuongtien FOR UPDATE
            {"id": 1, "idkvd": 2, "trangthai": 1},    # slot FOR UPDATE
            {"idbdx": 1},                             # khuvucdo lot lookup for operator_lot_id
            {"id": 6, "trangthai": 1},                # card FOR UPDATE
            None,                                     # no active turn
            None,                                     # card not bound to other pass
            None,                                     # no active monthly pass
            {"id": 3},                                # daily tariff
        ]
        mock_cursor.rowcount = 1
        mock_cursor.lastrowid = 42
        self.mock_db.transaction.return_value.__enter__.return_value = mock_cursor

        actor = AuditActor(account_id=1, username="admin", ip_address="127.0.0.1")
        turn_id = self.service.check_in_vehicle("30G45678", 3, 1, 6, 1, operator_lot_id=1, actor=actor)
        self.assertEqual(turn_id, 42)
        executed = [c.args[0] for c in mock_cursor.execute.call_args_list]
        self.assertTrue(any("INSERT INTO audit_logs" in sql for sql in executed))

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
            None,  # not already paid
            None,  # no active monthly pass
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
        # Parameter index 4 is loaithanhtoan -> must be 'Chuyển khoản', NEVER integer 0/1
        self.assertEqual(insert_calls[0].args[1][4], "Chuyển khoản")

        card_updates = [c for c in cursor.execute.call_args_list if "UPDATE thexe SET trangthai" in c.args[0]]
        self.assertEqual(card_updates[0].args[1], (2, 10))

        # Verify monthly-pass lost-card replacement locks cards in sorted order and rebinds vethang.idtx
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
            None,          # not already paid
            {"id": 77},    # active monthly pass #77
            None,          # replacement card not bound to another pass
        ]
        rep_cursor.fetchall.return_value = [
            {"id": 12, "trangthai": 1},  # replacement card (lower id)
            {"id": 30, "trangthai": 0},  # lost card (higher id)
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
            {"id": 99},  # already paid
        ]
        self.mock_db.transaction.return_value.__enter__.return_value = cursor
        with self.assertRaises(ConflictError):
            self.service.check_out_vehicle(10, 1)

    def test_register_monthly_pass_checks_overlap_and_records_payment(self) -> None:
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {"id": 4, "dongia": 100000},  # monthly tariff
            {"id": 3, "trangthai": 1},    # card available
            None,                         # card unbound
            None,                         # new customer
            None,                         # new vehicle
            None,                         # no overlapping active pass for vehicle
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

        # Gate POS mode: exclude_pass_bound=False must return pass_plate for owner auto-match
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
        # First query locks ONLY luotdo (never vitrido before ascending-ID lock)
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

    def test_legacy_streamlit_helpers_removed(self) -> None:
        self.assertFalse(hasattr(self.service, "seed_demo_data"))
        self.assertFalse(hasattr(self.service, "build_ticket_html"))
        self.assertFalse(hasattr(self.service, "build_receipt_html"))


if __name__ == "__main__":
    unittest.main()
