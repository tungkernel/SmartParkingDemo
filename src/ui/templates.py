from __future__ import annotations

import html


def build_ticket_html(
    turn_id: int,
    plate: str,
    vehicle_type: str,
    slot_label: str,
    card_code: str,
    checkin_time: str,
) -> str:
    """Generate a printable HTML parking ticket for legacy Streamlit exports."""
    return (
        "<!DOCTYPE html><html lang='vi'><head><meta charset='utf-8'>"
        "<title>Phiếu gửi xe</title>"
        "<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:340px;margin:24px auto;"
        "border:1px dashed #334155;padding:16px;border-radius:8px}h2{margin:0 0 8px;font-size:16px;text-align:center}"
        ".row{display:flex;justify-content:space-between;margin:6px 0;font-size:13px}"
        ".plate{font-size:20px;font-weight:700;text-align:center;margin:10px 0;letter-spacing:1px}</style></head><body>"
        "<h2>PHIẾU GỬI XE — PTIT</h2>"
        f"<div class='plate'>{html.escape(plate)}</div>"
        f"<div class='row'><span>Mã lượt:</span><strong>#{turn_id}</strong></div>"
        f"<div class='row'><span>Loại xe:</span><span>{html.escape(vehicle_type)}</span></div>"
        f"<div class='row'><span>Vị trí đỗ:</span><span>{html.escape(slot_label)}</span></div>"
        f"<div class='row'><span>Mã thẻ:</span><span>{html.escape(card_code)}</span></div>"
        f"<div class='row'><span>Giờ vào:</span><span>{html.escape(checkin_time)}</span></div>"
        "<hr><p style='text-align:center;font-size:11px;color:#64748b'>Vui lòng giữ phiếu/thẻ khi lấy xe.</p>"
        "</body></html>"
    )


def build_receipt_html(
    receipt_id: int,
    plate: str,
    ticket_type: str,
    checkin_time: str,
    checkout_time: str,
    amount: int,
    status: str = "Thành công",
) -> str:
    """Generate a printable HTML payment receipt for legacy Streamlit exports."""
    return (
        "<!DOCTYPE html><html lang='vi'><head><meta charset='utf-8'>"
        "<title>Biên lai thu phí</title>"
        "<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:360px;margin:24px auto;"
        "border:1px solid #cbd5e1;padding:18px;border-radius:8px}h2{margin:0 0 10px;font-size:16px;text-align:center}"
        ".row{display:flex;justify-content:space-between;margin:6px 0;font-size:13px}"
        ".total{font-size:18px;font-weight:700;color:#0f172a;border-top:1px dashed #94a3b8;padding-top:8px;margin-top:10px}</style></head><body>"
        "<h2>BIÊN LAI THU PHÍ ĐỖ XE — PTIT</h2>"
        f"<div class='row'><span>Mã giao dịch / lượt:</span><strong>#{receipt_id}</strong></div>"
        f"<div class='row'><span>Biển số:</span><strong>{html.escape(plate)}</strong></div>"
        f"<div class='row'><span>Loại vé:</span><span>{html.escape(ticket_type)}</span></div>"
        f"<div class='row'><span>Giờ vào:</span><span>{html.escape(checkin_time)}</span></div>"
        f"<div class='row'><span>Giờ ra / TT:</span><span>{html.escape(checkout_time)}</span></div>"
        f"<div class='row'><span>Trạng thái:</span><span>{html.escape(status)}</span></div>"
        f"<div class='row total'><span>Tổng thu:</span><span>{amount:,} VNĐ</span></div>"
        "</body></html>"
    )
