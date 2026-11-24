# Hướng dẫn cài đặt chi tiết (Setup Guide — v2.2.0)

## 1. Yêu cầu môi trường
- **Python:** 3.11 trở lên (khuyến nghị 3.12 / 3.14).
- **Node.js:** 20+ (khuyến nghị 24 LTS) và `npm`.
- **Database:** TiDB Cloud Serverless hoặc MySQL 8.x đã nạp sẵn lược đồ 13 bảng từ [`database/Dump20261118.sql`](../database/Dump20261118.sql).

## 2. Cấu hình biến môi trường (`.env`)

Sao chép `.env.example` thành `.env` ở thư mục gốc và điền thông tin kết nối `dbptit`:

```env
APP_ENV=development
TIDB_HOST=gateway01.ap-northeast-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_DATABASE=dbptit
TIDB_USER=<username>
TIDB_PASSWORD=<password>
TIDB_POOL_SIZE=8
TIDB_SSL_CA=
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000

# VietQR (tùy chọn cho quầy thu ngân)
VIETQR_BANK_BIN=970422
VIETQR_ACCOUNT_NO=0123456789
VIETQR_ACCOUNT_NAME=SMART PARKING PTIT
```

> Lưu ý: Không commit file `.env` lên Git.

## 3. Cài đặt môi trường & Khởi chạy

### Bước 1: Tạo virtual environment Python
```powershell
python -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements-dev.txt
```

### Bước 2A: Chạy 1-click trên Windows (Khuyến nghị)
- Nhấp đúp **`Mo_SmartParking.bat`** (hoặc chạy `.\Mo_SmartParking.bat` trong terminal).
- Script [`scripts/launch_app.py`](../scripts/launch_app.py) sẽ tự kiểm tra xem cổng `8000` đã chạy Smart Parking chưa; nếu `frontend/dist/` chưa tồn tại thì tự chạy `npm install` và `npm run build`, sau đó bật FastAPI tại `http://127.0.0.1:8000` và mở trình duyệt mặc định.
- Tham số hỗ trợ khi chạy qua terminal: `.\Mo_SmartParking.bat --port 8001 --no-browser` hoặc `--host 0.0.0.0`.
- Để ghim biểu tượng mở nhanh ngoài màn hình nền, chạy **`scripts\Tao_Shortcut_Desktop.bat`**.

### Bước 2B: Chạy tách Backend & Frontend khi phát triển (Hot Reload)
```powershell
# Terminal 1: Backend FastAPI (Swagger API tại http://127.0.0.1:8000/docs)
.\.venv\Scripts\uvicorn.exe src.api.main:app --reload --port 8000

# Terminal 2: Frontend Vite dev server (http://localhost:5173)
Set-Location frontend
npm install
npm run dev
```

### Bước 2C: Chia sẻ trong mạng LAN nội bộ
```powershell
# 1. Build bản SPA tối ưu vào frontend/dist
Set-Location frontend; npm run build; Set-Location ..

# 2. Mở FastAPI lắng nghe trên toàn mạng LAN (mở cổng 8000 trên Windows Firewall nếu cần)
.\.venv\Scripts\uvicorn.exe src.api.main:app --host 0.0.0.0 --port 8000
```
Các thiết bị cùng Wi-Fi/LAN truy cập `http://<IP-máy-chủ>:8000` (same-origin cho cả REST `/api/v1` lẫn WebSocket `/ws/live`).

## 4. Bộ lệnh kiểm tra chất lượng mã & kiểm thử

```powershell
# Backend
.\.venv\Scripts\python.exe -m ruff check src tests scripts
.\.venv\Scripts\python.exe -m mypy src scripts
.\.venv\Scripts\python.exe -m pytest tests -m "not integration" --cov=src --cov-report=term-missing --cov-fail-under=80 -v

# Frontend
Set-Location frontend
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```
