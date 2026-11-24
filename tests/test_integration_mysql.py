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

from services.db_service import DBService
from services.domain.base import utc_now, vn_today
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


def test_full_mysql_dump_and_domain_workflows() -> None:
    """End-to-end verification against live MySQL 8.4 starting from Dump20261118.sql."""
    db = _integration_db()
    dump_file = ROOT / "Dump20261118.sql"
    assert dump_file.exists(), "Dump20261118.sql must exist at repository root"

    _load_sql_dump(db, dump_file)

    svc = ParkingService(db)

    # 1. Create new employee (allocates next id safely even without AUTO_INCREMENT)
    new_emp_id = svc.create_employee(
        lot_id=1,
        full_name="Nguyễn Kiểm Thử",
        address="PTIT Hà Đông",
        role="Bảo vệ",
        phone="0911223344",
        cccd="001202999888",
    )
    assert new_emp_id > 0

    # 2. Check-in / Check-out and monthly pass workflow
    free_cards = svc.get_cards(only_available=True, exclude_pass_bound=True)
    assert len(free_cards) >= 3
    pass_card_id = int(free_cards[0]["id"])
    rep_card_id = int(free_cards[1]["id"])
    walkin_card_id = int(free_cards[2]["id"])

    cashier_id = svc.resolve_employee_id(None, lot_id=1, preferred_role="thu ngân")
    guard_id = svc.resolve_employee_id(None, lot_id=1, preferred_role="bảo vệ")

    pass_id = svc.register_monthly_pass(
        hoten="Trần Vé Tháng",
        sdt="0988776655",
        cccd="001200112233",
        customer_type_id=1,
        license_plate="29M1-888.88",
        vehicle_type_id=2,
        card_id=pass_card_id,
        months=1,
        employee_id=cashier_id,
        payment_method="Chuyển khoản",
    )
    assert pass_id > 0

    free_slots = svc.get_slots(status_filter=1)
    assert len(free_slots) >= 2
    slot_a = int(free_slots[0]["id"])
    slot_b = int(free_slots[1]["id"])

    turn_pass = svc.check_in_vehicle(
        license_plate="29M1-888.88",
        vehicle_type_id=2,
        slot_id=slot_a,
        card_id=pass_card_id,
        employee_id=guard_id,
    )
    svc.move_active_turn_slot(turn_pass, slot_b)
    quote_lost = svc.check_out_vehicle(
        turn_id=turn_pass,
        employee_id=cashier_id,
        lost_card=True,
        lost_card_fee=50000,
        payment_method="Tiền mặt",
        replacement_card_id=rep_card_id,
    )
    assert quote_lost.is_monthly_pass is True
    assert quote_lost.amount == 50000

    turn_exp = svc.check_in_vehicle(
        license_plate="29M1-888.88",
        vehicle_type_id=2,
        slot_id=slot_a,
        card_id=rep_card_id,
        employee_id=guard_id,
    )
    yesterday = (vn_today() - timedelta(days=1)).strftime("%Y-%m-%d")
    db.execute_non_query("UPDATE vethang SET ngayketthuc = %s WHERE id = %s", (yesterday, pass_id))
    past_checkin = (utc_now() - timedelta(hours=30)).strftime("%Y-%m-%d %H:%M:%S")
    db.execute_non_query("UPDATE luotdo SET giovao = %s WHERE id = %s", (past_checkin, turn_exp))

    exp_quote = svc.check_out_vehicle(
        turn_id=turn_exp,
        employee_id=cashier_id,
        payment_method="Chuyển khoản",
    )
    assert exp_quote.is_monthly_pass is False
    assert exp_quote.ticket_type == "Vé ngày (Vé tháng hết hạn)"
    assert exp_quote.amount == 10000

    turn_walkin = svc.check_in_vehicle(
        license_plate="30K-111.22",
        vehicle_type_id=3,
        slot_id=slot_a,
        card_id=walkin_card_id,
        employee_id=guard_id,
    )
    svc.check_out_vehicle(
        turn_id=turn_walkin,
        employee_id=cashier_id,
        payment_method="Tiền mặt",
    )

    assert svc.get_overview_metrics(lot_id=1).total_slots > 0
    assert isinstance(svc.get_daily_revenue(30), list)
    assert isinstance(svc.get_revenue_by_vehicle_type(), list)
    assert isinstance(svc.get_revenue_by_lot(), list)
    assert isinstance(svc.get_operational_alerts(), dict)
