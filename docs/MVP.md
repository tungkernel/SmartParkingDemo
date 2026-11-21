# Scope & Feature Milestones (MVP → Production v2.1)

## Đã hoàn thành trong MVP (v1.x)
- Giám sát sơ đồ bãi, khu vực và trạng thái ô đỗ từ `dbptit`.
- Ghi nhận xe vào/ra theo transaction, tính phí gửi xe ngày/vé tháng, quản lý vé tháng, bảng giá và thống kê doanh thu.

## Đã mở rộng lên bản Production (v2.0 → v2.1)
- Xác thực JWT + Refresh Token Rotation, phân quyền 3 vai trò (`ADMIN`, `ACCOUNTANT`, `OPERATOR`) và kiểm soát phạm vi bãi `lot_id`.
- Đối soát ca trực thu ngân (`ca_lam_viec`) và nhật ký kiểm toán nguyên tử (`audit_logs`).
- Giao diện SPA React 19 + TypeScript thời gian thực qua WebSocket xác thực ticket, mã chuyển khoản VietQR EMVCo và in phiếu nhiệt 80mm.
- Đóng gói chuẩn `pyproject.toml` và CI tự động trên GitHub Actions.

## Ngoài phạm vi đợt hiện tại (Future Hardware Integrations)
- Tích hợp camera nhận diện biển số tự động (ANPR/OCR) và thanh chắn barie vật lý (RS485/MQTT).
- Webhook đối soát tự động từ cổng thanh toán ngân hàng bên thứ ba.
