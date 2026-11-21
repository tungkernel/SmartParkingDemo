from __future__ import annotations

import os
import sys
from datetime import timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from core.config import Settings
from services.auth_service import AuthService
from services.db_service import DBService
from services.domain.base import AuditActor, utc_now, vn_today
from services.migration_service import MigrationService
from services.parking_service import ParkingService

pytestmark = pytest.mark.integration


def _integration_db() -> DBService:
    host = os.getenv("INTEGRATION_MYSQL_HOST")
    if not host:
        pytest.skip("INTEGRATION_MYSQL_HOST is not set; skipping live MySQL integration tests.")
    return DBService(
        host=host,
        port=int(os.getenv("INTEGRATION_MYSQL_PORT", "3306")),
        database=os.getenv("INTEGRATION_MYSQL_DATABASE", "dbptit_ci"),
        user=os.getenv("INTEGRATION_MYSQL_USER", "root"),
        password=os.getenv("INTEGRATION_MYSQL_PASSWORD", "root_ci_password"),
        pool_size=4,
    )


def _load_sql_dump(db: DBService, dump_path: Path) -> None:
    """Execute Dump20261118.sql statements cleanly against an empty test schema."""
    raw = dump_path.read_text(encoding="utf-8")
    statements: list[str] = []
    buf: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buf.append(line)
        if stripped.endswith(";"):
            statements.append("\n".join(buf))
            buf.clear()

    conn = db.get_connection()
    cur = None
    try:
        cur = conn.cursor()
        for stmt in statements:
            cur.execute(stmt)
        conn.commit()
    finally:
        db._safe_close(cur, conn)


