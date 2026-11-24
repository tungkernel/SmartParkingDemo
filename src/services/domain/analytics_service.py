from __future__ import annotations

from datetime import timedelta
from typing import Any, Optional

from services.db_service import DBService
from services.domain.base import (
    OverviewMetrics,
    utc_now,
    vn_day_utc_bounds,
    vn_today,
)


class AnalyticsService:
    """Domain service for KPIs, sargable revenue analytics, and operational alerts."""

    def __init__(self, db: DBService) -> None:
        self.db = db

    def get_overview_metrics(self, lot_id: Optional[int] = None) -> OverviewMetrics:
        """Compute real-time KPI metrics using sargable VN-day UTC bounds."""
        today_vn = vn_today()
        today_str = today_vn.strftime("%Y-%m-%d")
        today_start_utc, today_end_utc = vn_day_utc_bounds(today_vn)

        if lot_id is not None:
            slot_row = self.db.fetch_one(
                """
                SELECT
                    COUNT(*) AS total_slots,
                    COALESCE(SUM(CASE WHEN v.trangthai = 1 THEN 1 ELSE 0 END), 0) AS available_slots,
                    COALESCE(SUM(CASE WHEN v.trangthai = 0 THEN 1 ELSE 0 END), 0) AS occupied_slots
                FROM vitrido v
                JOIN khuvucdo k ON k.id = v.idkvd
                WHERE k.idbdx = %s
                """,
                (lot_id,),
            ) or {}
            active_row = self.db.fetch_one(
                """
                SELECT COUNT(*) AS active_count
                FROM luotdo ld
                JOIN vitrido v ON v.id = ld.idvtd
                JOIN khuvucdo k ON k.id = v.idkvd
                WHERE k.idbdx = %s
                  AND NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id)
                """,
                (lot_id,),
            ) or {}
        else:
            slot_row = self.db.fetch_one(
                """
                SELECT
                    COUNT(*) AS total_slots,
                    COALESCE(SUM(CASE WHEN trangthai = 1 THEN 1 ELSE 0 END), 0) AS available_slots,
                    COALESCE(SUM(CASE WHEN trangthai = 0 THEN 1 ELSE 0 END), 0) AS occupied_slots
                FROM vitrido
                """
            ) or {}
            active_row = self.db.fetch_one(
                """
                SELECT COUNT(*) AS active_count
                FROM luotdo ld
                WHERE NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id)
                """
            ) or {}

        if lot_id is not None:
            rev_row = self.db.fetch_one(
                """
                SELECT
                    COALESCE(SUM(tt.chiphi), 0) AS total_revenue,
                    COALESCE(SUM(CASE WHEN tt.giothanhtoan >= %s AND tt.giothanhtoan < %s THEN tt.chiphi ELSE 0 END), 0) AS today_revenue
                FROM thanhtoan tt
                LEFT JOIN luotdo ld ON ld.id = tt.idld
                LEFT JOIN vitrido v ON v.id = ld.idvtd
                LEFT JOIN khuvucdo k ON k.id = v.idkvd
                LEFT JOIN nhanvien nv ON nv.id = tt.idnv
                WHERE tt.trangthai = 'Thành công'
                  AND COALESCE(k.idbdx, nv.idbdx) = %s
                """,
                (today_start_utc, today_end_utc, lot_id),
            ) or {}
        else:
            rev_row = self.db.fetch_one(
                """
                SELECT
                    COALESCE(SUM(chiphi), 0) AS total_revenue,
                    COALESCE(SUM(CASE WHEN giothanhtoan >= %s AND giothanhtoan < %s THEN chiphi ELSE 0 END), 0) AS today_revenue
                FROM thanhtoan
                WHERE trangthai = 'Thành công'
                """,
                (today_start_utc, today_end_utc),
            ) or {}

        pass_row = self.db.fetch_one(
            """
            SELECT COUNT(*) AS active_passes
            FROM vethang
            WHERE ngaybatdau <= %s AND ngayketthuc >= %s
            """,
            (today_str, today_str),
        ) or {}

        return OverviewMetrics(
            total_slots=int(slot_row.get("total_slots") or 0),
            available_slots=int(slot_row.get("available_slots") or 0),
            occupied_slots=int(slot_row.get("occupied_slots") or 0),
            active_vehicles=int(active_row.get("active_count") or 0),
            total_revenue=int(rev_row.get("total_revenue") or 0),
            today_revenue=int(rev_row.get("today_revenue") or 0),
            active_monthly_passes=int(pass_row.get("active_passes") or 0),
        )

    def get_daily_revenue(self, days: int = 30) -> list[dict[str, Any]]:
        """Aggregate daily revenue grouped by Vietnam business date (UTC+7) using sargable cutoff."""
        start_day = vn_today() - timedelta(days=max(1, int(days)) - 1)
        start_utc, _ = vn_day_utc_bounds(start_day)
        return self.db.fetch_all(
            """
            SELECT
                DATE(DATE_ADD(giothanhtoan, INTERVAL 7 HOUR)) AS ngay,
                COUNT(*) AS so_luot,
                COALESCE(SUM(chiphi), 0) AS doanh_thu
            FROM thanhtoan
            WHERE trangthai = 'Thành công'
              AND giothanhtoan >= %s
            GROUP BY DATE(DATE_ADD(giothanhtoan, INTERVAL 7 HOUR))
            ORDER BY ngay ASC
            """,
            (start_utc,),
        )

    def get_revenue_by_vehicle_type(self) -> list[dict[str, Any]]:
        """Aggregate revenue by vehicle type including both parking turns AND monthly pass payments."""
        return self.db.fetch_all(
            """
            SELECT
                COALESCE(lpt.tenloai, lpt_vt.tenloai, 'Khác') AS loaiphuongtien,
                COUNT(tt.id) AS so_luot,
                COALESCE(SUM(tt.chiphi), 0) AS doanh_thu
            FROM thanhtoan tt
            LEFT JOIN luotdo ld ON ld.id = tt.idld
            LEFT JOIN phuongtien pt ON pt.id = ld.idpt
            LEFT JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
            LEFT JOIN vethang vt ON vt.id = tt.idvt
            LEFT JOIN phuongtien pt_vt ON pt_vt.id = vt.idpt
            LEFT JOIN loaiphuongtien lpt_vt ON lpt_vt.id = pt_vt.idlpt
            WHERE tt.trangthai = 'Thành công'
            GROUP BY COALESCE(lpt.tenloai, lpt_vt.tenloai, 'Khác')
            ORDER BY doanh_thu DESC
            """
        )

    def get_revenue_by_lot(self) -> list[dict[str, Any]]:
        """Aggregate revenue by parking lot including pass payments attributed to cashier's lot."""
        return self.db.fetch_all(
            """
            SELECT
                COALESCE(b.id, b_nv.id, 0) AS lot_id,
                COALESCE(b.tenbaido, b_nv.tenbaido, 'Toàn hệ thống / Vé tháng') AS tenbaido,
                COALESCE(b.diadiem, b_nv.diadiem, '—') AS diadiem,
                COUNT(tt.id) AS so_luot,
                COALESCE(SUM(tt.chiphi), 0) AS doanh_thu
            FROM thanhtoan tt
            LEFT JOIN luotdo ld ON ld.id = tt.idld
            LEFT JOIN vitrido v ON v.id = ld.idvtd
            LEFT JOIN khuvucdo k ON k.id = v.idkvd
            LEFT JOIN baidoxe b ON b.id = k.idbdx
            LEFT JOIN nhanvien nv ON nv.id = tt.idnv
            LEFT JOIN baidoxe b_nv ON b_nv.id = nv.idbdx
            WHERE tt.trangthai = 'Thành công'
            GROUP BY
                COALESCE(b.id, b_nv.id, 0),
                COALESCE(b.tenbaido, b_nv.tenbaido, 'Toàn hệ thống / Vé tháng'),
                COALESCE(b.diadiem, b_nv.diadiem, '—')
            ORDER BY doanh_thu DESC
            """
        )

    def get_operational_alerts(
        self,
        overdue_hours: int = 24,
        pass_expiring_days: int = 7,
        lot_id: Optional[int] = None,
    ) -> dict[str, Any]:
        """Return active operational alerts using sargable UTC timestamp cutoffs."""
        cutoff_utc = (utc_now() - timedelta(hours=max(1, int(overdue_hours)))).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        today_vn = vn_today()
        today_str = today_vn.strftime("%Y-%m-%d")
        expiring_end_str = (today_vn + timedelta(days=max(1, int(pass_expiring_days)))).strftime(
            "%Y-%m-%d"
        )

        lot_cond = "AND bdx.id = %s" if lot_id is not None else ""
        overdue_params: list[Any] = [cutoff_utc]
        if lot_id is not None:
            overdue_params.append(lot_id)

        overdue_turns = self.db.fetch_all(
            f"""
            SELECT ld.id, pt.bienso, tx.maso AS ma_the, bdx.tenbaido,
                   kvd.ten AS khu_vuc, vtd.sothutu, ld.giovao,
                   TIMESTAMPDIFF(HOUR, ld.giovao, UTC_TIMESTAMP()) AS hours_parked
            FROM luotdo ld
            JOIN phuongtien pt ON pt.id = ld.idpt
            JOIN thexe tx ON tx.id = ld.idtx
            JOIN vitrido vtd ON vtd.id = ld.idvtd
            JOIN khuvucdo kvd ON kvd.id = vtd.idkvd
            JOIN baidoxe bdx ON bdx.id = kvd.idbdx
            WHERE NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id)
              AND ld.giovao <= %s
              {lot_cond}
            ORDER BY ld.giovao ASC
            """,
            overdue_params,
        )
        expiring_passes = self.db.fetch_all(
            """
            SELECT vt.id, kh.hoten AS ten_khachhang, kh.sdt, pt.bienso,
                   tx.maso AS ma_the, vt.ngayketthuc,
                   DATEDIFF(vt.ngayketthuc, %s) AS days_left
            FROM vethang vt
            JOIN khachhang kh ON kh.id = vt.idkh
            JOIN phuongtien pt ON pt.id = vt.idpt
            JOIN thexe tx ON tx.id = vt.idtx
            WHERE vt.ngayketthuc >= %s AND vt.ngayketthuc <= %s
            ORDER BY vt.ngayketthuc ASC
            """,
            (today_str, today_str, expiring_end_str),
        )
        lost_cards = self.db.fetch_all(
            "SELECT id, maso FROM thexe WHERE trangthai = 2 ORDER BY id DESC"
        )
        return {
            "overdue_turns": overdue_turns,
            "expiring_passes": expiring_passes,
            "lost_cards": lost_cards,
        }
