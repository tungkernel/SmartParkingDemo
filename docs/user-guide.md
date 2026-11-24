# Hướng dẫn sử dụng Smart Parking System (v2.2.0)

Tài liệu này hướng dẫn chi tiết cách vận hành 6 phân hệ trên giao diện **React 19 SPA** của hệ thống **Smart Parking PTIT** theo mô hình quản lý tập trung một người vận hành, không yêu cầu đăng nhập.

> Nếu bạn chưa khởi chạy hệ thống trên máy, xem trước [docs/setup-guide.md](setup-guide.md) hoặc nhấp đúp `Mo_SmartParking.bat` ở thư mục gốc.

---

## 1. Thanh điều hướng & Công cụ chung

- **Truy cập trực tiếp:** Mở `http://127.0.0.1:8000` (hoặc `http://localhost:5173` khi dev) sẽ vào thẳng màn hình **Cổng Vào / Ra (`/gate`)**.
- **Bảng điều khiển nhanh (`Ctrl + K` / `Cmd + K`):** Mở Command Palette để nhảy nhanh giữa 6 trang, tìm kiếm hoặc làm mới toàn bộ dữ liệu.
- **Trạng thái Real-time:** Chỉ báo `Đồng bộ Real-time` khi WebSocket `/ws/live` đang kết nối; mọi thao tác check-in, check-out, chuyển ô, đăng ký/gia hạn vé tháng từ tab hoặc máy LAN khác sẽ tự cập nhật tức thời.
- **Giao diện Sáng / Tối:** Nút chuyển Light / Dark Mode lưu lựa chọn trên `localStorage`.
- **Chuông Cảnh báo vận hành:** Tổng hợp 3 nhóm cảnh báo thời gian thực:
  1. Xe gửi quá **24 giờ** chưa ra bãi.
  2. Vé tháng sắp hết hạn trong vòng **7 ngày**.
  3. Danh sách thẻ RFID đang ở trạng thái **Mất / Hỏng**.
- **Làm mới:** Nút làm mới cưỡng bức đồng bộ lại mọi truy vấn React Query đang hiển thị.

---

## 2. Cổng Vào / Ra — Gate POS (`/gate`)

### 2.1. Phím tắt thao tác nhanh
| Phím tắt | Tác dụng |
| --- | --- |
| `F2` | Focus vào ô **Biển số xe** và bôi đen nội dung cũ |
| `1` / `2` / `3` | Chọn nhanh loại phương tiện tương ứng (khi con trỏ không nằm trong ô nhập liệu) |
| `F3` hoặc `/` | Focus vào ô **Tìm kiếm xe đang gửi** |
| `Ctrl + Enter` / `Cmd + Enter` | Xác nhận nhanh trong hộp thoại Check-out |
| `Esc` | Đóng hộp thoại (Check-out, Chuyển ô, Xác nhận hủy, In phiếu) |

### 2.2. Ghi nhận xe vào bãi (Check-in)
1. Nhấn `F2` và nhập **Biển số xe** (ví dụ `29A-123.45` hoặc `30K12345`).
2. **Xe vé tháng còn hạn:** Hệ thống tự nhận diện biển số, hiển thị huy hiệu *Nhận diện vé tháng* và tự chọn đúng thẻ RFID gắn với vé tháng cùng loại xe tương ứng.
3. **Khách vãng lai:** Chọn **Loại phương tiện**, **Bãi đỗ**, **Vị trí trống** (hoặc chọn trực quan qua Sơ đồ nhanh `QuickSlotPicker`) và **Thẻ RFID sẵn sàng** (tự loại bỏ thẻ vé tháng của khách khác).
4. **Nhân viên trực (Check-in):** Dropdown tự động chọn **Bảo vệ** phụ trách bãi đỗ vừa chọn (ưu tiên khớp `idbdx` + chức vụ *Bảo vệ*, fallback về *Quản lý*). Bạn có thể đổi sang nhân viên khác trước khi bấm xác nhận; lựa chọn sẽ được lưu vào `luotdo.idnv`.
5. Nhấn **Xác nhận Check-in & In phiếu QR** để khóa ô + thẻ nguyên tử trong transaction và mở hộp thoại in phiếu gửi xe khổ **80mm**.

### 2.3. Ghi nhận xe ra bãi & Thanh toán (Check-out)
1. Nhấn `F3` hoặc `/`, nhập biển số, mã thẻ RFID, vị trí hoặc tên chủ xe để lọc bảng **Xe đang gửi trong bãi** (hỗ trợ lọc nhanh theo *Tất cả / Vé ngày / Vé tháng / Quá 24h*).
2. Nhấn **Check-out** trên dòng xe tương ứng:
   - **Vé ngày:** Tính theo chu kỳ 24 giờ (`đơn giá ngày × số ngày làm tròn lên`, tối thiểu 1 ngày).
   - **Vé tháng còn hiệu lực:** Hệ thống tự nhận diện và tính phí gửi xe `0 đ`.
   - **Vé tháng đã hết hạn / bị hủy khi xe đang trong bãi:** Tự động chuyển sang đơn giá **vé ngày** tương ứng loại xe.
