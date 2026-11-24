from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from core.exceptions import ConflictError, NotFoundError, ValidationError
from services.db_service import DBService
from services.domain.base import (
    FeeQuote,
    normalize_payment_method,
    normalize_plate,
    utc_now,
    utc_now_str,
    vn_today,
)


class GateService:
    """Domain service managing vehicle check-in, check-out, slot relocation, and turn cancellation."""

    def __init__(self, db: DBService) -> None:
        self.db = db

    def get_active_turns(
        self,
        lot_id: Optional[int] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List currently parked vehicles with optional lot scoping, keyword search, and pagination."""
        today_str = vn_today().strftime("%Y-%m-%d")
        conditions = ["NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id)"]
        params: list[Any] = [today_str, today_str]
        if lot_id is not None:
            conditions.append("b.id = %s")
            params.append(lot_id)
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(pt.bienso LIKE %s OR tx.maso LIKE %s OR nv.hoten LIKE %s)")
            params.extend([like, like, like])

        where_clause = " AND ".join(conditions)
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT %s OFFSET %s"
            params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                ld.id AS id_luotdo,
                pt.bienso,
                lpt.tenloai AS loaiphuongtien,
                pt.idlpt AS vehicle_type_id,
                COALESCE(owner_pass.chu_xe, 'Khách vãng lai') AS chu_xe,
                b.id AS idbdx,
                b.tenbaido,
                k.ten AS khuvuc,
                v.sothutu AS vitri,
                ld.idvtd,
                tx.maso AS mathe,
                ld.giovao,
                nv.hoten AS nhanvien,
                bg.loaive,
                bg.dongia,
                CASE WHEN owner_pass.idpt IS NOT NULL THEN 1 ELSE 0 END AS is_monthly_pass
            FROM luotdo ld
            JOIN vitrido v ON v.id = ld.idvtd
            JOIN khuvucdo k ON k.id = v.idkvd
            JOIN baidoxe b ON b.id = k.idbdx
            JOIN nhanvien nv ON nv.id = ld.idnv
            LEFT JOIN phuongtien pt ON pt.id = ld.idpt
            LEFT JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
            LEFT JOIN thexe tx ON tx.id = ld.idtx
            LEFT JOIN banggia bg ON bg.id = ld.idbg
            LEFT JOIN (
                SELECT idpt, chu_xe
                FROM (
                    SELECT
                        vt.idpt,
                        kh.hoten AS chu_xe,
                        ROW_NUMBER() OVER (PARTITION BY vt.idpt ORDER BY vt.ngayketthuc DESC, vt.id DESC) AS rn
                    FROM vethang vt
                    JOIN khachhang kh ON kh.id = vt.idkh
                    WHERE vt.ngaybatdau <= %s AND vt.ngayketthuc >= %s
                ) ranked_pass
                WHERE rn = 1
            ) owner_pass ON owner_pass.idpt = pt.id
            WHERE {where_clause}
            ORDER BY ld.giovao DESC, ld.id DESC
            {limit_clause}
            """,
            params,
        )

    def count_active_turns(
        self,
        lot_id: Optional[int] = None,
        keyword: Optional[str] = None,
    ) -> int:
        conditions = ["NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id)"]
        params: list[Any] = []
        if lot_id is not None:
            conditions.append("b.id = %s")
            params.append(lot_id)
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(pt.bienso LIKE %s OR tx.maso LIKE %s OR nv.hoten LIKE %s)")
            params.extend([like, like, like])
        row = self.db.fetch_one(
            f"""
            SELECT COUNT(*) AS cnt
            FROM luotdo ld
            JOIN vitrido v ON v.id = ld.idvtd
            JOIN khuvucdo k ON k.id = v.idkvd
            JOIN baidoxe b ON b.id = k.idbdx
            JOIN nhanvien nv ON nv.id = ld.idnv
            LEFT JOIN phuongtien pt ON pt.id = ld.idpt
            LEFT JOIN thexe tx ON tx.id = ld.idtx
            WHERE {' AND '.join(conditions)}
            """,
            params or None,
        )
        return int((row or {}).get("cnt") or 0)

    def check_in_vehicle(
        self,
        license_plate: str,
        vehicle_type_id: int,
        slot_id: int,
        card_id: int,
        employee_id: int,
    ) -> int:
        """Register a vehicle entering a parking slot atomically with consistent lock ordering."""
        plate = normalize_plate(license_plate)
        now_str = utc_now_str()
        today_str = vn_today().strftime("%Y-%m-%d")

        with self.db.transaction() as cursor:
            # Lock order: phuongtien -> vitrido -> thexe -> luotdo
            cursor.execute(
                "SELECT id, idlpt FROM phuongtien WHERE bienso = %s FOR UPDATE",
                (plate,),
            )
            vehicle = cursor.fetchone()

            cursor.execute(
                "SELECT id, idkvd, trangthai FROM vitrido WHERE id = %s FOR UPDATE",
                (slot_id,),
            )
            slot = cursor.fetchone()
            if slot is None or int(slot["trangthai"] or 0) != 1:
                raise ConflictError("Vị trí đỗ đã có xe, đang bảo trì hoặc không tồn tại.")

            cursor.execute(
                "SELECT id, trangthai FROM thexe WHERE id = %s FOR UPDATE",
                (card_id,),
            )
            card = cursor.fetchone()
            if card is None or int(card["trangthai"] or 0) != 1:
                raise ConflictError("Thẻ xe đang được sử dụng, mất/hỏng hoặc không hợp lệ.")

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
                SELECT id FROM luotdo
                WHERE idpt = %s
                  AND NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = luotdo.id)
                LIMIT 1
                """,
                (vehicle_id,),
            )
            if cursor.fetchone() is not None:
                raise ConflictError(f"Phương tiện {plate} hiện đang gửi trong bãi.")

            # Prevent handing out a card currently bound to another vehicle's active monthly pass
            cursor.execute(
                """
                SELECT id, idpt
                FROM vethang
                WHERE idtx = %s AND ngaybatdau <= %s AND ngayketthuc >= %s
                ORDER BY ngayketthuc DESC
                LIMIT 1
                """,
                (card_id, today_str, today_str),
            )
            card_pass = cursor.fetchone()
            if card_pass is not None and int(card_pass["idpt"]) != vehicle_id:
                raise ConflictError("Thẻ xe này đang gắn với vé tháng của phương tiện khác.")

            cursor.execute(
                """
                SELECT id, idbg
                FROM vethang
                WHERE idpt = %s AND ngaybatdau <= %s AND ngayketthuc >= %s
                ORDER BY ngayketthuc DESC
                LIMIT 1
                """,
                (vehicle_id, today_str, today_str),
            )
            monthly_pass = cursor.fetchone()

            if monthly_pass and monthly_pass.get("idbg"):
                tariff_id = int(monthly_pass["idbg"])
            else:
                cursor.execute(
                    """
                    SELECT id FROM banggia
                    WHERE idlpt = %s AND loaive = 'ngày'
                    ORDER BY id LIMIT 1
                    """,
                    (vehicle_type_id,),
                )
                tariff = cursor.fetchone()
                if tariff is None:
                    raise ValidationError("Không tìm thấy bảng giá ngày phù hợp cho loại xe này.")
                tariff_id = int(tariff["id"])

            cursor.execute(
                "UPDATE vitrido SET trangthai = 0 WHERE id = %s AND trangthai = 1",
                (slot_id,),
            )
            if cursor.rowcount != 1:
                raise ConflictError("Vị trí đỗ đã có xe hoặc không tồn tại.")

            cursor.execute(
                "UPDATE thexe SET trangthai = 0 WHERE id = %s AND trangthai = 1",
                (card_id,),
            )
            if cursor.rowcount != 1:
                raise ConflictError("Thẻ xe đang được sử dụng hoặc không hợp lệ.")

            cursor.execute(
                """
                INSERT INTO luotdo (idvtd, giovao, giora, idnv, idpt, idtx, idbg)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (slot_id, now_str, now_str, employee_id, vehicle_id, card_id, tariff_id),
            )
            return int(cursor.lastrowid)

    @staticmethod
    def _compute_quote_from_row(
        row: dict[str, Any],
        monthly_pass: Optional[dict[str, Any]],
        fallback_daily_price: Optional[int] = None,
        checkout_dt: Optional[datetime] = None,
    ) -> FeeQuote:
        """Compute fee quote; expired/cancelled monthly passes fall back to daily tariff."""
        checkin_dt = row["giovao"]
        if isinstance(checkin_dt, str):
            checkin_dt = datetime.fromisoformat(checkin_dt)
        if checkin_dt.tzinfo is not None:
            checkin_dt = checkin_dt.replace(tzinfo=None)
        now_dt = checkout_dt or utc_now()
        hours = max((now_dt - checkin_dt).total_seconds() / 3600.0, 0.0)

        checked_in_as_monthly = str(row.get("loaive") or "").strip().lower() == "tháng"
        is_monthly = monthly_pass is not None
        if is_monthly:
            amount = 0
            ticket_type = "Vé tháng"
        else:
            if checked_in_as_monthly:
                # Pass expired or was cancelled after check-in -> bill using daily rate, not monthly dongia
                unit_price = (
                    int(fallback_daily_price)
                    if fallback_daily_price is not None
                    else 5000
                )
                ticket_type = "Vé ngày (Vé tháng hết hạn)"
            else:
                unit_price = int(row["dongia"]) if row.get("dongia") is not None else 5000
                ticket_type = "Vé ngày"
            days = max(1, int(hours // 24) + (1 if hours % 24 > 0 or hours == 0 else 0))
            amount = unit_price * days

        return FeeQuote(
            turn_id=int(row["id"]),
            license_plate=str(row["bienso"]),
            vehicle_type=str(row["loaiphuongtien"]),
            ticket_type=ticket_type,
            checkin_time=checkin_dt,
            checkout_time=now_dt,
            duration_hours=round(hours, 2),
            amount=amount,
            is_monthly_pass=is_monthly,
            monthly_pass_id=int(monthly_pass["id"]) if monthly_pass else None,
        )

    def get_fee_quote(self, turn_id: int) -> FeeQuote:
        """Calculate checkout fee preview for an active parking turn."""
        row = self.db.fetch_one(
            """
            SELECT
                ld.id,
                ld.giovao,
                ld.idpt,
                pt.idlpt,
                pt.bienso,
                lpt.tenloai AS loaiphuongtien,
                bg.loaive,
                bg.dongia,
                k.idbdx
            FROM luotdo ld
            JOIN vitrido v ON v.id = ld.idvtd
            JOIN khuvucdo k ON k.id = v.idkvd
            JOIN phuongtien pt ON pt.id = ld.idpt
            JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
            LEFT JOIN banggia bg ON bg.id = ld.idbg
            WHERE ld.id = %s
              AND NOT EXISTS (SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id)
            """,
            (turn_id,),
        )
        if row is None:
            raise NotFoundError("Không tìm thấy lượt đỗ đang hoạt động.")

        today_str = vn_today().strftime("%Y-%m-%d")
        monthly_pass = self.db.fetch_one(
            """
            SELECT id
            FROM vethang
            WHERE idpt = %s AND ngaybatdau <= %s AND ngayketthuc >= %s
            ORDER BY ngayketthuc DESC
            LIMIT 1
            """,
            (row["idpt"], today_str, today_str),
        )
        fallback_daily_price: Optional[int] = None
        if monthly_pass is None and str(row.get("loaive") or "").strip().lower() == "tháng":
            daily_tariff = self.db.fetch_one(
                """
                SELECT dongia FROM banggia
                WHERE idlpt = %s AND loaive = 'ngày'
                ORDER BY id LIMIT 1
                """,
                (row.get("idlpt"),),
            )
            if daily_tariff and daily_tariff.get("dongia") is not None:
                fallback_daily_price = int(daily_tariff["dongia"])

        return self._compute_quote_from_row(
            row, monthly_pass, fallback_daily_price=fallback_daily_price
        )

    def check_out_vehicle(
        self,
        turn_id: int,
        employee_id: int,
        lost_card: bool = False,
        lost_card_fee: int = 0,
        payment_method: str = "Tiền mặt",
        replacement_card_id: Optional[int] = None,
    ) -> FeeQuote:
        """Complete parking turn, record payment method, and free/replace slot & card atomically."""
        if lost_card and lost_card_fee < 0:
            raise ValidationError("Phụ phí mất thẻ không được âm.")
        clean_method = normalize_payment_method(payment_method)
        today_str = vn_today().strftime("%Y-%m-%d")
        checkout_dt = utc_now()
        now_str = checkout_dt.strftime("%Y-%m-%d %H:%M:%S")
        next_card_status = 2 if lost_card else 1

        with self.db.transaction() as cursor:
            # Lock ONLY the luotdo row first to avoid taking FOR UPDATE locks on shared lookup tables
            cursor.execute(
                """
                SELECT id, idvtd, idtx, idpt, idbg, giovao
                FROM luotdo
                WHERE id = %s
                FOR UPDATE
                """,
                (turn_id,),
            )
            turn_core = cursor.fetchone()
            if turn_core is None:
                raise NotFoundError("Lượt đỗ không tồn tại.")

            cursor.execute(
                """
                SELECT
                    pt.idlpt,
                    pt.bienso,
                    lpt.tenloai AS loaiphuongtien,
                    bg.loaive,
                    bg.dongia,
                    k.idbdx
                FROM vitrido v
                JOIN khuvucdo k ON k.id = v.idkvd
                JOIN phuongtien pt ON pt.id = %s
                JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
                LEFT JOIN banggia bg ON bg.id = %s
                WHERE v.id = %s
                """,
                (turn_core["idpt"], turn_core.get("idbg"), turn_core["idvtd"]),
            )
            meta = cursor.fetchone()
            if meta is None:
                raise NotFoundError("Không tìm thấy dữ liệu vị trí hoặc phương tiện của lượt đỗ.")
            turn = {**turn_core, **meta}

            cursor.execute(
                "SELECT id FROM thanhtoan WHERE idld = %s LIMIT 1",
                (turn_id,),
            )
            if cursor.fetchone() is not None:
                raise ConflictError("Lượt đỗ này đã được thanh toán trước đó.")

            cursor.execute(
                """
                SELECT id
                FROM vethang
                WHERE idpt = %s AND ngaybatdau <= %s AND ngayketthuc >= %s
                ORDER BY ngayketthuc DESC
                LIMIT 1
                """,
                (turn["idpt"], today_str, today_str),
            )
            monthly_pass = cursor.fetchone()

            fallback_daily_price: Optional[int] = None
            if monthly_pass is None and str(turn.get("loaive") or "").strip().lower() == "tháng":
                cursor.execute(
                    """
                    SELECT dongia FROM banggia
                    WHERE idlpt = %s AND loaive = 'ngày'
                    ORDER BY id LIMIT 1
                    """,
                    (turn.get("idlpt"),),
                )
                daily_tariff = cursor.fetchone()
                if daily_tariff and daily_tariff.get("dongia") is not None:
                    fallback_daily_price = int(daily_tariff["dongia"])

            base_quote = self._compute_quote_from_row(
                turn,
                monthly_pass,
                fallback_daily_price=fallback_daily_price,
                checkout_dt=checkout_dt,
            )
            final_amount = base_quote.amount + (lost_card_fee if lost_card else 0)
            final_quote = FeeQuote(
                turn_id=base_quote.turn_id,
                license_plate=base_quote.license_plate,
                vehicle_type=base_quote.vehicle_type,
                ticket_type=f"{base_quote.ticket_type} (Mất thẻ)" if lost_card else base_quote.ticket_type,
                checkin_time=base_quote.checkin_time,
                checkout_time=base_quote.checkout_time,
                duration_hours=base_quote.duration_hours,
                amount=final_amount,
                is_monthly_pass=base_quote.is_monthly_pass,
                monthly_pass_id=base_quote.monthly_pass_id,
                payment_method=clean_method,
            )

            # Lock slot & card(s) in deterministic ascending order before updating statuses
            cursor.execute("SELECT id FROM vitrido WHERE id = %s FOR UPDATE", (turn["idvtd"],))
            if lost_card and final_quote.monthly_pass_id is not None and replacement_card_id is not None:
                if int(replacement_card_id) == int(turn["idtx"]):
                    raise ValidationError("Thẻ cấp lại phải khác thẻ bị mất.")
                low_card, high_card = sorted((int(turn["idtx"]), int(replacement_card_id)))
                cursor.execute(
                    "SELECT id, trangthai FROM thexe WHERE id IN (%s, %s) ORDER BY id ASC FOR UPDATE",
                    (low_card, high_card),
                )
                locked_cards = {int(c["id"]): c for c in (cursor.fetchall() or [])}
                rep_card = locked_cards.get(int(replacement_card_id))
                if rep_card is None or int(rep_card["trangthai"]) != 1:
                    raise ConflictError("Thẻ cấp lại không ở trạng thái sẵn sàng.")
                cursor.execute(
                    "SELECT id FROM vethang WHERE idtx = %s AND ngayketthuc >= %s LIMIT 1",
                    (replacement_card_id, today_str),
                )
                if cursor.fetchone() is not None:
                    raise ConflictError("Thẻ cấp lại đang gắn với một vé tháng khác.")
                cursor.execute(
                    "UPDATE vethang SET idtx = %s WHERE id = %s",
                    (replacement_card_id, final_quote.monthly_pass_id),
                )
            else:
                cursor.execute("SELECT id FROM thexe WHERE id = %s FOR UPDATE", (turn["idtx"],))

            cursor.execute(
                "UPDATE luotdo SET giora = %s WHERE id = %s",
                (now_str, turn_id),
            )
            cursor.execute(
                """
                INSERT INTO thanhtoan (idld, chiphi, giothanhtoan, trangthai, idnv, loaithanhtoan, idvt)
                VALUES (%s, %s, %s, 'Thành công', %s, %s, %s)
                """,
                (
                    turn_id,
                    final_quote.amount,
                    now_str,
                    employee_id,
                    clean_method,
                    final_quote.monthly_pass_id,
                ),
            )
            cursor.execute(
                "UPDATE vitrido SET trangthai = 1 WHERE id = %s",
                (turn["idvtd"],),
            )
            cursor.execute(
                "UPDATE thexe SET trangthai = %s WHERE id = %s",
                (next_card_status, turn["idtx"]),
            )

        return final_quote

    def move_active_turn_slot(self, turn_id: int, new_slot_id: int) -> None:
        """Move an active parked vehicle to another free slot using deterministic lock ordering."""
        with self.db.transaction() as cursor:
            # Lock ONLY luotdo first so old_slot_id is NOT locked before ascending-ID slot locking
            cursor.execute(
                "SELECT id, idvtd FROM luotdo WHERE id = %s FOR UPDATE",
                (turn_id,),
            )
            turn = cursor.fetchone()
            if turn is None:
                raise NotFoundError("Lượt đỗ không tồn tại.")

            cursor.execute("SELECT id FROM thanhtoan WHERE idld = %s LIMIT 1", (turn_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Lượt đỗ đã thanh toán, không thể chuyển vị trí.")

            old_slot_id = int(turn["idvtd"])
            if old_slot_id == int(new_slot_id):
                raise ValidationError("Vị trí mới trùng với vị trí hiện tại.")

            # Lock both vitrido rows strictly in ascending ID order without locking khuvucdo
            low_id, high_id = sorted((old_slot_id, int(new_slot_id)))
            cursor.execute(
                """
                SELECT id, idkvd, trangthai
                FROM vitrido
                WHERE id IN (%s, %s)
                ORDER BY id ASC
                FOR UPDATE
                """,
                (low_id, high_id),
            )
            locked_rows = {int(r["id"]): r for r in (cursor.fetchall() or [])}
            new_slot = locked_rows.get(int(new_slot_id))
            if new_slot is None or int(new_slot["trangthai"]) != 1:
                raise ConflictError("Vị trí đích không trống hoặc đang bảo trì.")

            cursor.execute("UPDATE vitrido SET trangthai = 1 WHERE id = %s", (old_slot_id,))
            cursor.execute("UPDATE vitrido SET trangthai = 0 WHERE id = %s", (new_slot_id,))
            cursor.execute("UPDATE luotdo SET idvtd = %s WHERE id = %s", (new_slot_id, turn_id))

    def cancel_active_turn(self, turn_id: int) -> None:
        """Cancel an unpaid active turn created by mistake and release slot & card atomically."""
        with self.db.transaction() as cursor:
            cursor.execute(
                "SELECT id, idvtd, idtx FROM luotdo WHERE id = %s FOR UPDATE",
                (turn_id,),
            )
            turn = cursor.fetchone()
            if turn is None:
                raise NotFoundError("Lượt đỗ không tồn tại.")

            cursor.execute("SELECT id FROM thanhtoan WHERE idld = %s LIMIT 1", (turn_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Lượt đỗ đã có giao dịch thanh toán, không thể hủy.")

            cursor.execute("SELECT id FROM vitrido WHERE id = %s FOR UPDATE", (turn["idvtd"],))
            cursor.execute("SELECT id FROM thexe WHERE id = %s FOR UPDATE", (turn["idtx"],))
            cursor.execute("UPDATE vitrido SET trangthai = 1 WHERE id = %s AND trangthai = 0", (turn["idvtd"],))
            cursor.execute("UPDATE thexe SET trangthai = 1 WHERE id = %s AND trangthai = 0", (turn["idtx"],))
            cursor.execute("DELETE FROM luotdo WHERE id = %s", (turn_id,))
