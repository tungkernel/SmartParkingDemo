# Changelog

Tất cả các thay đổi đáng chú ý của dự án **Smart Parking System (Nhóm 10 — PTIT)** được ghi lại theo chuẩn [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/).

## [2.2.0] - 2026-11-24

### Changed
- **Tinh gọn về đúng 13 bảng ERD `dbptit`:** Loại bỏ hoàn toàn 5 bảng vận hành ngoài ERD (`taikhoan`, `refresh_tokens`, `ca_lam_viec`, `audit_logs`, `schema_migrations`) cả trên TiDB Cloud lẫn mã nguồn, giúp CSDL bám sát mô hình học phần Cơ sở dữ liệu.
- **Chế độ quản lý trực tiếp không cần đăng nhập:** Bỏ luồng Login/JWT/RBAC để mở thẳng vào bàn điều hành **Gate POS (`/gate`)** cho một người quản lý duy nhất; WebSocket `/ws/live` kết nối trực tiếp với kiểm tra origin allowlist thay cho cơ chế single-use ticket.
- **Ghi nhận nhân viên thực hiện (Option A — `idnv` attribution):** Bổ sung danh sách nhân viên vào `/api/v1/catalogs` và bộ chọn nhân viên tự động gợi ý theo bãi đỗ & chức vụ (*Bảo vệ* cho Check-in, *Thu ngân* cho Check-out và Đăng ký/Gia hạn vé tháng, cho phép đổi tay) kèm lọc `employee_id` và `payment_method` trên trang Giao dịch và xuất CSV.
- **Đơn giản hóa Quản trị Hệ thống:** Gom màn hình `/admin` từ 5 tab xuống còn 3 tab cốt lõi (`Nhân sự & Danh bạ`, `Kho thẻ RFID`, `Hạ tầng bãi/khu`) và tinh gọn giao diện trang Giao dịch (`/transactions`).

### Added
- **Trình khởi chạy 1-click trên Windows:** Thêm `Mo_SmartParking.bat`, `scripts/launch_app.py` (tự động build `frontend/dist` nếu thiếu, probe `/health/live`, phát hiện trùng instance hoặc xung đột cổng, mở trình duyệt tự động) và `scripts/Tao_Shortcut_Desktop.bat` (tạo lối tắt `Smart Parking PTIT` trên Desktop).

### Removed
- Xóa các module đăng nhập, phân quyền, đối soát ca làm việc và startup migration: `src/services/auth_service.py`, `src/services/migration_service.py`, `src/api/v1/routers/auth.py`, `.streamlit/config.toml`, cùng các component/trang frontend tương ứng (`LoginPage`, `AuthContext`, `ChangePasswordModal`, `TransactionsShiftsPage`, `AccountsTab`, `AuditLogsTab`, `AuditLogDrawer`, `PasswordInput`) và các micro-docs trùng lặp (`docs/LICENSE.md`, `docs/IDEA.md`, `docs/MVP.md`, `docs/PLAN.md`, `docs/PROJECT.md`, `docs/SPEC.md`).

### Fixed
- Khắc phục lỗi thiếu `AUTO_INCREMENT` trên bảng `nhanvien.id` ở TiDB Cloud khi thêm nhân viên mới bằng truy vấn cấp phát `COALESCE(MAX(id), 0) + 1` với `SELECT ... FOR UPDATE`.

## [2.1.0] - 2026-11-21