3. Kiểm tra **Nhân viên thu ngân:** Mặc định tự chọn **Thu ngân** phụ trách bãi đỗ của lượt xe, cho phép chọn lại trước khi lưu vào `thanhtoan.idnv`.
4. Chọn phương thức thanh toán:
   - **Tiền mặt:** Hỗ trợ nút mệnh giá nhanh và tự tính tiền thừa trả khách.
   - **Chuyển khoản:** Khi tổng tiền `> 0 đ`, hiển thị mã **VietQR chuẩn EMVCo/NAPAS** kèm số tiền và nội dung chuyển khoản để khách quét.
5. **Xử lý mất thẻ RFID (nếu có):** Tích chọn **Khách báo mất thẻ**, điều chỉnh phụ phí mất thẻ (mặc định `50.000 đ`); nếu là xe vé tháng còn hạn, có thể chọn ngay thẻ trống ở mục cấp đổi để chuyển quyền sở hữu sang thẻ mới và khóa thẻ cũ thành *Mất / Hỏng*.
6. Nhấn **Xác nhận Check-out & In biên lai** (hoặc `Ctrl + Enter`) để hoàn tất, giải phóng ô/thẻ và in biên lai 80mm.

### 2.4. Chuyển vị trí, Hủy lượt & In lại phiếu
- **Chuyển ô đỗ:** Đổi sang ô trống khác (hoán đổi trạng thái 2 ô nguyên tử trong cùng transaction).
- **Hủy lượt xe:** Dùng khi nhập sai biển số hoặc xe quay đầu ngay lúc vừa check-in (chỉ hủy lượt chưa thanh toán); trả ô đỗ và thẻ RFID về trạng thái trống.
- **In lại phiếu:** Nhấn biểu tượng máy in trên dòng xe đang gửi để xem lại phiếu 80mm.

---

## 3. Tổng quan & Sơ đồ bãi (`/overview`)

- **Thẻ KPI:** Tổng số ô, chỗ trống, đang đỗ, lượt hoạt động, doanh thu toàn thời gian/hôm nay và số vé tháng còn hiệu lực.
- **Thanh công suất:** Tỷ lệ lấp đầy trực quan theo từng bãi đỗ và từng khu vực.
- **Sơ đồ ô đỗ trực tiếp:**
  - Lọc tại SQL theo bãi đỗ, khu vực, trạng thái (`Tất cả` / `Trống` / `Đang đỗ` / `Bảo trì`) hoặc biển số.
  - Nhấn vào từng ô để xem xe đang đỗ (biển số, loại xe, giờ vào), hoặc bật/tắt **Bảo trì** đối với ô trống / ô đang bảo trì.
- **Công cụ hạ tầng trên sơ đồ:**
  - **Thêm ô đỗ hàng loạt:** Chọn khu vực và số lượng (`1–50` ô) để đánh số thứ tự nối tiếp tự động.
  - **Đối soát trạng thái:** Tự phát hiện và giải phóng các ô đỗ hoặc thẻ RFID bị kẹt trạng thái *Đang dùng* nhưng không còn lượt gửi mở.

---

## 4. Vé tháng & Bảng giá (`/passes`)

### 4.1. Đăng ký vé tháng mới
1. Nhấn **Đăng ký vé tháng mới** để mở ngăn kéo nhập liệu.
2. Điền thông tin khách hàng (**Họ tên**, **Số điện thoại**, **CCCD**, **Đối tượng khách hàng**), **Biển số xe**, **Loại phương tiện**, **Thẻ RFID trống**, **Số tháng đăng ký** (`1–12` tháng) và **Phương thức thanh toán**.
3. Kiểm tra **Nhân viên thu ngân** (mặc định chọn *Thu ngân* khớp bãi đỗ ứng với loại xe, có thể đổi tay) -> nhấn **Đăng ký vé tháng** để ghi nhận đồng thời khách hàng, xe, vé tháng, hóa đơn `thanhtoan` (`idnv` đầy đủ) và mở biên lai in.

