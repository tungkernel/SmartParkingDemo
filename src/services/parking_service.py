from __future__ import annotations

from datetime import date
from typing import Any, Optional

from core.exceptions import ValidationError
from services.db_service import DBService
from services.domain.analytics_service import AnalyticsService
from services.domain.base import FeeQuote, OverviewMetrics, normalize_plate
from services.domain.billing_service import BillingService
from services.domain.directory_service import DirectoryService
from services.domain.gate_service import GateService
from services.domain.infrastructure_service import InfrastructureService
from services.domain.pass_service import PassService

__all__ = [
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
    ) -> dict[str, Any]:
        return self.analytics.get_operational_alerts(
            overdue_hours=overdue_hours,
            pass_expiring_days=pass_expiring_days,
            lot_id=lot_id,
        )

    # Infrastructure
    def get_parking_lots(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        return self.infra.get_parking_lots(lot_id=lot_id)

    def create_parking_lot(self, name: str, location: str) -> int:
        return self.infra.create_parking_lot(name, location)

    def update_parking_lot(self, lot_id: int, name: str, location: str) -> None:
        self.infra.update_parking_lot(lot_id, name, location)

    def delete_parking_lot(self, lot_id: int) -> None:
        self.infra.delete_parking_lot(lot_id)

    def get_zones(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        return self.infra.get_zones(lot_id=lot_id)

    def get_zones_summary(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        return self.infra.get_zones_summary(lot_id=lot_id)

    def create_zone(self, lot_id: int, name: str) -> int:
        return self.infra.create_zone(lot_id, name)

    def update_zone(self, zone_id: int, lot_id: int, name: str) -> None:
        self.infra.update_zone(zone_id, lot_id, name)

    def delete_zone(self, zone_id: int) -> None:
        self.infra.delete_zone(zone_id)

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

    def add_slots_to_zone(self, zone_id: int, count: int) -> int:
        return self.infra.add_slots_to_zone(zone_id, count)

    def set_slot_maintenance(self, slot_id: int, maintenance: bool) -> None:
        self.infra.set_slot_maintenance(slot_id, maintenance)

    def delete_slot(self, slot_id: int) -> None:
        self.infra.delete_slot(slot_id)

    def reconcile_slot_states(self) -> dict[str, int]:
        return self.infra.reconcile_slot_states()

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
    ) -> int:
        return self.gate.check_in_vehicle(
            license_plate=license_plate,
            vehicle_type_id=vehicle_type_id,
            slot_id=slot_id,
            card_id=card_id,
            employee_id=employee_id,
        )

    def get_fee_quote(self, turn_id: int) -> FeeQuote:
        return self.gate.get_fee_quote(turn_id)

    def check_out_vehicle(
        self,
        turn_id: int,
        employee_id: int,
        lost_card: bool = False,
        lost_card_fee: int = 0,
        payment_method: str = "Tiền mặt",
        replacement_card_id: Optional[int] = None,
    ) -> FeeQuote:
        return self.gate.check_out_vehicle(
            turn_id=turn_id,
            employee_id=employee_id,
            lost_card=lost_card,
            lost_card_fee=lost_card_fee,
            payment_method=payment_method,
            replacement_card_id=replacement_card_id,
        )

    def move_active_turn_slot(self, turn_id: int, new_slot_id: int) -> None:
        self.gate.move_active_turn_slot(turn_id, new_slot_id)

    def cancel_active_turn(self, turn_id: int) -> None:
        self.gate.cancel_active_turn(turn_id)

    # Monthly Passes
    def get_monthly_passes(
        self,
        status_filter: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.passes.get_monthly_passes(
            status_filter=status_filter,
            keyword=keyword,
            limit=limit,
            offset=offset,
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
        )

    def renew_monthly_pass(
        self,
        pass_id: int,
        months: int,
        employee_id: Optional[int] = None,
        payment_method: str = "Tiền mặt",
    ) -> dict[str, Any]:
        return self.passes.renew_monthly_pass(
            pass_id=pass_id,
            months=months,
            employee_id=employee_id,
            payment_method=payment_method,
        )

    def update_monthly_pass_assets(
        self,
        pass_id: int,
        plate: str,
        vehicle_type_id: int,
        new_card_id: int,
    ) -> None:
        self.passes.update_monthly_pass_assets(pass_id, plate, vehicle_type_id, new_card_id)

    def cancel_monthly_pass(self, pass_id: int) -> None:
        self.passes.cancel_monthly_pass(pass_id)

    def get_monthly_pass_revenue_summary(self) -> dict[str, Any]:
        return self.passes.get_monthly_pass_revenue_summary()

    # Billing & Tariffs
    def get_tariffs(self) -> list[dict[str, Any]]:
        return self.billing.get_tariffs()

    def create_tariff(
        self,
        ticket_type: str,
        unit_price: int,
        vehicle_type_id: int,
        customer_type_id: Optional[int],
    ) -> int:
        return self.billing.create_tariff(
            ticket_type, unit_price, vehicle_type_id, customer_type_id
        )

    def update_tariff(self, tariff_id: int, unit_price: int) -> None:
        self.billing.update_tariff(tariff_id, unit_price)

    def delete_tariff(self, tariff_id: int) -> None:
        self.billing.delete_tariff(tariff_id)

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

    def update_payment_status(self, payment_id: int, new_status: str) -> None:
        self.billing.update_payment_status(payment_id, new_status)

    # Directory (People, Cards, Vehicles, Catalogs)
    def resolve_employee_id(
        self,
        requested_employee_id: Optional[int],
        lot_id: Optional[int] = None,
        preferred_role: Optional[str] = None,
    ) -> int:
        return self.directory.resolve_employee_id(
            requested_employee_id, lot_id=lot_id, preferred_role=preferred_role
        )

    def get_vehicle_types(self) -> list[dict[str, Any]]:
        return self.directory.get_vehicle_types()

    def get_customer_types(self) -> list[dict[str, Any]]:
        return self.directory.get_customer_types()

    def get_employees(self) -> list[dict[str, Any]]:
        return self.directory.get_employees()

    def get_employees_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.directory.get_employees_detail(
            keyword=keyword, limit=limit, offset=offset
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
        )

    def delete_employee(self, emp_id: int) -> None:
        self.directory.delete_employee(emp_id)

    def get_customers_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.directory.get_customers_detail(
            keyword=keyword, limit=limit, offset=offset
        )

    def update_customer(
        self,
        customer_id: int,
        full_name: str,
        phone: str,
        cccd: str,
        customer_type_id: int,
    ) -> None:
        self.directory.update_customer(
            customer_id, full_name, phone, cccd, customer_type_id
        )

    def delete_customer(self, customer_id: int) -> None:
        self.directory.delete_customer(customer_id)

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

    def create_card(self, code: str) -> int:
        return self.directory.create_card(code)

    def set_card_status(self, card_id: int, status: int) -> None:
        self.directory.set_card_status(card_id, status)

    def delete_card(self, card_id: int) -> None:
        self.directory.delete_card(card_id)

    def get_vehicles_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self.directory.get_vehicles_detail(keyword=keyword, limit=limit, offset=offset)

    def update_vehicle(self, vehicle_id: int, plate: str, vehicle_type_id: int) -> None:
        self.directory.update_vehicle(vehicle_id, plate, vehicle_type_id)

    def delete_vehicle(self, vehicle_id: int) -> None:
        self.directory.delete_vehicle(vehicle_id)