### Added
- **Kiến trúc Backend phân tách hoàn chỉnh:** Tách `ParkingService` thành 6 domain service (`gate`, `infrastructure`, `pass`, `billing`, `directory`, `analytics`) dưới `src/services/domain/` và tách `src/api/main.py` thành các router phiên bản hóa `/api/v1/*`.
- **Quản trị cấu hình & Migration có phiên bản:** Thêm `src/core/config.py` (`pydantic-settings`), `src/core/logging.py` (JSON logging + `X-Request-ID`), bảng `schema_migrations` kèm khóa phân tán `GET_LOCK` và bảng `refresh_tokens`.
- **Bảo mật & Real-time nâng cao:** Refresh token rotation (`/auth/refresh`), thu hồi phiên tức thì qua `token_version` (`/auth/logout`), PBKDF2 600.000 vòng kèm rehash tự động, chống liệt kê tài khoản theo thời gian, rate limiting, xác thực WebSocket `/ws/live` bằng single-use ticket (`/auth/ws-ticket`) kèm heartbeat và broadcast song song.
- **Hiện đại hóa React 19 SPA:** Bật TypeScript `strict: true` + `noUncheckedIndexedAccess` (xóa 42 `any`), `react-router-dom` và `React.lazy`, `@tanstack/react-query` kết hợp invalidate đích danh từ WebSocket (0 cảnh báo `oxlint`), Dark Mode, phím tắt POS (`F2`/`F3`/`1–3`/`Enter`/`Esc`), VietQR chuẩn EMVCo/NAPAS TLV có CRC-16, biểu đồ `recharts`, in nhiệt 80mm chuẩn `@page`, và bộ kiểm thử `vitest` + React Testing Library.
- **Đóng gói & CI:** Bổ sung `pyproject.toml`, `requirements-dev.txt`, `.env.example`, `.editorconfig` và GitHub Actions CI (`.github/workflows/ci.yml`).

### Fixed
- Khắc phục lỗi runtime khi gọi `create_tariff` (lệch thứ tự đối số) và `create_employee`/`update_employee` (lệch tên kwargs) từ FastAPI.
- Cho phép `thanhtoan.idld NULL` và chuẩn hóa `thanhtoan.loaithanhtoan` (`'Tiền mặt'` / `'Chuyển khoản'`), khắc phục lỗi `1048` khi thu phí vé tháng.
- Thống nhất múi giờ lưu trữ UTC `+00:00` kèm chuyển đổi ranh giới ngày Việt Nam (UTC+7), loại bỏ lệch 7 tiếng trên TiDB Cloud.
- Chặn rò rỉ connection pool trong `DBService` khi socket ngắt giữa chừng và sửa logic retry deadlock/write-conflict TiDB (`1205`, `1213`, `8028`, `9007`).
- Không cấp thẻ đang gắn vé tháng cho khách vãng lai, sửa lỗi vé tháng hết hạn vẫn miễn phí vĩnh viễn (tự động quy đổi về đơn giá vé ngày thay vì giá vé tháng), sửa tích Đề-các ở `get_vehicles_detail`, gộp doanh thu vé tháng vào biểu đồ loại xe & bãi đỗ.
- Khóa ghi mặc định trên bản Streamlit kế thừa trước khi gỡ bỏ hoàn toàn ở `857aeff`.

## [2.0.0] - 2026-11-21

### Added
- Ra mắt API FastAPI + WebSocket `/ws/live` và giao diện SPA React 19 + TypeScript (`frontend/`).
- Bổ sung bộ slide thuyết trình (`docs/Cơ sở dữ liệu.pptx`).

## [1.3.0] - 2026-11-19

### Added
- Kiểm tra khóa thẻ và kiểm tra trùng vé tháng còn hiệu lực trong `register_monthly_pass` (`SELECT ... FOR UPDATE`).
- Xuất bản bộ tài liệu PDF hoàn chỉnh trong `docs/`: [Kich_ban_demo.pdf](Kich_ban_demo.pdf) và [Bao_cao_du_an.pdf](Bao_cao_du_an.pdf).

## [1.2.0] - 2026-11-19

### Added
- Trang giới thiệu dự án trên GitHub Pages ([index.html](index.html)) và màn hình Quản lý Nhân sự & Khách gửi xe.

## [1.1.0] - 2026-11-18

### Fixed
- Khắc phục trùng lượt đỗ và nhân bản dòng sơ đồ vị trí bằng `ROW_NUMBER()` và `SELECT ... FOR UPDATE`.

## [1.0.0] - 2026-11-18

### Added
- Khởi tạo lược đồ `dbptit` (`database/Dump20261118.sql`), `DBService`, `ParkingService` và nguyên mẫu ban đầu.
