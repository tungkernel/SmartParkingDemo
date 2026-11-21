# Hướng dẫn sử dụng Smart Parking System (v2.1)

Tài liệu này hướng dẫn chi tiết cách vận hành toàn bộ 6 phân hệ trên giao diện **React 19 SPA** của hệ thống quản lý bãi đỗ xe thông minh (**Smart Parking PTIT**), phân tách rõ thao tác theo từng vai trò (`ADMIN`, `ACCOUNTANT`, `OPERATOR`).

> Nếu bạn chưa khởi chạy hệ thống trên máy, hãy xem trước [docs/setup-guide.md](setup-guide.md).

---

## 1. Đăng nhập, Phân quyền & Bảo mật tài khoản

### 1.1. Tài khoản mặc định (môi trường phát triển)
Khi khởi động lần đầu với bảng `taikhoan` trống ở môi trường `development`, hệ thống tự khởi tạo 3 tài khoản mẫu với mật khẩu ban đầu `123456`:

| Tên đăng nhập | Vai trò | Phạm vi & Quyền hạn chính |
| --- | --- | --- |
| `admin` | **ADMIN** | Toàn quyền hệ thống: quản lý tài khoản, hạ tầng bãi/khu/ô đỗ, đối soát ô/thẻ mồ côi, bảng giá, vé tháng, giao dịch, phân tích doanh thu và xem `audit_logs`. |
| `thungan` | **ACCOUNTANT** | Nghiệp vụ tài chính & khách hàng: vận hành cổng, đăng ký/gia hạn/hủy vé tháng, chỉnh sửa bảng giá, cập nhật trạng thái hoàn tiền, xuất báo cáo CSV máy chủ, xem phân tích doanh thu và nhật ký kiểm toán. |
| `baove` | **OPERATOR** | Vận hành trực tiếp tại cổng: check-in, check-out, chuyển ô đỗ, hủy lượt nhập nhầm, bật/tắt bảo trì ô đỗ, đăng ký/gia hạn vé tháng, mở/chốt ca của chính mình. Phạm vi dữ liệu giới hạn trong **bãi đỗ được phân công** và tự động **che SĐT/CCCD**. |

### 1.2. Đổi mật khẩu & Quản lý phiên
- Các tài khoản khởi tạo mặc định hiển thị thanh cảnh báo màu vàng ở đầu màn hình. Nhấn **Đổi mật khẩu ngay** (hoặc nút **Đổi mật khẩu** ở cuối thanh điều hướng bên trái / menu di động).
- Nhập mật khẩu hiện tại và mật khẩu mới (**tối thiểu 8 ký tự**). Sau khi lưu thành công, hệ thống tự động thu hồi toàn bộ phiên đăng nhập cũ (`token_version`) và chuyển về màn hình `/login` để đăng nhập lại.
- Phiên đăng nhập tự động gia hạn ngầm qua refresh token rotation và tự đồng bộ đăng xuất giữa các tab trình duyệt cùng mở ứng dụng.

### 1.3. Thanh công cụ chung (Header)
- **Trạng thái Real-time:** Hiển thị `Đồng bộ Real-time` (màu xanh) khi WebSocket `/ws/live` đang kết nối; mọi thao tác check-in, check-out, đổi ô, đăng ký vé tháng từ máy trạm khác sẽ tự cập nhật mà không cần tải lại trang.
- **Giao diện Sáng / Tối:** Biểu tượng Mặt trăng / Mặt trời chuyển đổi Dark Mode và lưu tùy chọn trên trình duyệt.
- **Chuông Cảnh báo vận hành:** Tập hợp 3 nhóm cảnh báo theo thời gian thực:
  1. Xe gửi quá **24 giờ** chưa ra bãi.
  2. Vé tháng sắp hết hạn trong vòng **7 ngày**.
  3. Danh sách thẻ RFID đang ở trạng thái **Mất / Hỏng**.
- **Làm mới:** Làm mới lại toàn bộ dữ liệu đang hiển thị trên trang hiện tại.

