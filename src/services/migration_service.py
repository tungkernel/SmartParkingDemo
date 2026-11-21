from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Callable

from services.db_service import DBService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MigrationStep:
    """Single versioned, idempotent migration step."""

    version: str
    name: str
    apply: Callable[[MigrationService], list[str]]


class MigrationService:
    """Versioned, lock-protected SQL schema migration runner for TiDB/MySQL."""

    LOCK_NAME = "smart_parking_dbptit_migrations"

    def __init__(self, db: DBService) -> None:
        self.db = db

    def _table_exists(self, table_name: str) -> bool:
        row = self.db.fetch_one(
            """
            SELECT COUNT(*) AS cnt
            FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = %s
            """,
            (table_name,),
        )
        return bool(row and int(row["cnt"]) > 0)

    def _column_exists(self, table_name: str, column_name: str) -> bool:
        row = self.db.fetch_one(
            """
            SELECT COUNT(*) AS cnt
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = %s
              AND column_name = %s
            """,
            (table_name, column_name),
        )
        return bool(row and int(row["cnt"]) > 0)

    def _column_info(self, table_name: str, column_name: str) -> dict[str, object]:
        row = self.db.fetch_one(
            """
            SELECT DATA_TYPE AS data_type,
                   CHARACTER_MAXIMUM_LENGTH AS max_len,
                   IS_NULLABLE AS is_nullable,
                   EXTRA AS extra
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = %s
              AND column_name = %s
            """,
            (table_name, column_name),
        )
        return dict(row) if row else {}

    def _column_max_length(self, table_name: str, column_name: str) -> int:
        info = self._column_info(table_name, column_name)
        max_len = info.get("max_len")
        return int(max_len) if isinstance(max_len, (int, float, str)) and str(max_len).isdigit() else 0

    def _index_exists(self, table_name: str, index_name: str) -> bool:
        row = self.db.fetch_one(
            """
            SELECT COUNT(*) AS cnt
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = %s
              AND index_name = %s
            """,
            (table_name, index_name),
        )
        return bool(row and int(row["cnt"]) > 0)

    def _ensure_migrations_table(self) -> None:
        if not self._table_exists("schema_migrations"):
            self.db.execute_non_query(
                """
                CREATE TABLE `schema_migrations` (
                  `version` varchar(32) NOT NULL,
                  `name` varchar(120) NOT NULL,
                  `checksum` varchar(64) NOT NULL,
                  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`version`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
                """
            )

    def _applied_versions(self) -> set[str]:
        rows = self.db.fetch_all("SELECT version FROM schema_migrations")
        return {str(row["version"]) for row in rows}

    def _record_version(self, step: MigrationStep) -> None:
        checksum = hashlib.sha256(f"{step.version}:{step.name}".encode("utf-8")).hexdigest()
        self.db.execute_non_query(
            """
            INSERT INTO schema_migrations (version, name, checksum, applied_at)
            VALUES (%s, %s, %s, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE applied_at = applied_at
            """,
            (step.version, step.name, checksum),
        )

    # ------------------------------------------------------------------
    # Ordered Versioned Migrations
    # ------------------------------------------------------------------

    def _m001_production_tables(self) -> list[str]:
        changes: list[str] = []
        if not self._table_exists("taikhoan"):
            self.db.execute_non_query(
                """
                CREATE TABLE `taikhoan` (
                  `id` int NOT NULL AUTO_INCREMENT,
                  `idnv` int NOT NULL,
                  `username` varchar(50) NOT NULL,
                  `password_hash` varchar(255) NOT NULL,
                  `role` varchar(20) NOT NULL DEFAULT 'OPERATOR',
                  `is_active` tinyint(1) NOT NULL DEFAULT 1,
                  `token_version` int NOT NULL DEFAULT 1,
                  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
                  `last_login_at` datetime DEFAULT NULL,
                  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uk_taikhoan_username` (`username`),
                  UNIQUE KEY `uk_taikhoan_idnv` (`idnv`),
                  CONSTRAINT `fk_taikhoan_nhanvien` FOREIGN KEY (`idnv`) REFERENCES `nhanvien` (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
                """
            )
            changes.append("create_table_taikhoan")

        if not self._table_exists("refresh_tokens"):
            self.db.execute_non_query(
                """
                CREATE TABLE `refresh_tokens` (
                  `id` bigint NOT NULL AUTO_INCREMENT,
                  `account_id` int NOT NULL,
                  `token_hash` varchar(64) NOT NULL,
                  `expires_at` datetime NOT NULL,
                  `revoked_at` datetime DEFAULT NULL,
                  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uk_refresh_token_hash` (`token_hash`),
                  KEY `idx_refresh_account_active` (`account_id`, `revoked_at`, `expires_at`),
                  CONSTRAINT `fk_refresh_taikhoan` FOREIGN KEY (`account_id`) REFERENCES `taikhoan` (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
                """
            )
            changes.append("create_table_refresh_tokens")

        if not self._table_exists("audit_logs"):
            self.db.execute_non_query(
                """
                CREATE TABLE `audit_logs` (
                  `id` bigint NOT NULL AUTO_INCREMENT,
                  `actor_id` int DEFAULT NULL,
                  `actor_username` varchar(50) NOT NULL,
                  `action` varchar(60) NOT NULL,
                  `entity_type` varchar(40) NOT NULL,
                  `entity_id` varchar(64) DEFAULT NULL,
                  `ip_address` varchar(64) DEFAULT NULL,
                  `details_json` text,
                  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  KEY `idx_audit_created` (`created_at`),
                  KEY `idx_audit_entity` (`entity_type`, `entity_id`),
                  KEY `idx_audit_actor` (`actor_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
                """
            )
            changes.append("create_table_audit_logs")

        if not self._table_exists("ca_lam_viec"):
            self.db.execute_non_query(
                """
                CREATE TABLE `ca_lam_viec` (
                  `id` int NOT NULL AUTO_INCREMENT,
                  `idnv` int NOT NULL,
                  `idbdx` int DEFAULT NULL,
                  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `ended_at` datetime DEFAULT NULL,
                  `opening_cash` int NOT NULL DEFAULT 0,
                  `expected_cash` int NOT NULL DEFAULT 0,
                  `actual_cash` int DEFAULT NULL,
                  `transfer_total` int NOT NULL DEFAULT 0,
                  `note` varchar(255) DEFAULT NULL,
                  `status` varchar(20) NOT NULL DEFAULT 'OPEN',
                  PRIMARY KEY (`id`),
                  KEY `idx_shift_status` (`status`, `started_at`),
                  KEY `idx_shift_emp_status` (`idnv`, `status`),
                  CONSTRAINT `fk_shift_nhanvien` FOREIGN KEY (`idnv`) REFERENCES `nhanvien` (`id`),
                  CONSTRAINT `fk_shift_baidoxe` FOREIGN KEY (`idbdx`) REFERENCES `baidoxe` (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
                """
            )
            changes.append("create_table_ca_lam_viec")

        return changes

    def _m002_auth_and_audit_columns(self) -> list[str]:
        changes: list[str] = []
        if self._table_exists("taikhoan"):
            if not self._column_exists("taikhoan", "token_version"):
                self.db.execute_non_query(
                    "ALTER TABLE `taikhoan` ADD COLUMN `token_version` int NOT NULL DEFAULT 1"
                )
                changes.append("add_taikhoan_token_version")
            if not self._column_exists("taikhoan", "must_change_password"):
                self.db.execute_non_query(
                    "ALTER TABLE `taikhoan` ADD COLUMN `must_change_password` tinyint(1) NOT NULL DEFAULT 0"
                )
                changes.append("add_taikhoan_must_change_password")

        if self._table_exists("audit_logs") and not self._column_exists("audit_logs", "ip_address"):
            self.db.execute_non_query(
                "ALTER TABLE `audit_logs` ADD COLUMN `ip_address` varchar(64) DEFAULT NULL"
            )
            changes.append("add_audit_logs_ip_address")
        return changes

    def _m003_fix_thanhtoan_schema(self) -> list[str]:
        changes: list[str] = []
        if not self._table_exists("thanhtoan"):
            return changes

        # Allow NULL idld so monthly pass registrations & renewals can record payments cleanly
        idld_info = self._column_info("thanhtoan", "idld")
        if str(idld_info.get("is_nullable", "")).upper() == "NO":
            self.db.execute_non_query("ALTER TABLE `thanhtoan` MODIFY COLUMN `idld` int DEFAULT NULL")
            changes.append("nullable_thanhtoan_idld")

        # Safely widen & backfill loaithanhtoan from legacy tinyint(0/1)/NULL to canonical Vietnamese labels
        loai_info = self._column_info("thanhtoan", "loaithanhtoan")
        loai_type = str(loai_info.get("data_type", "")).lower()
        loai_len = self._column_max_length("thanhtoan", "loaithanhtoan")
        if loai_type != "varchar" or loai_len < 30:
            self.db.execute_non_query(
                "ALTER TABLE `thanhtoan` MODIFY COLUMN `loaithanhtoan` varchar(30) DEFAULT NULL"
            )
            changes.append("widen_thanhtoan_loaithanhtoan_stage1")

        self.db.execute_non_query(
            """
            UPDATE `thanhtoan`
            SET `loaithanhtoan` = 'Tiền mặt'
            WHERE `loaithanhtoan` IS NULL
               OR `loaithanhtoan` IN ('', '0', '1', 'Vé ngày', 'Vé tháng')
            """
        )
        self.db.execute_non_query(
            "ALTER TABLE `thanhtoan` MODIFY COLUMN `loaithanhtoan` varchar(30) NOT NULL DEFAULT 'Tiền mặt'"
        )
        changes.append("normalize_thanhtoan_loaithanhtoan")

        if self._column_max_length("thanhtoan", "trangthai") < 30:
            self.db.execute_non_query(
                "ALTER TABLE `thanhtoan` MODIFY COLUMN `trangthai` varchar(30) NOT NULL DEFAULT 'Thành công'"
            )
            changes.append("widen_thanhtoan_trangthai")

        return changes

    def _m004_widen_legacy_columns(self) -> list[str]:
        changes: list[str] = []
        # Preserve legacy NULLability so pre-existing NULL rows never fail ALTER TABLE MODIFY
        widen_specs: list[tuple[str, str, int, str]] = [
            ("phuongtien", "bienso", 15, "varchar(15) DEFAULT NULL"),
            ("baidoxe", "tenbaido", 100, "varchar(100) DEFAULT NULL"),
            ("baidoxe", "diadiem", 255, "varchar(255) DEFAULT NULL"),
            ("khuvucdo", "ten", 20, "varchar(20) DEFAULT NULL"),
            ("banggia", "loaive", 20, "varchar(20) DEFAULT NULL"),
            ("loaikhachhang", "tenloai", 30, "varchar(30) DEFAULT NULL"),
            ("loaiphuongtien", "tenloai", 30, "varchar(30) DEFAULT NULL"),
            ("khachhang", "hoten", 60, "varchar(60) DEFAULT NULL"),
            ("nhanvien", "hoten", 60, "varchar(60) DEFAULT NULL"),
            ("nhanvien", "chucvu", 30, "varchar(30) DEFAULT NULL"),
            ("nhanvien", "sdt", 15, "varchar(15) DEFAULT NULL"),
            ("nhanvien", "email", 100, "varchar(100) DEFAULT NULL"),
            ("nhanvien", "diachi", 255, "varchar(255) DEFAULT NULL"),
        ]
        for table, col, min_len, col_def in widen_specs:
            if self._table_exists(table) and self._column_max_length(table, col) < min_len:
                self.db.execute_non_query(f"ALTER TABLE `{table}` MODIFY COLUMN `{col}` {col_def}")
                changes.append(f"widen_{table}_{col}")
        return changes

    def _m005_nhanvien_auto_increment(self) -> list[str]:
        changes: list[str] = []
        if not self._table_exists("nhanvien"):
            return changes
        info = self._column_info("nhanvien", "id")
        if "auto_increment" not in str(info.get("extra", "")).lower():
            self.db.execute_non_query(
                "ALTER TABLE `nhanvien` MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT"
            )
            changes.append("nhanvien_id_auto_increment")
        return changes

    def _m006_integrity_and_composite_indexes(self) -> list[str]:
        changes: list[str] = []

        if self._table_exists("thanhtoan") and not self._index_exists("thanhtoan", "uk_thanhtoan_idld"):
            dup = self.db.fetch_one(
                """
                SELECT COUNT(*) AS cnt FROM (
                    SELECT idld FROM thanhtoan
                    WHERE idld IS NOT NULL
                    GROUP BY idld HAVING COUNT(*) > 1
                ) t
                """
            )
            if dup and int(dup["cnt"]) == 0:
                self.db.execute_non_query(
                    "ALTER TABLE `thanhtoan` ADD UNIQUE KEY `uk_thanhtoan_idld` (`idld`)"
                )
                changes.append("add_uk_thanhtoan_idld")
            else:
                logger.warning(
                    "Skipped uk_thanhtoan_idld because duplicate non-null thanhtoan.idld rows exist."
                )

        if self._table_exists("khuvucdo") and not self._index_exists("khuvucdo", "uk_khuvucdo_lot_ten"):
            dup = self.db.fetch_one(
                """
                SELECT COUNT(*) AS cnt FROM (
                    SELECT idbdx, ten FROM khuvucdo
                    GROUP BY idbdx, ten HAVING COUNT(*) > 1
                ) t
                """
            )
            if dup and int(dup["cnt"]) == 0:
                self.db.execute_non_query(
                    "ALTER TABLE `khuvucdo` ADD UNIQUE KEY `uk_khuvucdo_lot_ten` (`idbdx`, `ten`)"
                )
                changes.append("add_uk_khuvucdo_lot_ten")

        if self._table_exists("banggia") and not self._index_exists("banggia", "uk_banggia_rule"):
            dup = self.db.fetch_one(
                """
                SELECT COUNT(*) AS cnt FROM (
                    SELECT loaive, idlpt, idlkh FROM banggia
                    WHERE idlkh IS NOT NULL
                    GROUP BY loaive, idlpt, idlkh HAVING COUNT(*) > 1
                ) t
                """
            )
            if dup and int(dup["cnt"]) == 0:
                self.db.execute_non_query(
                    "ALTER TABLE `banggia` ADD UNIQUE KEY `uk_banggia_rule` (`loaive`, `idlpt`, `idlkh`)"
                )
                changes.append("add_uk_banggia_rule")

        index_specs: list[tuple[str, str, str]] = [
            ("luotdo", "idx_luotdo_time", "(`giovao`, `giora`)"),
            ("thanhtoan", "idx_thanhtoan_time_status", "(`giothanhtoan`, `trangthai`)"),
            ("thanhtoan", "idx_thanhtoan_shift_recon", "(`idnv`, `trangthai`, `giothanhtoan`)"),
            ("vethang", "idx_vethang_dates", "(`ngaybatdau`, `ngayketthuc`)"),
            ("vethang", "idx_vethang_pt_dates", "(`idpt`, `ngaybatdau`, `ngayketthuc`)"),
            ("vethang", "idx_vethang_tx_end", "(`idtx`, `ngayketthuc`)"),
            ("ca_lam_viec", "idx_shift_emp_status", "(`idnv`, `status`)"),
        ]
        for table, idx_name, cols in index_specs:
            if self._table_exists(table) and not self._index_exists(table, idx_name):
                self.db.execute_non_query(f"ALTER TABLE `{table}` ADD INDEX `{idx_name}` {cols}")
                changes.append(f"add_{idx_name}")

        return changes

    def _steps(self) -> list[MigrationStep]:
        return [
            MigrationStep("001", "production_tables", lambda svc: svc._m001_production_tables()),
            MigrationStep("002", "auth_and_audit_columns", lambda svc: svc._m002_auth_and_audit_columns()),
            MigrationStep("003", "fix_thanhtoan_schema", lambda svc: svc._m003_fix_thanhtoan_schema()),
            MigrationStep("004", "widen_legacy_columns", lambda svc: svc._m004_widen_legacy_columns()),
            MigrationStep("005", "nhanvien_auto_increment", lambda svc: svc._m005_nhanvien_auto_increment()),
            MigrationStep(
                "006",
                "integrity_and_composite_indexes",
                lambda svc: svc._m006_integrity_and_composite_indexes(),
            ),
        ]

    def ensure_production_schema(self) -> list[str]:
        """Apply pending versioned migrations under a pinned-session advisory lock."""
        applied: list[str] = []
        with self.db.advisory_lock(self.LOCK_NAME, timeout=30):
            self._ensure_migrations_table()
            already_applied = self._applied_versions()
            for step in self._steps():
                if step.version in already_applied:
                    continue
                changes = step.apply(self)
                self._record_version(step)
                applied.extend(changes or [f"{step.version}_{step.name}"])
            if applied:
                logger.info("Applied production migrations: %s", ", ".join(applied))
        return applied
