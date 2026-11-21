# Smart Parking PTIT — React 19 + TypeScript SPA

Giao diện vận hành bãi đỗ xe thông minh xây dựng bằng **React 19**, **TypeScript (`strict: true`)**, **Vite 8**, **Tailwind CSS v4**, **React Router**, **TanStack Query** và **Recharts**.

## Chạy môi trường phát triển

Đảm bảo backend FastAPI đang chạy tại `http://127.0.0.1:8000`, sau đó chạy:

```powershell
npm install
npm run dev
```

Vite dev server lắng nghe ở `http://localhost:5173` và tự động proxy `/api`, `/health`, `/ws` tới backend cổng `8000`.

## Bộ lệnh kiểm tra & build

```powershell
npm run lint          # Oxlint (yêu cầu 0 lỗi, 0 cảnh báo)
npm run typecheck     # TypeScript strict + noUncheckedIndexedAccess
npm run test          # Vitest + React Testing Library
npm run build         # Build production vào frontend/dist (FastAPI tự phục vụ SPA)
npm run format        # Định dạng mã bằng Prettier
```
