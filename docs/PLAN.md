# Project Plan & Roadmap

## Giai đoạn 1–4: Nền tảng CSDL & Prototype Streamlit (Hoàn thành — v1.0 → v1.3)
- [x] Thiết lập kho mã nguồn, lược đồ 13 bảng `dbptit` (`Dump20261118.sql`) và tài liệu báo cáo đồ án PTIT.
- [x] Xây dựng `DBService`, `ParkingService` có giao dịch `SELECT ... FOR UPDATE`, giao diện Streamlit 6 trang (`src/app.py`) và trang giới thiệu GitHub Pages (`index.html`).

## Giai đoạn 5: Kiến trúc Full-Stack Production (Hoàn thành — v2.0 → v2.1)
- [x] **CSDL & Migration:** Runner migration có phiên bản (`schema_migrations` + `GET_LOCK`), sửa `thanhtoan.idld NULL`, chuẩn hóa `loaithanhtoan`, thống nhất UTC `+00:00`, vá rò rỉ connection pool và bổ sung chỉ mục tổng hợp.
- [x] **Tách Domain & Models:** Phân tách `ParkingService` thành 6 domain service dưới `src/services/domain/` và thay thế các dataclass cũ bằng bộ Pydantic v2 canonical DTOs (`src/models/`).
- [x] **FastAPI `/api/v1` & Bảo mật:** Tách 8 router REST, phân trang & lọc tại SQL, xuất CSV phía server, RBAC 3 vai trò + `lot_id` scoping + ẩn PII, PBKDF2 600k + refresh token rotation + thu hồi tức thì qua `token_version`, rate limiting, WebSocket `/ws/live` xác thực single-use ticket và broadcast song song.
- [x] **React 19 + TypeScript SPA:** Bật `strict: true`, React Router + `React.lazy`, TanStack Query + targeted WS invalidation, Recharts, VietQR chuẩn EMVCo/NAPAS TLV, phím tắt quầy POS, Dark Mode, in nhiệt 80mm và 0 cảnh báo `oxlint`.
- [x] **Kiểm thử & CI:** Bộ kiểm thử `pytest` + `vitest`, `ruff` + `mypy`, `pyproject.toml` và GitHub Actions CI.
- [x] **Định vị Streamlit kế thừa:** Khóa ghi mặc định (`ENABLE_LEGACY_STREAMLIT_WRITES=1`), vá regex/deprecations và đồng bộ toàn bộ tài liệu dự án.
