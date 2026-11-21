from __future__ import annotations

from datetime import date
from typing import Any, Optional

from core.exceptions import ConflictError, NotFoundError, ValidationError
from services.db_service import DBService
from services.domain.base import (
    AuditActor,
    vn_date_range_utc_bounds,
    write_audit_in_tx,
)

_ALLOWED_TX_SORT = {
    "ma_gd": "tt.id",
    "giothanhtoan": "tt.giothanhtoan",
    "chiphi": "tt.chiphi",
    "trangthai": "tt.trangthai",
}


class BillingService:
    """Domain service managing tariffs, payment history, refunds, and cashier shift handover."""

    def __init__(self, db: DBService) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Tariffs
    # ------------------------------------------------------------------

    def get_tariffs(self) -> list[dict[str, Any]]:
        return self.db.fetch_all(
            """
            SELECT
                bg.id,
                bg.loaive,
                bg.dongia,
                lpt.tenloai AS loaiphuongtien,
                COALESCE(lkh.tenloai, 'Khách vãng lai') AS loaikhachhang,
                bg.idlpt,
                bg.idlkh
            FROM banggia bg
            LEFT JOIN loaiphuongtien lpt ON lpt.id = bg.idlpt
            LEFT JOIN loaikhachhang lkh ON lkh.id = bg.idlkh
            ORDER BY bg.loaive, bg.idlpt, bg.idlkh
            """
        )

    def create_tariff(
        self,
        ticket_type: str,
        unit_price: int,
        vehicle_type_id: int,
        customer_type_id: Optional[int],
        actor: Optional[AuditActor] = None,
    ) -> int:
        t_type = ticket_type.strip().lower()
        if t_type not in ("ngày", "tháng"):
            raise ValidationError("Loại vé chỉ nhận 'ngày' hoặc 'tháng'.")
        if unit_price < 0:
            raise ValidationError("Đơn giá không được âm.")

        with self.db.transaction() as cursor:
            if customer_type_id is None:
                cursor.execute(
                    "SELECT id FROM banggia WHERE loaive = %s AND idlpt = %s AND idlkh IS NULL LIMIT 1",
                    (t_type, vehicle_type_id),
                )
            else:
                cursor.execute(
                    "SELECT id FROM banggia WHERE loaive = %s AND idlpt = %s AND idlkh = %s LIMIT 1",
                    (t_type, vehicle_type_id, customer_type_id),
                )
            if cursor.fetchone() is not None:
                raise ConflictError("Biểu giá cho cấu hình loại vé/phương tiện/đối tượng này đã tồn tại.")

            cursor.execute(
                """
                INSERT INTO banggia (loaive, dongia, idlpt, idlkh)
                VALUES (%s, %s, %s, %s)
                """,
                (t_type, unit_price, vehicle_type_id, customer_type_id),
            )
            tariff_id = int(cursor.lastrowid)
            write_audit_in_tx(
                cursor,
                actor,
                "CREATE_TARIFF",
                "banggia",
                tariff_id,
                {
                    "ticket_type": t_type,
                    "unit_price": unit_price,
                    "vehicle_type_id": vehicle_type_id,
                    "customer_type_id": customer_type_id,
                },
            )
            return tariff_id

    def update_tariff(
        self,
        tariff_id: int,
        unit_price: int,
        actor: Optional[AuditActor] = None,
    ) -> None:
        if unit_price < 0:
            raise ValidationError("Đơn giá không được âm.")
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id, dongia FROM banggia WHERE id = %s FOR UPDATE", (tariff_id,))
            existing = cursor.fetchone()
            if existing is None:
                raise NotFoundError("Biểu giá không tồn tại.")
            cursor.execute("UPDATE banggia SET dongia = %s WHERE id = %s", (unit_price, tariff_id))
            write_audit_in_tx(
                cursor,
                actor,
                "UPDATE_TARIFF",
                "banggia",
                tariff_id,
                {"old_price": existing.get("dongia"), "new_price": unit_price},
            )

    def delete_tariff(self, tariff_id: int, actor: Optional[AuditActor] = None) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM banggia WHERE id = %s FOR UPDATE", (tariff_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Biểu giá không tồn tại.")
            cursor.execute("SELECT id FROM luotdo WHERE idbg = %s LIMIT 1", (tariff_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Bảng giá đã phát sinh lượt đỗ, không thể xóa.")
            cursor.execute("SELECT id FROM vethang WHERE idbg = %s LIMIT 1", (tariff_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Bảng giá đã gắn với vé tháng, không thể xóa.")
            cursor.execute("DELETE FROM banggia WHERE id = %s", (tariff_id,))
            write_audit_in_tx(cursor, actor, "DELETE_TARIFF", "banggia", tariff_id)

    # ------------------------------------------------------------------
    # Transactions (SQL-level Filtering, Sorting & Pagination)
    # ------------------------------------------------------------------

    def _build_transactions_where(
        self,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        vehicle_type_id: Optional[int] = None,
        keyword: Optional[str] = None,
        status_filter: Optional[str] = None,
        payment_method: Optional[str] = None,
        employee_id: Optional[int] = None,
    ) -> tuple[str, list[Any]]:
        conditions: list[str] = []
        params: list[Any] = []
        start_utc, end_utc = vn_date_range_utc_bounds(date_from, date_to)
        if start_utc is not None:
            conditions.append("tt.giothanhtoan >= %s")
            params.append(start_utc)
        if end_utc is not None:
            conditions.append("tt.giothanhtoan < %s")
            params.append(end_utc)
        if vehicle_type_id is not None:
            # Match both parking-turn vehicles AND monthly-pass purchase/renewal vehicles
            conditions.append("COALESCE(pt.idlpt, pt_vt.idlpt) = %s")
            params.append(vehicle_type_id)
        if status_filter and status_filter.strip():
            conditions.append("tt.trangthai = %s")
            params.append(status_filter.strip())
        if payment_method and payment_method.strip():
            conditions.append("tt.loaithanhtoan = %s")
            params.append(payment_method.strip())
        if employee_id is not None:
            conditions.append("tt.idnv = %s")
            params.append(employee_id)
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append(
                "("
                "COALESCE(pt.bienso, pt_vt.bienso, '') LIKE %s "
                "OR COALESCE(tx.maso, tx_vt.maso, '') LIKE %s "
                "OR COALESCE(nv.hoten, '') LIKE %s "
                "OR CAST(tt.id AS CHAR) LIKE %s"
                ")"
            )
            params.extend([like, like, like, like])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        return where_clause, params

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
        """Query payment history with sargable UTC range bounds and SQL-level keyword search."""
        where_clause, params = self._build_transactions_where(
            date_from=date_from,
            date_to=date_to,
            vehicle_type_id=vehicle_type_id,
            keyword=keyword,
            status_filter=status_filter,
            payment_method=payment_method,
            employee_id=employee_id,
        )
        sort_col = _ALLOWED_TX_SORT.get(sort_by, "tt.giothanhtoan")
        direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                tt.id AS ma_gd,
                COALESCE(pt.bienso, pt_vt.bienso) AS bienso,
                COALESCE(lpt.tenloai, lpt_vt.tenloai) AS loaiphuongtien,
                COALESCE(tx.maso, tx_vt.maso) AS mathe,
                COALESCE(b.tenbaido, b_nv.tenbaido) AS tenbaido,
                CASE
                    WHEN k.ten IS NOT NULL AND v.sothutu IS NOT NULL THEN CONCAT(k.ten, '-', v.sothutu)
                    ELSE 'Vé tháng'
                END AS vitri,
                ld.giovao,
                ld.giora,
                tt.giothanhtoan,
                tt.chiphi,
                CASE
                    WHEN tt.idvt IS NOT NULL AND tt.idld IS NULL THEN 'Đăng ký/Gia hạn vé tháng'
                    WHEN tt.idvt IS NOT NULL THEN 'Vé tháng'
                    ELSE 'Vé ngày'
                END AS hinhthuc,
                CASE
                    WHEN tt.loaithanhtoan IN ('0', '1', '') OR tt.loaithanhtoan IS NULL THEN 'Tiền mặt'
                    ELSE tt.loaithanhtoan
                END AS loaithanhtoan,
                tt.idvt AS ma_ve_thang,
                tt.trangthai,
                nv_in.hoten AS nv_tiep_nhan,
                nv.hoten AS nhanvien
            FROM thanhtoan tt
            LEFT JOIN luotdo ld ON ld.id = tt.idld
            LEFT JOIN vitrido v ON v.id = ld.idvtd
            LEFT JOIN khuvucdo k ON k.id = v.idkvd
            LEFT JOIN baidoxe b ON b.id = k.idbdx
            JOIN nhanvien nv ON nv.id = tt.idnv
            LEFT JOIN baidoxe b_nv ON b_nv.id = nv.idbdx
            LEFT JOIN nhanvien nv_in ON nv_in.id = ld.idnv
            LEFT JOIN thexe tx ON tx.id = ld.idtx
            LEFT JOIN phuongtien pt ON pt.id = ld.idpt
            LEFT JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
            LEFT JOIN vethang vt ON vt.id = tt.idvt
            LEFT JOIN thexe tx_vt ON tx_vt.id = vt.idtx
            LEFT JOIN phuongtien pt_vt ON pt_vt.id = vt.idpt
            LEFT JOIN loaiphuongtien lpt_vt ON lpt_vt.id = pt_vt.idlpt
            {where_clause}
            ORDER BY {sort_col} {direction}, tt.id DESC
            LIMIT %s OFFSET %s
            """,
            params,
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
        where_clause, params = self._build_transactions_where(
            date_from=date_from,
            date_to=date_to,
            vehicle_type_id=vehicle_type_id,
            keyword=keyword,
            status_filter=status_filter,
            payment_method=payment_method,
            employee_id=employee_id,
        )
        row = self.db.fetch_one(
            f"""
            SELECT COUNT(*) AS cnt
            FROM thanhtoan tt
            LEFT JOIN luotdo ld ON ld.id = tt.idld
            JOIN nhanvien nv ON nv.id = tt.idnv
            LEFT JOIN thexe tx ON tx.id = ld.idtx
            LEFT JOIN phuongtien pt ON pt.id = ld.idpt
            LEFT JOIN vethang vt ON vt.id = tt.idvt
            LEFT JOIN thexe tx_vt ON tx_vt.id = vt.idtx
            LEFT JOIN phuongtien pt_vt ON pt_vt.id = vt.idpt
            {where_clause}
            """,
            params or None,
        )
        return int((row or {}).get("cnt") or 0)

    def update_payment_status(
        self,
        payment_id: int,
        new_status: str,
        actor: Optional[AuditActor] = None,
    ) -> None:
        """Update payment status atomically with audit diff (refunds automatically exclude from net shift cash)."""
        allowed = ("Thành công", "Hoàn tiền", "Thất bại")
        cleaned = new_status.strip()
        if cleaned not in allowed:
            raise ValidationError(f"Trạng thái giao dịch chỉ hỗ trợ: {', '.join(allowed)}.")
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id, trangthai, chiphi FROM thanhtoan WHERE id = %s FOR UPDATE", (payment_id,))
            existing = cursor.fetchone()
            if existing is None:
                raise NotFoundError("Giao dịch thanh toán không tồn tại.")
            cursor.execute("UPDATE thanhtoan SET trangthai = %s WHERE id = %s", (cleaned, payment_id))
            write_audit_in_tx(
                cursor,
                actor,
                "UPDATE_PAYMENT_STATUS",
                "thanhtoan",
                payment_id,
                {"old_status": existing.get("trangthai"), "new_status": cleaned, "chiphi": existing.get("chiphi")},
            )

    # ------------------------------------------------------------------
    # Cashier Shifts & Reconciliation
    # ------------------------------------------------------------------

    def get_active_shift(self, employee_id: int) -> Optional[dict[str, Any]]:
        """Return currently open shift for an employee with accurate cash, transfer, and refund totals."""
        shift = self.db.fetch_one(
            """
            SELECT ca.*, nv.hoten AS ten_nhanvien, bdx.tenbaido
            FROM ca_lam_viec ca
            JOIN nhanvien nv ON nv.id = ca.idnv
            LEFT JOIN baidoxe bdx ON bdx.id = ca.idbdx
            WHERE ca.idnv = %s AND ca.status = 'OPEN'
            ORDER BY ca.id DESC
            LIMIT 1
            """,
            (employee_id,),
        )
        if not shift:
            return None

        totals = self.db.fetch_one(
            """
            SELECT
                COALESCE(SUM(CASE WHEN trangthai = 'Thành công' THEN 1 ELSE 0 END), 0) AS tx_count,
                COALESCE(SUM(CASE WHEN trangthai = 'Thành công' AND loaithanhtoan IN ('Tiền mặt', '0', '1') THEN chiphi ELSE 0 END), 0) AS cash_total,
                COALESCE(SUM(CASE WHEN trangthai = 'Thành công' AND loaithanhtoan = 'Chuyển khoản' THEN chiphi ELSE 0 END), 0) AS transfer_total,
                COALESCE(SUM(CASE WHEN trangthai = 'Hoàn tiền' THEN chiphi ELSE 0 END), 0) AS refund_total
            FROM thanhtoan
            WHERE idnv = %s
              AND giothanhtoan >= %s
            """,
            (employee_id, shift["started_at"]),
        ) or {}

        shift["live_tx_count"] = int(totals.get("tx_count") or 0)
        shift["live_cash_total"] = int(totals.get("cash_total") or 0)
        shift["live_transfer_total"] = int(totals.get("transfer_total") or 0)
        shift["live_refund_total"] = int(totals.get("refund_total") or 0)
        shift["live_expected_cash"] = int(shift.get("opening_cash") or 0) + shift["live_cash_total"]
        return shift

    def open_shift(
        self,
        employee_id: int,
        lot_id: Optional[int],
        opening_cash: int = 0,
        note: str = "",
        actor: Optional[AuditActor] = None,
    ) -> int:
        """Open a new shift atomically, locking employee row to prevent duplicate OPEN shifts."""
        if opening_cash < 0:
            raise ValidationError("Tiền đầu ca không được âm.")
        clean_note = note.strip()[:255] or None

        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM nhanvien WHERE id = %s FOR UPDATE", (employee_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Không tìm thấy nhân viên.")
            cursor.execute(
                "SELECT id FROM ca_lam_viec WHERE idnv = %s AND status = 'OPEN' LIMIT 1 FOR UPDATE",
                (employee_id,),
            )
            if cursor.fetchone() is not None:
                raise ConflictError("Nhân viên đang có một ca làm việc chưa đóng.")
            cursor.execute(
                """
                INSERT INTO ca_lam_viec (idnv, idbdx, started_at, opening_cash, note, status)
                VALUES (%s, %s, UTC_TIMESTAMP(), %s, %s, 'OPEN')
                """,
                (employee_id, lot_id, opening_cash, clean_note),
            )
            shift_id = int(cursor.lastrowid)
            write_audit_in_tx(
                cursor,
                actor,
                "OPEN_SHIFT",
                "ca_lam_viec",
                shift_id,
                {"lot_id": lot_id, "opening_cash": opening_cash, "note": clean_note},
            )
            return shift_id

    def close_shift(
        self,
        shift_id: int,
        employee_id: int,
        actual_cash: int,
        note: str = "",
        actor: Optional[AuditActor] = None,
    ) -> dict[str, Any]:
        """Close an open shift atomically and reconcile cash, transfers, and refunds."""
        if actual_cash < 0:
            raise ValidationError("Tiền bàn giao thực tế không được âm.")
        clean_note = note.strip()[:255]

        with self.db.transaction() as cursor:
            cursor.execute(
                "SELECT * FROM ca_lam_viec WHERE id = %s AND idnv = %s FOR UPDATE",
                (shift_id, employee_id),
            )
            shift = cursor.fetchone()
            if not shift:
                raise NotFoundError("Không tìm thấy ca làm việc.")
            if shift["status"] != "OPEN":
                raise ConflictError("Ca làm việc này đã được đóng trước đó.")

            cursor.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN trangthai = 'Thành công' AND loaithanhtoan IN ('Tiền mặt', '0', '1') THEN chiphi ELSE 0 END), 0) AS cash_total,
                    COALESCE(SUM(CASE WHEN trangthai = 'Thành công' AND loaithanhtoan = 'Chuyển khoản' THEN chiphi ELSE 0 END), 0) AS transfer_total,
                    COALESCE(SUM(CASE WHEN trangthai = 'Hoàn tiền' THEN chiphi ELSE 0 END), 0) AS refund_total
                FROM thanhtoan
                WHERE idnv = %s
                  AND giothanhtoan >= %s
                """,
                (employee_id, shift["started_at"]),
            )
            totals = cursor.fetchone() or {}
            cash_total = int(totals.get("cash_total") or 0)
            transfer_total = int(totals.get("transfer_total") or 0)
            refund_total = int(totals.get("refund_total") or 0)
            expected_cash = int(shift.get("opening_cash") or 0) + cash_total

            cursor.execute(
                """
                UPDATE ca_lam_viec
                SET ended_at = UTC_TIMESTAMP(),
                    expected_cash = %s,
                    actual_cash = %s,
                    transfer_total = %s,
                    note = COALESCE(NULLIF(%s, ''), note),
                    status = 'CLOSED'
                WHERE id = %s
                """,
                (expected_cash, actual_cash, transfer_total, clean_note, shift_id),
            )
            result = {
                "shift_id": shift_id,
                "expected_cash": expected_cash,
                "actual_cash": actual_cash,
                "transfer_total": transfer_total,
                "refund_total": refund_total,
                "diff": actual_cash - expected_cash,
            }
            write_audit_in_tx(cursor, actor, "CLOSE_SHIFT", "ca_lam_viec", shift_id, result)
            return result

    def get_shifts(
        self,
        limit: int = 50,
        offset: int = 0,
        employee_id: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """List cashier/operator shifts with optional employee scoping and pagination."""
        where_clause = "WHERE ca.idnv = %s" if employee_id is not None else ""
        params: list[Any] = [employee_id] if employee_id is not None else []
        params.extend([int(limit), max(0, int(offset))])
        return self.db.fetch_all(
            f"""
            SELECT ca.*, nv.hoten AS ten_nhanvien, bdx.tenbaido
            FROM ca_lam_viec ca
            JOIN nhanvien nv ON nv.id = ca.idnv
            LEFT JOIN baidoxe bdx ON bdx.id = ca.idbdx
            {where_clause}
            ORDER BY ca.id DESC
            LIMIT %s OFFSET %s
            """,
            params,
        )

    def count_shifts(self, employee_id: Optional[int] = None) -> int:
        where_clause = "WHERE idnv = %s" if employee_id is not None else ""
        params = (employee_id,) if employee_id is not None else None
        row = self.db.fetch_one(f"SELECT COUNT(*) AS cnt FROM ca_lam_viec {where_clause}", params)
        return int((row or {}).get("cnt") or 0)
