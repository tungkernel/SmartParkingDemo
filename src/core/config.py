from __future__ import annotations

import logging
import secrets
import tomllib
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_EPHEMERAL_DEV_SECRET = secrets.token_urlsafe(48)
_PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Unified application settings loaded from environment variables and `.env`."""

    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["development", "staging", "production", "test"] = "development"
    app_version: str = "2.1.0"
    log_level: str = "INFO"

    # Database (TiDB Cloud / MySQL 8)
    tidb_host: Optional[str] = None
    tidb_port: int = Field(default=4000, ge=1, le=65535)
    tidb_database: Optional[str] = None
    tidb_user: Optional[str] = None
    tidb_password: Optional[str] = None
    tidb_pool_size: int = Field(default=8, ge=2, le=32)
    tidb_ssl_ca: Optional[str] = None
    tidb_ssl_verify_identity: bool = True
    tidb_read_timeout: int = Field(default=30, ge=1, le=300)
    tidb_write_timeout: int = Field(default=30, ge=1, le=300)

    # Authentication & Security
    auth_secret_key: Optional[str] = None
    auth_access_ttl_seconds: int = Field(default=3600, ge=60, le=86400)
    auth_refresh_ttl_seconds: int = Field(default=7 * 86400, ge=300, le=90 * 86400)
    auth_default_seed_password: Optional[str] = None

    # CORS & Rate Limiting
    cors_allowed_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8000,http://127.0.0.1:8000"
    )
    rate_limit_login_max: int = Field(default=10, ge=1, le=1000)
    rate_limit_window_seconds: int = Field(default=60, ge=5, le=3600)
    trusted_proxy_ips: str = ""

    # Operations & Display
    display_timezone: str = "Asia/Ho_Chi_Minh"
    vietqr_bank_bin: str = "970422"
    vietqr_account_no: str = "0123456789"
    vietqr_account_name: str = "SMART PARKING PTIT"

    # Real-time WebSocket settings
    redis_url: Optional[str] = None
    ws_max_connections: int = Field(default=500, ge=10, le=10000)

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [item.strip() for item in self.cors_allowed_origins.split(",") if item.strip()]
        return [origin for origin in origins if origin != "*"]

    @property
    def trusted_proxy_set(self) -> set[str]:
        return {item.strip() for item in self.trusted_proxy_ips.split(",") if item.strip()}

    def resolve_auth_secret(self) -> str:
        """Return signing secret, failing fast in production when unconfigured."""
        if self.auth_secret_key and len(self.auth_secret_key.strip()) >= 16:
            return self.auth_secret_key.strip()
        if self.app_env == "production":
            raise RuntimeError(
                "AUTH_SECRET_KEY phải được cấu hình (tối thiểu 16 ký tự, khuyến nghị >= 32 ký tự) "
                "trong môi trường production."
            )
        logger.warning(
            "AUTH_SECRET_KEY chưa được cấu hình; sử dụng khóa ngẫu nhiên tạm thời cho môi trường %s.",
            self.app_env,
        )
        return _EPHEMERAL_DEV_SECRET

    def resolve_seed_password(self) -> Optional[str]:
        """Return initial password for default accounts, disabled in production unless set."""
        if self.auth_default_seed_password:
            return self.auth_default_seed_password
        if self.app_env == "production":
            return None
        return "123456"

    def resolve_db_params(self) -> dict[str, object]:
        """Resolve database connection settings from env or legacy `.streamlit/secrets.toml`."""
        if self.tidb_host and self.tidb_database and self.tidb_user and self.tidb_password:
            return {
                "host": self.tidb_host,
                "port": self.tidb_port,
                "database": self.tidb_database,
                "user": self.tidb_user,
                "password": self.tidb_password,
                "pool_size": self.tidb_pool_size,
                "ssl_ca": self.tidb_ssl_ca or None,
                "ssl_verify_identity": self.tidb_ssl_verify_identity,
                "read_timeout": self.tidb_read_timeout,
                "write_timeout": self.tidb_write_timeout,
            }

        if self.app_env != "production":
            secrets_path = _PROJECT_ROOT / ".streamlit" / "secrets.toml"
            if secrets_path.exists():
                with secrets_path.open("rb") as f:
                    data = tomllib.load(f)
                tidb = data.get("tidb", {})
                if (
                    tidb.get("host")
                    and tidb.get("database")
                    and tidb.get("user")
                    and tidb.get("password")
                ):
                    logger.warning(
                        "Đang đọc cấu hình DB dự phòng từ .streamlit/secrets.toml; "
                        "khuyến nghị chuyển sang tệp .env hoặc biến môi trường TIDB_*."
                    )
                    return {
                        "host": str(tidb["host"]),
                        "port": int(tidb.get("port", 4000)),
                        "database": str(tidb["database"]),
                        "user": str(tidb["user"]),
                        "password": str(tidb["password"]),
                        "pool_size": self.tidb_pool_size,
                        "ssl_ca": str(tidb["ssl_ca"]) if tidb.get("ssl_ca") else None,
                        "ssl_verify_identity": self.tidb_ssl_verify_identity,
                        "read_timeout": self.tidb_read_timeout,
                        "write_timeout": self.tidb_write_timeout,
                    }

        raise RuntimeError(
            "Thiếu cấu hình kết nối DB (biến môi trường TIDB_HOST, TIDB_DATABASE, TIDB_USER, TIDB_PASSWORD)."
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
