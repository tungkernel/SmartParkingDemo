from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_INDEX = FRONTEND_DIR / "dist" / "index.html"

_NO_PROXY_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _configure_stdio_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _connect_host_for(host: str) -> str:
    return "127.0.0.1" if host in ("0.0.0.0", "::", "") else host


def _is_smart_parking_alive(base_url: str, timeout: float = 1.0) -> bool:
    try:
        with _NO_PROXY_OPENER.open(f"{base_url}/health/live", timeout=timeout) as resp:
            if getattr(resp, "status", 0) != 200:
                return False
            data: Any = json.loads(resp.read().decode("utf-8"))
            return (
                isinstance(data, dict)
                and data.get("ok") is True
                and data.get("status") == "alive"
            )
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return False


def _is_port_in_use(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.4):
            return True
    except OSError:
        return False


def _ensure_frontend_dist() -> bool:
    if FRONTEND_INDEX.is_file():
        return True

    npm_bin = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm_bin:
        print("[LỖI] Không tìm thấy npm để build giao diện frontend/dist/.")
        return False

    try:
        if not (FRONTEND_DIR / "node_modules").is_dir():
            print("Đang cài đặt thư viện frontend (npm install)...")
            subprocess.run([npm_bin, "install"], cwd=str(FRONTEND_DIR), check=True)
        print("Đang build giao diện web (npm run build)...")
        subprocess.run([npm_bin, "run", "build"], cwd=str(FRONTEND_DIR), check=True)
    except subprocess.CalledProcessError as exc:
        print(f"[LỖI] Build frontend thất bại (mã thoát {exc.returncode}).")
        return False

    return FRONTEND_INDEX.is_file()


def _open_browser_when_ready(
    base_url: str,
    stop_event: threading.Event,
    timeout_seconds: float = 30.0,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while not stop_event.is_set() and time.monotonic() < deadline:
        if _is_smart_parking_alive(base_url, timeout=1.0):
            print(f"[OK] Máy chủ đã sẵn sàng — đang mở trình duyệt tại {base_url}")
            webbrowser.open(base_url)
            return
        stop_event.wait(0.25)

    if not stop_event.is_set():
        print(
            f"[CẢNH BÁO] Máy chủ phản hồi chậm quá {int(timeout_seconds)}s. "
            f"Bạn có thể mở thủ công tại: {base_url}"
        )


def _parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Khởi chạy Smart Parking PTIT và mở trình duyệt.")
    parser.add_argument("--host", default="127.0.0.1", help="Địa chỉ bind server (mặc định: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Cổng lắng nghe (mặc định: 8000)")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Chỉ chạy server, không tự mở trình duyệt.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    _configure_stdio_utf8()
    args = _parse_args(argv)
    host: str = args.host
    port: int = args.port
    no_browser: bool = args.no_browser

    connect_host = _connect_host_for(host)
    base_url = f"http://{connect_host}:{port}"

    if _is_smart_parking_alive(base_url):
        print(f"[INFO] Smart Parking PTIT đang chạy sẵn tại {base_url}.")
        if not no_browser:
            print("Đang mở trình duyệt...")
            webbrowser.open(base_url)
        return 0

    if _is_port_in_use(connect_host, port):
        print(
            f"[LỖI] Cổng {port} trên {connect_host} đang được ứng dụng khác sử dụng.\n"
            f"Hãy đóng ứng dụng đó hoặc chạy lại với cổng khác, ví dụ: "
            f"Mo_SmartParking.bat --port 8001"
        )
        return 1

    env_file = PROJECT_ROOT / ".env"
    secrets_file = PROJECT_ROOT / ".streamlit" / "secrets.toml"
    if not env_file.is_file() and not secrets_file.is_file():
        print(
            "[CẢNH BÁO] Chưa tìm thấy file .env hoặc .streamlit/secrets.toml. "
            "Ứng dụng có thể không kết nối được cơ sở dữ liệu TiDB/MySQL."
        )

    if not _ensure_frontend_dist():
        return 1

    src_str = str(SRC_DIR)
    if src_str not in sys.path:
        sys.path.insert(0, src_str)
    os.chdir(PROJECT_ROOT)

    try:
        import uvicorn
    except ImportError:
        print(
            "[LỖI] Thiếu thư viện uvicorn trong môi trường Python.\n"
            "Chạy: .venv\\Scripts\\pip.exe install -r requirements-dev.txt"
        )
        return 1

    print("=" * 60)
    print("  SMART PARKING PTIT — NHÓM 10")
    print("=" * 60)
    print(f"  Giao diện web : {base_url}")
    print(f"  API Swagger   : {base_url}/docs")
    print("  Nhấn Ctrl+C hoặc đóng cửa sổ này để tắt hệ thống.")
    print("=" * 60)

    stop_event = threading.Event()
    if not no_browser:
        browser_thread = threading.Thread(
            target=_open_browser_when_ready,
            args=(base_url, stop_event),
            daemon=True,
        )
        browser_thread.start()

    try:
        uvicorn.run("api.main:app", host=host, port=port, log_level="info")
    except KeyboardInterrupt:
        print("\nĐã dừng máy chủ Smart Parking PTIT.")
    finally:
        stop_event.set()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