---

## 2. Cổng Vào / Ra — Gate POS (`/gate`)

Đây là màn hình làm việc chính của nhân viên trực cổng (`ADMIN`, `ACCOUNTANT`, `OPERATOR`).

### 2.1. Phím tắt thao tác nhanh
| Phím tắt | Tác dụng |
| --- | --- |
| `F2` | Focus ngay vào ô nhập **Biển số xe** và bôi đen nội dung cũ |
| `1` / `2` / `3` | Chọn nhanh loại phương tiện tương ứng (khi con trỏ không nằm trong ô nhập liệu) |
| `F3` hoặc `/` | Focus nhanh vào ô **Tìm kiếm xe đang gửi** |
| `Esc` | Đóng hộp thoại (Check-out, Chuyển ô, Xác nhận hủy, In phiếu) |

### 2.2. Ghi nhận xe vào bãi (Check-in)
1. Nhấn `F2` và nhập **Biển số xe** (tối đa 15 ký tự, ví dụ `29A-123.45` hoặc `30K12345`).
2. **Trường hợp xe có vé tháng còn hạn:** Hệ thống tự động nhận diện biển số, hiển thị huy hiệu xanh *Nhận diện vé tháng — tự chọn thẻ #...*, đồng thời tự chọn đúng thẻ RFID gắn với vé tháng và loại xe của chủ vé.
3. **Trường hợp khách vãng lai:** Chọn **Loại phương tiện**, **Bãi đỗ**, **Vị trí trống** và **Thẻ RFID sẵn sàng** (dropdown tự lọc bỏ thẻ vé tháng của khách khác để tránh cấp nhầm).
4. Nhấn **Xác nhận Check-in & In phiếu QR**. Hệ thống khóa vị trí + thẻ nguyên tử trong cùng transaction và mở ngay hộp thoại in phiếu gửi xe khổ **80mm** kèm mã QR.

### 2.3. Ghi nhận xe ra bãi & Thanh toán (Check-out)
1. Nhấn `F3`, gõ biển số, mã thẻ RFID hoặc tên chủ xe để lọc bảng **Xe đang gửi trong bãi**.
2. Nhấn **Check-out** trên dòng tương ứng để mở hộp thoại tính phí:
   - **Vé ngày:** Tính phí theo chu kỳ 24 giờ (`đơn giá ngày × số ngày làm tròn lên`, tối thiểu 1 ngày).
   - **Vé tháng còn hiệu lực:** Hệ thống tự nhận diện và tính phí `0 đ`.
   - **Vé tháng đã hết hạn hoặc bị hủy khi xe đang trong bãi:** Hệ thống tự động chuyển sang đơn giá **vé ngày** tương ứng loại xe với nhãn `Vé ngày (Vé tháng hết hạn)`.
3. Chọn phương thức thanh toán:
   - **Tiền mặt:** Thu tiền mặt trực tiếp tại quầy.
   - **Chuyển khoản:** Khi tổng tiền `> 0 đ`, hộp thoại tự hiển thị mã **VietQR chuẩn EMVCo/NAPAS** kèm số tiền và nội dung chuyển khoản để khách quét bằng ứng dụng ngân hàng.
4. **Xử lý mất thẻ RFID (nếu có):**
   - Tích chọn **Khách báo mất thẻ RFID**.
   - Kiểm tra hoặc điều chỉnh **Phụ phí mất thẻ** (mặc định `50.000 đ`).
   - Nếu là xe **vé tháng còn hạn**, có thể chọn ngay một thẻ trống ở mục **Cấp đổi thẻ mới cho vé tháng** để hệ thống tự chuyển quyền sở hữu sang thẻ mới và khóa thẻ cũ thành *Mất / Hỏng*.
5. Nhấn **Xác nhận Check-out & In biên lai** để hoàn tất giao dịch, giải phóng ô đỗ/thẻ và in biên lai 80mm.

