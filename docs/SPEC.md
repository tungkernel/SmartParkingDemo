# Technical Specification (v2.1.0)

## 1. Kiến trúc & Công nghệ

- **Backend:** Python 3.11+, FastAPI (`/api/v1/*` + alias `/api/*`), Uvicorn, Pydantic v2, `pydantic-settings`, `mysql-connector-python`.
- **Frontend:** React 19, TypeScript (`strict: true`, `noUncheckedIndexedAccess`), Vite 8, Tailwind CSS v4, React Router, TanStack Query, Recharts, `qrcode.react`, `lucide-react`.
- **Database:** TiDB Cloud Serverless / MySQL 8 (`dbptit` — 13 bảng nền + 5 bảng sản xuất: `taikhoan`, `refresh_tokens`, `ca_lam_viec`, `audit_logs`, `schema_migrations`).
- **QA & CI/CD:** `pytest`, `pytest-asyncio`, `pytest-cov`, `ruff`, `mypy`, `oxlint`, `vitest`, `@testing-library/react`, GitHub Actions.

## 2. Yêu cầu chức năng cốt lõi

1. **Xác thực & Phân quyền (RBAC):** Đăng nhập nhận Access Token (JWT HS256, TTL 1 giờ) và Refresh Token (rotation, TTL 7 ngày); 3 vai trò `ADMIN`, `ACCOUNTANT`, `OPERATOR` (phạm vi bãi đỗ `lot_id` và ẩn PII cho `OPERATOR`).
2. **Vận hành Cổng POS:** Check-in, ước tính phí, check-out (Tiền mặt / VietQR EMVCo Chuyển khoản), xử lý mất thẻ (hỗ trợ cấp đổi thẻ mới cho vé tháng), chuyển ô đỗ, hủy lượt nhập nhầm, in phiếu/biên lai 80mm.
3. **Vé tháng & Bảng giá:** Đăng ký, gia hạn nhiều tháng, đổi xe/thẻ, hủy trước hạn, điều chỉnh đơn giá.
4. **Giao dịch & Ca trực:** Tra cứu phân trang lọc tại SQL, xuất CSV, mở/chốt ca đối soát tiền mặt – chuyển khoản – hoàn tiền.
5. **Phân tích & Kiểm toán:** Biểu đồ doanh thu theo ngày/loại xe/bãi đỗ (gộp đủ vé ngày và vé tháng) và nhật ký `audit_logs` ghi nguyên tử trong transaction.

## 3. Yêu cầu phi chức năng

- Mọi truy vấn SQL tham số hóa 100% (`%s`), không nội suy chuỗi giá trị.
- Không chặn event loop trên các route bất đồng bộ (`anyio.to_thread.run_sync`).
- Cổng kiểm tra chất lượng bắt buộc: `ruff` 0 lỗi, `mypy` 0 lỗi, `oxlint` 0 lỗi/0 cảnh báo, `tsc -b --noEmit` 0 lỗi, `pytest` và `vitest` 100% pass.
