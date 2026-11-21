# Tài liệu Dự án Nhóm 10

## Thông tin học phần
- **Đơn vị:** Học viện Công nghệ Bưu chính Viễn thông (PTIT)
- **Lớp:** D24CQCE04-B
- **Học phần:** Cơ sở dữ liệu (Năm học 2026–2027)
- **Giảng viên hướng dẫn:** Nguyễn Trọng Khánh
- **Đề tài:** Hệ thống quản lý bãi đỗ xe thông minh (Smart Parking System — v2.1)

## Thành viên & Phân công công việc
1. **Nguyễn Hoàng Tùng (`B24DCCE284`)** — Trưởng nhóm, thiết kế kiến trúc Modular Monolith, xây dựng `DBService`, `MigrationService`, `AuthService`, các giao dịch khóa dòng `SELECT ... FOR UPDATE` và API FastAPI + WebSocket (`/api/v1`, `/ws/live`).
2. **Nguyễn Bá Minh Đức (`B24DCCE053`)** — Phụ trách CSDL `dbptit`: thiết kế, chuẩn hóa lược đồ 13 bảng nền (`Dump20261118.sql`), ràng buộc khóa ngoại/chỉ mục, dữ liệu mẫu, truy vấn thống kê `ONLY_FULL_GROUP_BY` và kịch bản đối chứng Web–SQL.
3. **Trần Anh Tú (`B24DCCE277`)** — Thiết kế và phát triển giao diện React 19 + TypeScript SPA (`frontend/`), giao diện Streamlit kế thừa (`src/app.py`, `src/ui/`), biểu đồ Recharts/Altair và trang giới thiệu GitHub Pages (`index.html`).
4. **Bùi Minh Khang (`B24DCCE137`)** — Xây dựng canonical Pydantic v2 models (`src/models/`), bộ kiểm thử `pytest` + `vitest`, cấu hình GitHub Actions CI, viết tài liệu kỹ thuật và kịch bản demo.

## Mô tả hệ thống
Hệ thống quản lý bãi đỗ xe vận hành trực tiếp trên `dbptit` (TiDB Cloud / MySQL 8), bao gồm:
- Cổng kiểm soát vào/ra (Gate POS) thời gian thực, thanh toán VietQR chuẩn EMVCo và in phiếu nhiệt 80mm.
- Quản trị vé tháng, bảng giá, ca trực thu ngân, phân quyền RBAC 3 vai trò và nhật ký kiểm toán.
- Báo cáo phân tích doanh thu theo ngày, loại phương tiện và bãi đỗ.
