from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from core.config import Settings, get_settings
from core.exceptions import AuthenticationError, ConflictError, NotFoundError, ValidationError
from services.db_service import DBService

logger = logging.getLogger(__name__)

VALID_ROLES = ("ADMIN", "ACCOUNTANT", "OPERATOR")
PBKDF2_ITERATIONS = 600_000
LEGACY_MIN_PASSWORD_LEN = 6
MIN_PASSWORD_LEN = 8
MAX_PASSWORD_LEN = 128
JWT_ISSUER = "smart-parking-api"
JWT_AUDIENCE = "smart-parking-client"

# Pre-computed dummy hash for constant-time login rejection when username does not exist
_DUMMY_SALT = b"smartparking_dummy_salt_v2"
_DUMMY_HASH = (
    f"pbkdf2_sha256${PBKDF2_ITERATIONS}$"
    f"{base64.urlsafe_b64encode(_DUMMY_SALT).rstrip(b'=').decode('ascii')}$"
    f"{base64.urlsafe_b64encode(hashlib.pbkdf2_hmac('sha256', b'dummy-password', _DUMMY_SALT, PBKDF2_ITERATIONS)).rstrip(b'=').decode('ascii')}"
)


@dataclass(frozen=True)
class AuthUser:
    """Authenticated operator or administrator identity."""

    account_id: int
    employee_id: int
    username: str
    full_name: str
    role: str
    lot_id: Optional[int]
    token_version: int = 1
    must_change_password: bool = False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str, *, allow_legacy_length: bool = False) -> str:
    """Hash a plaintext password using PBKDF2-HMAC-SHA256 (600,000 iterations)."""
    min_len = LEGACY_MIN_PASSWORD_LEN if allow_legacy_length else MIN_PASSWORD_LEN
    if len(password) < min_len:
        raise ValidationError(f"Mật khẩu phải có ít nhất {min_len} ký tự.")
    if len(password) > MAX_PASSWORD_LEN:
        raise ValidationError(f"Mật khẩu tối đa {MAX_PASSWORD_LEN} ký tự.")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64url_encode(salt)}${_b64url_encode(dk)}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2-HMAC-SHA256 hash."""
    if not password or len(password) > MAX_PASSWORD_LEN:
        return False
    try:
        scheme, iter_raw, salt_b64, dk_b64 = stored_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        iterations = int(iter_raw)
        if iterations < 10_000 or iterations > 2_000_000:
            return False
        salt = _b64url_decode(salt_b64)
        expected = _b64url_decode(dk_b64)
    except Exception:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)


def _needs_rehash(stored_hash: str) -> bool:
    try:
        scheme, iter_raw, _, _ = stored_hash.split("$", 3)
        return scheme != "pbkdf2_sha256" or int(iter_raw) < PBKDF2_ITERATIONS
    except Exception:
        return True


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class WebSocketTicketStore:
    """Bounded, thread-safe single-use ticket store for authenticating WebSocket handshakes."""

    def __init__(self, ttl_seconds: int = 30, max_size: int = 2000) -> None:
        self._ttl = ttl_seconds
        self._max_size = max_size
        self._lock = threading.Lock()
        self._tickets: dict[str, tuple[AuthUser, float]] = {}

    def _prune_locked(self, now: float) -> None:
        expired = [k for k, (_, exp) in self._tickets.items() if exp <= now]
        for k in expired:
            self._tickets.pop(k, None)

    def issue(self, user: AuthUser) -> str:
        now = time.monotonic()
        ticket = secrets.token_urlsafe(32)
        with self._lock:
            self._prune_locked(now)
            if len(self._tickets) >= self._max_size:
                oldest = min(self._tickets.items(), key=lambda kv: kv[1][1])[0]
                self._tickets.pop(oldest, None)
            self._tickets[ticket] = (user, now + self._ttl)
        return ticket

    def consume(self, ticket: str) -> AuthUser:
        if not ticket:
            raise AuthenticationError("Thiếu mã xác thực WebSocket.")
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            entry = self._tickets.pop(ticket, None)
        if entry is None:
            raise AuthenticationError("Mã xác thực WebSocket không hợp lệ hoặc đã hết hạn.")
        user, exp = entry
        if exp <= now:
            raise AuthenticationError("Mã xác thực WebSocket đã hết hạn.")
        return user


_shared_ws_tickets = WebSocketTicketStore()


class AuthService:
    """Authentication, RBAC, refresh token lifecycle, and operator account management."""

    def __init__(
        self,
        db: DBService,
        secret_key: Optional[str] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        self.db = db
        self.settings = settings or get_settings()
        resolved_secret = secret_key if secret_key is not None else self.settings.resolve_auth_secret()
        self._secret_key = resolved_secret.encode("utf-8")
        self.ws_tickets = _shared_ws_tickets

    def create_token(self, user: AuthUser, ttl_seconds: Optional[int] = None) -> str:
        """Issue an HS256-signed bearer access token with standard claims."""
        ttl = ttl_seconds if ttl_seconds is not None else self.settings.auth_access_ttl_seconds
        header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
        now = int(time.time())
        payload = _b64url_encode(
            json.dumps(
                {
                    "iss": JWT_ISSUER,
                    "aud": JWT_AUDIENCE,
                    "jti": secrets.token_hex(12),
                    "sub": user.account_id,
                    "emp_id": user.employee_id,
                    "username": user.username,
                    "full_name": user.full_name,
                    "role": user.role,
                    "lot_id": user.lot_id,
                    "tv": user.token_version,
                    "mcp": user.must_change_password,
                    "iat": now,
                    "exp": now + ttl,
                }
            ).encode("utf-8")
        )
        signing_input = f"{header}.{payload}".encode("ascii")
        sig = _b64url_encode(hmac.new(self._secret_key, signing_input, hashlib.sha256).digest())
        return f"{header}.{payload}.{sig}"

    def verify_token(self, token: str) -> AuthUser:
        """Cryptographically validate an HS256 access token and parse claims safely."""
        try:
            header_b64, payload_b64, sig_b64 = token.split(".", 2)
        except ValueError as exc:
            raise AuthenticationError("Token không hợp lệ.") from exc

        try:
            header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
        except Exception as exc:
            raise AuthenticationError("Header token không hợp lệ.") from exc

        if header.get("alg") != "HS256" or header.get("typ") != "JWT":
            raise AuthenticationError("Thuật toán ký token không được hỗ trợ.")

        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = _b64url_encode(
            hmac.new(self._secret_key, signing_input, hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig_b64, expected_sig):
            raise AuthenticationError("Chữ ký token không hợp lệ.")

        try:
            claims = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        except Exception as exc:
            raise AuthenticationError("Không thể giải mã phiên đăng nhập.") from exc

        if not isinstance(claims, dict):
            raise AuthenticationError("Nội dung token không hợp lệ.")

        if claims.get("iss") != JWT_ISSUER or claims.get("aud") != JWT_AUDIENCE:
            raise AuthenticationError("Nguồn phát hành token không hợp lệ.")

        try:
            exp = int(claims["exp"])
            account_id = int(claims["sub"])
            employee_id = int(claims["emp_id"])
            username = str(claims["username"])
            full_name = str(claims["full_name"])
            role = str(claims["role"]).upper()
            lot_raw = claims.get("lot_id")
            lot_id = int(lot_raw) if lot_raw is not None else None
            token_version = int(claims.get("tv", 1))
            must_change = bool(claims.get("mcp", False))
        except (KeyError, TypeError, ValueError) as exc:
            raise AuthenticationError("Thông tin phiên đăng nhập bị thiếu hoặc không hợp lệ.") from exc

        if exp < int(time.time()):
            raise AuthenticationError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")

        if role not in VALID_ROLES:
            raise AuthenticationError("Vai trò trong token không hợp lệ.")

        return AuthUser(
            account_id=account_id,
            employee_id=employee_id,
            username=username,
            full_name=full_name,
            role=role,
            lot_id=lot_id,
            token_version=token_version,
            must_change_password=must_change,
        )

    def verify_active_token(self, token: str) -> AuthUser:
        """Verify token signature AND re-validate live account active status and token_version."""
        token_user = self.verify_token(token)
        row = self.db.fetch_one(
            """
            SELECT tk.id, tk.idnv, tk.username, tk.role, tk.is_active,
                   COALESCE(tk.token_version, 1) AS token_version,
                   COALESCE(tk.must_change_password, 0) AS must_change_password,
                   nv.hoten, nv.idbdx
            FROM taikhoan tk
            JOIN nhanvien nv ON nv.id = tk.idnv
            WHERE tk.id = %s
            """,
            (token_user.account_id,),
        )
        if not row or not int(row["is_active"]):
            raise AuthenticationError("Tài khoản đã bị khóa hoặc không còn tồn tại.")
        db_version = int(row.get("token_version") or 1)
        if db_version != token_user.token_version:
            raise AuthenticationError("Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.")
        return AuthUser(
            account_id=int(row["id"]),
            employee_id=int(row["idnv"]),
            username=str(row["username"]),
            full_name=str(row["hoten"] or row["username"]),
            role=str(row["role"]).upper(),
            lot_id=int(row["idbdx"]) if row.get("idbdx") is not None else None,
            token_version=db_version,
            must_change_password=bool(int(row.get("must_change_password") or 0)),
        )

    def authenticate(self, username: str, password: str) -> AuthUser:
        """Verify username and password in constant time and update last_login_at."""
        clean_user = (username or "").strip().lower()
        if not clean_user or not password:
            raise AuthenticationError("Vui lòng nhập tên đăng nhập và mật khẩu.")

        row = self.db.fetch_one(
            """
            SELECT tk.id, tk.idnv, tk.username, tk.password_hash, tk.role, tk.is_active,
                   COALESCE(tk.token_version, 1) AS token_version,
                   COALESCE(tk.must_change_password, 0) AS must_change_password,
                   nv.hoten, nv.idbdx
            FROM taikhoan tk
            JOIN nhanvien nv ON nv.id = tk.idnv
            WHERE tk.username = %s
            """,
            (clean_user,),
        )
        if not row:
            # Constant-time dummy PBKDF2 run to prevent username enumeration via timing
            verify_password(password, _DUMMY_HASH)
            raise AuthenticationError("Tên đăng nhập hoặc mật khẩu không đúng.")

        stored_hash = str(row["password_hash"])
        if not verify_password(password, stored_hash):
            raise AuthenticationError("Tên đăng nhập hoặc mật khẩu không đúng.")
        if not int(row["is_active"]):
            raise AuthenticationError("Tài khoản đã bị khóa. Liên hệ quản trị viên.")

        if _needs_rehash(stored_hash):
            upgraded_hash = hash_password(password, allow_legacy_length=True)
            self.db.execute_non_query(
                "UPDATE taikhoan SET password_hash = %s, last_login_at = UTC_TIMESTAMP() WHERE id = %s",
                (upgraded_hash, int(row["id"])),
            )
        else:
            self.db.execute_non_query(
                "UPDATE taikhoan SET last_login_at = UTC_TIMESTAMP() WHERE id = %s",
                (int(row["id"]),),
            )

        return AuthUser(
            account_id=int(row["id"]),
            employee_id=int(row["idnv"]),
            username=str(row["username"]),
            full_name=str(row["hoten"] or row["username"]),
            role=str(row["role"]).upper(),
            lot_id=int(row["idbdx"]) if row.get("idbdx") is not None else None,
            token_version=int(row.get("token_version") or 1),
            must_change_password=bool(int(row.get("must_change_password") or 0)),
        )

    def create_refresh_token(self, user: AuthUser) -> str:
        """Issue and persist a hashed opaque refresh token."""
        raw_token = secrets.token_urlsafe(48)
        token_hash = _hash_token(raw_token)
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=self.settings.auth_refresh_ttl_seconds)
        ).strftime("%Y-%m-%d %H:%M:%S")
        self.db.execute_non_query(
            """
            INSERT INTO refresh_tokens (account_id, token_hash, expires_at)
            VALUES (%s, %s, %s)
            """,
            (user.account_id, token_hash, expires_at),
        )
        return raw_token

    def rotate_refresh_token(self, raw_token: str) -> tuple[AuthUser, str, str]:
        """Validate a refresh token, revoke it atomically, and issue a new token pair."""
        if not raw_token or len(raw_token) < 16:
            raise AuthenticationError("Refresh token không hợp lệ.")
        token_hash = _hash_token(raw_token)
        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        new_raw = secrets.token_urlsafe(48)
        new_hash = _hash_token(new_raw)
        new_exp = (now_utc + timedelta(seconds=self.settings.auth_refresh_ttl_seconds)).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        with self.db.transaction() as cursor:
            cursor.execute(
                """
                SELECT rt.id, rt.account_id, rt.expires_at, rt.revoked_at,
                       tk.idnv, tk.username, tk.role, tk.is_active,
                       COALESCE(tk.token_version, 1) AS token_version,
                       COALESCE(tk.must_change_password, 0) AS must_change_password,
                       nv.hoten, nv.idbdx
                FROM refresh_tokens rt
                JOIN taikhoan tk ON tk.id = rt.account_id
                JOIN nhanvien nv ON nv.id = tk.idnv
                WHERE rt.token_hash = %s
                FOR UPDATE
                """,
                (token_hash,),
            )
            row = cursor.fetchone()
            if not row or row.get("revoked_at") is not None:
                raise AuthenticationError("Phiên làm mới không hợp lệ hoặc đã bị thu hồi.")

            exp_dt = row["expires_at"]
            if isinstance(exp_dt, str):
                exp_dt = datetime.fromisoformat(exp_dt)
            if exp_dt <= now_utc:
                raise AuthenticationError("Refresh token đã hết hạn. Vui lòng đăng nhập lại.")

            if not int(row["is_active"]):
                raise AuthenticationError("Tài khoản đã bị khóa.")

            cursor.execute(
                "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = %s",
                (int(row["id"]),),
            )
            cursor.execute(
                """
                INSERT INTO refresh_tokens (account_id, token_hash, expires_at)
                VALUES (%s, %s, %s)
                """,
                (int(row["account_id"]), new_hash, new_exp),
            )

        user = AuthUser(
            account_id=int(row["account_id"]),
            employee_id=int(row["idnv"]),
            username=str(row["username"]),
            full_name=str(row["hoten"] or row["username"]),
            role=str(row["role"]).upper(),
            lot_id=int(row["idbdx"]) if row.get("idbdx") is not None else None,
            token_version=int(row.get("token_version") or 1),
            must_change_password=bool(int(row.get("must_change_password") or 0)),
        )
        access_token = self.create_token(user)
        return user, access_token, new_raw

    def revoke_session(self, account_id: int, refresh_token: Optional[str] = None) -> None:
        """Revoke a specific refresh token or invalidate all active sessions for the account."""
        with self.db.transaction() as cursor:
            if refresh_token:
                cursor.execute(
                    "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = %s AND account_id = %s",
                    (_hash_token(refresh_token), account_id),
                )
            else:
                cursor.execute(
                    "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE account_id = %s AND revoked_at IS NULL",
                    (account_id,),
                )
            cursor.execute(
                "UPDATE taikhoan SET token_version = COALESCE(token_version, 1) + 1 WHERE id = %s",
                (account_id,),
            )

    def ensure_default_accounts(self) -> int:
        """Seed initial accounts atomically with unique salts per account when taikhoan is empty."""
        seed_password = self.settings.resolve_seed_password()
        if not seed_password:
            logger.info("Skipping default account seeding because AUTH_DEFAULT_SEED_PASSWORD is unset in production.")
            return 0

        with self.db.transaction() as cursor:
            cursor.execute("SELECT COUNT(*) AS cnt FROM taikhoan FOR UPDATE")
            count_row = cursor.fetchone()
            if count_row and int(count_row["cnt"]) > 0:
                return 0

            cursor.execute("SELECT id, hoten, chucvu FROM nhanvien ORDER BY id")
            employees = cursor.fetchall() or []
            if not employees:
                return 0

            role_by_position = {
                "quản lý": "ADMIN",
                "thu ngân": "ACCOUNTANT",
                "bảo vệ": "OPERATOR",
            }
            created = 0
            used_usernames: set[str] = set()

            for emp in employees:
                pos = str(emp.get("chucvu") or "").strip().lower()
                role = role_by_position.get(pos, "OPERATOR")
                if role == "ADMIN" and "admin" not in used_usernames:
                    uname = "admin"
                elif role == "ACCOUNTANT" and "thungan" not in used_usernames:
                    uname = "thungan"
                elif role == "OPERATOR" and "baove" not in used_usernames:
                    uname = "baove"
                else:
                    uname = f"nv{int(emp['id'])}"
                used_usernames.add(uname)

                unique_hash = hash_password(seed_password, allow_legacy_length=True)
                cursor.execute(
                    """
                    INSERT IGNORE INTO taikhoan (idnv, username, password_hash, role, is_active, token_version, must_change_password)
                    VALUES (%s, %s, %s, %s, 1, 1, 1)
                    """,
                    (int(emp["id"]), uname, unique_hash, role),
                )
                if cursor.rowcount:
                    created += 1
            return created

    def list_accounts(self) -> list[dict[str, Any]]:
        """List all operator accounts joined with employee and parking lot info."""
        return self.db.fetch_all(
            """
            SELECT tk.id, tk.idnv, tk.username, tk.role, tk.is_active,
                   COALESCE(tk.must_change_password, 0) AS must_change_password,
                   tk.last_login_at, tk.created_at,
                   nv.hoten AS ten_nhanvien, nv.chucvu, nv.sdt, nv.email,
                   bdx.tenbaido
            FROM taikhoan tk
            JOIN nhanvien nv ON nv.id = tk.idnv
            LEFT JOIN baidoxe bdx ON bdx.id = nv.idbdx
            ORDER BY tk.id
            """
        )

    def create_account(
        self, employee_id: int, username: str, password: str, role: str
    ) -> int:
        """Create a login account atomically linked to an employee."""
        clean_user = (username or "").strip().lower()
        if (
            len(clean_user) < 3
            or len(clean_user) > 50
            or not clean_user.replace("_", "").replace(".", "").isalnum()
        ):
            raise ValidationError("Tên đăng nhập phải dài 3-50 ký tự (chữ, số, '.', '_').")
        clean_role = role.strip().upper()
        if clean_role not in VALID_ROLES:
            raise ValidationError("Vai trò không hợp lệ.")

        pw_hash = hash_password(password)
        with self.db.transaction() as cursor:
            cursor.execute("SELECT id FROM nhanvien WHERE id = %s FOR UPDATE", (employee_id,))
            if not cursor.fetchone():
                raise NotFoundError("Không tìm thấy nhân viên.")
            cursor.execute("SELECT id FROM taikhoan WHERE username = %s LIMIT 1", (clean_user,))
            if cursor.fetchone():
                raise ConflictError("Tên đăng nhập đã tồn tại.")
            cursor.execute("SELECT id FROM taikhoan WHERE idnv = %s LIMIT 1", (employee_id,))
            if cursor.fetchone():
                raise ConflictError("Nhân viên này đã có tài khoản.")

            cursor.execute(
                """
                INSERT INTO taikhoan (idnv, username, password_hash, role, is_active, token_version, must_change_password)
                VALUES (%s, %s, %s, %s, 1, 1, 0)
                """,
                (employee_id, clean_user, pw_hash, clean_role),
            )
            return int(cursor.lastrowid)

    def update_account(
        self,
        account_id: int,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        new_password: Optional[str] = None,
    ) -> None:
        """Update account role/status/password atomically, preventing last-admin lockout and revoking old tokens."""
        clean_role: Optional[str] = None
        if role is not None:
            clean_role = role.strip().upper()
            if clean_role not in VALID_ROLES:
                raise ValidationError("Vai trò không hợp lệ.")
        pw_hash = hash_password(new_password) if new_password else None

        with self.db.transaction() as cursor:
            cursor.execute(
                "SELECT id, role, is_active FROM taikhoan WHERE id = %s FOR UPDATE",
                (account_id,),
            )
            current = cursor.fetchone()
            if not current:
                raise NotFoundError("Không tìm thấy tài khoản.")

            removing_admin = str(current["role"]).upper() == "ADMIN" and int(current["is_active"]) == 1 and (
                (is_active is False) or (clean_role is not None and clean_role != "ADMIN")
            )
            if removing_admin:
                cursor.execute(
                    "SELECT COUNT(*) AS cnt FROM taikhoan WHERE role = 'ADMIN' AND is_active = 1 AND id <> %s",
                    (account_id,),
                )
                other_admins = cursor.fetchone()
                if not other_admins or int(other_admins["cnt"]) == 0:
                    raise ConflictError("Không thể khóa hoặc hạ quyền quản trị viên (ADMIN) cuối cùng.")

            sets: list[str] = []
            params: list[Any] = []
            invalidate_tokens = False

            if clean_role is not None:
                sets.append("role = %s")
                params.append(clean_role)
                invalidate_tokens = True
            if is_active is not None:
                sets.append("is_active = %s")
                params.append(1 if is_active else 0)
                if not is_active:
                    invalidate_tokens = True
            if pw_hash is not None:
                sets.append("password_hash = %s")
                params.append(pw_hash)
                sets.append("must_change_password = 0")
                invalidate_tokens = True

            if not sets:
                return

            if invalidate_tokens:
                sets.append("token_version = COALESCE(token_version, 1) + 1")

            params.append(account_id)
            cursor.execute(f"UPDATE taikhoan SET {', '.join(sets)} WHERE id = %s", tuple(params))
            if invalidate_tokens:
                cursor.execute(
                    "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE account_id = %s AND revoked_at IS NULL",
                    (account_id,),
                )

    def change_own_password(
        self, account_id: int, old_password: str, new_password: str
    ) -> None:
        """Allow an authenticated user to change their password and revoke previous tokens."""
        new_hash = hash_password(new_password)
        with self.db.transaction() as cursor:
            cursor.execute(
                "SELECT password_hash FROM taikhoan WHERE id = %s FOR UPDATE",
                (account_id,),
            )
            row = cursor.fetchone()
            if not row or not verify_password(old_password, str(row["password_hash"])):
                raise ValidationError("Mật khẩu hiện tại không đúng.")
            cursor.execute(
                """
                UPDATE taikhoan
                SET password_hash = %s,
                    must_change_password = 0,
                    token_version = COALESCE(token_version, 1) + 1
                WHERE id = %s
                """,
                (new_hash, account_id),
            )
            cursor.execute(
                "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE account_id = %s AND revoked_at IS NULL",
                (account_id,),
            )