### 2.4. Chuyển vị trí đỗ & Hủy lượt nhập nhầm
- **Chuyển ô đỗ** (`ADMIN`, `OPERATOR`): Nhấn nút chuyển vị trí trên dòng xe đang gửi -> chọn ô đỗ trống mới -> xác nhận. Hai ô cũ/mới được hoán đổi nguyên tử.
- **Hủy lượt xe** (`ADMIN`, `OPERATOR`): Dùng khi nhập nhầm biển số hoặc xe quay đầu ngay lúc vừa check-in (chỉ hủy được lượt chưa thanh toán). Hệ thống xóa lượt và trả ô đỗ cùng thẻ RFID về trạng thái trống.
- **In lại phiếu:** Nhấn biểu tượng máy in trên dòng xe đang gửi để mở lại phiếu gửi xe bất kỳ lúc nào.

---

## 3. Tổng quan & Sơ đồ bãi (`/overview`)

- **Thẻ KPI:** Hiển thị tổng số ô, số chỗ trống, đang đỗ, lượt hoạt động, doanh thu toàn thời gian/hôm nay và số vé tháng còn hiệu lực (`OPERATOR` xem theo bãi được phân công).
- **Thanh công suất:** Tỷ lệ lấp đầy trực quan theo từng bãi đỗ và từng khu vực.
- **Sơ đồ ô đỗ trực tiếp:**
  - Lọc nhanh theo bãi đỗ, khu vực, trạng thái (`Tất cả` / `Trống` / `Đang đỗ` / `Bảo trì`) hoặc tìm theo biển số.
  - Nhấn vào bất kỳ ô nào để xem chi tiết: nếu ô đang có xe sẽ hiện biển số, loại xe và giờ vào; nếu ô trống (`ADMIN`, `OPERATOR`) có thể nhấn **Khóa bảo trì** hoặc **Mở lại hoạt động** (khi ô đang bảo trì).
- **Thao tác quản trị hạ tầng trên sơ đồ (`ADMIN`):**
  - **Thêm ô đỗ hàng loạt:** Chọn khu vực và số lượng (`1–50` ô) để sinh số thứ tự nối tiếp tự động.
  - **Đối soát trạng thái:** Tự động phát hiện và giải phóng các ô đỗ hoặc thẻ RFID bị kẹt trạng thái *Đang dùng* dù không còn lượt đỗ mở.

---

## 4. Vé tháng & Bảng giá (`/passes`)

### 4.1. Đăng ký vé tháng mới (`ADMIN`, `ACCOUNTANT`, `OPERATOR`)
1. Điền thông tin khách hàng ở cột trái: **Họ tên**, **Số điện thoại**, **CCCD**, **Đối tượng khách hàng** (Sinh viên / Cán bộ, giảng viên...).
2. Nhập **Biển số xe**, chọn **Loại phương tiện**, **Thẻ RFID trống**, **Số tháng đăng ký** (`1–12` tháng) và **Phương thức thanh toán**.
3. Kiểm tra thành tiền tạm tính theo biểu giá vé tháng tương ứng rồi nhấn **Đăng ký vé tháng**. Hệ thống tự lưu hồ sơ khách hàng/phương tiện, tạo vé tháng, ghi nhận khoản thu vào `thanhtoan` và mở biên lai in.

### 4.2. Tra cứu, Gia hạn & Hủy vé tháng
- Lọc danh sách vé theo trạng thái (`Tất cả` / `Còn hạn` / `Hết hạn`) hoặc tìm theo tên khách, biển số, mã thẻ, SĐT.
- **Gia hạn:** Nhấn nút **Gia hạn** trên vé -> chọn số tháng (`1, 2, 3, 6, 12`) và phương thức thanh toán. Ngày hết hạn mới được tính cộng dồn từ `max(ngày hết hạn hiện tại, ngày hôm nay)` (mỗi tháng 30 ngày).
- **Hủy vé trước hạn (`ADMIN`, `ACCOUNTANT`):** Nhấn biểu tượng thùng rác và xác nhận. Vé sẽ chuyển sang hết hạn ngay lập tức và giải phóng thẻ RFID nếu xe không đang gửi trong bãi.

