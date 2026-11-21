# Ý tưởng & Điểm nổi bật

## Bối cảnh
Bãi đỗ xe truyền thống sử dụng vé giấy và ghi chép rời rạc dễ dẫn đến sai sót đối soát thu ngân, thất thoát thẻ, trùng lặp ô đỗ và không có dữ liệu tức thời để điều phối luồng xe.

## Giải pháp Smart Parking PTIT (v2.1)
- **Độ tin cậy CSDL cao:** Chuẩn hóa lược đồ `dbptit` (13 bảng nền + 5 bảng vận hành), khóa dòng `SELECT ... FOR UPDATE` chống tranh chấp đồng thời, migration có phiên bản và lưu trữ chuẩn UTC.
- **Vận hành Quầy Cổng (POS) tốc độ cao:** Giao diện React 19 + TypeScript hỗ trợ phím tắt (`F2`, `F3`, `1–3`, `Enter`), đồng bộ WebSocket thời gian thực, mã VietQR chuẩn EMVCo/NAPAS và in phiếu nhiệt 80mm.
- **Kiểm soát nội bộ chặt chẽ:** Phân quyền RBAC (`ADMIN` / `ACCOUNTANT` / `OPERATOR`), mở/chốt ca bàn giao quỹ tiền mặt – chuyển khoản – hoàn tiền và nhật ký kiểm toán nguyên tử `audit_logs`.
- **Phân tích lịch sử minh bạch:** Biểu đồ doanh thu và lưu lượng theo ngày, loại xe, bãi đỗ gộp đầy đủ cả lượt gửi ngày lẫn đăng ký/gia hạn vé tháng.