### 4.2. Tra cứu, Gia hạn & Hủy vé tháng
- Lọc theo trạng thái (`Tất cả` / `Còn hạn` / `Hết hạn`) hoặc tìm theo tên, SĐT, biển số, mã thẻ.
- **Gia hạn:** Chọn số tháng (`1, 2, 3, 6, 12`), phương thức thanh toán (kèm QR VietQR nếu chọn Chuyển khoản) và **Thu ngân** thực hiện; ngày hết hạn mới cộng dồn từ `max(ngày hết hạn hiện tại, hôm nay)` (mỗi tháng 30 ngày).
- **Hủy vé trước hạn:** Chuyển vé sang hết hạn ngay lập tức và giải phóng thẻ RFID nếu xe không đang gửi trong bãi.

### 4.3. Quản lý bảng giá (`?tab=tariffs`)
- Hiển thị toàn bộ ma trận đơn giá vé ngày và vé tháng theo loại xe và đối tượng khách hàng; nhấn **Sửa giá** trên từng dòng để cập nhật đơn giá mới.

---

## 5. Lịch sử Giao dịch (`/transactions`)

- Lọc kết hợp trực tiếp tại SQL theo:
  - **Khoảng ngày kinh doanh** (chọn tay Từ ngày / Đến ngày hoặc preset `Hôm nay`, `7 ngày`, `30 ngày`, `Tháng này` theo múi giờ Việt Nam UTC+7).
  - **Từ khóa** (biển số, mã thẻ, tên nhân viên, mã hóa đơn).
  - **Nhân viên thu ngân (`employee_id`)**.
  - **Phương thức thanh toán (`Tiền mặt` / `Chuyển khoản`)**.
- **Cập nhật trạng thái:** Chuyển trạng thái hóa đơn giữa `Thành công`, `Hoàn tiền` và `Thất bại`.
- **In lại biên lai & Xuất CSV:** In lại hóa đơn khổ 80mm hoặc nhấn **Xuất CSV** để tải báo cáo UTF-8 BOM từ server theo đúng bộ lọc đang áp dụng.

---

## 6. Phân tích Doanh thu (`/analytics`)

- Chọn khoảng thống kê: **7 ngày**, **14 ngày**, **30 ngày** hoặc **90 ngày** gần nhất.
- Theo dõi doanh thu vé tháng tích lũy/trong tháng, biểu đồ doanh thu & lưu lượng theo ngày (UTC+7), và tỷ trọng theo **Loại phương tiện** / **Bãi đỗ** (gộp đầy đủ cả hóa đơn lượt ngày và hóa đơn vé tháng).

---

## 7. Quản trị Danh mục & Hạ tầng (`/admin/*`)

Màn hình quản trị gồm **3 tab** tải dữ liệu theo yêu cầu:
1. **Nhân sự & Danh bạ (`/admin/people`):** Thêm/sửa/xóa nhân viên (`nhanvien`), sửa thông tin khách hàng (`khachhang`), tra cứu lịch sử khách vãng lai và danh bạ phương tiện (`phuongtien`).
2. **Kho thẻ RFID (`/admin/cards`):** Phát hành thẻ mới, theo dõi thẻ đang gắn lượt xe nào hoặc vé tháng nào, chuyển trạng thái `Sẵn sàng` / `Mất - Hỏng`.
3. **Hạ tầng bãi/khu (`/admin/infrastructure`):** Tạo mới bãi đỗ xe (`baidoxe`) và thêm khu vực đỗ (`khuvucdo`) cho từng bãi.

---

## 8. Xử lý nhanh các tình huống thường gặp

| Tình huống | Nguyên nhân & Cách xử lý |
| --- | --- |
| Xe vé tháng vào bãi nhưng không thấy thẻ trong dropdown | Kiểm tra đã gõ đúng biển số vé tháng chưa và thẻ đó không đang bị kẹt ở một lượt gửi trước chưa check-out. |
| Trạng thái Header báo `Đang kết nối lại...` | Mất kết nối mạng tạm thời hoặc backend FastAPI đang khởi động lại; WebSocket tự nối lại theo exponential backoff hoặc nhấn **Làm mới**. |
| Không thể xóa nhân viên, bãi/khu/ô đỗ hoặc thẻ RFID | Đối tượng đã phát sinh dữ liệu ràng buộc khóa ngoại (`luotdo`, `thanhtoan`, `vethang`, `vitrido`). Với ô đỗ hãy dùng **Bảo trì**, với thẻ hãy chuyển **Mất / Hỏng** thay vì xóa cứng. |
| Nhấp đúp `Mo_SmartParking.bat` báo cổng `8000` đang bận | Có tiến trình khác chiếm cổng `8000`; chạy từ PowerShell với cổng khác như `.\Mo_SmartParking.bat --port 8001`. |
| Máy in nhiệt bị lệch lề hoặc in kèm thanh menu | Chọn khổ giấy **80mm** và tắt *Headers and footers* trong hộp thoại in trình duyệt. |