def test_full_mysql_dump_migrations_and_domain_workflows() -> None:
    """End-to-end verification against live MySQL 8.4 starting from Dump20261118.sql."""
    db = _integration_db()
    dump_file = ROOT / "Dump20261118.sql"
    assert dump_file.exists(), "Dump20261118.sql must exist at repository root"

    _load_sql_dump(db, dump_file)

    # 1. Migration runner applies all 6 steps cleanly and is strictly idempotent on re-run
    migrator = MigrationService(db)
    first_run = migrator.ensure_production_schema()
    assert "create_table_taikhoan" in first_run
    assert "nullable_thanhtoan_idld" in first_run
    assert "nhanvien_id_auto_increment" in first_run
    assert "add_uk_thanhtoan_idld" in first_run
    assert migrator.ensure_production_schema() == []

    # 2. Auth seeding, login, refresh rotation, and password change
    settings = Settings(
        app_env="development",
        auth_secret_key="integration-test-secret-key-32-chars!!",
        auth_default_seed_password="SeedPassword123",
    )
    auth = AuthService(db, settings=settings)
    seeded = auth.ensure_default_accounts()
    assert seeded > 0
    assert auth.ensure_default_accounts() == 0

    admin = auth.authenticate("admin", "SeedPassword123")
    refresh_1 = auth.create_refresh_token(admin)
    rotated_user, access_2, refresh_2 = auth.rotate_refresh_token(refresh_1)
    assert rotated_user.username == "admin"
    assert refresh_2 != refresh_1
    assert auth.verify_active_token(access_2).username == "admin"

    svc = ParkingService(db)
    actor = AuditActor(account_id=admin.account_id, username=admin.username, ip_address="127.0.0.1")

    # 3. Create new employee (verifies nhanvien.id AUTO_INCREMENT works on live MySQL 8.4)
    new_emp_id = svc.create_employee(
        lot_id=1,
        full_name="Nguyễn Kiểm Thử",
        address="PTIT Hà Đông",
        role="Bảo vệ",
        phone="0911223344",
        cccd="001202999888",
        actor=actor,
    )
    assert new_emp_id > 0

    # 4. Register monthly pass -> inserts thanhtoan with idld = NULL cleanly
    free_cards = svc.get_cards(only_available=True, exclude_pass_bound=True)
    assert len(free_cards) >= 3
    pass_card_id = int(free_cards[0]["id"])
    rep_card_id = int(free_cards[1]["id"])
    walkin_card_id = int(free_cards[2]["id"])

    pass_id = svc.register_monthly_pass(
        hoten="Trần Vé Tháng",
        sdt="0988776655",
        cccd="001200112233",
        customer_type_id=1,
        license_plate="29M1-888.88",
        vehicle_type_id=2,
        card_id=pass_card_id,
        months=1,
        employee_id=admin.employee_id,
        payment_method="Chuyển khoản",
        actor=actor,
    )
    assert pass_id > 0

    # Gate mode card list MUST expose the pass holder's card annotated with pass_plate
    gate_cards = svc.get_cards(only_available=True, exclude_pass_bound=False)
    matched = [c for c in gate_cards if int(c["id"]) == pass_card_id]
    assert len(matched) == 1
    assert matched[0]["pass_plate"] == "29M1-888.88"

    # Walk-in mode card list MUST exclude the pass-bound card
    walkin_only = svc.get_cards(only_available=True, exclude_pass_bound=True)
    assert all(int(c["id"]) != pass_card_id for c in walkin_only)

    # 5. Open cashier shift, check-in monthly pass holder, lose card & replace atomically
    shift_id = svc.open_shift(
        employee_id=admin.employee_id,
        lot_id=1,
        opening_cash=500000,
        note="Ca tích hợp",
        actor=actor,
    )
    free_slots = svc.get_slots(status_filter=1)
    assert len(free_slots) >= 2
    slot_a = int(free_slots[0]["id"])
    slot_b = int(free_slots[1]["id"])

    turn_pass = svc.check_in_vehicle(
        license_plate="29M1-888.88",
        vehicle_type_id=2,
        slot_id=slot_a,
        card_id=pass_card_id,
        employee_id=admin.employee_id,
        actor=actor,
    )
    svc.move_active_turn_slot(turn_pass, slot_b, actor=actor)
    quote_lost = svc.check_out_vehicle(
        turn_id=turn_pass,
        employee_id=admin.employee_id,
        lost_card=True,
        lost_card_fee=50000,
        payment_method="Tiền mặt",
        replacement_card_id=rep_card_id,
        actor=actor,
    )
    assert quote_lost.is_monthly_pass is True
    assert quote_lost.amount == 50000

    # 6. Expired monthly pass checkout MUST fall back to daily rate (NOT 0, NOT monthly dongia)
    turn_exp = svc.check_in_vehicle(
        license_plate="29M1-888.88",
        vehicle_type_id=2,
        slot_id=slot_a,
        card_id=rep_card_id,
        employee_id=admin.employee_id,
        actor=actor,
    )
    # Expire the monthly pass while the vehicle is still parked
    yesterday = (vn_today() - timedelta(days=1)).strftime("%Y-%m-%d")
    db.execute_non_query("UPDATE vethang SET ngayketthuc = %s WHERE id = %s", (yesterday, pass_id))
    # Backdate check-in by 30 hours to test multi-day daily-rate calculation
    past_checkin = (utc_now() - timedelta(hours=30)).strftime("%Y-%m-%d %H:%M:%S")
    db.execute_non_query("UPDATE luotdo SET giovao = %s WHERE id = %s", (past_checkin, turn_exp))

    exp_quote = svc.check_out_vehicle(
        turn_id=turn_exp,
        employee_id=admin.employee_id,
        payment_method="Chuyển khoản",
        actor=actor,
    )
    assert exp_quote.is_monthly_pass is False
    assert exp_quote.ticket_type == "Vé ngày (Vé tháng hết hạn)"
    assert exp_quote.amount == 10000  # 2 days * 5,000 VND daily motorbike tariff

    # 7. Walk-in turn + shift closing reconciliation
    turn_walkin = svc.check_in_vehicle(
        license_plate="30K-111.22",
        vehicle_type_id=3,
        slot_id=slot_a,
        card_id=walkin_card_id,
        employee_id=admin.employee_id,
        actor=actor,
    )
    svc.check_out_vehicle(
        turn_id=turn_walkin,
        employee_id=admin.employee_id,
        payment_method="Tiền mặt",
        actor=actor,
    )
    closed = svc.close_shift(
        shift_id=shift_id,
        employee_id=admin.employee_id,
        actual_cash=560000,  # 500k opening + 50k lost card cash + 10k car walkin cash
        note="Khớp quỹ",
        actor=actor,
    )
    assert closed["expected_cash"] == 560000
    assert closed["transfer_total"] == 10000
    assert closed["diff"] == 0

    # 8. Lot-scoped overview metrics & analytics run without SQL errors on live MySQL 8.4
    overview_lot1 = svc.get_overview_metrics(lot_id=1)
    assert overview_lot1.total_slots > 0
    assert isinstance(svc.get_daily_revenue(30), list)
    assert isinstance(svc.get_revenue_by_vehicle_type(), list)
    assert isinstance(svc.get_revenue_by_lot(), list)
    assert isinstance(svc.get_operational_alerts(redact_pii=True), dict)
