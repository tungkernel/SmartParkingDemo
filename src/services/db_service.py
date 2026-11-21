from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Optional, Sequence, TypeVar, cast

from mysql.connector import Error, pooling
from mysql.connector.connection import MySQLConnection

from core.exceptions import DatabaseError

logger = logging.getLogger(__name__)
_T = TypeVar("_T")

# Transient MySQL / TiDB error codes:
# 1205: Lock wait timeout, 1213: Deadlock, 2006: Server gone away,
# 2013: Lost connection during query, 8028: TiDB schema changed, 9007: TiDB write conflict
_READ_TRANSIENT_ERRNOS = {1205, 1213, 2006, 2013, 8028, 9007}
_WRITE_RETRYABLE_ERRNOS = {1205, 1213, 2006, 8028, 9007}


@dataclass(frozen=True)
class DBConfig:
    """Immutable database connection configuration with masked credentials."""

    host: str
    database: str
    user: str
    password: str = field(repr=False)
    port: int = 4000
    ssl_ca: Optional[str] = None
    ssl_verify_identity: bool = True
    pool_size: int = 8
    read_timeout: int = 30
    write_timeout: int = 30


class DBService:
    """Infrastructure service managing MySQL/TiDB connection pooling and transactions."""

    def __init__(
        self,
        host: str,
        database: str,
        user: str,
        password: str,
        port: int = 4000,
        pool_size: int = 8,
        ssl_ca: Optional[str] = None,
        ssl_verify_identity: bool = True,
        read_timeout: int = 30,
        write_timeout: int = 30,
    ) -> None:
        clamped_pool_size = max(2, min(32, int(pool_size)))
        self.config = DBConfig(
            host=host,
            database=database,
            user=user,
            password=password,
            port=int(port),
            ssl_ca=ssl_ca or None,
            ssl_verify_identity=ssl_verify_identity,
            pool_size=clamped_pool_size,
            read_timeout=max(1, int(read_timeout)),
            write_timeout=max(1, int(write_timeout)),
        )
        self._pool_size = clamped_pool_size
        self._pool: Optional[pooling.MySQLConnectionPool] = None
        self._pool_lock = threading.Lock()
        self._pinned = threading.local()

    @classmethod
    def from_config(cls, config: DBConfig) -> DBService:
        """Instantiate DBService from a DBConfig instance preserving all options."""
        return cls(
            host=config.host,
            database=config.database,
            user=config.user,
            password=config.password,
            port=config.port,
            pool_size=config.pool_size,
            ssl_ca=config.ssl_ca,
            ssl_verify_identity=config.ssl_verify_identity,
            read_timeout=config.read_timeout,
            write_timeout=config.write_timeout,
        )

    @classmethod
    def from_env(cls) -> Optional[DBService]:
        """Load DBService from environment variables if present."""
        host = os.getenv("TIDB_HOST")
        database = os.getenv("TIDB_DATABASE")
        user = os.getenv("TIDB_USER")
        password = os.getenv("TIDB_PASSWORD")
        if not (host and database and user and password):
            return None
        port_raw = os.getenv("TIDB_PORT", "4000")
        pool_raw = os.getenv("TIDB_POOL_SIZE", "8")
        ssl_ca = os.getenv("TIDB_SSL_CA")
        verify_id = os.getenv("TIDB_SSL_VERIFY_IDENTITY", "true").lower() not in ("0", "false", "no")
        read_timeout = int(os.getenv("TIDB_READ_TIMEOUT", "30"))
        write_timeout = int(os.getenv("TIDB_WRITE_TIMEOUT", "30"))
        return cls(
            host=host,
            database=database,
            user=user,
            password=password,
            port=int(port_raw),
            pool_size=max(2, min(32, int(pool_raw))),
            ssl_ca=ssl_ca or None,
            ssl_verify_identity=verify_id,
            read_timeout=read_timeout,
            write_timeout=write_timeout,
        )

    @staticmethod
    def _safe_close(cursor: Any, conn: Optional[MySQLConnection]) -> None:
        """Unconditionally close cursor and return pooled connection without leaking slots."""
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                logger.debug("Ignoring error while closing DB cursor", exc_info=True)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                logger.debug("Ignoring error while returning DB connection to pool", exc_info=True)

    @staticmethod
    def _safe_rollback(conn: Optional[MySQLConnection]) -> None:
        """Roll back an active transaction without masking the originating exception."""
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                logger.debug("Ignoring error during rollback on dropped connection", exc_info=True)

    def _get_pool(self) -> pooling.MySQLConnectionPool:
        """Lazily initialize and return the thread-safe MySQL connection pool."""
        if self._pool is None:
            with self._pool_lock:
                if self._pool is None:
                    raw_key = (
                        f"{self.config.host}:{self.config.port}/"
                        f"{self.config.database}/{self.config.user}/{id(self)}"
                    )
                    pool_name = "ptit_" + hashlib.sha1(raw_key.encode("utf-8")).hexdigest()[:12]
                    pool_kwargs: dict[str, Any] = {
                        "pool_name": pool_name,
                        "pool_size": self._pool_size,
                        "pool_reset_session": True,
                        "host": self.config.host,
                        "port": self.config.port,
                        "database": self.config.database,
                        "user": self.config.user,
                        "password": self.config.password,
                        "charset": "utf8mb4",
                        "time_zone": "+00:00",
                        "connection_timeout": 10,
                        "read_timeout": self.config.read_timeout,
                        "write_timeout": self.config.write_timeout,
                    }
                    if self.config.ssl_ca:
                        pool_kwargs["ssl_ca"] = self.config.ssl_ca
                        pool_kwargs["ssl_verify_cert"] = True
                        pool_kwargs["ssl_verify_identity"] = self.config.ssl_verify_identity
                    self._pool = pooling.MySQLConnectionPool(**pool_kwargs)
        return self._pool

    def close_pool(self) -> None:
        """Release reference to the connection pool during graceful shutdown."""
        with self._pool_lock:
            self._pool = None

    def _acquire_connection(self) -> MySQLConnection:
        """Borrow a pooled connection raising raw mysql.connector.Error for retry handling."""
        conn = self._get_pool().get_connection()
        if not conn.is_connected():
            conn.ping(reconnect=True, attempts=1, delay=0)
        return conn  # type: ignore[return-value]

    def _run_with_retry(
        self,
        fn: Callable[[], _T],
        retryable_errnos: set[int] = _READ_TRANSIENT_ERRNOS,
        max_attempts: int = 3,
    ) -> _T:
        """Retry transient MySQL/TiDB errors with exponential backoff."""
        delay = 0.15
        for attempt in range(1, max_attempts + 1):
            try:
                return fn()
            except Error as exc:
                errno = getattr(exc, "errno", None)
                if errno in retryable_errnos and attempt < max_attempts:
                    logger.warning(
                        "Transient DB error (errno=%s, attempt=%s/%s): %s",
                        errno,
                        attempt,
                        max_attempts,
                        exc,
                    )
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
        raise DatabaseError("Lỗi kết nối cơ sở dữ liệu sau nhiều lần thử lại.")

    def get_connection(self) -> MySQLConnection:
        """Borrow a pooled database connection wrapped with DatabaseError."""
        try:
            return self._acquire_connection()
        except Error as exc:
            logger.error("Failed to acquire DB connection: %s", exc)
            raise DatabaseError("Không thể kết nối tới cơ sở dữ liệu.") from exc

    def test_connection(self) -> tuple[bool, str]:
        """Verify database connectivity and return (ok, safe_message)."""
        conn: Optional[MySQLConnection] = None
        cursor = None
        try:
            conn = self._acquire_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            return True, "Kết nối cơ sở dữ liệu thành công."
        except Exception as exc:
            logger.error("Database health check failed: %s", exc)
            return False, "Không thể kết nối tới cơ sở dữ liệu."
        finally:
            self._safe_close(cursor, conn)

    def _get_pinned_connection(self) -> Optional[MySQLConnection]:
        return getattr(self._pinned, "conn", None)

    @contextmanager
    def advisory_lock(self, lock_name: str, timeout: int = 30) -> Iterator[bool]:
        """Hold a session-scoped MySQL/TiDB advisory lock on a single pinned pooled connection.

        All `fetch_one`, `fetch_all`, and `execute_non_query` calls executed inside this
        context reuse the exact same connection so `pool_reset_session=True` never drops
        the advisory lock prematurely before `RELEASE_LOCK` runs.
        """
        conn: Optional[MySQLConnection] = None
        acquired = False
        prev_pinned = getattr(self._pinned, "conn", None)
        try:
            conn = self._acquire_connection()
            cursor = None
            try:
                cursor = conn.cursor(dictionary=True, buffered=True)
                cursor.execute("SELECT GET_LOCK(%s, %s) AS got", (lock_name, int(timeout)))
                row = cursor.fetchone()
                acquired = bool(row and int(cast(dict[str, Any], row).get("got") or 0) == 1)
            except Exception as exc:
                logger.debug("Advisory GET_LOCK unavailable on target engine: %s", exc)
                acquired = False
            finally:
                if cursor is not None:
                    try:
                        cursor.close()
                    except Exception:
                        pass
            self._pinned.conn = conn
            yield acquired
        finally:
            self._pinned.conn = prev_pinned
            if conn is not None:
                if acquired:
                    rel_cursor = None
                    try:
                        rel_cursor = conn.cursor(buffered=True)
                        rel_cursor.execute("SELECT RELEASE_LOCK(%s)", (lock_name,))
                        rel_cursor.fetchone()
                    except Exception:
                        logger.debug("Ignoring RELEASE_LOCK failure", exc_info=True)
                    finally:
                        if rel_cursor is not None:
                            try:
                                rel_cursor.close()
                            except Exception:
                                pass
                self._safe_close(None, conn)

    def fetch_all(
        self,
        query: str,
        params: Optional[Sequence[Any]] = None,
    ) -> list[dict[str, Any]]:
        """Execute a SELECT query and return all rows as dictionaries."""

        def _exec() -> list[dict[str, Any]]:
            pinned = self._get_pinned_connection()
            conn: Optional[MySQLConnection] = pinned
            cursor = None
            try:
                if conn is None:
                    conn = self._acquire_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute(query, params)
                rows = cursor.fetchall()
                return list(cast(list[dict[str, Any]], rows)) if rows else []
            finally:
                self._safe_close(cursor, None if pinned is not None else conn)

        try:
            return self._run_with_retry(_exec, _READ_TRANSIENT_ERRNOS)
        except Error as exc:
            logger.error("fetch_all error: %s", exc)
            raise DatabaseError("Lỗi truy vấn dữ liệu cơ sở dữ liệu.") from exc

    def fetch_one(
        self,
        query: str,
        params: Optional[Sequence[Any]] = None,
    ) -> Optional[dict[str, Any]]:
        """Execute a SELECT query and return the first row directly without buffering all rows."""

        def _exec() -> Optional[dict[str, Any]]:
            pinned = self._get_pinned_connection()
            conn: Optional[MySQLConnection] = pinned
            cursor = None
            try:
                if conn is None:
                    conn = self._acquire_connection()
                cursor = conn.cursor(dictionary=True, buffered=True)
                cursor.execute(query, params)
                row = cursor.fetchone()
                return dict(cast(dict[str, Any], row)) if row is not None else None
            finally:
                self._safe_close(cursor, None if pinned is not None else conn)

        try:
            return self._run_with_retry(_exec, _READ_TRANSIENT_ERRNOS)
        except Error as exc:
            logger.error("fetch_one error: %s", exc)
            raise DatabaseError("Lỗi truy vấn dữ liệu cơ sở dữ liệu.") from exc

    def execute_query(
        self,
        query: str,
        params: Optional[Sequence[Any]] = None,
    ) -> list[dict[str, Any]]:
        """Backward-compatible alias for fetch_all."""
        return self.fetch_all(query, params)

    def execute_non_query(
        self,
        query: str,
        params: Optional[Sequence[Any]] = None,
    ) -> int:
        """Execute an INSERT/UPDATE/DELETE query and return lastrowid or rowcount."""

        def _exec() -> int:
            pinned = self._get_pinned_connection()
            conn: Optional[MySQLConnection] = pinned
            cursor = None
            try:
                if conn is None:
                    conn = self._acquire_connection()
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                return int(cursor.lastrowid) if cursor.lastrowid else int(cursor.rowcount)
            except Error:
                self._safe_rollback(conn)
                raise
            finally:
                self._safe_close(cursor, None if pinned is not None else conn)

        try:
            return self._run_with_retry(_exec, _WRITE_RETRYABLE_ERRNOS)
        except Error as exc:
            logger.error("execute_non_query error: %s", exc)
            raise DatabaseError("Lỗi cập nhật dữ liệu cơ sở dữ liệu.") from exc

    def execute_batch(
        self,
        query: str,
        params_list: Sequence[Sequence[Any]],
    ) -> int:
        """Execute a bulk parameterized statement inside a single transaction."""
        if not params_list:
            return 0

        def _exec() -> int:
            conn: Optional[MySQLConnection] = None
            cursor = None
            try:
                conn = self._acquire_connection()
                cursor = conn.cursor()
                cursor.executemany(query, params_list)
                conn.commit()
                return int(cursor.rowcount)
            except Error:
                self._safe_rollback(conn)
                raise
            finally:
                self._safe_close(cursor, conn)

        try:
            return self._run_with_retry(_exec, _WRITE_RETRYABLE_ERRNOS)
        except Error as exc:
            logger.error("execute_batch error: %s", exc)
            raise DatabaseError("Lỗi cập nhật hàng loạt cơ sở dữ liệu.") from exc

    def execute_transaction(
        self,
        operations: Sequence[tuple[str, Optional[Sequence[Any]]]],
    ) -> None:
        """Execute multiple SQL statements atomically with deadlock/conflict retry."""

        def _exec() -> None:
            conn: Optional[MySQLConnection] = None
            cursor = None
            try:
                conn = self._acquire_connection()
                cursor = conn.cursor()
                for query, params in operations:
                    cursor.execute(query, params)
                conn.commit()
            except Error:
                self._safe_rollback(conn)
                raise
            finally:
                self._safe_close(cursor, conn)

        try:
            self._run_with_retry(_exec, _WRITE_RETRYABLE_ERRNOS)
        except Error as exc:
            logger.error("execute_transaction error: %s", exc)
            raise DatabaseError("Lỗi giao dịch cơ sở dữ liệu.") from exc

    @contextmanager
    def transaction(self) -> Iterator[Any]:
        """Provide a transactional dictionary cursor with safe commit/rollback/cleanup."""
        conn: Optional[MySQLConnection] = None
        cursor = None
        try:
            conn = self._acquire_connection()
            cursor = conn.cursor(dictionary=True, buffered=True)
            yield cursor
            conn.commit()
        except Error as exc:
            self._safe_rollback(conn)
            logger.error("Transaction DB error: %s", exc)
            raise DatabaseError("Lỗi giao dịch cơ sở dữ liệu.") from exc
        except Exception:
            self._safe_rollback(conn)
            raise
        finally:
            self._safe_close(cursor, conn)

    def run_in_transaction(self, fn: Callable[[Any], _T], max_attempts: int = 3) -> _T:
        """Run a transactional callback with automatic retry on deadlock or TiDB write conflicts."""

        def _exec() -> _T:
            conn: Optional[MySQLConnection] = None
            cursor = None
            try:
                conn = self._acquire_connection()
                cursor = conn.cursor(dictionary=True, buffered=True)
                result = fn(cursor)
                conn.commit()
                return result
            except Error:
                self._safe_rollback(conn)
                raise
            except Exception:
                self._safe_rollback(conn)
                raise
            finally:
                self._safe_close(cursor, conn)

        try:
            return self._run_with_retry(_exec, _WRITE_RETRYABLE_ERRNOS, max_attempts=max_attempts)
        except Error as exc:
            logger.error("run_in_transaction failed: %s", exc)
            raise DatabaseError("Lỗi giao dịch cơ sở dữ liệu.") from exc
