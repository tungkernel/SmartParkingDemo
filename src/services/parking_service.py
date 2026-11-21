from __future__ import annotations

from datetime import date
from typing import Any, Optional

from core.exceptions import ValidationError
from services.db_service import DBService
from services.domain.analytics_service import AnalyticsService
from services.domain.base import AuditActor, FeeQuote, OverviewMetrics, normalize_plate
from services.domain.billing_service import BillingService
from services.domain.directory_service import DirectoryService
from services.domain.gate_service import GateService
from services.domain.infrastructure_service import InfrastructureService
from services.domain.pass_service import PassService
from ui.templates import build_receipt_html, build_ticket_html

__all__ = [
    "AuditActor",
    "FeeQuote",
    "OverviewMetrics",
    "ParkingService",
    "ValidationError",
]


class ParkingService:
    """Thin backward-compatible facade composing focused domain services."""

    def __init__(self, db: DBService) -> None:
        self.db = db
        self.gate = GateService(db)
        self.infra = InfrastructureService(db)
        self.passes = PassService(db)
        self.billing = BillingService(db)
        self.directory = DirectoryService(db)
        self.analytics = AnalyticsService(db)

    @staticmethod
    def _normalize_plate(plate: str) -> str:
        return normalize_plate(plate)

    # Analytics & Overview
    def get_overview_metrics(self, lot_id: Optional[int] = None) -> OverviewMetrics:
        return self.analytics.get_overview_metrics(lot_id=lot_id)

    def get_daily_revenue(self, days: int = 30) -> list[dict[str, Any]]:
        return self.analytics.get_daily_revenue(days=days)

    def get_revenue_by_vehicle_type(self) -> list[dict[str, Any]]:
        return self.analytics.get_revenue_by_vehicle_type()

    def get_revenue_by_lot(self) -> list[dict[str, Any]]:
        return self.analytics.get_revenue_by_lot()

    def get_operational_alerts(
        self,
        overdue_hours: int = 24,
        pass_expiring_days: int = 7,
        lot_id: Optional[int] = None,
        redact_pii: bool = False,
    ) -> dict[str, Any]:
        return self.analytics.get_operational_alerts(
            overdue_hours=overdue_hours,
            pass_expiring_days=pass_expiring_days,
            lot_id=lot_id,
            redact_pii=redact_pii,
        )

    def record_audit_log(
        self,
        actor_id: Optional[int],
        actor_username: str,
        action: str,
        entity_type: str,
        entity_id: Optional[Any] = None,
        details: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        self.analytics.record_audit_log(
            actor_id=actor_id,
            actor_username=actor_username,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            ip_address=ip_address,
        )

    def get_audit_logs(
        self,
        limit: int = 100,
        offset: int = 0,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        actor_username: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        return self.analytics.get_audit_logs(
            limit=limit,
            offset=offset,
            action=action,
            entity_type=entity_type,
            actor_username=actor_username,
        )

    def count_audit_logs(
        self,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        actor_username: Optional[str] = None,
    ) -> int:
        return self.analytics.count_audit_logs(
            action=action, entity_type=entity_type, actor_username=actor_username
        )

    # Infrastructure
    def get_parking_lots(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        return self.infra.get_parking_lots(lot_id=lot_id)

    def create_parking_lot(self, name: str, location: str, actor: Optional[AuditActor] = None) -> int:
        return self.infra.create_parking_lot(name, location, actor=actor)

    def update_parking_lot(
        self, lot_id: int, name: str, location: str, actor: Optional[AuditActor] = None
    ) -> None:
        self.infra.update_parking_lot(lot_id, name, location, actor=actor)

    def delete_parking_lot(self, lot_id: int, actor: Optional[AuditActor] = None) -> None:
        self.infra.delete_parking_lot(lot_id, actor=actor)

    def get_zones(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        return self.infra.get_zones(lot_id=lot_id)

    def get_zones_summary(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        return self.infra.get_zones_summary(lot_id=lot_id)

    def create_zone(self, lot_id: int, name: str, actor: Optional[AuditActor] = None) -> int:
        return self.infra.create_zone(lot_id, name, actor=actor)

    def update_zone(
        self, zone_id: int, lot_id: int, name: str, actor: Optional[AuditActor] = None
    ) -> None:
        self.infra.update_zone(zone_id, lot_id, name, actor=actor)

    def delete_zone(self, zone_id: int, actor: Optional[AuditActor] = None) -> None:
        self.infra.delete_zone(zone_id, actor=actor)

    def get_slots(
        self,
        lot_id: Optional[int] = None,
        zone_id: Optional[int] = None,
        status_filter: Optional[int] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.infra.get_slots(
            lot_id=lot_id,
            zone_id=zone_id,
            status_filter=status_filter,
            keyword=keyword,
            limit=limit,
            offset=offset,
        )

    def add_slots_to_zone(
        self, zone_id: int, count: int, actor: Optional[AuditActor] = None
    ) -> int:
        return self.infra.add_slots_to_zone(zone_id, count, actor=actor)

    def set_slot_maintenance(
        self,
        slot_id: int,
        maintenance: bool,
        operator_lot_id: Optional[int] = None,
        actor: Optional[AuditActor] = None,
    ) -> None:
        self.infra.set_slot_maintenance(
            slot_id, maintenance, operator_lot_id=operator_lot_id, actor=actor
        )

    def delete_slot(self, slot_id: int, actor: Optional[AuditActor] = None) -> None:
        self.infra.delete_slot(slot_id, actor=actor)

    def reconcile_slot_states(self, actor: Optional[AuditActor] = None) -> dict[str, int]:
        return self.infra.reconcile_slot_states(actor=actor)

    # Gate Operations
    def get_active_turns(
        self,
        lot_id: Optional[int] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.gate.get_active_turns(
            lot_id=lot_id, keyword=keyword, limit=limit, offset=offset
        )

    def count_active_turns(
        self, lot_id: Optional[int] = None, keyword: Optional[str] = None
    ) -> int:
        return self.gate.count_active_turns(lot_id=lot_id, keyword=keyword)

    def check_in_vehicle(
        self,
        license_plate: str,
        vehicle_type_id: int,
        slot_id: int,
        card_id: int,
        employee_id: int,
        operator_lot_id: Optional[int] = None,
        actor: Optional[AuditActor] = None,
    ) -> int:
        return self.gate.check_in_vehicle(
            license_plate=license_plate,
            vehicle_type_id=vehicle_type_id,
            slot_id=slot_id,
            card_id=card_id,
            employee_id=employee_id,
            operator_lot_id=operator_lot_id,
            actor=actor,
        )

    def get_fee_quote(
        self,
        turn_id: int,
        operator_lot_id: Optional[int] = None,
    ) -> FeeQuote:
        return self.gate.get_fee_quote(turn_id, operator_lot_id=operator_lot_id)

    def check_out_vehicle(
        self,
        turn_id: int,
        employee_id: int,
        lost_card: bool = False,
        lost_card_fee: int = 0,
        payment_method: str = "Tiền mặt",
        replacement_card_id: Optional[int] = None,
        operator_lot_id: Optional[int] = None,
        actor: Optional[AuditActor] = None,
    ) -> FeeQuote:
        return self.gate.check_out_vehicle(
            turn_id=turn_id,
            employee_id=employee_id,
            lost_card=lost_card,
            lost_card_fee=lost_card_fee,
            payment_method=payment_method,
            replacement_card_id=replacement_card_id,
            operator_lot_id=operator_lot_id,
            actor=actor,
        )

    def move_active_turn_slot(
        self,
        turn_id: int,
        new_slot_id: int,
        operator_lot_id: Optional[int] = None,
        actor: Optional[AuditActor] = None,
    ) -> None:
        self.gate.move_active_turn_slot(
            turn_id, new_slot_id, operator_lot_id=operator_lot_id, actor=actor
        )

    def cancel_active_turn(
        self,
        turn_id: int,
        operator_lot_id: Optional[int] = None,
        actor: Optional[AuditActor] = None,
    ) -> None:
        self.gate.cancel_active_turn(turn_id, operator_lot_id=operator_lot_id, actor=actor)

    # Monthly Passes
    def get_monthly_passes(
        self,
        status_filter: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        redact_pii: bool = False,
    ) -> list[dict[str, Any]]:
        return self.passes.get_monthly_passes(
            status_filter=status_filter,
            keyword=keyword,
            limit=limit,
            offset=offset,
            redact_pii=redact_pii,
        )

    def count_monthly_passes(
        self, status_filter: Optional[str] = None, keyword: Optional[str] = None
    ) -> int:
        return self.passes.count_monthly_passes(status_filter=status_filter, keyword=keyword)

    def register_monthly_pass(
        self,
        hoten: str,
        sdt: str,
        cccd: str,
        customer_type_id: int,
        license_plate: str,
        vehicle_type_id: int,
        card_id: int,
        months: int = 1,
        employee_id: Optional[int] = None,
        payment_method: str = "Tiền mặt",
        actor: Optional[AuditActor] = None,
    ) -> int:
        return self.passes.register_monthly_pass(
            hoten=hoten,
            sdt=sdt,
            cccd=cccd,
            customer_type_id=customer_type_id,
            license_plate=license_plate,
            vehicle_type_id=vehicle_type_id,
            card_id=card_id,
            months=months,
            employee_id=employee_id,
            payment_method=payment_method,
            actor=actor,
        )

    def renew_monthly_pass(
        self,
        pass_id: int,
        months: int,
        employee_id: Optional[int] = None,
        payment_method: str = "Tiền mặt",
        actor: Optional[AuditActor] = None,
    ) -> dict[str, Any]:
        return self.passes.renew_monthly_pass(
            pass_id=pass_id,
            months=months,
            employee_id=employee_id,
            payment_method=payment_method,
            actor=actor,
        )

    def update_monthly_pass_assets(
        self,
        pass_id: int,
        plate: str,
        vehicle_type_id: int,
        new_card_id: int,
        actor: Optional[AuditActor] = None,
    ) -> None:
        self.passes.update_monthly_pass_assets(
            pass_id, plate, vehicle_type_id, new_card_id, actor=actor
        )

    def cancel_monthly_pass(
        self, pass_id: int, actor: Optional[AuditActor] = None
    ) -> None:
        self.passes.cancel_monthly_pass(pass_id, actor=actor)

    def get_monthly_pass_revenue_summary(self) -> dict[str, Any]:
        return self.passes.get_monthly_pass_revenue_summary()

    # Billing, Tariffs & Shifts
    def get_tariffs(self) -> list[dict[str, Any]]:
        return self.billing.get_tariffs()

    def create_tariff(
        self,
        ticket_type: str,
        unit_price: int,
        vehicle_type_id: int,
        customer_type_id: Optional[int],
        actor: Optional[AuditActor] = None,
    ) -> int:
        return self.billing.create_tariff(
            ticket_type, unit_price, vehicle_type_id, customer_type_id, actor=actor
        )

    def update_tariff(
        self, tariff_id: int, unit_price: int, actor: Optional[AuditActor] = None
    ) -> None:
        self.billing.update_tariff(tariff_id, unit_price, actor=actor)

    def delete_tariff(self, tariff_id: int, actor: Optional[AuditActor] = None) -> None:
        self.billing.delete_tariff(tariff_id, actor=actor)

    def get_transactions(
        self,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        vehicle_type_id: Optional[int] = None,
        keyword: Optional[str] = None,
        status_filter: Optional[str] = None,
        payment_method: Optional[str] = None,
        employee_id: Optional[int] = None,
        sort_by: str = "giothanhtoan",
        sort_dir: str = "desc",
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.billing.get_transactions(
            date_from=date_from,
            date_to=date_to,
            vehicle_type_id=vehicle_type_id,
            keyword=keyword,
            status_filter=status_filter,
            payment_method=payment_method,
            employee_id=employee_id,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )

    def count_transactions(
        self,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        vehicle_type_id: Optional[int] = None,
        keyword: Optional[str] = None,
        status_filter: Optional[str] = None,
        payment_method: Optional[str] = None,
        employee_id: Optional[int] = None,
    ) -> int:
        return self.billing.count_transactions(
            date_from=date_from,
            date_to=date_to,
            vehicle_type_id=vehicle_type_id,
            keyword=keyword,
            status_filter=status_filter,
            payment_method=payment_method,
            employee_id=employee_id,
        )

    def update_payment_status(
        self, payment_id: int, new_status: str, actor: Optional[AuditActor] = None
    ) -> None:
        self.billing.update_payment_status(payment_id, new_status, actor=actor)

    def get_active_shift(self, employee_id: int) -> Optional[dict[str, Any]]:
        return self.billing.get_active_shift(employee_id)

    def open_shift(
        self,
        employee_id: int,
        lot_id: Optional[int],
        opening_cash: int = 0,
        note: str = "",
        actor: Optional[AuditActor] = None,
    ) -> int:
        return self.billing.open_shift(
            employee_id, lot_id, opening_cash=opening_cash, note=note, actor=actor
        )

    def close_shift(
        self,
        shift_id: int,
        employee_id: int,
        actual_cash: int,
        note: str = "",
        actor: Optional[AuditActor] = None,
    ) -> dict[str, Any]:
        return self.billing.close_shift(
            shift_id, employee_id, actual_cash, note=note, actor=actor
        )

    def get_shifts(
        self, limit: int = 50, offset: int = 0, employee_id: Optional[int] = None
    ) -> list[dict[str, Any]]:
        return self.billing.get_shifts(limit=limit, offset=offset, employee_id=employee_id)

    def count_shifts(self, employee_id: Optional[int] = None) -> int:
        return self.billing.count_shifts(employee_id=employee_id)

    # Directory (People, Cards, Vehicles, Catalogs)
    def get_vehicle_types(self) -> list[dict[str, Any]]:
        return self.directory.get_vehicle_types()

    def get_customer_types(self) -> list[dict[str, Any]]:
        return self.directory.get_customer_types()

    def get_employees(self, redact_pii: bool = False) -> list[dict[str, Any]]:
        return self.directory.get_employees(redact_pii=redact_pii)

    def get_employees_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        redact_pii: bool = False,
    ) -> list[dict[str, Any]]:
        return self.directory.get_employees_detail(
            keyword=keyword, limit=limit, offset=offset, redact_pii=redact_pii
        )

    def create_employee(
        self,
        lot_id: Optional[int],
        full_name: str,
        address: str = "",
        birth_date: Optional[date] = None,
        role: str = "Bảo vệ",
        phone: str = "",
        start_date: Optional[date] = None,
        email: str = "",
        cccd: str = "",
        actor: Optional[AuditActor] = None,
    ) -> int:
        return self.directory.create_employee(
            lot_id=lot_id,
            full_name=full_name,
            address=address,
            birth_date=birth_date,
            role=role,
            phone=phone,
            start_date=start_date,
            email=email,
            cccd=cccd,
            actor=actor,
        )

    def update_employee(
        self,
        emp_id: int,
        lot_id: Optional[int],
        full_name: str,
        address: str,
        role: str,
        phone: str,
        email: str = "",
        cccd: str = "",
        actor: Optional[AuditActor] = None,
    ) -> None:
        self.directory.update_employee(
            emp_id=emp_id,
            lot_id=lot_id,
            full_name=full_name,
            address=address,
            role=role,
            phone=phone,
            email=email,
            cccd=cccd,
            actor=actor,
        )

    def delete_employee(self, emp_id: int, actor: Optional[AuditActor] = None) -> None:
        self.directory.delete_employee(emp_id, actor=actor)

    def get_customers_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        redact_pii: bool = False,
    ) -> list[dict[str, Any]]:
        return self.directory.get_customers_detail(
            keyword=keyword, limit=limit, offset=offset, redact_pii=redact_pii
        )

    def update_customer(
        self,
        customer_id: int,
        full_name: str,
        phone: str,
        cccd: str,
        customer_type_id: int,
        actor: Optional[AuditActor] = None,
    ) -> None:
        self.directory.update_customer(
            customer_id, full_name, phone, cccd, customer_type_id, actor=actor
        )

    def delete_customer(self, customer_id: int, actor: Optional[AuditActor] = None) -> None:
        self.directory.delete_customer(customer_id, actor=actor)

    def get_walkin_visitors(
        self, limit: int = 200, offset: int = 0, keyword: Optional[str] = None
    ) -> list[dict[str, Any]]:
        return self.directory.get_walkin_visitors(limit=limit, offset=offset, keyword=keyword)

    def get_cards(
        self, only_available: bool = False, exclude_pass_bound: bool = True
    ) -> list[dict[str, Any]]:
        return self.directory.get_cards(
            only_available=only_available, exclude_pass_bound=exclude_pass_bound
        )

    def get_cards_detail(
        self,
        status_filter: Optional[int] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.directory.get_cards_detail(
            status_filter=status_filter, keyword=keyword, limit=limit, offset=offset
        )

    def create_card(self, code: str, actor: Optional[AuditActor] = None) -> int:
        return self.directory.create_card(code, actor=actor)

    def set_card_status(
        self, card_id: int, status: int, actor: Optional[AuditActor] = None
    ) -> None:
        self.directory.set_card_status(card_id, status, actor=actor)

    def delete_card(self, card_id: int, actor: Optional[AuditActor] = None) -> None:
        self.directory.delete_card(card_id, actor=actor)

    def get_vehicles_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.directory.get_vehicles_detail(keyword=keyword, limit=limit, offset=offset)

    def update_vehicle(
        self,
        vehicle_id: int,
        plate: str,
        vehicle_type_id: int,
        actor: Optional[AuditActor] = None,
    ) -> None:
        self.directory.update_vehicle(vehicle_id, plate, vehicle_type_id, actor=actor)

    def delete_vehicle(self, vehicle_id: int, actor: Optional[AuditActor] = None) -> None:
        self.directory.delete_vehicle(vehicle_id, actor=actor)

    # Deprecated UI HTML template delegation for legacy Streamlit compatibility
    build_ticket_html = staticmethod(build_ticket_html)
    build_receipt_html = staticmethod(build_receipt_html)
