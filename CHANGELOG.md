# Changelog

Tất cả các thay đổi đáng chú ý của dự án **Smart Parking System (Nhóm 10 — PTIT)** được ghi lại theo chuẩn [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/).

## [2.1.0] - 2026-11-21

### Added
- **Kiến trúc Backend phân tách hoàn chỉnh:** Tách `ParkingService` thành 6 domain service (`gate`, `infrastructure`, `pass`, `billing`, `directory`, `analytics`) dưới `src/services/domain/` và tách `src/api/main.py` thành 8 router phiên bản hóa `/api/v1/*`.
- **Quản trị cấu hình & Migration có phiên bản:** Thêm `src/core/config.py` (`pydantic-settings`), `src/core/logging.py` (JSON logging + `X-Request-ID`), bảng `schema_migrations` kèm khóa phân tán `GET_LOCK` và bảng `refresh_tokens`.
- **Bảo mật & Real-time nâng cao:** Refresh token rotation (`/auth/refresh`), thu hồi phiên tức thì qua `token_version` (`/auth/logout`), PBKDF2 600.000 vòng kèm rehash tự động, chống liệt kê tài khoản theo thời gian, rate limiting, xác thực WebSocket `/ws/live` bằng single-use ticket (`/auth/ws-ticket`) kèm heartbeat và broadcast song song.
- **Hiện đại hóa React 19 SPA:** Bật TypeScript `strict: true` + `noUncheckedIndexedAccess` (xóa 42 `any`), `react-router-dom` kèm `<RequireRole>` và `React.lazy`, `@tanstack/react-query` kết hợp invalidate đích danh từ WebSocket (0 cảnh báo `oxlint`), Dark Mode, phím tắt POS (`F2`/`F3`/`1–3`/`Enter`/`Esc`), VietQR chuẩn EMVCo/NAPAS TLV có CRC-16, biểu đồ `recharts`, in nhiệt 80mm chuẩn `@page`, và bộ kiểm thử `vitest` + React Testing Library.
- **Đóng gói & CI:** Bổ sung `pyproject.toml`, `requirements-dev.txt`, `.env.example`, `.editorconfig` và GitHub Actions CI (`.github/workflows/ci.yml`).

### Fixed
- Khắc phục lỗi runtime khi gọi `create_tariff` (lệch thứ tự đối số) và `create_employee`/`update_employee` (lệch tên kwargs) từ FastAPI.
- Cho phép `thanhtoan.idld NULL` và chuẩn hóa `thanhtoan.loaithanhtoan` (`'Tiền mặt'` / `'Chuyển khoản'`), khắc phục lỗi `1048` khi thu phí vé tháng và lỗi lệch sổ quỹ ca trực.
- Thống nhất múi giờ lưu trữ UTC `+00:00` kèm chuyển đổi ranh giới ngày Việt Nam (UTC+7), loại bỏ lệch 7 tiếng trên TiDB Cloud.
- Chặn rò rỉ connection pool trong `DBService` khi socket ngắt giữa chừng và sửa logic retry deadlock/write-conflict TiDB (`1205`, `1213`, `8028`, `9007`).
- Chặn `OPERATOR` giả mạo `employee_id`, áp dụng phạm vi bãi `lot_id`, ẩn PII trên danh bạ, không cấp thẻ đang gắn vé tháng cho khách vãng lai, sửa lỗi vé tháng hết hạn vẫn miễn phí vĩnh viễn (tự động quy đổi về đơn giá vé ngày thay vì giá vé tháng), sửa tích Đề-các ở `get_vehicles_detail`, gộp doanh thu vé tháng vào biểu đồ loại xe & bãi đỗ.
- Khóa ghi mặc định trên bản Streamlit kế thừa (`src/app.py`), vá 25 lỗi regex `.str.contains(..., regex=False)`, trùng CSS/icon, lỗi subpath `404.html`, và sửa lỗi ghi đè ô nhập tiền chốt ca khi có sự kiện WebSocket.

## [2.0.0] - 2026-11-21

### Added
- Ra mắt API FastAPI + WebSocket `/ws/live`, xác thực RBAC (`taikhoan`), ca trực thu ngân (`ca_lam_viec`), nhật ký kiểm toán (`audit_logs`) và giao diện SPA React 19 + TypeScript (`frontend/`).
- Bổ sung bộ slide thuyết trình 19 trang (`docs/Cơ sở dữ liệu.pptx`).

## [1.3.0] - 2026-11-19

### Added
- Kiểm tra khóa thẻ và kiểm tra trùng vé tháng còn hiệu lực trong `register_monthly_pass` (`SELECT ... FOR UPDATE`).
- Xuất bản bộ tài liệu PDF hoàn chỉnh trong `docs/`: [Kich_ban_demo.pdf](docs/Kich_ban_demo.pdf) và [Bao_cao_du_an.pdf](docs/Bao_cao_du_an.pdf).

## [1.2.0] - 2026-11-19

### Added
- Trang giới thiệu dự án trên GitHub Pages ([index.html](index.html)), hệ thống `src/ui/` và màn hình Trang 6 Nhân sự & Khách gửi xe.

## [1.1.0] - 2026-11-18

### Fixed
- Khắc phục trùng lượt đỗ và nhân bản dòng sơ đồ vị trí bằng `ROW_NUMBER()` và `SELECT ... FOR UPDATE`.

## [1.0.0] - 2026-11-18

### Added
- Khởi tạo lược đồ `dbptit` (`Dump20261118.sql`), `DBService`, `ParkingService` và giao diện Streamlit ban đầu.
