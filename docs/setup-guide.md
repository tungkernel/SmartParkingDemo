# Hướng dẫn cài đặt chi tiết (Setup Guide — v2.1)

## 1. Yêu cầu môi trường
- **Python:** 3.11 trở lên (khuyến nghị 3.12 / 3.14).
- **Node.js:** 20+ (khuyến nghị 24 LTS) và `npm`.
- **Database:** TiDB Cloud Serverless hoặc MySQL 8.x (nạp sẵn lược đồ `Dump20261118.sql`).

## 2. Cài đặt môi trường phát triển cục bộ (Windows PowerShell)

### Bước 1: Tạo tệp cấu hình `.env`
Sao chép `.env.example` sang `.env` và điền thông tin kết nối:
```env
APP_ENV=development
TIDB_HOST=gateway01.ap-northeast-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_DATABASE=dbptit
TIDB_USER=<username>
TIDB_PASSWORD=<password>
TIDB_POOL_SIZE=8
TIDB_SSL_CA=
AUTH_SECRET_KEY=<chuoi-bi-mat-ngau-nhien-toi-thieu-32-ky-tu>
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000
```

### Bước 2: Khởi động Backend FastAPI
```powershell
python -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements-dev.txt
.\.venv\Scripts\uvicorn.exe src.api.main:app --reload --port 8000
```
Khi khởi động, `MigrationService` tự động áp dụng các bản migration còn thiếu và `AuthService` khởi tạo các tài khoản mặc định (`admin`, `thungan`, `baove` — mật khẩu dev `123456` nếu bảng `taikhoan` đang trống).

### Bước 3: Khởi động Frontend React SPA
```powershell
Set-Location frontend
npm install
npm run dev
```
Truy cập `http://localhost:5173` (hoặc chạy `npm run build` để FastAPI phục vụ trực tiếp bản build tại `http://127.0.0.1:8000`).

### Bước 4: Bản Streamlit kế thừa (chỉ đọc mặc định)
```powershell
.\.venv\Scripts\streamlit.exe run src/app.py
```
Nếu cần mở khóa ghi trên bản Streamlit phục vụ minh họa cục bộ:
```powershell
$env:ENABLE_LEGACY_STREAMLIT_WRITES = "1"
.\.venv\Scripts\streamlit.exe run src/app.py
```

## 3. Chạy bộ kiểm tra & kiểm thử
```powershell
# Backend
.\.venv\Scripts\python.exe -m ruff check src tests
.\.venv\Scripts\python.exe -m mypy src
.\.venv\Scripts\python.exe -m pytest tests --cov=src -v

# Frontend
Set-Location frontend
npm run lint
npm run typecheck
npm run test
npm run build
```
