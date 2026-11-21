from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Optional

from core.exceptions import ConflictError, NotFoundError, ValidationError
from services.db_service import DBService
from services.domain.base import (
    AuditActor,
    mask_cccd,
    mask_phone,
    normalize_payment_method,
    normalize_plate,
    require_text,
    utc_now_str,
    vn_date_range_utc_bounds,
    vn_today,
    write_audit_in_tx,
)


class PassService:
    """Domain service managing monthly parking passes and pass revenue aggregation."""

    def __init__(self, db: DBService) -> None:
        self.db = db

    def get_monthly_passes(
        self,
        status_filter: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        redact_pii: bool = False,
    ) -> list[dict[str, Any]]:
        """List monthly passes with optional status/keyword SQL filtering and pagination."""
        today_str = vn_today().strftime("%Y-%m-%d")
        conditions: list[str] = []
        params: list[Any] = [today_str, today_str]
        if status_filter == "active":
            conditions.append("vt.ngayketthuc >= %s")
            params.append(today_str)
        elif status_filter == "expired":
            conditions.append("vt.ngayketthuc < %s")
            params.append(today_str)
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(kh.hoten LIKE %s OR pt.bienso LIKE %s OR tx.maso LIKE %s OR kh.sdt LIKE %s)")
            params.extend([like, like, like, like])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT %s OFFSET %s"
            params.extend([int(limit), max(0, int(offset))])

        rows = self.db.fetch_all(
            f"""
            SELECT
                vt.id,
                kh.hoten,
                kh.sdt,
                kh.cccd,
                lkh.tenloai AS loaikhachhang,
                pt.bienso,
                pt.idlpt AS vehicle_type_id,
                lpt.tenloai AS loaiphuongtien,
                tx.id AS card_id,
                tx.maso AS mathe,
                bg.dongia,
                vt.ngaybatdau,
                vt.ngayketthuc,
                CASE
                    WHEN vt.ngayketthuc >= %s THEN 'active'
                    ELSE 'expired'
                END AS status_code,
                CASE
                    WHEN vt.ngayketthuc >= %s THEN 'Còn hạn'
                    ELSE 'Hết hạn'
                END AS trangthai
            FROM vethang vt
            JOIN khachhang kh ON kh.id = vt.idkh
            LEFT JOIN loaikhachhang lkh ON lkh.id = kh.idlkh
            LEFT JOIN phuongtien pt ON pt.id = vt.idpt
            LEFT JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
            LEFT JOIN thexe tx ON tx.id = vt.idtx
            LEFT JOIN banggia bg ON bg.id = vt.idbg
            {where_clause}
            ORDER BY vt.id DESC
            {limit_clause}
            """,
            params,
        )
        if redact_pii:
            for row in rows:
                row["sdt"] = mask_phone(row.get("sdt"))
                row["cccd"] = mask_cccd(row.get("cccd"))
        return rows

    def count_monthly_passes(
        self,
        status_filter: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> int:
        today_str = vn_today().strftime("%Y-%m-%d")
        conditions: list[str] = []
        params: list[Any] = []
        if status_filter == "active":
            conditions.append("vt.ngayketthuc >= %s")
            params.append(today_str)
        elif status_filter == "expired":
            conditions.append("vt.ngayketthuc < %s")
            params.append(today_str)
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(kh.hoten LIKE %s OR pt.bienso LIKE %s OR tx.maso LIKE %s OR kh.sdt LIKE %s)")
            params.extend([like, like, like, like])
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        row = self.db.fetch_one(
            f"""
            SELECT COUNT(*) AS cnt
            FROM vethang vt
            JOIN khachhang kh ON kh.id = vt.idkh
            LEFT JOIN phuongtien pt ON pt.id = vt.idpt
            LEFT JOIN thexe tx ON tx.id = vt.idtx
            {where_clause}
            """,
            params or None,
        )
        return int((row or {}).get("cnt") or 0)

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
        """Register a new monthly parking pass atomically with overlap & card locking checks."""
        hoten_clean = require_text(hoten, "Họ tên khách hàng", 60)
        sdt_clean = require_text(sdt, "Số điện thoại", 20)
        cccd_clean = require_text(cccd, "CCCD", 15)
        if months < 1 or months > 12:
            raise ValidationError("Số tháng đăng ký phải từ 1 đến 12.")
        clean_method = normalize_payment_method(payment_method)

        plate = normalize_plate(license_plate)
        start_date = vn_today()
        end_date = start_date + timedelta(days=30 * months)
        today_str = start_date.strftime("%Y-%m-%d")
        now_utc_str = utc_now_str()

        with self.db.transaction() as cursor:
            cursor.execute(
                """
                SELECT id, dongia FROM banggia
                WHERE loaive = 'tháng' AND idlpt = %s AND idlkh = %s
                LIMIT 1
                """,
                (vehicle_type_id, customer_type_id),
            )
            tariff = cursor.fetchone()
            if tariff is None:
                raise NotFoundError("Không tìm thấy đơn giá vé tháng cho cấu hình này.")

            cursor.execute(
                "SELECT id, trangthai FROM thexe WHERE id = %s FOR UPDATE",
                (card_id,),
            )
            card = cursor.fetchone()
            if card is None or int(card["trangthai"]) != 1:
                raise ConflictError("Thẻ xe không ở trạng thái sẵn sàng.")

            cursor.execute(
                """
                SELECT id FROM vethang
                WHERE idtx = %s AND ngayketthuc >= %s
                LIMIT 1
                """,
                (card_id, today_str),
            )
            if cursor.fetchone() is not None:
                raise ConflictError("Thẻ xe đang được gắn với một vé tháng khác còn hiệu lực.")

            cursor.execute("SELECT id FROM khachhang WHERE cccd = %s FOR UPDATE", (cccd_clean,))
            customer = cursor.fetchone()
            if customer is None:
                cursor.execute(
                    "INSERT INTO khachhang (hoten, sdt, cccd, idlkh) VALUES (%s, %s, %s, %s)",
                    (hoten_clean, sdt_clean, cccd_clean, customer_type_id),
                )
                customer_id = int(cursor.lastrowid)
            else:
                customer_id = int(customer["id"])
                cursor.execute(
                    "UPDATE khachhang SET hoten = %s, sdt = %s, idlkh = %s WHERE id = %s",
                    (hoten_clean, sdt_clean, customer_type_id, customer_id),
                )

            cursor.execute("SELECT id, idlpt FROM phuongtien WHERE bienso = %s FOR UPDATE", (plate,))
            vehicle = cursor.fetchone()
            if vehicle is None:
                cursor.execute(
                    "INSERT INTO phuongtien (bienso, idlpt) VALUES (%s, %s)",
                    (plate, vehicle_type_id),
                )
                vehicle_id = int(cursor.lastrowid)
            else:
                vehicle_id = int(vehicle["id"])
                if vehicle.get("idlpt") is not None and int(vehicle["idlpt"]) != int(vehicle_type_id):
                    raise ValidationError(
                        f"Biển số {plate} đã được đăng ký với loại phương tiện khác."
                    )

            cursor.execute(
                """
                SELECT id FROM vethang
                WHERE idpt = %s AND ngayketthuc >= %s
                LIMIT 1
                """,
                (vehicle_id, today_str),
            )
            if cursor.fetchone() is not None:
                raise ConflictError(f"Phương tiện {plate} đã có vé tháng còn hiệu lực. Vui lòng gia hạn thay vì đăng ký mới.")

            cursor.execute(
                """
                INSERT INTO vethang (ngaybatdau, ngayketthuc, idtx, idpt, idbg, idkh)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"), card_id, vehicle_id, int(tariff["id"]), customer_id),
            )
            pass_id = int(cursor.lastrowid)
            amount = int(tariff.get("dongia") or 0) * months
            if employee_id is not None:
                cursor.execute(
                    """
                    INSERT INTO thanhtoan (idld, chiphi, giothanhtoan, trangthai, idnv, loaithanhtoan, idvt)
                    VALUES (NULL, %s, %s, 'Thành công', %s, %s, %s)
                    """,
                    (amount, now_utc_str, employee_id, clean_method, pass_id),
                )
            write_audit_in_tx(
                cursor,
                actor,
                "REGISTER_PASS",
                "vethang",
                pass_id,
                {"plate": plate, "months": months, "amount": amount, "payment_method": clean_method},
            )
            return pass_id

    def renew_monthly_pass(
        self,
        pass_id: int,
        months: int,
        employee_id: Optional[int] = None,
        payment_method: str = "Tiền mặt",
        actor: Optional[AuditActor] = None,
    ) -> dict[str, Any]:
        """Extend an existing monthly pass by N 30-day periods and optionally record payment."""
        if months <= 0 or months > 24:
            raise ValidationError("Số tháng gia hạn phải từ 1 đến 24.")
        clean_method = normalize_payment_method(payment_method)
        now_utc_str = utc_now_str()
        today_vn = vn_today()

        with self.db.transaction() as cursor:
            # Lock ONLY the vethang row; read banggia without taking a shared-table FOR UPDATE lock
            cursor.execute(
                "SELECT id, ngayketthuc, idbg FROM vethang WHERE id = %s FOR UPDATE",
                (pass_id,),
            )
            row = cursor.fetchone()
            if row is None:
                raise NotFoundError("Không tìm thấy vé tháng.")
            unit_price = 0
            if row.get("idbg") is not None:
                cursor.execute("SELECT dongia FROM banggia WHERE id = %s", (row["idbg"],))
                tariff_row = cursor.fetchone()
                unit_price = int((tariff_row or {}).get("dongia") or 0)
            end_dt = row["ngayketthuc"]
            if isinstance(end_dt, str):
                end_dt = date.fromisoformat(end_dt)
            elif isinstance(end_dt, datetime):
                end_dt = end_dt.date()
            base_date = max(end_dt, today_vn)
            new_end = base_date + timedelta(days=30 * months)
            cursor.execute(
                "UPDATE vethang SET ngayketthuc = %s WHERE id = %s",
                (new_end.strftime("%Y-%m-%d"), pass_id),
            )
            amount = unit_price * months
            if employee_id is not None:
                cursor.execute(
                    """
                    INSERT INTO thanhtoan (idld, chiphi, giothanhtoan, trangthai, idnv, loaithanhtoan, idvt)
                    VALUES (NULL, %s, %s, 'Thành công', %s, %s, %s)
                    """,
                    (amount, now_utc_str, employee_id, clean_method, pass_id),
                )
            res = {"pass_id": pass_id, "new_end_date": new_end, "amount": amount}
            write_audit_in_tx(
                cursor,
                actor,
                "RENEW_PASS",
                "vethang",
                pass_id,
                {"months": months, "new_end_date": str(new_end), "amount": amount, "payment_method": clean_method},
            )
        return res

    def update_monthly_pass_assets(
        self,
        pass_id: int,
        plate: str,
        vehicle_type_id: int,
        new_card_id: int,
        actor: Optional[AuditActor] = None,
    ) -> None:
        """Reassign vehicle plate or RFID card for an existing monthly pass atomically."""
        clean_plate = normalize_plate(plate)
        today_str = vn_today().strftime("%Y-%m-%d")

        with self.db.transaction() as cursor:
            cursor.execute(
                "SELECT id, idtx FROM vethang WHERE id = %s FOR UPDATE",
                (pass_id,),
            )
            pass_row = cursor.fetchone()
            if pass_row is None:
                raise NotFoundError("Không tìm thấy vé tháng.")

            cursor.execute("SELECT id, idlpt FROM phuongtien WHERE bienso = %s FOR UPDATE", (clean_plate,))
            veh_row = cursor.fetchone()
            if veh_row:
                vehicle_id = int(veh_row["id"])
            else:
                cursor.execute(
                    "INSERT INTO phuongtien (bienso, idlpt) VALUES (%s, %s)",
                    (clean_plate, vehicle_type_id),
                )
                vehicle_id = int(cursor.lastrowid)

            if int(new_card_id) != int(pass_row["idtx"] or 0):
                cursor.execute(
                    "SELECT id, trangthai FROM thexe WHERE id = %s FOR UPDATE",
                    (new_card_id,),
                )
                card = cursor.fetchone()
                if card is None or int(card["trangthai"]) != 1:
                    raise ConflictError("Thẻ mới không ở trạng thái sẵn sàng.")
                cursor.execute(
                    """
                    SELECT id FROM vethang
                    WHERE idtx = %s AND ngayketthuc >= %s AND id <> %s
                    LIMIT 1
                    """,
                    (new_card_id, today_str, pass_id),
                )
                if cursor.fetchone() is not None:
                    raise ConflictError("Thẻ mới đang được gắn với một vé tháng khác còn hiệu lực.")

            cursor.execute(
                "UPDATE vethang SET idpt = %s, idtx = %s WHERE id = %s",
                (vehicle_id, new_card_id, pass_id),
            )
            write_audit_in_tx(
                cursor,
                actor,
                "UPDATE_PASS_ASSETS",
                "vethang",
                pass_id,
                {"plate": clean_plate, "vehicle_type_id": vehicle_type_id, "new_card_id": new_card_id},
            )

    def cancel_monthly_pass(
        self,
        pass_id: int,
        actor: Optional[AuditActor] = None,
    ) -> None:
        """Expire a monthly pass early and free card if not in an active turn."""
        yesterday = (vn_today() - timedelta(days=1)).strftime("%Y-%m-%d")
        with self.db.transaction() as cursor:
            cursor.execute(
                "SELECT id, idtx, ngayketthuc FROM vethang WHERE id = %s FOR UPDATE",
                (pass_id,),
            )
            row = cursor.fetchone()
            if row is None:
                raise NotFoundError("Không tìm thấy vé tháng.")
            cursor.execute(
                "UPDATE vethang SET ngayketthuc = %s WHERE id = %s",
                (yesterday, pass_id),
            )
            cursor.execute(
                """
                SELECT id FROM luotdo
                WHERE idtx = %s
                  AND NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = luotdo.id)
                LIMIT 1
                """,
                (row["idtx"],),
            )
            if cursor.fetchone() is None and row.get("idtx") is not None:
                cursor.execute(
                    "UPDATE thexe SET trangthai = 1 WHERE id = %s AND trangthai = 0",
                    (row["idtx"],),
                )
            write_audit_in_tx(cursor, actor, "CANCEL_PASS", "vethang", pass_id)

    def get_monthly_pass_revenue_summary(self) -> dict[str, Any]:
        """Aggregate monthly pass counts and actual collected revenue (including renewals)."""
        today_vn = vn_today()
        today_str = today_vn.strftime("%Y-%m-%d")
        month_start = today_vn.replace(day=1)
        next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        month_start_utc, month_end_utc = vn_date_range_utc_bounds(
            month_start, next_month - timedelta(days=1)
        )

        pass_counts = self.db.fetch_one(
            """
            SELECT
                COUNT(*) AS total_passes,
                COALESCE(SUM(CASE WHEN vt.ngaybatdau <= %s AND vt.ngayketthuc >= %s THEN 1 ELSE 0 END), 0) AS active_passes
            FROM vethang vt
            """,
            (today_str, today_str),
        ) or {}

        # Sum real collected payments for monthly passes (idld IS NULL AND idvt IS NOT NULL),
        # plus legacy seed passes that predate payment recording
        payment_rev = self.db.fetch_one(
            """
            SELECT
                COALESCE(SUM(chiphi), 0) AS collected_total,
                COALESCE(SUM(CASE WHEN giothanhtoan >= %s AND giothanhtoan < %s THEN chiphi ELSE 0 END), 0) AS collected_month
            FROM thanhtoan
            WHERE idvt IS NOT NULL
              AND idld IS NULL
              AND trangthai = 'Thành công'
            """,
            (month_start_utc, month_end_utc),
        ) or {}

        legacy_rev = self.db.fetch_one(
            """
            SELECT
                COALESCE(SUM(COALESCE(bg.dongia, 0)), 0) AS legacy_total,
                COALESCE(SUM(CASE WHEN vt.ngaybatdau >= %s AND vt.ngaybatdau < %s THEN COALESCE(bg.dongia, 0) ELSE 0 END), 0) AS legacy_month
            FROM vethang vt
            LEFT JOIN banggia bg ON bg.id = vt.idbg
            WHERE NOT EXISTS (
                SELECT 1 FROM thanhtoan tt
                WHERE tt.idvt = vt.id AND tt.idld IS NULL AND tt.trangthai = 'Thành công'
            )
            """,
            (month_start.strftime("%Y-%m-%d"), next_month.strftime("%Y-%m-%d")),
        ) or {}

        return {
            "total_passes": int(pass_counts.get("total_passes") or 0),
            "active_passes": int(pass_counts.get("active_passes") or 0),
            "total_pass_revenue": int(payment_rev.get("collected_total") or 0)
            + int(legacy_rev.get("legacy_total") or 0),
            "this_month_pass_revenue": int(payment_rev.get("collected_month") or 0)
            + int(legacy_rev.get("legacy_month") or 0),
        }
