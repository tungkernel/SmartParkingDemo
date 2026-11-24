from __future__ import annotations

from datetime import date
from typing import Any, Optional

from core.exceptions import ConflictError, NotFoundError, ValidationError
from services.db_service import DBService
from services.domain.base import (
    normalize_plate,
    require_text,
    vn_today,
)


class DirectoryService:
    """Domain service managing catalogs, employees, customers, walk-ins, RFID cards, and vehicles."""

    def __init__(self, db: DBService) -> None:
        self.db = db

    def get_vehicle_types(self) -> list[dict[str, Any]]:
        return self.db.fetch_all("SELECT id, tenloai FROM loaiphuongtien ORDER BY id")

    def get_customer_types(self) -> list[dict[str, Any]]:
        return self.db.fetch_all("SELECT id, tenloai FROM loaikhachhang ORDER BY id")

    # ------------------------------------------------------------------
    # Employees
    # ------------------------------------------------------------------

    def resolve_employee_id(
        self,
        requested_employee_id: Optional[int],
        lot_id: Optional[int] = None,
        preferred_role: Optional[str] = None,
    ) -> int:
        """Validate explicit employee ID or pick a default by lot and preferred role."""
        if requested_employee_id is not None:
            row = self.db.fetch_one(
                "SELECT id FROM nhanvien WHERE id = %s LIMIT 1",
                (requested_employee_id,),
            )
            if row is None:
                raise NotFoundError("Nhân viên không tồn tại.")
            return int(row["id"])

        rows = self.db.fetch_all("SELECT id, idbdx, chucvu FROM nhanvien ORDER BY id ASC")
        if not rows:
            raise ValidationError("Hệ thống chưa có dữ liệu nhân viên.")

        role_kw = (preferred_role or "").strip().lower()
        if lot_id is not None and role_kw:
            for r in rows:
                if (
                    r.get("idbdx") is not None
                    and int(r["idbdx"]) == int(lot_id)
                    and role_kw in str(r.get("chucvu") or "").lower()
                ):
                    return int(r["id"])
        if role_kw:
            for r in rows:
                if role_kw in str(r.get("chucvu") or "").lower():
                    return int(r["id"])
        for r in rows:
            if "quản lý" in str(r.get("chucvu") or "").lower():
                return int(r["id"])
        return int(rows[0]["id"])

    def get_employees(self) -> list[dict[str, Any]]:
        return self.db.fetch_all(
            """
            SELECT nv.id, nv.hoten, nv.chucvu, nv.sdt, nv.idbdx, b.tenbaido
            FROM nhanvien nv
            LEFT JOIN baidoxe b ON b.id = nv.idbdx
            ORDER BY nv.id
            """
        )

    def get_employees_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(nv.hoten LIKE %s OR nv.sdt LIKE %s OR nv.chucvu LIKE %s)")
            params.extend([like, like, like])
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT %s OFFSET %s"
            params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                nv.id,
                nv.idbdx,
                nv.hoten,
                nv.chucvu,
                COALESCE(b.tenbaido, 'Toàn hệ thống') AS tenbaido,
                nv.sdt,
                nv.cccd,
                nv.email,
                nv.diachi,
                nv.ngaysinh,
                nv.ngaybatdau
            FROM nhanvien nv
            LEFT JOIN baidoxe b ON b.id = nv.idbdx
            {where_clause}
            ORDER BY nv.id
            {limit_clause}
            """,
            params or None,
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
        clean_name = require_text(full_name, "Họ tên", 60)
        clean_addr = (address or "").strip()[:255] or "Chưa cập nhật"
        clean_role = require_text(role, "Chức vụ", 30)
        clean_phone = require_text(phone, "Số điện thoại", 15)
        clean_email = (email or "").strip()[:100] or None
        clean_cccd = (cccd or "").strip()[:15] or None
        dob = (birth_date or date(2000, 1, 1)).strftime("%Y-%m-%d")
        started = (start_date or vn_today()).strftime("%Y-%m-%d")

        with self.db.transaction() as cursor:
            if clean_cccd:
                cursor.execute("SELECT id FROM nhanvien WHERE cccd = %s LIMIT 1", (clean_cccd,))
                if cursor.fetchone() is not None:
                    raise ConflictError(f"CCCD {clean_cccd} đã tồn tại trong danh sách nhân viên.")
            cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM nhanvien FOR UPDATE")
            row_id = cursor.fetchone()
            next_id = int((row_id or {}).get("next_id") or 1)
            cursor.execute(
                """
                INSERT INTO nhanvien (id, idbdx, hoten, diachi, ngaysinh, chucvu, sdt, ngaybatdau, email, cccd)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (next_id, lot_id, clean_name, clean_addr, dob, clean_role, clean_phone, started, clean_email, clean_cccd),
            )
            return next_id

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
        clean_name = require_text(full_name, "Họ tên", 60)
        clean_addr = (address or "").strip()[:255] or "Chưa cập nhật"
        clean_role = require_text(role, "Chức vụ", 30)
        clean_phone = require_text(phone, "Số điện thoại", 15)
        clean_email = (email or "").strip()[:100] or None
        clean_cccd = (cccd or "").strip()[:15] or None

        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM nhanvien WHERE id = %s FOR UPDATE", (emp_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Nhân viên không tồn tại.")
            if clean_cccd:
                cursor.execute(
                    "SELECT id FROM nhanvien WHERE cccd = %s AND id <> %s LIMIT 1",
                    (clean_cccd, emp_id),
                )
                if cursor.fetchone() is not None:
                    raise ConflictError(f"CCCD {clean_cccd} đã thuộc về nhân viên khác.")

            cursor.execute(
                """
                UPDATE nhanvien
                SET idbdx = %s, hoten = %s, diachi = %s, chucvu = %s, sdt = %s, email = %s, cccd = %s
                WHERE id = %s
                """,
                (lot_id, clean_name, clean_addr, clean_role, clean_phone, clean_email, clean_cccd, emp_id),
            )

    def delete_employee(self, emp_id: int) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM nhanvien WHERE id = %s FOR UPDATE", (emp_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Nhân viên không tồn tại.")
            for table, msg in (
                ("luotdo", "Nhân viên đã ghi nhận lượt đỗ, không thể xóa."),
                ("thanhtoan", "Nhân viên đã ghi nhận thanh toán, không thể xóa."),
            ):
                cursor.execute(f"SELECT id FROM {table} WHERE idnv = %s LIMIT 1", (emp_id,))
                if cursor.fetchone() is not None:
                    raise ConflictError(msg)
            cursor.execute("DELETE FROM nhanvien WHERE id = %s", (emp_id,))

    # ------------------------------------------------------------------
    # Customers & Walk-in Visitors
    # ------------------------------------------------------------------

    def get_customers_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        today_str = vn_today().strftime("%Y-%m-%d")
        conditions: list[str] = []
        params: list[Any] = [today_str]
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(kh.hoten LIKE %s OR kh.sdt LIKE %s OR kh.cccd LIKE %s)")
            params.extend([like, like, like])
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT %s OFFSET %s"
            params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                kh.id,
                kh.hoten,
                kh.idlkh,
                COALESCE(lkh.tenloai, 'Khác') AS loaikhachhang,
                kh.sdt,
                kh.cccd,
                COALESCE(
                    NULLIF(GROUP_CONCAT(DISTINCT pt.bienso ORDER BY pt.bienso SEPARATOR ', '), ''),
                    '—'
                ) AS bien_so_dang_ky,
                COUNT(DISTINCT CASE WHEN vt.ngayketthuc >= %s THEN vt.id END) AS so_ve_hieu_luc,
                COUNT(DISTINCT vt.id) AS tong_ve_da_dang_ky
            FROM khachhang kh
            LEFT JOIN loaikhachhang lkh ON lkh.id = kh.idlkh
            LEFT JOIN vethang vt ON vt.idkh = kh.id
            LEFT JOIN phuongtien pt ON pt.id = vt.idpt
            {where_clause}
            GROUP BY kh.id, kh.hoten, kh.idlkh, lkh.tenloai, kh.sdt, kh.cccd
            ORDER BY kh.id
            {limit_clause}
            """,
            params,
        )

    def update_customer(
        self,
        customer_id: int,
        full_name: str,
        phone: str,
        cccd: str,
        customer_type_id: int,
    ) -> None:
        clean_name = require_text(full_name, "Họ tên khách hàng", 60)
        clean_phone = require_text(phone, "Số điện thoại", 20)
        clean_cccd = require_text(cccd, "CCCD", 15)
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM khachhang WHERE id = %s FOR UPDATE", (customer_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Khách hàng không tồn tại.")
            cursor.execute(
                "SELECT id FROM khachhang WHERE cccd = %s AND id <> %s LIMIT 1",
                (clean_cccd, customer_id),
            )
            if cursor.fetchone() is not None:
                raise ConflictError(f"CCCD {clean_cccd} đã thuộc về khách hàng khác.")
            cursor.execute(
                """
                UPDATE khachhang
                SET hoten = %s, sdt = %s, cccd = %s, idlkh = %s
                WHERE id = %s
                """,
                (clean_name, clean_phone, clean_cccd, customer_type_id, customer_id),
            )

    def delete_customer(self, customer_id: int) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM khachhang WHERE id = %s FOR UPDATE", (customer_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Khách hàng không tồn tại.")
            cursor.execute("SELECT id FROM vethang WHERE idkh = %s LIMIT 1", (customer_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Khách hàng đã có lịch sử vé tháng, không thể xóa.")
            cursor.execute("DELETE FROM khachhang WHERE id = %s", (customer_id,))

    def get_walkin_visitors(
        self,
        limit: int = 200,
        offset: int = 0,
        keyword: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        conditions = [
            "tt.idvt IS NULL",
            """NOT EXISTS (
                SELECT 1
                FROM vethang vt
                WHERE vt.idpt = ld.idpt
                  AND vt.ngaybatdau <= DATE(DATE_ADD(ld.giovao, INTERVAL 7 HOUR))
                  AND vt.ngayketthuc >= DATE(DATE_ADD(ld.giovao, INTERVAL 7 HOUR))
            )""",
        ]
        params: list[Any] = []
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(pt.bienso LIKE %s OR tx.maso LIKE %s OR nv.hoten LIKE %s)")
            params.extend([like, like, like])
        params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                ld.id AS id_luotdo,
                pt.bienso,
                lpt.tenloai AS loaiphuongtien,
                tx.maso AS mathe,
                CONCAT(b.tenbaido, ' - ', k.ten, ' - Ô ', v.sothutu) AS vitri_do,
                ld.giovao,
                ld.giora,
                nv.hoten AS nhanvien,
                CASE
                    WHEN tt.id IS NULL THEN 'Đang gửi'
                    ELSE 'Đã ra bãi'
                END AS trang_thai,
                COALESCE(tt.chiphi, 0) AS chiphi,
                CASE
                    WHEN tt.id IS NULL THEN 'Chưa thanh toán'
                    WHEN tt.loaithanhtoan IN ('0', '1', '') OR tt.loaithanhtoan IS NULL THEN 'Tiền mặt'
                    ELSE tt.loaithanhtoan
                END AS loaithanhtoan
            FROM luotdo ld
            JOIN vitrido v ON v.id = ld.idvtd
            JOIN khuvucdo k ON k.id = v.idkvd
            JOIN baidoxe b ON b.id = k.idbdx
            JOIN nhanvien nv ON nv.id = ld.idnv
            LEFT JOIN phuongtien pt ON pt.id = ld.idpt
            LEFT JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
            LEFT JOIN thexe tx ON tx.id = ld.idtx
            LEFT JOIN thanhtoan tt ON tt.idld = ld.id
            WHERE {' AND '.join(conditions)}
            ORDER BY ld.giovao DESC, ld.id DESC
            LIMIT %s OFFSET %s
            """,
            params,
        )

    # ------------------------------------------------------------------
    # RFID Cards
    # ------------------------------------------------------------------

    def get_cards(
        self,
        only_available: bool = False,
        exclude_pass_bound: bool = True,
    ) -> list[dict[str, Any]]:
        """List RFID cards; when only_available=True optionally exclude or annotate pass-bound cards."""
        if not only_available:
            return self.db.fetch_all("SELECT id, maso, trangthai FROM thexe ORDER BY id")

        today_str = vn_today().strftime("%Y-%m-%d")
        if not exclude_pass_bound:
            return self.db.fetch_all(
                """
                SELECT
                    tx.id,
                    tx.maso,
                    tx.trangthai,
                    vt_act.pass_plate,
                    vt_act.pass_vehicle_type_id
                FROM thexe tx
                LEFT JOIN (
                    SELECT
                        vt.idtx,
                        pt.bienso AS pass_plate,
                        pt.idlpt AS pass_vehicle_type_id,
                        ROW_NUMBER() OVER (PARTITION BY vt.idtx ORDER BY vt.ngayketthuc DESC, vt.id DESC) AS rn
                    FROM vethang vt
                    JOIN phuongtien pt ON pt.id = vt.idpt
                    WHERE vt.ngaybatdau <= %s AND vt.ngayketthuc >= %s
                ) vt_act ON vt_act.idtx = tx.id AND vt_act.rn = 1
                WHERE tx.trangthai = 1
                ORDER BY tx.id
                """,
                (today_str, today_str),
            )

        return self.db.fetch_all(
            """
            SELECT tx.id, tx.maso, tx.trangthai
            FROM thexe tx
            WHERE tx.trangthai = 1
              AND NOT EXISTS (
                  SELECT 1
                  FROM vethang vt
                  WHERE vt.idtx = tx.id AND vt.ngayketthuc >= %s
              )
            ORDER BY tx.id
            """,
            (today_str,),
        )

    def get_cards_detail(
        self,
        status_filter: Optional[int] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        today_str = vn_today().strftime("%Y-%m-%d")
        conditions: list[str] = []
        params: list[Any] = [today_str]
        if status_filter is not None:
            conditions.append("tx.trangthai = %s")
            params.append(int(status_filter))
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(tx.maso LIKE %s OR ld_act.bienso LIKE %s OR vt_act.bienso_ve_thang LIKE %s)")
            params.extend([like, like, like])
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT %s OFFSET %s"
            params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                tx.id,
                tx.maso,
                tx.trangthai,
                ld_act.bienso AS bienso_dang_gui,
                ld_act.tenbaido,
                ld_act.khuvuc,
                ld_act.sothutu,
                ld_act.giovao,
                vt_act.ma_ve_thang,
                vt_act.chu_ve_thang,
                vt_act.bienso_ve_thang
            FROM thexe tx
            LEFT JOIN (
                SELECT
                    ld.idtx,
                    pt.bienso,
                    b.tenbaido,
                    k.ten AS khuvuc,
                    v.sothutu,
                    ld.giovao,
                    ROW_NUMBER() OVER (PARTITION BY ld.idtx ORDER BY ld.id DESC) AS rn
                FROM luotdo ld
                JOIN vitrido v ON v.id = ld.idvtd
                JOIN khuvucdo k ON k.id = v.idkvd
                JOIN baidoxe b ON b.id = k.idbdx
                LEFT JOIN phuongtien pt ON pt.id = ld.idpt
                WHERE NOT EXISTS (
                    SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id
                )
            ) ld_act ON ld_act.idtx = tx.id AND ld_act.rn = 1
            LEFT JOIN (
                SELECT
                    vt.idtx,
                    vt.id AS ma_ve_thang,
                    kh.hoten AS chu_ve_thang,
                    pt.bienso AS bienso_ve_thang,
                    ROW_NUMBER() OVER (PARTITION BY vt.idtx ORDER BY vt.ngayketthuc DESC, vt.id DESC) AS rn
                FROM vethang vt
                JOIN khachhang kh ON kh.id = vt.idkh
                JOIN phuongtien pt ON pt.id = vt.idpt
                WHERE vt.ngayketthuc >= %s
            ) vt_act ON vt_act.idtx = tx.id AND vt_act.rn = 1
            {where_clause}
            ORDER BY tx.id
            {limit_clause}
            """,
            params,
        )

    def create_card(self, code: str) -> int:
        clean_code = require_text(code, "Mã thẻ", 10)
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM thexe WHERE maso = %s LIMIT 1", (clean_code,))
            if cursor.fetchone() is not None:
                raise ConflictError(f"Mã thẻ '{clean_code}' đã tồn tại.")
            cursor.execute(
                "INSERT INTO thexe (maso, trangthai) VALUES (%s, 1)",
                (clean_code,),
            )
            return int(cursor.lastrowid)

    def set_card_status(self, card_id: int, status: int) -> None:
        if status not in (1, 2):
            raise ValidationError("Trạng thái thẻ chỉ nhận 1 (Sẵn sàng) hoặc 2 (Mất / Hỏng).")
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id, trangthai FROM thexe WHERE id = %s FOR UPDATE", (card_id,))
            card = cursor.fetchone()
            if card is None:
                raise NotFoundError("Thẻ xe không tồn tại.")
            if int(card["trangthai"]) == 0:
                raise ConflictError("Thẻ đang gắn với xe trong bãi, không thể đổi trạng thái trực tiếp.")
            cursor.execute("UPDATE thexe SET trangthai = %s WHERE id = %s", (status, card_id))

    def delete_card(self, card_id: int) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id, trangthai FROM thexe WHERE id = %s FOR UPDATE", (card_id,))
            card = cursor.fetchone()
            if card is None:
                raise NotFoundError("Thẻ xe không tồn tại.")
            if int(card["trangthai"]) == 0:
                raise ConflictError("Thẻ đang được sử dụng, không thể xóa.")
            cursor.execute("SELECT id FROM luotdo WHERE idtx = %s LIMIT 1", (card_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Thẻ đã có lịch sử lượt đỗ, chỉ có thể khóa Mất / Hỏng.")
            cursor.execute("SELECT id FROM vethang WHERE idtx = %s LIMIT 1", (card_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Thẻ đang/đã gắn với vé tháng, không thể xóa.")
            cursor.execute("DELETE FROM thexe WHERE id = %s", (card_id,))

    # ------------------------------------------------------------------
    # Vehicles (No Cartesian JOIN!)
    # ------------------------------------------------------------------

    def get_vehicles_detail(
        self,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List registered vehicles using pre-aggregated subqueries to avoid Cartesian joins."""
        today_str = vn_today().strftime("%Y-%m-%d")
        conditions: list[str] = []
        params: list[Any] = [today_str]
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(pt.bienso LIKE %s OR COALESCE(pass_info.chu_xe, '') LIKE %s)")
            params.extend([like, like])
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT %s OFFSET %s"
            params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                pt.id,
                pt.bienso,
                pt.idlpt AS vehicle_type_id,
                COALESCE(lpt.tenloai, 'Khác') AS loaiphuongtien,
                COALESCE(turn_stats.tong_luot, 0) AS tong_luot,
                turn_stats.lan_gui_gan_nhat,
                COALESCE(turn_stats.dang_trong_bai, 0) AS dang_trong_bai,
                CASE WHEN pass_info.idpt IS NOT NULL THEN 1 ELSE 0 END AS co_ve_thang,
                COALESCE(pass_info.chu_xe, 'Khách vãng lai') AS chu_xe
            FROM phuongtien pt
            LEFT JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
            LEFT JOIN (
                SELECT
                    ld.idpt,
                    COUNT(*) AS tong_luot,
                    MAX(ld.giovao) AS lan_gui_gan_nhat,
                    MAX(
                        CASE
                            WHEN NOT EXISTS (
                                SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id
                            ) THEN 1
                            ELSE 0
                        END
                    ) AS dang_trong_bai
                FROM luotdo ld
                GROUP BY ld.idpt
            ) turn_stats ON turn_stats.idpt = pt.id
            LEFT JOIN (
                SELECT idpt, chu_xe
                FROM (
                    SELECT
                        vt.idpt,
                        kh.hoten AS chu_xe,
                        ROW_NUMBER() OVER (PARTITION BY vt.idpt ORDER BY vt.ngayketthuc DESC, vt.id DESC) AS rn
                    FROM vethang vt
                    JOIN khachhang kh ON kh.id = vt.idkh
                    WHERE vt.ngayketthuc >= %s
                ) ranked_vt
                WHERE rn = 1
            ) pass_info ON pass_info.idpt = pt.id
            {where_clause}
            ORDER BY turn_stats.lan_gui_gan_nhat DESC, pt.id DESC
            {limit_clause}
            """,
            params,
        )

    def update_vehicle(
        self,
        vehicle_id: int,
        plate: str,
        vehicle_type_id: int,
    ) -> None:
        clean_plate = normalize_plate(plate)
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM phuongtien WHERE id = %s FOR UPDATE", (vehicle_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Phương tiện không tồn tại.")
            cursor.execute(
                "SELECT id FROM phuongtien WHERE bienso = %s AND id <> %s LIMIT 1",
                (clean_plate, vehicle_id),
            )
            if cursor.fetchone() is not None:
                raise ConflictError(f"Biển số {clean_plate} đã tồn tại.")
            cursor.execute(
                "UPDATE phuongtien SET bienso = %s, idlpt = %s WHERE id = %s",
                (clean_plate, vehicle_type_id, vehicle_id),
            )

    def delete_vehicle(self, vehicle_id: int) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM phuongtien WHERE id = %s FOR UPDATE", (vehicle_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Phương tiện không tồn tại.")
            cursor.execute("SELECT id FROM luotdo WHERE idpt = %s LIMIT 1", (vehicle_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Phương tiện đã có lịch sử lượt đỗ, không thể xóa.")
            cursor.execute("SELECT id FROM vethang WHERE idpt = %s LIMIT 1", (vehicle_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Phương tiện đã gắn với vé tháng, không thể xóa.")
            cursor.execute("DELETE FROM phuongtien WHERE id = %s", (vehicle_id,))
