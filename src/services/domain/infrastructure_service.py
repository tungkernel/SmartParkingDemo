from __future__ import annotations

from typing import Any, Optional

from core.exceptions import ConflictError, NotFoundError, ValidationError
from services.db_service import DBService
from services.domain.base import AuditActor, require_text, write_audit_in_tx


class InfrastructureService:
    """Domain service managing parking lots, zones, parking slots, and state reconciliation."""

    def __init__(self, db: DBService) -> None:
        self.db = db

    def get_parking_lots(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        """List parking lots with slot occupancy summary."""
        where_clause = "WHERE b.id = %s" if lot_id is not None else ""
        params = (lot_id,) if lot_id is not None else None
        return self.db.fetch_all(
            f"""
            SELECT
                b.id,
                b.tenbaido,
                b.diadiem,
                COUNT(v.id) AS tong_cho,
                COALESCE(SUM(CASE WHEN v.trangthai = 1 THEN 1 ELSE 0 END), 0) AS cho_trong,
                COALESCE(SUM(CASE WHEN v.trangthai = 0 THEN 1 ELSE 0 END), 0) AS dang_do,
                COALESCE(SUM(CASE WHEN v.trangthai = 2 THEN 1 ELSE 0 END), 0) AS bao_tri
            FROM baidoxe b
            LEFT JOIN khuvucdo k ON k.idbdx = b.id
            LEFT JOIN vitrido v ON v.idkvd = k.id
            {where_clause}
            GROUP BY b.id, b.tenbaido, b.diadiem
            ORDER BY b.id
            """,
            params,
        )

    def create_parking_lot(
        self,
        name: str,
        location: str,
        actor: Optional[AuditActor] = None,
    ) -> int:
        lot_name = require_text(name, "Tên bãi đỗ", 100)
        lot_loc = require_text(location, "Địa điểm", 255)
        with self.db.transaction() as cursor:
            cursor.execute(
                "INSERT INTO baidoxe (tenbaido, diadiem) VALUES (%s, %s)",
                (lot_name, lot_loc),
            )
            lot_id = int(cursor.lastrowid)
            write_audit_in_tx(
                cursor, actor, "CREATE_LOT", "baidoxe", lot_id, {"name": lot_name, "location": lot_loc}
            )
            return lot_id

    def update_parking_lot(
        self,
        lot_id: int,
        name: str,
        location: str,
        actor: Optional[AuditActor] = None,
    ) -> None:
        lot_name = require_text(name, "Tên bãi đỗ", 100)
        lot_loc = require_text(location, "Địa điểm", 255)
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM baidoxe WHERE id = %s FOR UPDATE", (lot_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Bãi đỗ không tồn tại.")
            cursor.execute(
                "UPDATE baidoxe SET tenbaido = %s, diadiem = %s WHERE id = %s",
                (lot_name, lot_loc, lot_id),
            )
            write_audit_in_tx(
                cursor, actor, "UPDATE_LOT", "baidoxe", lot_id, {"name": lot_name, "location": lot_loc}
            )

    def delete_parking_lot(self, lot_id: int, actor: Optional[AuditActor] = None) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM baidoxe WHERE id = %s FOR UPDATE", (lot_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Bãi đỗ không tồn tại.")
            cursor.execute("SELECT id FROM khuvucdo WHERE idbdx = %s LIMIT 1", (lot_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Không thể xóa bãi đỗ đang có khu vực đỗ.")
            cursor.execute("SELECT id FROM nhanvien WHERE idbdx = %s LIMIT 1", (lot_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Không thể xóa bãi đỗ đang có nhân viên phụ trách.")
            cursor.execute("SELECT id FROM ca_lam_viec WHERE idbdx = %s LIMIT 1", (lot_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Không thể xóa bãi đỗ đã phát sinh lịch sử ca làm việc.")
            cursor.execute("DELETE FROM baidoxe WHERE id = %s", (lot_id,))
            write_audit_in_tx(cursor, actor, "DELETE_LOT", "baidoxe", lot_id)

    def get_zones(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        if lot_id is not None:
            return self.db.fetch_all(
                """
                SELECT k.id, k.idbdx, k.ten, b.tenbaido
                FROM khuvucdo k
                JOIN baidoxe b ON b.id = k.idbdx
                WHERE k.idbdx = %s
                ORDER BY k.ten
                """,
                (lot_id,),
            )
        return self.db.fetch_all(
            """
            SELECT k.id, k.idbdx, k.ten, b.tenbaido
            FROM khuvucdo k
            JOIN baidoxe b ON b.id = k.idbdx
            ORDER BY b.id, k.ten
            """
        )

    def get_zones_summary(self, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
        where_clause = "WHERE k.idbdx = %s" if lot_id is not None else ""
        params = (lot_id,) if lot_id is not None else ()
        return self.db.fetch_all(
            f"""
            SELECT
                k.id,
                k.idbdx,
                k.ten,
                b.tenbaido,
                b.diadiem,
                COUNT(v.id) AS tong_cho,
                COALESCE(SUM(CASE WHEN v.trangthai = 1 THEN 1 ELSE 0 END), 0) AS cho_trong,
                COALESCE(SUM(CASE WHEN v.trangthai = 0 THEN 1 ELSE 0 END), 0) AS dang_do,
                COALESCE(SUM(CASE WHEN v.trangthai = 2 THEN 1 ELSE 0 END), 0) AS bao_tri
            FROM khuvucdo k
            JOIN baidoxe b ON b.id = k.idbdx
            LEFT JOIN vitrido v ON v.idkvd = k.id
            {where_clause}
            GROUP BY k.id, k.idbdx, k.ten, b.tenbaido, b.diadiem
            ORDER BY k.idbdx, k.ten
            """,
            params,
        )

    def create_zone(
        self,
        lot_id: int,
        name: str,
        actor: Optional[AuditActor] = None,
    ) -> int:
        zone_name = require_text(name, "Tên khu vực", 20)
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM baidoxe WHERE id = %s FOR UPDATE", (lot_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Bãi đỗ không tồn tại.")
            cursor.execute(
                "SELECT id FROM khuvucdo WHERE idbdx = %s AND LOWER(ten) = LOWER(%s) LIMIT 1",
                (lot_id, zone_name),
            )
            if cursor.fetchone() is not None:
                raise ConflictError(f"Khu vực '{zone_name}' đã tồn tại trong bãi đỗ này.")
            cursor.execute(
                "INSERT INTO khuvucdo (idbdx, ten) VALUES (%s, %s)",
                (lot_id, zone_name),
            )
            zone_id = int(cursor.lastrowid)
            write_audit_in_tx(
                cursor, actor, "CREATE_ZONE", "khuvucdo", zone_id, {"lot_id": lot_id, "name": zone_name}
            )
            return zone_id

    def update_zone(
        self,
        zone_id: int,
        lot_id: int,
        name: str,
        actor: Optional[AuditActor] = None,
    ) -> None:
        zone_name = require_text(name, "Tên khu vực", 20)
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM khuvucdo WHERE id = %s FOR UPDATE", (zone_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Khu vực không tồn tại.")
            cursor.execute(
                "SELECT id FROM khuvucdo WHERE idbdx = %s AND LOWER(ten) = LOWER(%s) AND id <> %s LIMIT 1",
                (lot_id, zone_name, zone_id),
            )
            if cursor.fetchone() is not None:
                raise ConflictError(f"Khu vực '{zone_name}' đã tồn tại trong bãi đỗ này.")
            cursor.execute(
                "UPDATE khuvucdo SET idbdx = %s, ten = %s WHERE id = %s",
                (lot_id, zone_name, zone_id),
            )
            write_audit_in_tx(
                cursor, actor, "UPDATE_ZONE", "khuvucdo", zone_id, {"lot_id": lot_id, "name": zone_name}
            )

    def delete_zone(self, zone_id: int, actor: Optional[AuditActor] = None) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM khuvucdo WHERE id = %s FOR UPDATE", (zone_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Khu vực không tồn tại.")
            cursor.execute("SELECT id FROM vitrido WHERE idkvd = %s LIMIT 1", (zone_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Không thể xóa khu vực đang có vị trí đỗ.")
            cursor.execute("DELETE FROM khuvucdo WHERE id = %s", (zone_id,))
            write_audit_in_tx(cursor, actor, "DELETE_ZONE", "khuvucdo", zone_id)

    def get_slots(
        self,
        lot_id: Optional[int] = None,
        zone_id: Optional[int] = None,
        status_filter: Optional[int] = None,
        keyword: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Return parking slots with SQL-level filtering and deduplicated active turn info."""
        conditions: list[str] = []
        params: list[Any] = []
        if lot_id is not None:
            conditions.append("b.id = %s")
            params.append(lot_id)
        if zone_id is not None:
            conditions.append("k.id = %s")
            params.append(zone_id)
        if status_filter is not None:
            conditions.append("v.trangthai = %s")
            params.append(int(status_filter))
        if keyword and keyword.strip():
            like = f"%{keyword.strip()}%"
            conditions.append("(active.bienso LIKE %s OR k.ten LIKE %s OR CAST(v.sothutu AS CHAR) LIKE %s)")
            params.extend([like, like, like])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT %s OFFSET %s"
            params.extend([int(limit), max(0, int(offset))])

        return self.db.fetch_all(
            f"""
            SELECT
                v.id,
                v.idkvd,
                v.sothutu,
                v.trangthai,
                k.ten AS ten_khuvuc,
                b.id AS idbdx,
                b.tenbaido,
                active.bienso,
                active.giovao,
                active.tenloai AS loaiphuongtien
            FROM vitrido v
            JOIN khuvucdo k ON k.id = v.idkvd
            JOIN baidoxe b ON b.id = k.idbdx
            LEFT JOIN (
                SELECT idvtd, bienso, giovao, tenloai
                FROM (
                    SELECT
                        ld.idvtd,
                        pt.bienso,
                        ld.giovao,
                        lpt.tenloai,
                        ROW_NUMBER() OVER (PARTITION BY ld.idvtd ORDER BY ld.id DESC) AS rn
                    FROM luotdo ld
                    JOIN phuongtien pt ON pt.id = ld.idpt
                    JOIN loaiphuongtien lpt ON lpt.id = pt.idlpt
                    WHERE NOT EXISTS (
                        SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id
                    )
                ) ranked
                WHERE rn = 1
            ) active ON active.idvtd = v.id
            {where_clause}
            ORDER BY b.id, k.ten, v.sothutu
            {limit_clause}
            """,
            params if params else None,
        )

    def add_slots_to_zone(
        self,
        zone_id: int,
        count: int,
        actor: Optional[AuditActor] = None,
    ) -> int:
        """Create sequential parking slots inside a locked transaction using bulk executemany."""
        if count <= 0 or count > 50:
            raise ValidationError("Số lượng ô đỗ thêm mới phải từ 1 đến 50.")

        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM khuvucdo WHERE id = %s FOR UPDATE", (zone_id,))
            if cursor.fetchone() is None:
                raise NotFoundError("Khu vực không tồn tại.")
            cursor.execute(
                "SELECT COALESCE(MAX(sothutu), 0) AS max_stt FROM vitrido WHERE idkvd = %s",
                (zone_id,),
            )
            row = cursor.fetchone()
            start_stt = int((row or {}).get("max_stt") or 0) + 1
            batch = [(zone_id, start_stt + i) for i in range(count)]
            cursor.executemany(
                "INSERT INTO vitrido (idkvd, sothutu, trangthai) VALUES (%s, %s, 1)",
                batch,
            )
            write_audit_in_tx(
                cursor,
                actor,
                "ADD_SLOTS",
                "vitrido",
                zone_id,
                {"zone_id": zone_id, "count": count, "start_stt": start_stt},
            )
            return count

    def set_slot_maintenance(
        self,
        slot_id: int,
        maintenance: bool,
        operator_lot_id: Optional[int] = None,
        actor: Optional[AuditActor] = None,
    ) -> None:
        with self.db.transaction() as cursor:
            cursor.execute(
                "SELECT id, idkvd, trangthai FROM vitrido WHERE id = %s FOR UPDATE",
                (slot_id,),
            )
            slot = cursor.fetchone()
            if slot is None:
                raise NotFoundError("Vị trí đỗ không tồn tại.")
            if operator_lot_id is not None:
                cursor.execute("SELECT idbdx FROM khuvucdo WHERE id = %s", (slot["idkvd"],))
                zone_row = cursor.fetchone()
                if zone_row is None or int(zone_row["idbdx"]) != int(operator_lot_id):
                    raise ValidationError("Nhân viên chỉ được thao tác bảo trì ô đỗ thuộc bãi được phân công.")

            status = int(slot["trangthai"])
            if maintenance:
                if status == 0:
                    raise ConflictError("Vị trí đang có xe đỗ, không thể khóa bảo trì.")
                if status == 2:
                    raise ConflictError("Vị trí đã ở trạng thái bảo trì.")
                cursor.execute("UPDATE vitrido SET trangthai = 2 WHERE id = %s", (slot_id,))
            else:
                if status != 2:
                    raise ConflictError("Vị trí không ở trạng thái bảo trì.")
                cursor.execute("UPDATE vitrido SET trangthai = 1 WHERE id = %s", (slot_id,))
            write_audit_in_tx(
                cursor,
                actor,
                "SET_SLOT_MAINTENANCE",
                "vitrido",
                slot_id,
                {"maintenance": maintenance},
            )

    def delete_slot(self, slot_id: int, actor: Optional[AuditActor] = None) -> None:
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id, trangthai FROM vitrido WHERE id = %s FOR UPDATE", (slot_id,))
            slot = cursor.fetchone()
            if slot is None:
                raise NotFoundError("Vị trí đỗ không tồn tại.")
            if int(slot["trangthai"]) == 0:
                raise ConflictError("Vị trí đang có xe đỗ, không thể xóa.")
            cursor.execute("SELECT id FROM luotdo WHERE idvtd = %s LIMIT 1", (slot_id,))
            if cursor.fetchone() is not None:
                raise ConflictError("Vị trí đã có lịch sử lượt đỗ, chỉ có thể khóa bảo trì.")
            cursor.execute("DELETE FROM vitrido WHERE id = %s", (slot_id,))
            write_audit_in_tx(cursor, actor, "DELETE_SLOT", "vitrido", slot_id)

    def reconcile_slot_states(self, actor: Optional[AuditActor] = None) -> dict[str, int]:
        """Reset orphaned occupied slots AND orphaned in-use cards to available atomically."""
        with self.db.transaction() as cursor:
            cursor.execute(
                """
                UPDATE vitrido v
                SET v.trangthai = 1
                WHERE v.trangthai = 0
                  AND NOT EXISTS (
                      SELECT 1
                      FROM luotdo ld
                      WHERE ld.idvtd = v.id
                        AND NOT EXISTS (
                            SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id
                        )
                  )
                """
            )
            slots_reconciled = int(cursor.rowcount or 0)
            cursor.execute(
                """
                UPDATE thexe tx
                SET tx.trangthai = 1
                WHERE tx.trangthai = 0
                  AND NOT EXISTS (
                      SELECT 1
                      FROM luotdo ld
                      WHERE ld.idtx = tx.id
                        AND NOT EXISTS (
                            SELECT 1 FROM thanhtoan tt WHERE tt.idld = ld.id
                        )
                  )
                """
            )
            cards_reconciled = int(cursor.rowcount or 0)
            result = {
                "slots_reconciled": slots_reconciled,
                "cards_reconciled": cards_reconciled,
            }
            write_audit_in_tx(cursor, actor, "RECONCILE_SLOTS", "vitrido", None, result)
            return result