### 4.3. Quản lý bảng giá (`ADMIN`, `ACCOUNTANT`)
- Bảng giá phía dưới liệt kê toàn bộ mức giá vé ngày và vé tháng theo loại xe và đối tượng khách hàng.
- Nhấn **Sửa giá** ở từng dòng để cập nhật đơn giá mới (mọi thay đổi được ghi lại giá cũ/mới trong `audit_logs`).

---

## 5. Giao dịch & Ca trực (`/transactions`)

### 5.1. Tab Lịch sử giao dịch
- Lọc giao dịch theo **Từ ngày**, **Đến ngày** (chuẩn theo ngày kinh doanh Việt Nam UTC+7) và từ khóa (biển số, mã thẻ, thu ngân, mã giao dịch).
- Nhấn biểu tượng máy in ở cuối mỗi dòng để in lại biên lai giao dịch.
- **Xuất CSV:** Nhấn **Xuất CSV** để tải báo cáo định dạng UTF-8 BOM mở trực tiếp trên Excel (`ADMIN`/`ACCOUNTANT` tải luồng xuất trực tiếp từ máy chủ lên tới 2.000 dòng theo bộ lọc; `OPERATOR` xuất danh sách giao dịch trong phạm vi của mình).
- **Cập nhật trạng thái / Hoàn tiền (`ADMIN`, `ACCOUNTANT`):** Đổi trạng thái giao dịch giữa `Thành công`, `Hoàn tiền` và `Thất bại`. Khoản `Hoàn tiền` sẽ tự động được tách riêng khỏi tiền mặt thu thực tế khi đối soát ca.

### 5.2. Tab Ca làm việc & Đối soát bàn giao quỹ
1. **Mở ca:** Đầu ca trực, nhập **Tiền quỹ đầu ca** (tiền lẻ trả khách) và ghi chú (nếu có) -> nhấn **Mở ca làm việc**. Mỗi nhân viên chỉ được mở 1 ca tại một thời điểm.
2. **Theo dõi trong ca:** Hệ thống hiển thị trực tiếp số giao dịch thành công, tổng **Tiền mặt thu trong ca**, **Chuyển khoản**, **Hoàn tiền** và **Tiền mặt kỳ vọng bàn giao** (`Quỹ đầu ca + Tiền mặt thu`).
3. **Chốt ca:** Cuối ca, kiểm đếm két và nhập **Tiền mặt thực tế bàn giao** (ô nhập được giữ nguyên không bị ghi đè khi WebSocket có giao dịch mới), thêm ghi chú bàn giao nếu chênh lệch -> nhấn **Chốt ca**. Hệ thống lưu lịch sử ca và tính ngay số tiền thừa/thiếu.

---

## 6. Phân tích Doanh thu (`/analytics` — `ADMIN`, `ACCOUNTANT`)

- Chọn khoảng thống kê: **7 ngày**, **14 ngày**, **30 ngày** hoặc **90 ngày** gần nhất.
- Xem tổng quan doanh thu vé tháng (tổng thu tích lũy và doanh thu tháng hiện tại), biểu đồ doanh thu & số lượt theo từng ngày (UTC+7), cùng bảng/biểu đồ tỷ trọng theo **Loại phương tiện** và **Bãi đỗ** (gộp đầy đủ cả lượt gửi ngày và đăng ký/gia hạn vé tháng).

---

## 7. Quản trị Hệ thống (`/admin/*` — `ADMIN`, `ACCOUNTANT`)

Màn hình quản trị chia thành 5 tab tải dữ liệu theo yêu cầu:

1. **Tài khoản (`ADMIN`):** Tạo tài khoản gắn với nhân viên chưa có tài khoản, đổi vai trò (`ADMIN` / `ACCOUNTANT` / `OPERATOR`), khóa/mở khóa tài khoản (hệ thống chặn khóa hoặc hạ quyền quản trị viên cuối cùng) và đặt lại mật khẩu.
2. **Nhân sự & Khách hàng:** Tra cứu danh sách nhân viên, khách hàng vé tháng, lịch sử khách vãng lai và danh bạ phương tiện.
3. **Kho thẻ RFID:** Theo dõi toàn bộ thẻ (đang gắn xe nào trong bãi hoặc gắn vé tháng nào), phát hành mã thẻ mới (`ADMIN`, `OPERATOR`) và chuyển trạng thái `Sẵn sàng` / `Mất - Hỏng`.
4. **Hạ tầng bãi & khu vực (`ADMIN`):** Tạo mới bãi đỗ xe và thêm khu vực đỗ cho từng bãi.
5. **Nhật ký kiểm toán (`audit_logs`):** Tra cứu vết toàn bộ thao tác quan trọng (đăng nhập, check-in/out, hoàn tiền, đổi giá, mở/chốt ca, sửa tài khoản) kèm tài khoản thực hiện, địa chỉ IP và chi tiết JSON; hỗ trợ lọc theo hành động, bảng dữ liệu và username.

---

## 8. Giao diện Streamlit kế thừa (`src/app.py`)

Bản giao diện Streamlit cũ (`.\.venv\Scripts\streamlit.exe run src/app.py`) được giữ lại để đối chiếu báo cáo đồ án và **mặc định chạy ở chế độ chỉ đọc (Read-only)** nhằm bảo vệ phân quyền RBAC, ca trực và `audit_logs`.

- Bạn vẫn có thể xem biểu đồ, danh sách bãi, lượt đỗ và giao dịch bình thường.
- Nếu cần minh họa thao tác ghi trên bản Streamlit cục bộ, chạy trước biến môi trường `$env:ENABLE_LEGACY_STREAMLIT_WRITES = "1"`.

---

## 9. Xử lý nhanh các tình huống thường gặp

| Tình huống | Nguyên nhân & Cách xử lý |
| --- | --- |
| Xe vé tháng vào bãi nhưng không thấy thẻ trong dropdown | Đảm bảo đã gõ đúng biển số đã đăng ký vé tháng (hệ thống tự khớp khi nhập biển số) và thẻ đó không đang bị kẹt ở một lượt gửi trước chưa check-out. |
| Hệ thống tự chuyển về trang Đăng nhập | Phiên đăng nhập hết hạn hoặc quản trị viên vừa đổi vai trò / khóa tài khoản / đặt lại mật khẩu. Đăng nhập lại bằng thông tin mới. |
| Trạng thái trên thanh trên báo `Đang kết nối lại...` | Mất kết nối mạng tạm thời hoặc backend FastAPI đang khởi động lại; WebSocket sẽ tự kết nối lại theo cơ chế exponential backoff. Bạn có thể nhấn **Làm mới** sau khi kết nối ổn định. |
| Báo lỗi `Nhân viên chỉ được thao tác thuộc bãi được phân công` | Tài khoản `OPERATOR` đang thao tác trên ô đỗ hoặc lượt xe của bãi khác. Liên hệ `ADMIN` nếu cần đổi bãi phụ trách cho nhân viên. |
| Không thể xóa bãi/khu/ô đỗ hoặc thẻ RFID | Đối tượng đã phát sinh dữ liệu lịch sử (lượt đỗ, vé tháng, ca làm việc). Hãy dùng tính năng **Bảo trì** (với ô đỗ) hoặc **Mất / Hỏng** (với thẻ) thay vì xóa cứng. |
| Máy in nhiệt bị lệch lề hoặc in kèm thanh menu | Chọn khổ giấy **80mm**, tắt tùy chọn *Headers and footers* trong hộp thoại in của trình duyệt (giao diện đã tích hợp sẵn CSS `@media print` tự ẩn toàn bộ thanh điều hướng). |
