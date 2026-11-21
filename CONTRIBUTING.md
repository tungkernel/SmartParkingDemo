# Hướng dẫn đóng góp (Contributing)

Tài liệu này quy định quy chuẩn kiến trúc, quy ước commit và bộ lệnh kiểm thử bắt buộc cho dự án **Smart Parking System — Nhóm 10 (PTIT)**.

## 1. Quy chuẩn kiến trúc

- **Không viết SQL trực tiếp trong router FastAPI hoặc giao diện:** Toàn bộ truy vấn SQL tham số hóa (`%s`) và transaction `SELECT ... FOR UPDATE` nằm trong `src/services/domain/` và `src/services/auth_service.py`.
- **Thứ tự khóa nhất quán:** Các thao tác ghi nhiều bảng phải dùng `with self.db.transaction() as cursor:` và giữ thứ tự khóa `phuongtien -> vitrido -> thexe -> luotdo -> ca_lam_viec`.
- **Múi giờ chuẩn:** Toàn bộ `DATETIME` lưu UTC (`+00:00`); ranh giới ngày Việt Nam (UTC+7) tính bằng `vn_day_utc_bounds()` để truy vấn luôn tận dụng chỉ mục (sargable).
- **Type safety nghiêm ngặt:** Backend khai báo type hints đầy đủ qua `mypy`; Frontend bật `strict: true` + `noUncheckedIndexedAccess` (không dùng `any`).
- **Bảo mật cấu hình:** Tuyệt đối không commit `.env` hay `.streamlit/secrets.toml`.

## 2. Quy trình kiểm tra trước khi tạo PR

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

## 3. Quy ước Commit (Conventional Commits)

- `feat(scope): ...` — tính năng mới
- `fix(scope): ...` — sửa lỗi
- `refactor(scope): ...` — tái cấu trúc không đổi hành vi
- `test(scope): ...` — bổ sung hoặc cập nhật kiểm thử
- `docs(scope): ...` — cập nhật tài liệu
- `chore(scope): ...` — cấu hình, phụ thuộc, CI/CD
