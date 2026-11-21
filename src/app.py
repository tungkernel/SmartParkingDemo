from __future__ import annotations

import html
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import altair as alt
import pandas as pd
import streamlit as st

from services.db_service import DBConfig, DBService, DatabaseError
from services.parking_service import ParkingService, ValidationError
from ui.icons import brand_logo_svg, svg_icon
from ui.styles import DESIGN_SYSTEM_CSS

_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo.svg"
_LEGACY_WRITES_ENABLED = os.getenv("ENABLE_LEGACY_STREAMLIT_WRITES", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)


class _ReadOnlyParkingServiceProxy:
    """Block DB-mutating calls on legacy Streamlit UI unless ENABLE_LEGACY_STREAMLIT_WRITES=1."""

    _WRITE_PREFIXES = (
        "create_",
        "update_",
        "delete_",
        "add_",
        "set_",
        "check_in",
        "check_out",
        "register_",
        "renew_",
        "cancel_",
        "move_",
        "reconcile_",
        "open_",
        "close_",
    )

    def __init__(self, inner: ParkingService) -> None:
        self._inner = inner

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._inner, name)
        if callable(attr) and name.startswith(self._WRITE_PREFIXES):
            def _blocked(*_args: Any, **_kwargs: Any) -> Any:
                raise ValidationError(
                    "Bản Streamlit kế thừa đang ở chế độ chỉ đọc để bảo vệ RBAC, ca trực và audit_logs. "
                    "Hãy thao tác ghi qua giao diện React + FastAPI v2.1 hoặc bật ENABLE_LEGACY_STREAMLIT_WRITES=1."
                )

            return _blocked
        return attr


st.set_page_config(
    page_title="Smart Parking PTIT (Legacy Demo)",
    page_icon=str(_LOGO_PATH) if _LOGO_PATH.exists() else "🅿️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(DESIGN_SYSTEM_CSS, unsafe_allow_html=True)

NAV_ITEMS: tuple[str, ...] = (
    "Tổng quan & Sơ đồ bãi",
    "Vào / Ra bãi xe",
    "Lịch sử giao dịch",
    "Vé tháng & Bảng giá",
    "Thống kê doanh thu",
    "Nhân sự & Khách gửi xe",
)


@st.cache_resource(show_spinner=False)
def _create_db_service() -> DBService:
    """Create and cache a pooled DBService from environment variables or Streamlit secrets."""
    env_db = DBService.from_env()
    if env_db is not None:
        return env_db

    if "tidb" in st.secrets:
        cfg = st.secrets["tidb"]
        return DBService.from_config(
            DBConfig(
                host=str(cfg["host"]),
                port=int(cfg.get("port", 4000)),
                database=str(cfg["database"]),
                user=str(cfg["user"]),
                password=str(cfg["password"]),
                ssl_ca=str(cfg["ssl_ca"]) if cfg.get("ssl_ca") else None,
                pool_size=int(os.getenv("TIDB_POOL_SIZE", "8")),
            )
        )

    raise DatabaseError(
        "Chưa cấu hình kết nối database. Hãy thiết lập `.streamlit/secrets.toml` hoặc biến môi trường TIDB_*."
    )


@st.cache_data(ttl=60, show_spinner=False)
def _check_db_health(_db: DBService) -> tuple[bool, str]:
    return _db.test_connection()


def _invalidate_data_cache() -> None:
    """Clear cached read queries after any database mutation or manual refresh."""
    st.cache_data.clear()


@st.cache_data(ttl=20, show_spinner=False)
def _cached_overview_metrics(_service: ParkingService) -> Any:
    return _service.get_overview_metrics()


@st.cache_data(ttl=20, show_spinner=False)
def _cached_parking_lots(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_parking_lots()


@st.cache_data(ttl=60, show_spinner=False)
def _cached_zones(_service: ParkingService, lot_id: Optional[int]) -> list[dict[str, Any]]:
    return _service.get_zones(lot_id)


@st.cache_data(ttl=20, show_spinner=False)
def _cached_slots(
    _service: ParkingService, lot_id: Optional[int], zone_id: Optional[int]
) -> list[dict[str, Any]]:
    return _service.get_slots(lot_id=lot_id, zone_id=zone_id)


@st.cache_data(ttl=20, show_spinner=False)
def _cached_active_turns(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_active_turns()


@st.cache_data(ttl=60, show_spinner=False)
def _cached_employees(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_employees()


@st.cache_data(ttl=120, show_spinner=False)
def _cached_vehicle_types(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_vehicle_types()


@st.cache_data(ttl=20, show_spinner=False)
def _cached_cards(_service: ParkingService, only_available: bool) -> list[dict[str, Any]]:
    return _service.get_cards(only_available=only_available)


@st.cache_data(ttl=20, show_spinner=False)
def _cached_transactions(
    _service: ParkingService,
    date_from: Optional[date],
    date_to: Optional[date],
    vehicle_type_id: Optional[int],
    limit: int = 250,
) -> list[dict[str, Any]]:
    return _service.get_transactions(
        date_from=date_from,
        date_to=date_to,
        vehicle_type_id=vehicle_type_id,
        limit=limit,
    )


@st.cache_data(ttl=60, show_spinner=False)
def _cached_tariffs(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_tariffs()


@st.cache_data(ttl=20, show_spinner=False)
def _cached_monthly_passes(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_monthly_passes()


@st.cache_data(ttl=120, show_spinner=False)
def _cached_customer_types(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_customer_types()


@st.cache_data(ttl=30, show_spinner=False)
def _cached_employees_detail(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_employees_detail()


@st.cache_data(ttl=30, show_spinner=False)
def _cached_customers_detail(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_customers_detail()


@st.cache_data(ttl=20, show_spinner=False)
def _cached_walkin_visitors(_service: ParkingService, limit: int) -> list[dict[str, Any]]:
    return _service.get_walkin_visitors(limit=limit)


@st.cache_data(ttl=30, show_spinner=False)
def _cached_daily_revenue(_service: ParkingService, days: int) -> list[dict[str, Any]]:
    return _service.get_daily_revenue(days=days)


@st.cache_data(ttl=30, show_spinner=False)
def _cached_revenue_by_vehicle_type(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_revenue_by_vehicle_type()


@st.cache_data(ttl=20, show_spinner=False)
def _cached_zones_summary(_service: ParkingService, lot_id: Optional[int] = None) -> list[dict[str, Any]]:
    return _service.get_zones_summary(lot_id=lot_id)


@st.cache_data(ttl=20, show_spinner=False)
def _cached_cards_detail(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_cards_detail()


@st.cache_data(ttl=20, show_spinner=False)
def _cached_vehicles_detail(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_vehicles_detail()


@st.cache_data(ttl=30, show_spinner=False)
def _cached_revenue_by_lot(_service: ParkingService) -> list[dict[str, Any]]:
    return _service.get_revenue_by_lot()


@st.cache_data(ttl=30, show_spinner=False)
def _cached_monthly_pass_revenue_summary(_service: ParkingService) -> dict[str, Any]:
    return _service.get_monthly_pass_revenue_summary()


def _show_skeleton(variant: str = "dashboard") -> Any:
    """Render an animated shimmer skeleton placeholder and return it so callers can clear it."""
    holder = st.empty()
    kpi_html = ""
    if variant == "dashboard":
        kpi_cards = "".join(
            '<div class="skeleton-kpi-card">'
            '<div class="skeleton-pulse skeleton-line" style="width:48%;"></div>'
            '<div class="skeleton-pulse skeleton-line--lg"></div>'
            '<div class="skeleton-pulse skeleton-line--sm"></div>'
            "</div>"
            for _ in range(4)
        )
        kpi_html = f'<div class="skeleton-kpi-grid">{kpi_cards}</div>'

    panel_rows = "".join(
        '<div class="skeleton-pulse skeleton-row"></div>' for _ in range(5)
    )
    holder.markdown(
        f"""
{kpi_html}
<div class="skeleton-panel">
{panel_rows}
</div>
        """,
        unsafe_allow_html=True,
    )
    return holder


def _format_vnd(amount: int) -> str:
    return f"{amount:,} đ".replace(",", ".")


def _queue_toast(message: str) -> None:
    """Store a toast message across st.rerun()."""
    pending = st.session_state.setdefault("pending_toasts", [])
    pending.append(message)


def _flush_toasts() -> None:
    """Display and clear any queued toast messages."""
    pending = st.session_state.pop("pending_toasts", [])
    for msg in pending:
        st.toast(msg)


def _render_page_header(icon_name: str, title: str, subtitle: str) -> None:
    """Render a consistent page header with a single-stroke SVG icon."""
    icon_svg = svg_icon(icon_name, size=24, stroke_width=1.9)
    st.markdown(
        f"""
        <div class="page-heading">
            {icon_svg}
            <h1>{html.escape(title)}</h1>
        </div>
        <div class="page-sub">{html.escape(subtitle)}</div>
        """,
        unsafe_allow_html=True,
    )


def _render_kpi_grid(cards: list[dict[str, str]], cols: int = 4) -> None:
    """Render a responsive Bento KPI grid using shared design-system classes."""
    grid_cls = f"kpi-grid kpi-grid--{cols}" if cols in {2, 3, 4} else "kpi-grid"
    items_html: list[str] = []
    for card in cards:
        icon_name = card.get("icon", "dashboard")
        icon_tone = card.get("icon_tone", "blue")
        chip_tone = card.get("chip_tone", "slate")
        label = html.escape(str(card.get("label", "")))
        value = html.escape(str(card.get("value", "")))
        chip = html.escape(str(card.get("chip", "")))
        items_html.append(
            f'<div class="kpi-card">'
            f'<div class="kpi-top"><span class="kpi-label">{label}</span>'
            f'<span class="kpi-icon kpi-icon--{icon_tone}">{svg_icon(icon_name, 17, 1.9)}</span></div>'
            f'<div class="kpi-value">{value}</div>'
            f'<span class="kpi-chip kpi-chip--{chip_tone}">{chip}</span>'
            f"</div>"
        )
    st.markdown(f'<div class="{grid_cls}">{"".join(items_html)}</div>', unsafe_allow_html=True)


def _render_empty_state(title: str, description: str, icon_name: str = "inbox") -> None:
    """Render a clean, consistent empty-state placeholder."""
    st.markdown(
        f"""
        <div class="empty-state">
            <div class="empty-state-icon">{svg_icon(icon_name, 20, 1.9)}</div>
            <div class="empty-state-title">{html.escape(title)}</div>
            <div class="empty-state-desc">{html.escape(description)}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _tbl_plate(plate: Any) -> str:
    return f'<span class="tbl-plate">{html.escape(str(plate or "—"))}</span>'


def _tbl_pill(text: Any, tone: str = "slate") -> str:
    return f'<span class="tbl-pill tbl-pill--{tone}">{html.escape(str(text or "—"))}</span>'


def _tbl_stack(main: Any, sub: Any = "") -> str:
    main_html = f'<div class="tbl-main">{html.escape(str(main or "—"))}</div>'
    sub_str = str(sub or "").strip()
    sub_html = f'<div class="tbl-sub">{html.escape(sub_str)}</div>' if sub_str else ""
    return f"{main_html}{sub_html}"


def _tbl_fmt_dt(val: Any) -> str:
    if val is None or str(val) in {"", "NaT", "None"}:
        return "—"
    if isinstance(val, datetime):
        return val.strftime("%d/%m/%Y %H:%M")
    try:
        parsed = pd.to_datetime(val, errors="coerce")
        if pd.isna(parsed):
            return str(val)[:16]
        return parsed.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(val)[:16]


def _tbl_fmt_d(val: Any) -> str:
    if val is None or str(val) in {"", "NaT", "None"}:
        return "—"
    if isinstance(val, (date, datetime)):
        return val.strftime("%d/%m/%Y")
    try:
        parsed = pd.to_datetime(val, errors="coerce")
        if pd.isna(parsed):
            return str(val)[:10]
        return parsed.strftime("%d/%m/%Y")
    except Exception:
        return str(val)[:10]


def _tbl_progress(pct: float) -> str:
    color = "#EF4444" if pct >= 85 else ("#F59E0B" if pct >= 60 else "#10B981")
    return (
        f'<div class="tbl-prog-wrap">'
        f'<div class="tbl-prog-track"><div class="tbl-prog-fill" style="width:{min(pct, 100.0)}%;background:{color};"></div></div>'
        f'<span style="font-weight:600;color:#334155;font-size:0.78rem;">{pct:.1f}%</span>'
        f"</div>"
    )


def _render_modern_table(
    headers: list[tuple[str, bool]],
    rows_html: list[list[str]],
    max_height: int = 380,
) -> None:
    """Render a modern HTML table with sticky header, rounded border, and cell pills."""
    ths = "".join(
        f'<th class="{"num" if is_num else ""}">{html.escape(label)}</th>'
        for label, is_num in headers
    )
    trs: list[str] = []
    for row in rows_html:
        tds = "".join(
            f'<td class="{"num" if headers[idx][1] else ""}">{cell}</td>'
            for idx, cell in enumerate(row)
        )
        trs.append(f"<tr>{tds}</tr>")
    table_html = (
        f'<div class="modern-table-wrap">'
        f'<div class="modern-table-scroll" style="max-height:{max_height}px;">'
        f'<table class="modern-table">'
        f"<thead><tr>{ths}</tr></thead>"
        f"<tbody>{''.join(trs)}</tbody>"
        f"</table>"
        f"</div>"
        f"</div>"
    )
    st.markdown(table_html, unsafe_allow_html=True)


@st.fragment
def _render_live_overview_fragment(service: ParkingService) -> None:
    skeleton = _show_skeleton("dashboard")
    metrics = _cached_overview_metrics(service)
    lots = _cached_parking_lots(service)
    skeleton.empty()

    total = metrics.total_slots
    free_pct = round((metrics.available_slots / total) * 100, 1) if total else 0.0
    occ_pct = round((metrics.active_vehicles / total) * 100, 1) if total else 0.0

    st.markdown(
        f"""
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-top">
                    <span class="kpi-label">Tổng vị trí</span>
                    <span class="kpi-icon kpi-icon--blue">{svg_icon("layers", 17, 1.9)}</span>
                </div>
                <div class="kpi-value">{metrics.total_slots}</div>
                <span class="kpi-chip kpi-chip--blue">{len(lots)} bãi đỗ PTIT</span>
            </div>
            <div class="kpi-card">
                <div class="kpi-top">
                    <span class="kpi-label">Chỗ trống</span>
                    <span class="kpi-icon kpi-icon--green">{svg_icon("check", 17, 1.9)}</span>
                </div>
                <div class="kpi-value">{metrics.available_slots}</div>
                <span class="kpi-chip kpi-chip--green">{free_pct}% tổng chỗ</span>
            </div>
            <div class="kpi-card">
                <div class="kpi-top">
                    <span class="kpi-label">Xe đang gửi</span>
                    <span class="kpi-icon kpi-icon--amber">{svg_icon("car", 17, 1.9)}</span>
                </div>
                <div class="kpi-value">{metrics.active_vehicles}</div>
                <span class="kpi-chip kpi-chip--amber">{occ_pct}% lấp đầy</span>
            </div>
            <div class="kpi-card">
                <div class="kpi-top">
                    <span class="kpi-label">Doanh thu hôm nay</span>
                    <span class="kpi-icon kpi-icon--indigo">{svg_icon("wallet", 17, 1.9)}</span>
                </div>
                <div class="kpi-value">{html.escape(_format_vnd(metrics.today_revenue))}</div>
                <span class="kpi-chip kpi-chip--slate">Tổng: {html.escape(_format_vnd(metrics.total_revenue))}</span>
            </div>
            <div class="kpi-card">
                <div class="kpi-top">
                    <span class="kpi-label">Vé tháng hiệu lực</span>
                    <span class="kpi-icon kpi-icon--slate">{svg_icon("ticket", 17, 1.9)}</span>
                </div>
                <div class="kpi-value">{metrics.active_monthly_passes}</div>
                <span class="kpi-chip kpi-chip--green">Đang hoạt động</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.subheader("Tình trạng các bãi đỗ")
    if lots:
        lot_cards_html: list[str] = ['<div class="lot-grid">']
        pin_svg = svg_icon("map_pin", 13, 1.9)
        for lot in lots:
            tong = int(lot.get("tong_cho") or 0)
            dang_do = int(lot.get("dang_do") or 0)
            cho_trong = int(lot.get("cho_trong") or 0)
            pct = round((dang_do / tong) * 100, 1) if tong > 0 else 0.0
            bar_color = "#EF4444" if pct >= 85 else ("#F59E0B" if pct >= 60 else "#10B981")
            lot_cards_html.append(
                f'<div class="lot-card">'
                f'<div class="lot-card-head">'
                f'<div>'
                f'<div class="lot-name">{html.escape(str(lot["tenbaido"]))}</div>'
                f'<div class="lot-loc">{pin_svg}<span>{html.escape(str(lot["diadiem"]))}</span></div>'
                f'</div>'
                f'<span class="lot-ratio">{dang_do} / {tong} ô</span>'
                f'</div>'
                f'<div class="lot-bar-bg">'
                f'<div class="lot-bar-fill" style="width: {min(pct, 100.0)}%; background: {bar_color};"></div>'
                f'</div>'
                f'<div class="lot-stats">'
                f'<span>Còn trống: <strong>{cho_trong}</strong></span>'
                f'<span>Lấp đầy: <strong>{pct}%</strong></span>'
                f'</div>'
                f'</div>'
            )
        lot_cards_html.append("</div>")
        st.markdown("".join(lot_cards_html), unsafe_allow_html=True)

        zones_summary = _cached_zones_summary(service)
        if zones_summary:
            with st.expander("Chi tiết tỷ lệ lấp đầy theo khu vực", expanded=False):
                zone_rows_html: list[list[str]] = []
                for z in zones_summary:
                    tong = int(z.get("tong_cho") or 0)
                    dang_do = int(z.get("dang_do") or 0)
                    cho_trong = int(z.get("cho_trong") or 0)
                    pct = round((dang_do / tong) * 100, 1) if tong > 0 else 0.0
                    zone_rows_html.append(
                        [
                            _tbl_stack(z.get("tenbaido"), z.get("diadiem")),
                            _tbl_pill(f"Khu {z.get('ten')}", "blue"),
                            f'<span class="tbl-main">{tong}</span>',
                            _tbl_pill(f"{cho_trong} trống", "green"),
                            _tbl_pill(f"{dang_do} xe", "amber" if dang_do > 0 else "slate"),
                            _tbl_progress(pct),
                        ]
                    )
                _render_modern_table(
                    [
                        ("Bãi đỗ & Địa điểm", False),
                        ("Khu vực", False),
                        ("Tổng ô", True),
                        ("Còn trống", False),
                        ("Đang đỗ", False),
                        ("Lấp đầy", False),
                    ],
                    zone_rows_html,
                    max_height=320,
                )

    head_left, head_right = st.columns([3.6, 1.2])
    head_left.subheader("Sơ đồ vị trí đỗ trực quan")
    if head_right.button("Làm mới sơ đồ", icon=":material/refresh:", width="stretch"):
        _invalidate_data_cache()
        st.rerun(scope="fragment")

    f_lot, f_zone = st.columns([2.5, 2.5])
    lot_options: dict[str, Optional[int]] = {"Tất cả bãi xe": None}
    for lot in lots:
        lot_options[f"{lot['tenbaido']} ({lot['diadiem']})"] = int(lot["id"])

    selected_lot_label = f_lot.selectbox("Chọn bãi xe", list(lot_options.keys()))
    selected_lot_id = lot_options[selected_lot_label]

    zones = _cached_zones(service, selected_lot_id)
    zone_options: dict[str, Optional[int]] = {"Tất cả khu vực": None}
    for z in zones:
        zone_options[f"Khu {z['ten']} - {z['tenbaido']}"] = int(z["id"])

    selected_zone_label = f_zone.selectbox("Chọn khu vực", list(zone_options.keys()))
    selected_zone_id = zone_options[selected_zone_label]

    f_status, f_query = st.columns([2.6, 2.4])
    status_filter = f_status.segmented_control(
        "Trạng thái",
        options=["Tất cả", "Còn trống", "Đang đỗ", "Bảo trì"],
        default="Tất cả",
    )
    search_kw = f_query.text_input("Tìm biển số / ô", placeholder="VD: 29A12345 hoặc A-1").strip().lower()

    all_slots = _cached_slots(service, selected_lot_id, selected_zone_id)
    filtered_slots: list[dict[str, Any]] = []
    for s in all_slots:
        slot_status = int(s["trangthai"] if s["trangthai"] is not None else 0)
        if status_filter == "Còn trống" and slot_status != 1:
            continue
        if status_filter == "Đang đỗ" and slot_status != 0:
            continue
        if status_filter == "Bảo trì" and slot_status != 2:
            continue
        if search_kw:
            plate_text = str(s.get("bienso") or "").lower()
            code_text = f"{s['ten_khuvuc']}-{s['sothutu']}".lower()
            if search_kw not in plate_text and search_kw not in code_text:
                continue
        filtered_slots.append(s)

    if not all_slots:
        _render_empty_state(
            "Khu vực này chưa có vị trí đỗ nào",
            "Bạn có thể mở rộng thêm vị trí đỗ ở mục bên dưới.",
            icon_name="layers",
        )
    elif not filtered_slots:
        _render_empty_state(
            "Không tìm thấy vị trí đỗ phù hợp",
            "Thử thay đổi bộ lọc bãi xe, trạng thái hoặc từ khóa tìm kiếm.",
            icon_name="search",
        )
    else:
        st.markdown(
            f"""
            <div class="slot-toolbar">
                <span style="font-size:0.82rem; color:#64748B;">Đang hiển thị <strong>{len(filtered_slots)}</strong> / {len(all_slots)} vị trí</span>
                <div class="slot-legend">
                    <span class="legend-item"><span class="legend-dot legend-dot--free"></span>Còn trống</span>
                    <span class="legend-item"><span class="legend-dot legend-dot--busy"></span>Đang đỗ</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        cards_html: list[str] = []
        for slot in filtered_slots:
            slot_status = int(slot["trangthai"] if slot["trangthai"] is not None else 0)
            is_free = slot_status == 1
            is_maint = slot_status == 2
            if is_free:
                css_cls = "slot-free"
                badge_cls = "slot-badge--free"
                badge_icon = svg_icon("check", size=12, stroke_width=2.0)
                badge_label = "Trống"
            elif is_maint:
                css_cls = "slot-busy"
                badge_cls = "slot-badge--busy"
                badge_icon = svg_icon("alert", size=12, stroke_width=2.0)
                badge_label = "Bảo trì"
            else:
                css_cls = "slot-busy"
                badge_cls = "slot-badge--busy"
                badge_icon = svg_icon("car", size=12, stroke_width=2.0)
                badge_label = "Đang đỗ"
            zone_label = f"Khu {html.escape(str(slot['ten_khuvuc']))}-{html.escape(str(slot['sothutu']))}"
            lot_name_raw = str(slot["tenbaido"])
            lot_name = html.escape(lot_name_raw)
            plate_raw = str(slot.get("bienso") or "").strip()

            if is_free:
                middle_html = '<div class="slot-empty-hint">Sẵn sàng đón xe</div>'
                meta_html = f'<div class="slot-meta">{lot_name}</div>'
                tooltip_text = f"{lot_name_raw} · Còn trống"
            elif is_maint:
                middle_html = '<div class="slot-empty-hint">Đang khóa bảo trì</div>'
                meta_html = f'<div class="slot-meta">{lot_name}</div>'
                tooltip_text = f"{lot_name_raw} · Đang bảo trì"
            else:
                middle_html = (
                    f'<div class="slot-plate">{html.escape(plate_raw)}</div>'
                    if plate_raw
                    else '<div class="slot-plate">Đang giữ chỗ</div>'
                )
                vtype_val = str(slot.get("loaiphuongtien") or "").strip()
                giovao_raw = slot.get("giovao")
                if isinstance(giovao_raw, datetime):
                    time_short = giovao_raw.strftime("%H:%M %d/%m")
                else:
                    s_time = str(giovao_raw or "").strip()
                    time_short = f"{s_time[11:16]} {s_time[8:10]}/{s_time[5:7]}" if len(s_time) >= 16 else s_time[:16]

                meta_parts = [p for p in (vtype_val, time_short) if p]
                meta_line = " · ".join(html.escape(p) for p in meta_parts) if meta_parts else lot_name
                meta_html = f'<div class="slot-meta">{meta_line}</div>'
                tooltip_text = " · ".join(p for p in (lot_name_raw, plate_raw, vtype_val, time_short) if p)

            cards_html.append(
                f'<div class="slot-card {css_cls}" title="{html.escape(tooltip_text)}">'
                f'<div class="slot-head"><span class="slot-title">{zone_label}</span>'
                f'<span class="slot-badge {badge_cls}">{badge_icon}{badge_label}</span></div>'
                f"{middle_html}"
                f"{meta_html}"
                f"</div>"
            )

        with st.container(height=420, border=True):
            st.markdown(f'<div class="slot-grid">{"".join(cards_html)}</div>', unsafe_allow_html=True)

    with st.expander("Mở rộng thêm vị trí đỗ cho khu vực"):
        if zones:
            z_map = {f"{z['tenbaido']} - Khu {z['ten']}": int(z["id"]) for z in zones}
            with st.form("add_slots_form"):
                c1, c2 = st.columns([3, 1])
                target_zone = c1.selectbox("Khu vực cần thêm", list(z_map.keys()))
                qty = c2.number_input("Số ô thêm", min_value=1, max_value=50, value=5)
                if st.form_submit_button("Thêm vị trí đỗ"):
                    try:
                        added = service.add_slots_to_zone(z_map[target_zone], int(qty))
                        _queue_toast(f"Đã thêm {added} vị trí đỗ mới.")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))


def _render_active_turns_table(
    active_turns: list[dict[str, Any]],
    height: int = 320,
    show_search: bool = True,
    key_prefix: str = "active_turns",
) -> None:
    """Render the table of vehicles currently parked inside the parking lots."""
    if not active_turns:
        _render_empty_state(
            "Không có xe đang gửi trong bãi",
            "Các phương tiện check-in thành công sẽ xuất hiện tại đây.",
            icon_name="car",
        )
        return

    filtered = active_turns
    if show_search:
        kw = st.text_input(
            "Lọc nhanh xe đang gửi (biển số / thẻ / chủ xe / bãi)",
            placeholder="VD: 29A12345 hoặc 013...",
            key=f"{key_prefix}_search",
        ).strip().lower()
        if kw:
            filtered = [
                t
                for t in active_turns
                if kw in str(t.get("bienso") or "").lower()
                or kw in str(t.get("mathe") or "").lower()
                or kw in str(t.get("chu_xe") or "").lower()
                or kw in str(t.get("tenbaido") or "").lower()
            ]
        if not filtered:
            _render_empty_state(
                "Không có xe nào khớp từ khóa",
                "Thử xóa hoặc đổi từ khóa tìm kiếm.",
                icon_name="search",
            )
            return

    active_rows_html: list[list[str]] = []
    for t in filtered:
        loaive_raw = str(t.get("loaive") or "ngày").strip()
        is_monthly = "tháng" in loaive_raw.lower()
        ticket_pill = _tbl_pill("Vé tháng" if is_monthly else "Vé ngày", "blue" if is_monthly else "slate")
        active_rows_html.append(
            [
                f'<span class="tbl-id">#{html.escape(str(t.get("id_luotdo")))}</span>',
                f'{_tbl_plate(t.get("bienso"))}<div class="tbl-sub">{html.escape(str(t.get("loaiphuongtien") or "—"))}</div>',
                _tbl_stack(t.get("chu_xe") or "Khách vãng lai", ""),
                _tbl_stack(t.get("tenbaido"), f"Khu {t.get('khuvuc', '')} · Ô {t.get('vitri', '')}"),
                _tbl_pill(f"#{t.get('mathe') or '—'}", "slate"),
                html.escape(_tbl_fmt_dt(t.get("giovao"))),
                html.escape(str(t.get("nhanvien") or "—")),
                f'{ticket_pill}<div class="tbl-sub">{html.escape(_format_vnd(int(t.get("dongia") or 0)))}</div>',
            ]
        )

    _render_modern_table(
        [
            ("Mã", False),
            ("Phương tiện", False),
            ("Chủ xe", False),
            ("Vị trí đỗ", False),
            ("Thẻ xe", False),
            ("Giờ vào", False),
            ("NV trực", False),
            ("Vé & Giá", True),
        ],
        active_rows_html,
        max_height=max(height, 340),
    )


def _render_overview_page(service: ParkingService) -> None:
    _render_page_header(
        "dashboard",
        "Tổng quan & Sơ đồ bãi xe",
        "Theo dõi công suất, vị trí đỗ theo khu vực và phương tiện đang gửi theo thời gian thực.",
    )
    _render_live_overview_fragment(service)

    with st.expander("Quản trị bãi đỗ, khu vực & vị trí"):
        t_lot, t_zone, t_slot = st.tabs(["Bãi đỗ (baidoxe)", "Khu vực (khuvucdo)", "Vị trí đỗ (vitrido)"])
        lots = _cached_parking_lots(service)
        zones = _cached_zones(service, None)
        slots = _cached_slots(service, None, None)

        with t_lot:
            c_add, c_edit = st.columns(2)
            with c_add.form("add_lot_form"):
                st.caption("Thêm bãi đỗ mới")
                new_lot_name = st.text_input("Tên bãi đỗ", max_chars=20, key="new_lot_name")
                new_lot_loc = st.text_input("Địa điểm", max_chars=30, key="new_lot_loc")
                if st.form_submit_button("Thêm bãi đỗ", type="primary"):
                    try:
                        service.create_parking_lot(new_lot_name, new_lot_loc)
                        _invalidate_data_cache()
                        _queue_toast(f"Đã thêm bãi đỗ '{new_lot_name.strip()}'.")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))

            with c_edit:
                if lots:
                    lot_select_map = {f"#{l['id']} · {l['tenbaido']}": l for l in lots}
                    sel_lot_lbl = st.selectbox("Chọn bãi đỗ sửa / xóa", list(lot_select_map.keys()), key="edit_lot_sel")
                    sel_lot = lot_select_map[sel_lot_lbl]
                    with st.form("edit_lot_form"):
                        upd_lot_name = st.text_input("Tên bãi đỗ", value=str(sel_lot["tenbaido"]), max_chars=20, key="upd_lot_name")
                        upd_lot_loc = st.text_input("Địa điểm", value=str(sel_lot.get("diadiem") or ""), max_chars=30, key="upd_lot_loc")
                        b1, b2 = st.columns(2)
                        if b1.form_submit_button("Cập nhật bãi đỗ", type="primary"):
                            try:
                                service.update_parking_lot(int(sel_lot["id"]), upd_lot_name, upd_lot_loc)
                                _invalidate_data_cache()
                                _queue_toast("Đã cập nhật thông tin bãi đỗ.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))
                        if b2.form_submit_button("Xóa bãi đỗ"):
                            try:
                                service.delete_parking_lot(int(sel_lot["id"]))
                                _invalidate_data_cache()
                                _queue_toast("Đã xóa bãi đỗ.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))

        with t_zone:
            if not lots:
                st.info("Cần có ít nhất 1 bãi đỗ trước khi tạo khu vực.")
            else:
                lot_id_map = {f"{l['tenbaido']} (#{l['id']})": int(l["id"]) for l in lots}
                c_zadd, c_zedit = st.columns(2)
                with c_zadd.form("add_zone_form"):
                    st.caption("Thêm khu vực mới")
                    z_lot_lbl = st.selectbox("Thuộc bãi đỗ", list(lot_id_map.keys()), key="new_zone_lot")
                    z_name = st.text_input("Tên khu vực", max_chars=5, placeholder="VD: D", key="new_zone_name")
                    if st.form_submit_button("Thêm khu vực", type="primary"):
                        try:
                            service.create_zone(lot_id_map[z_lot_lbl], z_name)
                            _invalidate_data_cache()
                            _queue_toast(f"Đã thêm khu vực '{z_name.strip()}'.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))

                with c_zedit:
                    if zones:
                        zone_sel_map = {f"#{z['id']} · Khu {z['ten']} ({z['tenbaido']})": z for z in zones}
                        sel_z_lbl = st.selectbox("Chọn khu vực sửa / xóa", list(zone_sel_map.keys()), key="edit_zone_sel")
                        sel_z = zone_sel_map[sel_z_lbl]
                        with st.form("edit_zone_form"):
                            lot_keys = list(lot_id_map.keys())
                            cur_lot_idx = next((i for i, k in enumerate(lot_keys) if lot_id_map[k] == int(sel_z["idbdx"])), 0)
                            upd_z_lot = st.selectbox("Thuộc bãi đỗ", lot_keys, index=cur_lot_idx, key="upd_zone_lot")
                            upd_z_name = st.text_input("Tên khu vực", value=str(sel_z["ten"]), max_chars=5, key="upd_zone_name")
                            zb1, zb2 = st.columns(2)
                            if zb1.form_submit_button("Cập nhật khu vực", type="primary"):
                                try:
                                    service.update_zone(int(sel_z["id"]), lot_id_map[upd_z_lot], upd_z_name)
                                    _invalidate_data_cache()
                                    _queue_toast("Đã cập nhật khu vực.")
                                    st.rerun()
                                except (ValidationError, DatabaseError) as exc:
                                    st.error(str(exc))
                            if zb2.form_submit_button("Xóa khu vực"):
                                try:
                                    service.delete_zone(int(sel_z["id"]))
                                    _invalidate_data_cache()
                                    _queue_toast("Đã xóa khu vực.")
                                    st.rerun()
                                except (ValidationError, DatabaseError) as exc:
                                    st.error(str(exc))

        with t_slot:
            c_sadd, c_smaint = st.columns(2)
            with c_sadd.form("crud_add_slots_form"):
                st.caption("Thêm hàng loạt vị trí đỗ vào khu vực")
                if zones:
                    z_map = {f"{z['tenbaido']} · Khu {z['ten']}": int(z["id"]) for z in zones}
                    s_zone_lbl = st.selectbox("Khu vực", list(z_map.keys()), key="add_slot_zone")
                    s_count = st.number_input("Số lượng vị trí thêm", min_value=1, max_value=50, value=5, key="add_slot_cnt")
                    if st.form_submit_button("Thêm vị trí", type="primary"):
                        try:
                            added = service.add_slots_to_zone(z_map[s_zone_lbl], int(s_count))
                            _invalidate_data_cache()
                            _queue_toast(f"Đã thêm {added} vị trí đỗ mới.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))
            with c_smaint:
                if slots:
                    st.caption("Khóa bảo trì / Mở khóa / Xóa vị trí")
                    slot_lbl_map = {
                        f"#{s['id']} · {s['tenbaido']} Khu {s['ten_khuvuc']}-{s['sothutu']} ({'Trống' if int(s['trangthai'] or 0) == 1 else ('Bảo trì' if int(s['trangthai'] or 0) == 2 else 'Đang đỗ')})": s
                        for s in slots
                    }
                    sel_s_lbl = st.selectbox("Chọn vị trí", list(slot_lbl_map.keys()), key="maint_slot_sel")
                    sel_s = slot_lbl_map[sel_s_lbl]
                    sb1, sb2, sb3 = st.columns(3)
                    if sb1.button("Khóa bảo trì", key="btn_slot_lock", width="stretch"):
                        try:
                            service.set_slot_maintenance(int(sel_s["id"]), True)
                            _invalidate_data_cache()
                            _queue_toast("Đã khóa bảo trì vị trí.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))
                    if sb2.button("Mở khóa", key="btn_slot_unlock", width="stretch"):
                        try:
                            service.set_slot_maintenance(int(sel_s["id"]), False)
                            _invalidate_data_cache()
                            _queue_toast("Đã mở khóa vị trí về Trống.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))
                    if sb3.button("Xóa vị trí", key="btn_slot_del", width="stretch"):
                        try:
                            service.delete_slot(int(sel_s["id"]))
                            _invalidate_data_cache()
                            _queue_toast("Đã xóa vị trí đỗ.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))

    active_turns = _cached_active_turns(service)
    st.subheader(f"Danh sách xe đang gửi trong bãi ({len(active_turns)})")
    _render_active_turns_table(active_turns, height=320, key_prefix="overview_active")


@st.dialog("Xác nhận thanh toán & Xuất bến")
def _confirm_checkout_dialog(
    service: ParkingService,
    turn_id: int,
    cashier_id: int,
    cashier_name: str,
    license_plate: str,
    amount: int,
) -> None:
    lost_card = st.checkbox("Khách làm mất thẻ xe (khóa thẻ & thu phụ phí)", value=False, key="dlg_lost_card")
    lost_fee = 0
    if lost_card:
        lost_fee = int(
            st.number_input("Phụ phí mất thẻ (VNĐ)", min_value=0, step=10000, value=50000, key="dlg_lost_fee")
        )
    total_due = amount + lost_fee
    st.markdown(
        f"""
        <div class="invoice-card">
            <div class="invoice-row"><span>Biển số xe</span><strong>{html.escape(license_plate)}</strong></div>
            <div class="invoice-row"><span>Nhân viên thu ngân</span><strong>{html.escape(cashier_name)}</strong></div>
            <div class="invoice-row"><span>Tổng thanh toán</span><strong>{html.escape(_format_vnd(total_due))}</strong></div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    c_cancel, c_ok = st.columns(2)
    if c_cancel.button("Hủy", width="stretch"):
        st.rerun()
    if c_ok.button("Xác nhận thu tiền & Mở cổng", type="primary", width="stretch"):
        try:
            done_quote = service.check_out_vehicle(
                turn_id,
                cashier_id,
                lost_card=lost_card,
                lost_card_fee=lost_fee,
            )
            st.session_state["last_receipt_html"] = {
                "filename": f"bien_lai_luot_{done_quote.turn_id}.html",
                "content": service.build_receipt_html(
                    receipt_id=done_quote.turn_id,
                    plate=done_quote.license_plate,
                    ticket_type=done_quote.ticket_type,
                    checkin_time=done_quote.checkin_time.strftime("%Y-%m-%d %H:%M:%S"),
                    checkout_time=done_quote.checkout_time.strftime("%Y-%m-%d %H:%M:%S"),
                    amount=done_quote.amount,
                    status="Thành công",
                ),
            }
            _invalidate_data_cache()
            _queue_toast(
                f"Đã hoàn tất thanh toán {_format_vnd(done_quote.amount)} cho xe {done_quote.license_plate}."
            )
            st.rerun()
        except (ValidationError, DatabaseError) as exc:
            st.error(str(exc))


def _render_checkin_checkout_page(service: ParkingService) -> None:
    _render_page_header(
        "car",
        "Quản lý Xe vào / Xe ra",
        "Ghi nhận phương tiện vào bãi, cấp thẻ xe, xử lý sự cố và tính phí xuất bến tức thời.",
    )

    employees = _cached_employees(service)
    if not employees:
        st.warning(
            "Chưa có dữ liệu nhân viên trong DB. Vui lòng thêm nhân viên ở mục **Nhân sự & Khách gửi xe**."
        )
        return

    emp_map = {f"{e['hoten']} ({e['chucvu']})": int(e["id"]) for e in employees}

    tab_in, tab_out, tab_ops = st.tabs(
        [
            "Cho xe vào bãi (Check-in)",
            "Cho xe ra & Thanh toán (Check-out)",
            "Xử lý sự cố (Chuyển chỗ / Hủy lượt)",
        ]
    )

    with tab_in:
        vehicle_types = _cached_vehicle_types(service)
        vtype_map = {str(v["tenloai"]): int(v["id"]) for v in vehicle_types}

        free_slots = [s for s in _cached_slots(service, None, None) if int(s["trangthai"] or 0) == 1]
        free_cards = _cached_cards(service, True)

        if not vehicle_types:
            st.warning("Chưa có danh mục loại phương tiện trong cơ sở dữ liệu.")
        elif not free_slots:
            st.warning("Hiện không còn vị trí đỗ trống.")
        elif not free_cards:
            st.warning("Hiện không còn thẻ xe trống để phát hành.")
        else:
            lot_names = sorted({str(s["tenbaido"]) for s in free_slots})
            f_ci_lot, f_ci_vtype = st.columns(2)
            filter_lot = f_ci_lot.selectbox(
                "Lọc nhanh vị trí trống theo bãi đỗ",
                ["Tất cả bãi đỗ"] + lot_names,
                key="checkin_lot_filter",
            )
            vtype_label = f_ci_vtype.selectbox(
                "Loại phương tiện",
                list(vtype_map.keys()),
                key="checkin_vtype_select",
            )
            if filter_lot == "Tất cả bãi đỗ":
                vtype_norm = vtype_label.strip().lower()
                scoped_slots = sorted(
                    free_slots,
                    key=lambda s: (0 if vtype_norm in str(s["tenbaido"]).lower() else 1, int(s["id"])),
                )
            else:
                scoped_slots = [s for s in free_slots if str(s["tenbaido"]) == filter_lot]
            slot_map = {
                f"{s['tenbaido']} | Khu {s['ten_khuvuc']}-{s['sothutu']}": int(s["id"])
                for s in scoped_slots
            }
            card_map = {str(c["maso"]): int(c["id"]) for c in free_cards}

            st.markdown(
                f"""
                <div class="preview-strip">
                    <span>Phạm vi lọc: <strong>{html.escape(filter_lot)}</strong></span>
                    <span>Ô trống phù hợp: <strong>{len(scoped_slots)}</strong></span>
                    <span>Thẻ xe sẵn sàng: <strong>{len(free_cards)}</strong></span>
                </div>
                """,
                unsafe_allow_html=True,
            )

            with st.form("checkin_form"):
                plate = st.text_input("Biển số xe (tối đa 8 ký tự)", placeholder="VD: 29A12345", max_chars=8)

                c3, c4, c5 = st.columns(3)
                slot_label = c3.selectbox("Vị trí đỗ trống", list(slot_map.keys()))
                card_label = c4.selectbox("Thẻ xe cấp phát", list(card_map.keys()))
                emp_label = c5.selectbox("Nhân viên tiếp nhận", list(emp_map.keys()))

                submitted = st.form_submit_button("Xác nhận xe vào bãi", type="primary")
                if submitted:
                    try:
                        turn_id = service.check_in_vehicle(
                            license_plate=plate,
                            vehicle_type_id=vtype_map[vtype_label],
                            slot_id=slot_map[slot_label],
                            card_id=card_map[card_label],
                            employee_id=emp_map[emp_label],
                        )
                        st.session_state["last_ticket_html"] = {
                            "filename": f"phieu_gui_xe_{turn_id}.html",
                            "content": service.build_ticket_html(
                                turn_id=turn_id,
                                plate=plate.strip().upper(),
                                vehicle_type=vtype_label,
                                slot_label=slot_label,
                                card_code=card_label,
                                checkin_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            ),
                        }
                        _invalidate_data_cache()
                        _queue_toast(f"Đã ghi nhận xe vào bãi thành công (Mã lượt #{turn_id}).")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))

        last_ticket = st.session_state.get("last_ticket_html")
        if last_ticket:
            st.download_button(
                label="Tải / In phiếu gửi xe gần nhất (HTML)",
                data=last_ticket["content"].encode("utf-8"),
                file_name=last_ticket["filename"],
                mime="text/html",
                key="dl_last_ticket_html",
            )

    with tab_out:
        active_turns = _cached_active_turns(service)
        if not active_turns:
            st.info("Không có xe nào đang chờ ra bãi.")
        else:
            kw = st.text_input(
                "Tìm nhanh theo biển số hoặc mã thẻ",
                placeholder="VD: 29A12345 hoặc THE01",
                key="checkout_search_kw",
            ).strip().lower()
            filtered_turns = (
                [
                    t
                    for t in active_turns
                    if kw in str(t.get("bienso") or "").lower() or kw in str(t.get("mathe") or "").lower()
                ]
                if kw
                else active_turns
            )
            if not filtered_turns:
                st.info("Không tìm thấy xe đang gửi khớp với từ khóa.")
            else:
                turn_map = {
                    f"#{t['id_luotdo']} | {t['bienso']} ({t['loaiphuongtien']}) - {t['tenbaido']} Khu {t['khuvuc']}-{t['vitri']}": int(
                        t["id_luotdo"]
                    )
                    for t in filtered_turns
                }
                selected_turn_label = st.selectbox("Chọn phương tiện cần xuất bến", list(turn_map.keys()))
                selected_turn_id = turn_map[selected_turn_label]
                selected_turn = next(
                    (t for t in filtered_turns if int(t["id_luotdo"]) == selected_turn_id),
                    {},
                )

                try:
                    quote = service.get_fee_quote(selected_turn_id)
                    slot_desc = (
                        f"{selected_turn.get('tenbaido', '')} · Khu {selected_turn.get('khuvuc', '')}-{selected_turn.get('vitri', '')}"
                        if selected_turn
                        else "—"
                    )
                    giovao_str = str(selected_turn.get("giovao") or "")[:16] or "—"
                    st.markdown(
                        f"""
                        <div class="invoice-card">
                            <div class="invoice-row"><span>Biển số xe</span><strong>{html.escape(quote.license_plate)}</strong></div>
                            <div class="invoice-row"><span>Loại phương tiện</span><span>{html.escape(str(selected_turn.get('loaiphuongtien') or '—'))}</span></div>
                            <div class="invoice-row"><span>Vị trí đỗ & Thẻ xe</span><span>{html.escape(slot_desc)} · Thẻ {html.escape(str(selected_turn.get('mathe') or '—'))}</span></div>
                            <div class="invoice-row"><span>Giờ vào bãi</span><span>{html.escape(giovao_str)}</span></div>
                            <div class="invoice-row"><span>Hình thức vé</span><span>{html.escape(quote.ticket_type)}</span></div>
                            <div class="invoice-row"><span>Thời gian gửi tạm tính</span><span>{quote.duration_hours} giờ</span></div>
                            <div class="invoice-row"><span>Phí thanh toán dự kiến</span><strong>{html.escape(_format_vnd(quote.amount))}</strong></div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

                    cashier_label = st.selectbox("Nhân viên thu ngân", list(emp_map.keys()), key="checkout_cashier")
                    if st.button("Thanh toán & Cho xe ra", type="primary"):
                        _confirm_checkout_dialog(
                            service=service,
                            turn_id=selected_turn_id,
                            cashier_id=emp_map[cashier_label],
                            cashier_name=cashier_label,
                            license_plate=quote.license_plate,
                            amount=quote.amount,
                        )
                except (ValidationError, DatabaseError) as exc:
                    st.error(str(exc))

        last_receipt = st.session_state.get("last_receipt_html")
        if last_receipt:
            st.download_button(
                label="Tải / In biên lai thu phí gần nhất (HTML)",
                data=last_receipt["content"].encode("utf-8"),
                file_name=last_receipt["filename"],
                mime="text/html",
                key="dl_last_receipt_html",
            )

    with tab_ops:
        active_ops = _cached_active_turns(service)
        free_slots_ops = [s for s in _cached_slots(service, None, None) if int(s["trangthai"] or 0) == 1]
        if not active_ops:
            st.info("Hiện không có xe đang gửi trong bãi để xử lý.")
        else:
            ops_turn_map = {
                f"#{t['id_luotdo']} | {t['bienso']} - {t['tenbaido']} Khu {t['khuvuc']}-{t['vitri']}": int(t["id_luotdo"])
                for t in active_ops
            }
            c_move, c_cancel = st.columns(2)
            with c_move:
                st.caption("Chuyển vị trí đỗ cho xe đang gửi")
                if not free_slots_ops:
                    st.info("Không còn vị trí trống để chuyển.")
                else:
                    move_turn_lbl = st.selectbox("Chọn lượt đỗ cần chuyển", list(ops_turn_map.keys()), key="move_turn_sel")
                    target_slot_map = {
                        f"{s['tenbaido']} | Khu {s['ten_khuvuc']}-{s['sothutu']}": int(s["id"])
                        for s in free_slots_ops
                    }
                    target_slot_lbl = st.selectbox("Vị trí đỗ mới", list(target_slot_map.keys()), key="move_slot_sel")
                    if st.button("Xác nhận chuyển vị trí", type="primary", key="btn_move_slot"):
                        try:
                            service.move_active_turn_slot(ops_turn_map[move_turn_lbl], target_slot_map[target_slot_lbl])
                            _invalidate_data_cache()
                            _queue_toast("Đã chuyển vị trí đỗ thành công.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))

            with c_cancel:
                st.caption("Hủy lượt đỗ nhập nhầm (chưa thanh toán)")
                cancel_turn_lbl = st.selectbox("Chọn lượt đỗ cần hủy", list(ops_turn_map.keys()), key="cancel_turn_sel")
                if st.button("Hủy lượt đỗ & Trả chỗ/thẻ", key="btn_cancel_turn"):
                    try:
                        service.cancel_active_turn(ops_turn_map[cancel_turn_lbl])
                        _invalidate_data_cache()
                        _queue_toast("Đã hủy lượt đỗ và giải phóng vị trí, thẻ xe.")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))

    st.divider()
    active_turns_all = _cached_active_turns(service)
    st.subheader(f"Danh sách xe đang gửi trong bãi ({len(active_turns_all)})")
    _render_active_turns_table(active_turns_all, height=300, key_prefix="checkin_active")


def _render_transactions_page(service: ParkingService) -> None:
    _render_page_header(
        "receipt",
        "Lịch sử giao dịch & Thanh toán",
        "Tra cứu biên lai thu phí theo ngày, loại phương tiện và xuất báo cáo CSV.",
    )

    vtypes = _cached_vehicle_types(service)
    vtype_options: dict[str, Optional[int]] = {"Tất cả loại xe": None}
    for v in vtypes:
        vtype_options[str(v["tenloai"])] = int(v["id"])

    quick_range = st.segmented_control(
        "Khoảng thời gian nhanh",
        options=["Hôm nay", "7 ngày", "30 ngày", "Tùy chỉnh"],
        default="30 ngày",
    )

    today = date.today()
    if quick_range == "Hôm nay":
        date_from, date_to = today, today
    elif quick_range == "7 ngày":
        date_from, date_to = today - timedelta(days=7), today
    elif quick_range == "30 ngày":
        date_from, date_to = today - timedelta(days=30), today
    else:
        c_from, c_to = st.columns(2)
        date_from = c_from.date_input("Từ ngày", value=today - timedelta(days=30))
        date_to = c_to.date_input("Đến ngày", value=today)

    f1, f2 = st.columns(2)
    vtype_label = f1.selectbox("Loại phương tiện", list(vtype_options.keys()))
    tx_search = f2.text_input(
        "Tìm theo biển số / mã GD / nhân viên",
        placeholder="VD: 29A12345",
    ).strip().lower()

    if date_from > date_to:
        st.warning("Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.")
        return

    skeleton = _show_skeleton("table")
    rows = _cached_transactions(
        service,
        date_from=date_from,
        date_to=date_to,
        vehicle_type_id=vtype_options[vtype_label],
        limit=250,
    )
    skeleton.empty()

    if not rows:
        _render_empty_state(
            "Không có giao dịch nào",
            "Không tìm thấy biên lai thanh toán trong khoảng thời gian đã chọn.",
            icon_name="receipt",
        )
        return

    df = pd.DataFrame(rows)
    if tx_search:
        mask = (
            df["bienso"].astype(str).str.lower().str.contains(tx_search, na=False, regex=False)
            | df["ma_gd"].astype(str).str.lower().str.contains(tx_search, na=False, regex=False)
            | df["nhanvien"].astype(str).str.lower().str.contains(tx_search, na=False, regex=False)
            | df["mathe"].astype(str).str.lower().str.contains(tx_search, na=False, regex=False)
        )
        df = df[mask]

    if df.empty:
        _render_empty_state(
            "Không có giao dịch khớp từ khóa",
            "Thử thay đổi biển số, mã giao dịch hoặc tên nhân viên.",
            icon_name="search",
        )
        return

    total_amount = int(df["chiphi"].sum())
    avg_amount = total_amount // max(len(df), 1)
    _render_kpi_grid(
        [
            {
                "label": "Số lượng giao dịch",
                "value": f"{len(df):,}".replace(",", "."),
                "chip": f"Từ {date_from.strftime('%d/%m')} đến {date_to.strftime('%d/%m')}",
                "chip_tone": "blue",
                "icon": "receipt",
                "icon_tone": "blue",
            },
            {
                "label": "Tổng doanh thu theo bộ lọc",
                "value": _format_vnd(total_amount),
                "chip": f"TB {_format_vnd(avg_amount)} / giao dịch",
                "chip_tone": "green",
                "icon": "wallet",
                "icon_tone": "green",
            },
        ],
        cols=2,
    )

    tx_rows_html: list[list[str]] = []
    for _, row in df.iterrows():
        hinhthuc = str(row.get("hinhthuc") or "Vé ngày")
        is_monthly = "tháng" in hinhthuc.lower()
        ht_sub = (
            f"VT #{int(float(row['ma_ve_thang']))}"
            if pd.notna(row.get("ma_ve_thang")) and row.get("ma_ve_thang") is not None
            else ""
        )
        status_txt = str(row.get("trangthai") or "Thành công")
        status_tone = "green" if "thành công" in status_txt.lower() else "amber"
        tx_rows_html.append(
            [
                f'<span class="tbl-id">#{html.escape(str(row.get("ma_gd")))}</span>',
                f'{_tbl_plate(row.get("bienso"))}<div class="tbl-sub">{html.escape(str(row.get("loaiphuongtien") or "—"))} · Thẻ #{html.escape(str(row.get("mathe") or "—"))}</div>',
                _tbl_stack(row.get("tenbaido"), f"Ô {row.get('vitri', '—')}"),
                _tbl_stack(_tbl_fmt_dt(row.get("giovao")), f"Ra: {_tbl_fmt_dt(row.get('giora'))}"),
                html.escape(_tbl_fmt_dt(row.get("giothanhtoan"))),
                f'<span class="tbl-money">{html.escape(_format_vnd(int(row.get("chiphi") or 0)))}</span>',
                f'{_tbl_pill(hinhthuc, "blue" if is_monthly else "slate")}'
                + (f'<div class="tbl-sub">{html.escape(ht_sub)}</div>' if ht_sub else ""),
                _tbl_pill(status_txt, status_tone),
                _tbl_stack(row.get("nhanvien") or "—", f"Vào: {row.get('nv_tiep_nhan') or '—'}"),
            ]
        )

    _render_modern_table(
        [
            ("Mã GD", False),
            ("Phương tiện & Thẻ", False),
            ("Bãi & Vị trí", False),
            ("Vào / Ra bãi", False),
            ("Thanh toán", False),
            ("Chi phí", True),
            ("Hình thức", False),
            ("Trạng thái", False),
            ("Nhân sự", False),
        ],
        tx_rows_html,
        max_height=430,
    )

    display_df = df.rename(
        columns={
            "ma_gd": "Mã GD",
            "bienso": "Biển số",
            "loaiphuongtien": "Loại xe",
            "mathe": "Mã thẻ",
            "tenbaido": "Bãi đỗ",
            "vitri": "Vị trí",
            "giovao": "Giờ vào",
            "giora": "Giờ ra",
            "giothanhtoan": "Giờ thanh toán",
            "chiphi": "Chi phí (VNĐ)",
            "hinhthuc": "Hình thức",
            "ma_ve_thang": "Mã vé tháng",
            "trangthai": "Trạng thái",
            "nv_tiep_nhan": "NV tiếp nhận",
            "nhanvien": "NV thu ngân",
        }
    )

    csv_data = display_df.to_csv(index=False).encode("utf-8-sig")
    st.download_button(
        label="Tải xuống báo cáo CSV",
        data=csv_data,
        file_name=f"lich_su_giao_dich_{date_from}_{date_to}.csv",
        mime="text/csv",
    )

    with st.expander("Xử lý trạng thái giao dịch & In biên lai"):
        tx_map = {
            f"#{r['ma_gd']} · {r.get('bienso') or '—'} · {_format_vnd(int(r.get('chiphi') or 0))} ({r.get('trangthai')})": r
            for r in rows
        }
        sel_tx_lbl = st.selectbox("Chọn giao dịch", list(tx_map.keys()), key="tx_action_sel")
        sel_tx = tx_map[sel_tx_lbl]
        c_st, c_pr = st.columns(2)
        with c_st:
            cur_status = str(sel_tx.get("trangthai") or "Thành công")
            status_opts = ["Thành công", "Hoàn tiền", "Thất bại"]
            idx_st = status_opts.index(cur_status) if cur_status in status_opts else 0
            new_st = st.selectbox("Trạng thái mới", status_opts, index=idx_st, key="tx_new_status")
            if st.button("Cập nhật trạng thái", key="btn_upd_tx_status"):
                try:
                    service.update_payment_status(int(sel_tx["ma_gd"]), new_st)
                    _invalidate_data_cache()
                    _queue_toast(f"Đã cập nhật giao dịch #{sel_tx['ma_gd']} sang '{new_st}'.")
                    st.rerun()
                except (ValidationError, DatabaseError) as exc:
                    st.error(str(exc))
        with c_pr:
            receipt_html = service.build_receipt_html(
                receipt_id=int(sel_tx["ma_gd"]),
                plate=str(sel_tx.get("bienso") or "—"),
                ticket_type=str(sel_tx.get("hinhthuc") or "Vé ngày"),
                checkin_time=str(sel_tx.get("giovao") or "—")[:19],
                checkout_time=str(sel_tx.get("giothanhtoan") or "—")[:19],
                amount=int(sel_tx.get("chiphi") or 0),
                status=str(sel_tx.get("trangthai") or "Thành công"),
            )
            st.download_button(
                label="Tải / In biên lai giao dịch (HTML)",
                data=receipt_html.encode("utf-8"),
                file_name=f"bien_lai_gd_{sel_tx['ma_gd']}.html",
                mime="text/html",
                key="dl_tx_receipt_html",
            )


def _render_passes_and_tariffs_page(service: ParkingService) -> None:
    _render_page_header(
        "ticket",
        "Vé tháng & Bảng giá niêm yết",
        "Quản lý thuê bao vé tháng, đăng ký mới và tra cứu biểu giá theo đối tượng.",
    )

    skeleton = _show_skeleton("table")
    tariffs = _cached_tariffs(service)
    passes = _cached_monthly_passes(service)
    skeleton.empty()
    tab_passes, tab_register, tab_tariffs = st.tabs(
        ["Danh sách vé tháng", "Đăng ký vé tháng mới", "Bảng giá"]
    )

    with tab_passes:
        if passes:
            p_status_col, p_search_col = st.columns([2, 2])
            pass_status_filter = p_status_col.segmented_control(
                "Lọc trạng thái vé",
                options=["Tất cả", "Còn hạn", "Hết hạn"],
                default="Tất cả",
            )
            pass_kw = p_search_col.text_input(
                "Tìm biển số / khách hàng / SĐT",
                placeholder="VD: 29A12345 hoặc 09...",
            ).strip().lower()

            pass_df = pd.DataFrame(passes)
            if pass_status_filter == "Còn hạn":
                pass_df = pass_df[pass_df["trangthai"].astype(str).str.lower().str.contains("còn|hiệu lực|active", na=False, regex=False)]
            elif pass_status_filter == "Hết hạn":
                pass_df = pass_df[pass_df["trangthai"].astype(str).str.lower().str.contains("hết|expired", na=False, regex=False)]

            if pass_kw:
                mask = (
                    pass_df["bienso"].astype(str).str.lower().str.contains(pass_kw, na=False, regex=False)
                    | pass_df["hoten"].astype(str).str.lower().str.contains(pass_kw, na=False, regex=False)
                    | pass_df["sdt"].astype(str).str.lower().str.contains(pass_kw, na=False, regex=False)
                )
                pass_df = pass_df[mask]

            if pass_df.empty:
                _render_empty_state(
                    "Không có vé tháng khớp bộ lọc",
                    "Thử chọn trạng thái 'Tất cả' hoặc xóa từ khóa tìm kiếm.",
                    icon_name="ticket",
                )
            else:
                pass_rows_html: list[list[str]] = []
                for _, row in pass_df.iterrows():
                    st_txt = str(row.get("trangthai") or "")
                    is_active = any(k in st_txt.lower() for k in ("còn", "hiệu lực", "active"))
                    pass_rows_html.append(
                        [
                            f'<span class="tbl-id">#{html.escape(str(row.get("id")))}</span>',
                            _tbl_stack(row.get("hoten"), f"{row.get('loaikhachhang') or '—'} · {row.get('sdt') or '—'}"),
                            f'<span class="tbl-sub" style="margin:0;">{html.escape(str(row.get("cccd") or "—"))}</span>',
                            f'{_tbl_plate(row.get("bienso"))}<div class="tbl-sub">{html.escape(str(row.get("loaiphuongtien") or "—"))}</div>',
                            _tbl_pill(f"#{row.get('mathe') or '—'}", "slate"),
                            f'<span class="tbl-money">{html.escape(_format_vnd(int(row.get("dongia") or 0)))}</span>',
                            _tbl_stack(_tbl_fmt_d(row.get("ngaybatdau")), f"Đến: {_tbl_fmt_d(row.get('ngayketthuc'))}"),
                            _tbl_pill(st_txt, "green" if is_active else "red"),
                        ]
                    )

                _render_modern_table(
                    [
                        ("Mã vé", False),
                        ("Khách hàng", False),
                        ("CCCD", False),
                        ("Phương tiện", False),
                        ("Thẻ xe", False),
                        ("Đơn giá/tháng", True),
                        ("Thời hạn", False),
                        ("Trạng thái", False),
                    ],
                    pass_rows_html,
                    max_height=400,
                )

                pass_df = pass_df.rename(
                    columns={
                        "id": "Mã vé",
                        "hoten": "Khách hàng",
                        "sdt": "SĐT",
                        "cccd": "CCCD",
                        "loaikhachhang": "Đối tượng",
                        "bienso": "Biển số",
                        "loaiphuongtien": "Loại xe",
                        "mathe": "Thẻ xe",
                        "dongia": "Đơn giá/tháng",
                        "ngaybatdau": "Ngày bắt đầu",
                        "ngayketthuc": "Ngày hết hạn",
                        "trangthai": "Trạng thái",
                    }
                )
                st.download_button(
                    label="Tải xuống danh sách vé tháng (CSV)",
                    data=pass_df.to_csv(index=False).encode("utf-8-sig"),
                    file_name=f"danh_sach_ve_thang_{date.today()}.csv",
                    mime="text/csv",
                )

                with st.expander("Gia hạn / Đổi xe-thẻ / Hủy vé tháng"):
                    pass_map = {
                        f"#{p['id']} · {p['hoten']} · {p['bienso']} (Hết hạn: {p['ngayketthuc']})": p
                        for p in passes
                    }
                    sel_p_lbl = st.selectbox("Chọn vé tháng", list(pass_map.keys()), key="pass_manage_sel")
                    sel_p = pass_map[sel_p_lbl]
                    col_rn, col_ed, col_cn = st.columns(3)

                    with col_rn:
                        st.caption("Gia hạn vé tháng")
                        ext_months = st.number_input("Số tháng gia hạn", min_value=1, max_value=24, value=1, key="pass_ext_months")
                        if st.button("Gia hạn vé", type="primary", key="btn_renew_pass", width="stretch"):
                            try:
                                res = service.renew_monthly_pass(int(sel_p["id"]), int(ext_months))
                                _invalidate_data_cache()
                                _queue_toast(f"Đã gia hạn vé #{sel_p['id']} đến {res['new_end_date']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))

                    with col_ed:
                        st.caption("Đổi biển số / thẻ xe")
                        all_vtypes_p = _cached_vehicle_types(service)
                        vt_map_p = {str(v["tenloai"]): int(v["id"]) for v in all_vtypes_p}
                        all_cards_p = _cached_cards(service, False)
                        card_opts_p = {
                            f"{c['maso']} (#{c['id']})": int(c["id"])
                            for c in all_cards_p
                            if int(c.get("trangthai") or 0) == 1 or str(c["maso"]) == str(sel_p["mathe"])
                        }
                        new_p_plate = st.text_input("Biển số mới", value=str(sel_p["bienso"]), max_chars=8, key="pass_upd_plate")
                        vt_keys_p = list(vt_map_p.keys())
                        cur_vt_idx = next((i for i, k in enumerate(vt_keys_p) if k == str(sel_p["loaiphuongtien"])), 0)
                        new_p_vtype = st.selectbox("Loại xe", vt_keys_p, index=cur_vt_idx, key="pass_upd_vtype")
                        card_keys_p = list(card_opts_p.keys())
                        cur_c_idx = next((i for i, k in enumerate(card_keys_p) if k.startswith(f"{sel_p['mathe']} ")), 0)
                        new_p_card = st.selectbox("Thẻ xe", card_keys_p, index=cur_c_idx, key="pass_upd_card")
                        if st.button("Lưu thay đổi xe/thẻ", key="btn_upd_pass_assets", width="stretch"):
                            try:
                                service.update_monthly_pass_assets(
                                    pass_id=int(sel_p["id"]),
                                    plate=new_p_plate,
                                    vehicle_type_id=vt_map_p[new_p_vtype],
                                    new_card_id=card_opts_p[new_p_card],
                                )
                                _invalidate_data_cache()
                                _queue_toast(f"Đã cập nhật phương tiện/thẻ cho vé #{sel_p['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))

                    with col_cn:
                        st.caption("Hủy vé trước hạn")
                        st.write("Đặt vé hết hiệu lực ngay và giải phóng thẻ xe nếu không đang gửi.")
                        if st.button("Hủy vé tháng này", key="btn_cancel_pass", width="stretch"):
                            try:
                                service.cancel_monthly_pass(int(sel_p["id"]))
                                _invalidate_data_cache()
                                _queue_toast(f"Đã hủy vé tháng #{sel_p['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))
        else:
            _render_empty_state(
                "Chưa có vé tháng nào được đăng ký",
                "Chuyển sang tab 'Đăng ký vé tháng mới' để cấp vé đầu tiên.",
                icon_name="ticket",
            )

    with tab_register:
        ctypes = _cached_customer_types(service)
        vtypes = _cached_vehicle_types(service)
        active_pass_cards = {
            str(p.get("mathe"))
            for p in passes
            if any(k in str(p.get("trangthai") or "").lower() for k in ("còn", "hiệu lực", "active"))
        }
        cards = [
            c
            for c in _cached_cards(service, True)
            if str(c.get("maso")) not in active_pass_cards
        ]

        if not cards or not ctypes or not vtypes:
            st.warning("Thiếu dữ liệu thẻ xe hoặc danh mục loại khách hàng/phương tiện. Hãy kiểm tra lại DB.")
        else:
            ctype_map = {str(c["tenloai"]): int(c["id"]) for c in ctypes}
            vtype_map = {str(v["tenloai"]): int(v["id"]) for v in vtypes}
            card_map = {str(c["maso"]): int(c["id"]) for c in cards}

            p_c1, p_c2, p_c3 = st.columns(3)
            ctype_label = p_c1.selectbox("Loại khách hàng", list(ctype_map.keys()), key="reg_ctype")
            vtype_label = p_c2.selectbox("Loại phương tiện", list(vtype_map.keys()), key="reg_vtype")
            months = p_c3.number_input("Số tháng", min_value=1, max_value=12, value=1, key="reg_months")

            monthly_unit_price: Optional[int] = None
            for t in tariffs:
                if (
                    "tháng" in str(t.get("loaive") or "").lower()
                    and str(t.get("loaikhachhang") or "") == ctype_label
                    and str(t.get("loaiphuongtien") or "") == vtype_label
                ):
                    monthly_unit_price = int(t["dongia"])
                    break

            if monthly_unit_price is not None:
                est_total = monthly_unit_price * int(months)
                est_end = date.today() + timedelta(days=30 * int(months))
                st.markdown(
                    f"""
                    <div class="preview-strip">
                        <span>Đơn giá: <strong>{html.escape(_format_vnd(monthly_unit_price))}/tháng</strong></span>
                        <span>Thời hạn: <strong>{int(months)} tháng</strong> (đến {est_end.strftime('%d/%m/%Y')})</span>
                        <span>Tổng dự kiến: <strong>{html.escape(_format_vnd(est_total))}</strong></span>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

            with st.form("register_monthly_pass_form"):
                c1, c2, c3 = st.columns(3)
                hoten = c1.text_input("Họ tên khách hàng", max_chars=30)
                sdt = c2.text_input("Số điện thoại", max_chars=20)
                cccd = c3.text_input("Số CCCD", max_chars=15)

                c4, c5 = st.columns(2)
                plate = c4.text_input("Biển số xe", max_chars=8, placeholder="VD: 29A12345")
                card_label = c5.selectbox("Thẻ xe gán cho vé tháng", list(card_map.keys()))

                if st.form_submit_button("Đăng ký vé tháng", type="primary"):
                    try:
                        pass_id = service.register_monthly_pass(
                            hoten=hoten,
                            sdt=sdt,
                            cccd=cccd,
                            customer_type_id=ctype_map[ctype_label],
                            license_plate=plate,
                            vehicle_type_id=vtype_map[vtype_label],
                            card_id=card_map[card_label],
                            months=int(months),
                        )
                        _invalidate_data_cache()
                        _queue_toast(f"Đăng ký vé tháng thành công (Mã vé #{pass_id}).")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))

    with tab_tariffs:
        if tariffs:
            tariff_rows_html: list[list[str]] = []
            for t in tariffs:
                loaive = str(t.get("loaive") or "")
                is_monthly = "tháng" in loaive.lower()
                tariff_rows_html.append(
                    [
                        f'<span class="tbl-id">#{html.escape(str(t.get("id")))}</span>',
                        _tbl_pill(f"Vé {loaive}", "blue" if is_monthly else "slate"),
                        f'<span class="tbl-main">{html.escape(str(t.get("loaiphuongtien") or "—"))}</span>',
                        _tbl_pill(t.get("loaikhachhang") or "Khách vãng lai", "green" if "giảng" in str(t.get("loaikhachhang") or "").lower() else "slate"),
                        f'<span class="tbl-money">{html.escape(_format_vnd(int(t.get("dongia") or 0)))}</span>',
                    ]
                )
            _render_modern_table(
                [
                    ("Mã giá", False),
                    ("Loại vé", False),
                    ("Loại phương tiện", False),
                    ("Đối tượng áp dụng", False),
                    ("Đơn giá niêm yết", True),
                ],
                tariff_rows_html,
                max_height=380,
            )

        with st.expander("Quản trị bảng giá (Thêm / Sửa / Xóa)"):
            vtypes_t = _cached_vehicle_types(service)
            ctypes_t = _cached_customer_types(service)
            vt_map_t = {str(v["tenloai"]): int(v["id"]) for v in vtypes_t}
            ct_map_t: dict[str, Optional[int]] = {"Khách vãng lai (NULL)": None}
            for c in ctypes_t:
                ct_map_t[str(c["tenloai"])] = int(c["id"])

            col_tadd, col_tedit = st.columns(2)
            with col_tadd.form("add_tariff_form"):
                st.caption("Thêm mức giá mới")
                t_type = st.selectbox("Loại vé", ["ngày", "tháng"], key="new_t_type")
                t_vtype = st.selectbox("Loại phương tiện", list(vt_map_t.keys()), key="new_t_vtype")
                t_ctype = st.selectbox("Đối tượng", list(ct_map_t.keys()), key="new_t_ctype")
                t_price = st.number_input("Đơn giá (VNĐ)", min_value=0, step=1000, value=5000, key="new_t_price")
                if st.form_submit_button("Thêm bảng giá", type="primary"):
                    try:
                        service.create_tariff(t_type, int(t_price), vt_map_t[t_vtype], ct_map_t[t_ctype])
                        _invalidate_data_cache()
                        _queue_toast("Đã thêm mức giá mới.")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))

            with col_tedit:
                if tariffs:
                    t_sel_map = {
                        f"#{t['id']} · Vé {t['loaive']} · {t['loaiphuongtien']} ({t.get('loaikhachhang') or 'Vãng lai'})": t
                        for t in tariffs
                    }
                    sel_t_lbl = st.selectbox("Chọn mức giá sửa / xóa", list(t_sel_map.keys()), key="edit_t_sel")
                    sel_t = t_sel_map[sel_t_lbl]
                    with st.form("edit_tariff_form"):
                        upd_price = st.number_input(
                            "Đơn giá mới (VNĐ)",
                            min_value=0,
                            step=1000,
                            value=int(sel_t.get("dongia") or 0),
                            key="upd_t_price",
                        )
                        tb1, tb2 = st.columns(2)
                        if tb1.form_submit_button("Cập nhật đơn giá", type="primary"):
                            try:
                                service.update_tariff(int(sel_t["id"]), int(upd_price))
                                _invalidate_data_cache()
                                _queue_toast(f"Đã cập nhật đơn giá bảng giá #{sel_t['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))
                        if tb2.form_submit_button("Xóa bảng giá"):
                            try:
                                service.delete_tariff(int(sel_t["id"]))
                                _invalidate_data_cache()
                                _queue_toast(f"Đã xóa bảng giá #{sel_t['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))


def _render_people_and_visitors_page(service: ParkingService) -> None:
    _render_page_header(
        "users",
        "Nhân sự, Giảng viên / Sinh viên & Khách vãng lai",
        "Quản lý nhân sự vận hành, danh sách giảng viên - sinh viên đăng ký vé và theo dõi lượt khách vãng lai.",
    )

    skeleton = _show_skeleton("dashboard")
    employees = _cached_employees_detail(service)
    customers = _cached_customers_detail(service)
    walkins = _cached_walkin_visitors(service, 250)
    skeleton.empty()

    gv_count = sum(1 for c in customers if "giảng" in str(c.get("loaikhachhang") or "").lower())
    sv_count = sum(1 for c in customers if "sinh" in str(c.get("loaikhachhang") or "").lower())
    active_walkin_count = sum(1 for w in walkins if w.get("trang_thai") == "Đang gửi")

    st.markdown(
        f"""
<div class="kpi-grid">
<div class="kpi-card">
<div class="kpi-top"><span class="kpi-label">Nhân sự vận hành</span><span class="kpi-icon kpi-icon--blue">{svg_icon("users", 17, 1.9)}</span></div>
<div class="kpi-value">{len(employees)}</div>
<span class="kpi-chip kpi-chip--blue">Đội ngũ bãi xe PTIT</span>
</div>
<div class="kpi-card">
<div class="kpi-top"><span class="kpi-label">Giảng viên</span><span class="kpi-icon kpi-icon--indigo">{svg_icon("ticket", 17, 1.9)}</span></div>
<div class="kpi-value">{gv_count}</div>
<span class="kpi-chip kpi-chip--slate">Khách hàng đăng ký</span>
</div>
<div class="kpi-card">
<div class="kpi-top"><span class="kpi-label">Sinh viên / Học sinh</span><span class="kpi-icon kpi-icon--green">{svg_icon("users", 17, 1.9)}</span></div>
<div class="kpi-value">{sv_count}</div>
<span class="kpi-chip kpi-chip--green">Khách hàng đăng ký</span>
</div>
<div class="kpi-card">
<div class="kpi-top"><span class="kpi-label">Lượt khách lạ (Vãng lai)</span><span class="kpi-icon kpi-icon--amber">{svg_icon("car", 17, 1.9)}</span></div>
<div class="kpi-value">{len(walkins)}</div>
<span class="kpi-chip kpi-chip--amber">{active_walkin_count} xe đang gửi</span>
</div>
</div>
        """,
        unsafe_allow_html=True,
    )

    tab_staff, tab_campus, tab_walkin, tab_cards, tab_vehicles = st.tabs(
        [
            "Nhân sự vận hành",
            "Giảng viên & Sinh viên",
            "Khách lạ (Khách vãng lai)",
            "Kho thẻ xe",
            "Danh bạ phương tiện",
        ]
    )

    with tab_staff:
        if employees:
            lot_names = ["Tất cả bãi"] + sorted(
                {str(e.get("tenbaido") or "Toàn hệ thống") for e in employees}
            )
            s_col1, s_col2 = st.columns([2, 3])
            selected_lot = s_col1.selectbox("Lọc theo bãi phụ trách", lot_names, key="staff_lot_filter")
            staff_kw = s_col2.text_input(
                "Tìm nhân viên (tên / chức vụ / SĐT / email)",
                placeholder="VD: Nguyễn hoặc Bảo vệ...",
                key="staff_search_kw",
            ).strip().lower()

            emp_df = pd.DataFrame(employees)
            if selected_lot != "Tất cả bãi":
                emp_df = emp_df[emp_df["tenbaido"].astype(str) == selected_lot]
            if staff_kw:
                mask = (
                    emp_df["hoten"].astype(str).str.lower().str.contains(staff_kw, na=False, regex=False)
                    | emp_df["chucvu"].astype(str).str.lower().str.contains(staff_kw, na=False, regex=False)
                    | emp_df["sdt"].astype(str).str.lower().str.contains(staff_kw, na=False, regex=False)
                    | emp_df["cccd"].astype(str).str.lower().str.contains(staff_kw, na=False, regex=False)
                    | emp_df["email"].astype(str).str.lower().str.contains(staff_kw, na=False, regex=False)
                )
                emp_df = emp_df[mask]

            if emp_df.empty:
                _render_empty_state(
                    "Không có nhân viên khớp bộ lọc",
                    "Thử chọn 'Tất cả bãi' hoặc xóa từ khóa tìm kiếm.",
                    icon_name="users",
                )
            else:
                emp_rows_html: list[list[str]] = []
                for _, row in emp_df.iterrows():
                    chucvu = str(row.get("chucvu") or "—")
                    is_mgr = "quản lý" in chucvu.lower()
                    emp_rows_html.append(
                        [
                            f'<span class="tbl-id">#{html.escape(str(row.get("id")))}</span>',
                            _tbl_stack(row.get("hoten"), row.get("email") or "—"),
                            _tbl_pill(chucvu, "blue" if is_mgr else "slate"),
                            html.escape(str(row.get("tenbaido") or "Toàn hệ thống")),
                            _tbl_stack(row.get("sdt") or "—", f"CCCD: {row.get('cccd') or '—'}"),
                            html.escape(str(row.get("diachi") or "—")),
                            _tbl_stack(_tbl_fmt_d(row.get("ngaybatdau")), f"Sinh: {_tbl_fmt_d(row.get('ngaysinh'))}"),
                        ]
                    )

                emp_df = emp_df.rename(
                    columns={
                        "id": "Mã NV",
                        "hoten": "Họ và tên",
                        "chucvu": "Chức vụ",
                        "tenbaido": "Bãi phụ trách",
                        "sdt": "Số điện thoại",
                        "cccd": "CCCD",
                        "email": "Email",
                        "diachi": "Địa chỉ",
                        "ngaysinh": "Ngày sinh",
                        "ngaybatdau": "Ngày vào làm",
                    }
                )
                st.caption(f"Hiển thị {len(emp_df)} nhân viên")
                _render_modern_table(
                    [
                        ("Mã NV", False),
                        ("Họ tên & Email", False),
                        ("Chức vụ", False),
                        ("Bãi phụ trách", False),
                        ("Liên hệ & CCCD", False),
                        ("Địa chỉ", False),
                        ("Công tác & Ngày sinh", False),
                    ],
                    emp_rows_html,
                    max_height=400,
                )
                st.download_button(
                    label="Tải xuống danh sách nhân sự (CSV)",
                    data=emp_df.to_csv(index=False).encode("utf-8-sig"),
                    file_name=f"nhan_su_bai_xe_{date.today()}.csv",
                    mime="text/csv",
                    key="dl_employees_csv",
                )
        else:
            _render_empty_state("Chưa có dữ liệu nhân viên", "Sử dụng biểu mẫu bên dưới để thêm nhân viên mới.", icon_name="users")

        with st.expander("Thêm / Sửa / Xóa nhân viên"):
            lots_emp = _cached_parking_lots(service)
            lot_opt_emp: dict[str, Optional[int]] = {"Toàn hệ thống": None}
            for l in lots_emp:
                lot_opt_emp[f"{l['tenbaido']} (#{l['id']})"] = int(l["id"])
            c_eadd, c_eedit = st.columns(2)
            with c_eadd.form("add_emp_form"):
                st.caption("Thêm nhân viên mới")
                e_name = st.text_input("Họ tên", max_chars=30, key="new_e_name")
                e_role = st.selectbox("Chức vụ", ["Bảo vệ", "Thu ngân", "Quản lý"], key="new_e_role")
                e_lot = st.selectbox("Bãi phụ trách", list(lot_opt_emp.keys()), key="new_e_lot")
                e_phone = st.text_input("Số điện thoại", max_chars=10, key="new_e_phone")
                e_cccd = st.text_input("CCCD", max_chars=15, key="new_e_cccd")
                e_email = st.text_input("Email", max_chars=30, key="new_e_email")
                e_addr = st.text_input("Địa chỉ", max_chars=50, key="new_e_addr")
                e_dob = st.date_input("Ngày sinh", value=date(1995, 1, 1), key="new_e_dob")
                e_start = st.date_input("Ngày bắt đầu", value=date.today(), key="new_e_start")
                if st.form_submit_button("Thêm nhân viên", type="primary"):
                    try:
                        eid = service.create_employee(
                            lot_id=lot_opt_emp[e_lot],
                            full_name=e_name,
                            address=e_addr,
                            birth_date=e_dob,
                            role=e_role,
                            phone=e_phone,
                            start_date=e_start,
                            email=e_email,
                            cccd=e_cccd,
                        )
                        _invalidate_data_cache()
                        _queue_toast(f"Đã thêm nhân viên #{eid} ({e_name.strip()}).")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))

            with c_eedit:
                if employees:
                    e_sel_map = {f"#{e['id']} · {e['hoten']} ({e['chucvu']})": e for e in employees}
                    sel_e_lbl = st.selectbox("Chọn nhân viên sửa / xóa", list(e_sel_map.keys()), key="edit_e_sel")
                    sel_e = e_sel_map[sel_e_lbl]
                    with st.form("edit_emp_form"):
                        ue_name = st.text_input("Họ tên", value=str(sel_e["hoten"] or ""), max_chars=30, key="upd_e_name")
                        roles_e = ["Bảo vệ", "Thu ngân", "Quản lý"]
                        cur_r = str(sel_e.get("chucvu") or "Bảo vệ")
                        ue_role = st.selectbox("Chức vụ", roles_e, index=roles_e.index(cur_r) if cur_r in roles_e else 0, key="upd_e_role")
                        lot_keys_e = list(lot_opt_emp.keys())
                        cur_el_idx = next((i for i, k in enumerate(lot_keys_e) if lot_opt_emp[k] == sel_e.get("idbdx")), 0)
                        ue_lot = st.selectbox("Bãi phụ trách", lot_keys_e, index=cur_el_idx, key="upd_e_lot")
                        ue_phone = st.text_input("Số điện thoại", value=str(sel_e.get("sdt") or ""), max_chars=10, key="upd_e_phone")
                        ue_cccd = st.text_input("CCCD", value=str(sel_e.get("cccd") or ""), max_chars=15, key="upd_e_cccd")
                        ue_email = st.text_input("Email", value=str(sel_e.get("email") or ""), max_chars=30, key="upd_e_email")
                        ue_addr = st.text_input("Địa chỉ", value=str(sel_e.get("diachi") or ""), max_chars=50, key="upd_e_addr")
                        eb1, eb2 = st.columns(2)
                        if eb1.form_submit_button("Cập nhật NV", type="primary"):
                            try:
                                service.update_employee(
                                    emp_id=int(sel_e["id"]),
                                    lot_id=lot_opt_emp[ue_lot],
                                    full_name=ue_name,
                                    address=ue_addr,
                                    role=ue_role,
                                    phone=ue_phone,
                                    email=ue_email,
                                    cccd=ue_cccd,
                                )
                                _invalidate_data_cache()
                                _queue_toast(f"Đã cập nhật nhân viên #{sel_e['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))
                        if eb2.form_submit_button("Xóa nhân viên"):
                            try:
                                service.delete_employee(int(sel_e["id"]))
                                _invalidate_data_cache()
                                _queue_toast(f"Đã xóa nhân viên #{sel_e['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))

    with tab_campus:
        if customers:
            c_col1, c_col2 = st.columns([2.7, 2.3])
            role_filter = c_col1.segmented_control(
                "Đối tượng",
                ["Tất cả", "Giảng viên", "Sinh viên"],
                default="Tất cả",
                key="campus_role_filter",
            ) or "Tất cả"
            cus_kw = c_col2.text_input(
                "Tìm theo tên / SĐT / CCCD / biển số",
                placeholder="VD: 29A hoặc Nguyễn...",
                key="people_cus_search",
            ).strip().lower()

            cus_df = pd.DataFrame(customers)
            if role_filter == "Giảng viên":
                cus_df = cus_df[cus_df["loaikhachhang"].astype(str).str.lower().str.contains("giảng", na=False, regex=False)]
            elif role_filter == "Sinh viên":
                cus_df = cus_df[cus_df["loaikhachhang"].astype(str).str.lower().str.contains("sinh", na=False, regex=False)]

            if cus_kw:
                mask = (
                    cus_df["hoten"].astype(str).str.lower().str.contains(cus_kw, na=False, regex=False)
                    | cus_df["sdt"].astype(str).str.lower().str.contains(cus_kw, na=False, regex=False)
                    | cus_df["cccd"].astype(str).str.lower().str.contains(cus_kw, na=False, regex=False)
                    | cus_df["bien_so_dang_ky"].astype(str).str.lower().str.contains(cus_kw, na=False, regex=False)
                )
                cus_df = cus_df[mask]

            if cus_df.empty:
                _render_empty_state(
                    "Không có giảng viên / sinh viên khớp bộ lọc",
                    "Thử chọn 'Tất cả' hoặc đổi từ khóa tìm kiếm.",
                    icon_name="users",
                )
            else:
                cus_rows_html: list[list[str]] = []
                for _, row in cus_df.iterrows():
                    role_str = str(row.get("loaikhachhang") or "Khác")
                    is_gv = "giảng" in role_str.lower()
                    plates_str = str(row.get("bien_so_dang_ky") or "—")
                    plates_html = (
                        " ".join(_tbl_plate(p.strip()) for p in plates_str.split(",") if p.strip())
                        if plates_str != "—"
                        else "—"
                    )
                    active_v = int(row.get("so_ve_hieu_luc") or 0)
                    total_v = int(row.get("tong_ve_da_dang_ky") or 0)
                    cus_rows_html.append(
                        [
                            f'<span class="tbl-id">#{html.escape(str(row.get("id")))}</span>',
                            _tbl_stack(row.get("hoten"), f"CCCD: {row.get('cccd') or '—'}"),
                            _tbl_pill(role_str, "blue" if is_gv else "green"),
                            html.escape(str(row.get("sdt") or "—")),
                            plates_html,
                            _tbl_pill(f"{active_v} hiệu lực / {total_v} tổng", "green" if active_v > 0 else "slate"),
                        ]
                    )

                cus_df = cus_df.rename(
                    columns={
                        "id": "Mã KH",
                        "hoten": "Họ và tên",
                        "loaikhachhang": "Đối tượng",
                        "sdt": "Số điện thoại",
                        "cccd": "CCCD",
                        "bien_so_dang_ky": "Biển số đăng ký",
                        "so_ve_hieu_luc": "Vé hiệu lực",
                        "tong_ve_da_dang_ky": "Tổng vé đã ĐK",
                    }
                )
                st.caption(f"Hiển thị {len(cus_df)} giảng viên / sinh viên")
                _render_modern_table(
                    [
                        ("Mã KH", False),
                        ("Họ tên & CCCD", False),
                        ("Đối tượng", False),
                        ("Số điện thoại", False),
                        ("Biển số đăng ký", False),
                        ("Số lượng vé tháng", False),
                    ],
                    cus_rows_html,
                    max_height=400,
                )
                st.download_button(
                    label="Tải xuống danh sách giảng viên & sinh viên (CSV)",
                    data=cus_df.to_csv(index=False).encode("utf-8-sig"),
                    file_name=f"giang_vien_sinh_vien_{date.today()}.csv",
                    mime="text/csv",
                    key="dl_customers_csv",
                )

                with st.expander("Sửa / Xóa thông tin khách hàng"):
                    ctypes_c = _cached_customer_types(service)
                    ct_map_c = {str(ct["tenloai"]): int(ct["id"]) for ct in ctypes_c}
                    c_sel_map = {f"#{c['id']} · {c['hoten']} ({c['cccd']})": c for c in customers}
                    sel_c_lbl = st.selectbox("Chọn khách hàng", list(c_sel_map.keys()), key="edit_cus_sel")
                    sel_c = c_sel_map[sel_c_lbl]
                    with st.form("edit_cus_form"):
                        uc_name = st.text_input("Họ tên", value=str(sel_c["hoten"] or ""), max_chars=30, key="upd_c_name")
                        uc_phone = st.text_input("Số điện thoại", value=str(sel_c.get("sdt") or ""), max_chars=20, key="upd_c_phone")
                        uc_cccd = st.text_input("CCCD", value=str(sel_c.get("cccd") or ""), max_chars=15, key="upd_c_cccd")
                        ct_keys_c = list(ct_map_c.keys())
                        cur_ct_idx = next((i for i, k in enumerate(ct_keys_c) if k == str(sel_c.get("loaikhachhang"))), 0)
                        uc_type = st.selectbox("Đối tượng", ct_keys_c, index=cur_ct_idx, key="upd_c_type")
                        cb1, cb2 = st.columns(2)
                        if cb1.form_submit_button("Cập nhật khách hàng", type="primary"):
                            try:
                                service.update_customer(
                                    customer_id=int(sel_c["id"]),
                                    full_name=uc_name,
                                    phone=uc_phone,
                                    cccd=uc_cccd,
                                    customer_type_id=ct_map_c[uc_type],
                                )
                                _invalidate_data_cache()
                                _queue_toast(f"Đã cập nhật khách hàng #{sel_c['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))
                        if cb2.form_submit_button("Xóa khách hàng"):
                            try:
                                service.delete_customer(int(sel_c["id"]))
                                _invalidate_data_cache()
                                _queue_toast(f"Đã xóa khách hàng #{sel_c['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))
        else:
            _render_empty_state("Chưa có dữ liệu giảng viên / sinh viên", "Khách hàng đăng ký vé tháng sẽ hiển thị tại đây.", icon_name="users")

    with tab_walkin:
        if walkins:
            total_walkin_rev = sum(int(w.get("chiphi") or 0) for w in walkins)
            _render_kpi_grid(
                [
                    {
                        "label": "Tổng lượt khách lạ",
                        "value": str(len(walkins)),
                        "chip": "Khách vãng lai",
                        "chip_tone": "blue",
                        "icon": "car",
                        "icon_tone": "blue",
                    },
                    {
                        "label": "Đang gửi tại bãi",
                        "value": str(active_walkin_count),
                        "chip": "Chưa xuất bến",
                        "chip_tone": "amber",
                        "icon": "clock",
                        "icon_tone": "amber",
                    },
                    {
                        "label": "Doanh thu khách lạ",
                        "value": _format_vnd(total_walkin_rev),
                        "chip": "Vé lượt đã thu",
                        "chip_tone": "green",
                        "icon": "wallet",
                        "icon_tone": "green",
                    },
                ],
                cols=3,
            )

            w_col1, w_col2 = st.columns([2, 3])
            walkin_status = w_col1.segmented_control(
                "Trạng thái lượt gửi",
                ["Tất cả", "Đang gửi", "Đã ra bãi"],
                default="Tất cả",
                key="walkin_status_filter",
            ) or "Tất cả"
            walkin_kw = w_col2.text_input(
                "Tìm biển số / mã thẻ / vị trí",
                placeholder="VD: 30A hoặc PTIT...",
                key="walkin_search_kw",
            ).strip().lower()

            w_df = pd.DataFrame(walkins)
            if walkin_status != "Tất cả":
                w_df = w_df[w_df["trang_thai"] == walkin_status]
            if walkin_kw:
                mask = (
                    w_df["bienso"].astype(str).str.lower().str.contains(walkin_kw, na=False, regex=False)
                    | w_df["mathe"].astype(str).str.lower().str.contains(walkin_kw, na=False, regex=False)
                    | w_df["vitri_do"].astype(str).str.lower().str.contains(walkin_kw, na=False, regex=False)
                )
                w_df = w_df[mask]

            if w_df.empty:
                st.info("Không có lượt khách lạ nào khớp bộ lọc.")
            else:
                walkin_rows_html: list[list[str]] = []
                for _, row in w_df.iterrows():
                    is_in = row.get("trang_thai") == "Đang gửi"
                    walkin_rows_html.append(
                        [
                            f'<span class="tbl-id">#{html.escape(str(row.get("id_luotdo")))}</span>',
                            f'{_tbl_plate(row.get("bienso"))}<div class="tbl-sub">{html.escape(str(row.get("loaiphuongtien") or "—"))}</div>',
                            _tbl_pill(f"#{row.get('mathe') or '—'}", "slate"),
                            html.escape(str(row.get("vitri_do") or "—")),
                            _tbl_stack(_tbl_fmt_dt(row.get("giovao")), f"Ra: {_tbl_fmt_dt(row.get('giora'))}"),
                            html.escape(str(row.get("nhanvien") or "—")),
                            _tbl_pill(row.get("trang_thai"), "amber" if is_in else "green"),
                            _tbl_stack(_format_vnd(int(row.get("chiphi") or 0)), row.get("loaithanhtoan") or "—"),
                        ]
                    )

                w_df = w_df.rename(
                    columns={
                        "id_luotdo": "Mã lượt",
                        "bienso": "Biển số",
                        "loaiphuongtien": "Loại xe",
                        "mathe": "Mã thẻ",
                        "vitri_do": "Vị trí đỗ",
                        "giovao": "Giờ vào",
                        "giora": "Giờ ra",
                        "nhanvien": "NV tiếp nhận",
                        "trang_thai": "Trạng thái",
                        "chiphi": "Phí gửi (VNĐ)",
                        "loaithanhtoan": "Thanh toán",
                    }
                )
                st.caption(f"Hiển thị {len(w_df)} lượt khách lạ")
                _render_modern_table(
                    [
                        ("Mã lượt", False),
                        ("Phương tiện", False),
                        ("Thẻ xe", False),
                        ("Vị trí đỗ", False),
                        ("Vào / Ra bãi", False),
                        ("NV tiếp nhận", False),
                        ("Trạng thái", False),
                        ("Phí & Thanh toán", True),
                    ],
                    walkin_rows_html,
                    max_height=400,
                )
                st.download_button(
                    label="Tải xuống danh sách khách lạ (CSV)",
                    data=w_df.to_csv(index=False).encode("utf-8-sig"),
                    file_name=f"khach_vang_lai_{date.today()}.csv",
                    mime="text/csv",
                    key="dl_walkin_csv",
                )
        else:
            _render_empty_state("Chưa có lượt khách lạ nào", "Các lượt gửi xe không dùng vé tháng sẽ xuất hiện tại đây.", icon_name="car")

    with tab_cards:
        cards_detail = _cached_cards_detail(service)
        if not cards_detail:
            _render_empty_state("Chưa có dữ liệu thẻ xe", "Sử dụng biểu mẫu bên dưới để phát hành thẻ xe mới.", icon_name="ticket")
        else:
            free_cards = sum(1 for c in cards_detail if int(c.get("trangthai") if c.get("trangthai") is not None else 0) == 1)
            lost_cards = sum(1 for c in cards_detail if int(c.get("trangthai") if c.get("trangthai") is not None else 0) == 2)
            busy_cards = len(cards_detail) - free_cards - lost_cards
            pass_bound = sum(1 for c in cards_detail if c.get("ma_ve_thang") is not None)
            _render_kpi_grid(
                [
                    {
                        "label": "Tổng số thẻ xe",
                        "value": str(len(cards_detail)),
                        "chip": f"{lost_cards} thẻ mất/hỏng",
                        "chip_tone": "blue",
                        "icon": "ticket",
                        "icon_tone": "blue",
                    },
                    {
                        "label": "Thẻ sẵn sàng",
                        "value": str(free_cards),
                        "chip": "Có thể cấp phát",
                        "chip_tone": "green",
                        "icon": "check",
                        "icon_tone": "green",
                    },
                    {
                        "label": "Thẻ đang sử dụng",
                        "value": str(busy_cards),
                        "chip": f"{pass_bound} thẻ gắn vé tháng",
                        "chip_tone": "amber",
                        "icon": "car",
                        "icon_tone": "amber",
                    },
                ],
                cols=3,
            )

            cf1, cf2 = st.columns([2, 3])
            card_status_f = cf1.segmented_control(
                "Trạng thái thẻ",
                ["Tất cả", "Sẵn sàng", "Đang sử dụng", "Mất / Hỏng"],
                default="Tất cả",
                key="cards_status_filter",
            ) or "Tất cả"
            card_kw = cf2.text_input(
                "Tìm mã thẻ / biển số / chủ vé tháng",
                placeholder="VD: 001 hoặc 29A12345...",
                key="cards_search_kw",
            ).strip().lower()

            filtered_cards = []
            for c in cards_detail:
                st_val = int(c.get("trangthai") if c.get("trangthai") is not None else 0)
                if card_status_f == "Sẵn sàng" and st_val != 1:
                    continue
                if card_status_f == "Đang sử dụng" and st_val != 0:
                    continue
                if card_status_f == "Mất / Hỏng" and st_val != 2:
                    continue
                if card_kw:
                    haystack = " ".join(
                        str(c.get(k) or "")
                        for k in ("maso", "bienso_dang_gui", "bienso_ve_thang", "chu_ve_thang")
                    ).lower()
                    if card_kw not in haystack:
                        continue
                filtered_cards.append(c)

            if not filtered_cards:
                _render_empty_state("Không có thẻ xe khớp bộ lọc", "Thử chọn 'Tất cả' hoặc đổi từ khóa.", icon_name="ticket")
            else:
                card_html = ['<div class="card-grid">']
                for c in filtered_cards:
                    st_val = int(c.get("trangthai") if c.get("trangthai") is not None else 0)
                    is_free = st_val == 1
                    is_lost = st_val == 2
                    cls = "rfid-card--free" if is_free else "rfid-card--busy"
                    badge_cls = "badge--free" if is_free else "badge--busy"
                    badge_lbl = "Sẵn sàng" if is_free else ("Mất / Hỏng" if is_lost else "Đang dùng")
                    if c.get("bienso_dang_gui"):
                        meta = f"Xe {c['bienso_dang_gui']}"
                    elif c.get("bienso_ve_thang"):
                        meta = f"VT #{c['ma_ve_thang']} · {c['bienso_ve_thang']}"
                    else:
                        meta = "Chưa gắn xe"
                    card_html.append(
                        f'<div class="rfid-card {cls}">'
                        f'<div class="rfid-head">'
                        f'<span class="rfid-code">#{html.escape(str(c["maso"]))}</span>'
                        f'<span class="slot-badge {badge_cls}">{badge_lbl}</span>'
                        f'</div>'
                        f'<div class="rfid-meta">{html.escape(meta)}</div>'
                        f'</div>'
                    )
                card_html.append("</div>")
                with st.container(height=280, border=True):
                    st.markdown("".join(card_html), unsafe_allow_html=True)

                cards_table_html: list[list[str]] = []
                for c in filtered_cards:
                    st_val = int(c.get("trangthai") if c.get("trangthai") is not None else 0)
                    loc = (
                        f"{c['tenbaido']} · Khu {c['khuvuc']}-{c['sothutu']}"
                        if c.get("tenbaido")
                        else "—"
                    )
                    plate_cell = _tbl_plate(c["bienso_dang_gui"]) if c.get("bienso_dang_gui") else "—"
                    pass_cell = (
                        _tbl_stack(f"Vé #{c['ma_ve_thang']}", c.get("chu_ve_thang") or "")
                        if c.get("ma_ve_thang")
                        else "—"
                    )
                    pill_lbl = "Sẵn sàng" if st_val == 1 else ("Mất / Hỏng" if st_val == 2 else "Đang sử dụng")
                    pill_tone = "green" if st_val == 1 else ("amber" if st_val == 2 else "red")
                    cards_table_html.append(
                        [
                            f'<span class="tbl-id">#{html.escape(str(c["id"]))}</span>',
                            _tbl_pill(f"#{c['maso']}", "slate"),
                            _tbl_pill(pill_lbl, pill_tone),
                            plate_cell,
                            html.escape(loc),
                            pass_cell,
                        ]
                    )
                _render_modern_table(
                    [
                        ("ID", False),
                        ("Mã thẻ", False),
                        ("Trạng thái", False),
                        ("Xe đang gửi", False),
                        ("Vị trí hiện tại", False),
                        ("Vé tháng gắn thẻ", False),
                    ],
                    cards_table_html,
                    max_height=320,
                )

        with st.expander("Phát hành / Khóa mất-hỏng / Xóa thẻ xe"):
            c_cadd, c_cedit = st.columns(2)
            with c_cadd.form("add_card_form"):
                st.caption("Phát hành thẻ xe mới")
                new_card_code = st.text_input("Mã số thẻ (tối đa 10 ký tự)", max_chars=10, placeholder="VD: 051", key="new_card_code")
                if st.form_submit_button("Thêm thẻ xe", type="primary"):
                    try:
                        cid = service.create_card(new_card_code)
                        _invalidate_data_cache()
                        _queue_toast(f"Đã phát hành thẻ #{cid} (Mã {new_card_code.strip()}).")
                        st.rerun()
                    except (ValidationError, DatabaseError) as exc:
                        st.error(str(exc))

            with c_cedit:
                if cards_detail:
                    card_sel_map = {f"#{c['id']} · Mã {c['maso']}": c for c in cards_detail}
                    sel_card_lbl = st.selectbox("Chọn thẻ xe xử lý", list(card_sel_map.keys()), key="manage_card_sel")
                    sel_card = card_sel_map[sel_card_lbl]
                    cb1, cb2, cb3 = st.columns(3)
                    if cb1.button("Đánh dấu Mất/Hỏng", key="btn_card_lost", width="stretch"):
                        try:
                            service.set_card_status(int(sel_card["id"]), 2)
                            _invalidate_data_cache()
                            _queue_toast(f"Đã khóa thẻ {sel_card['maso']} (Mất / Hỏng).")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))
                    if cb2.button("Mở khóa Sẵn sàng", key="btn_card_ok", width="stretch"):
                        try:
                            service.set_card_status(int(sel_card["id"]), 1)
                            _invalidate_data_cache()
                            _queue_toast(f"Đã mở khóa thẻ {sel_card['maso']}.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))
                    if cb3.button("Xóa thẻ", key="btn_card_del", width="stretch"):
                        try:
                            service.delete_card(int(sel_card["id"]))
                            _invalidate_data_cache()
                            _queue_toast(f"Đã xóa thẻ {sel_card['maso']}.")
                            st.rerun()
                        except (ValidationError, DatabaseError) as exc:
                            st.error(str(exc))

    with tab_vehicles:
        vehicles_detail = _cached_vehicles_detail(service)
        if not vehicles_detail:
            _render_empty_state("Chưa có phương tiện nào", "Phương tiện sẽ được ghi nhận khi xe vào bãi hoặc đăng ký vé tháng.", icon_name="car")
        else:
            vf1, vf2 = st.columns([2, 3])
            vtype_names = ["Tất cả loại xe"] + sorted({str(v["loaiphuongtien"]) for v in vehicles_detail})
            vtype_f = vf1.selectbox("Loại phương tiện", vtype_names, key="vehicles_type_filter")
            veh_kw = vf2.text_input(
                "Tìm biển số / chủ xe",
                placeholder="VD: 29A hoặc Nguyễn...",
                key="vehicles_search_kw",
            ).strip().lower()

            v_df = pd.DataFrame(vehicles_detail)
            if vtype_f != "Tất cả loại xe":
                v_df = v_df[v_df["loaiphuongtien"] == vtype_f]
            if veh_kw:
                mask = (
                    v_df["bienso"].astype(str).str.lower().str.contains(veh_kw, na=False, regex=False)
                    | v_df["chu_xe"].astype(str).str.lower().str.contains(veh_kw, na=False, regex=False)
                )
                v_df = v_df[mask]

            if v_df.empty:
                _render_empty_state("Không có phương tiện khớp bộ lọc", "Thử đổi loại xe hoặc từ khóa tìm kiếm.", icon_name="car")
            else:
                veh_rows_html: list[list[str]] = []
                for _, row in v_df.iterrows():
                    in_lot = int(row.get("dang_trong_bai") or 0) == 1
                    has_pass = int(row.get("co_ve_thang") or 0) == 1
                    veh_rows_html.append(
                        [
                            f'<span class="tbl-id">#{html.escape(str(row.get("id")))}</span>',
                            _tbl_plate(row.get("bienso")),
                            f'<span class="tbl-main">{html.escape(str(row.get("loaiphuongtien") or "—"))}</span>',
                            f'<span class="tbl-main">{int(row.get("tong_luot") or 0)} lượt</span>',
                            html.escape(_tbl_fmt_dt(row.get("lan_gui_gan_nhat"))),
                            _tbl_pill("Đang trong bãi" if in_lot else "Ngoài bãi", "amber" if in_lot else "slate"),
                            _tbl_pill("Có vé tháng" if has_pass else "Vé lượt", "blue" if has_pass else "slate"),
                            html.escape(str(row.get("chu_xe") or "Khách vãng lai")),
                        ]
                    )
                st.caption(f"Hiển thị {len(v_df)} phương tiện đã ghi nhận")
                _render_modern_table(
                    [
                        ("Mã PT", False),
                        ("Biển số", False),
                        ("Loại xe", False),
                        ("Tổng lượt", True),
                        ("Lần gửi gần nhất", False),
                        ("Trạng thái", False),
                        ("Loại vé", False),
                        ("Chủ xe / Đối tượng", False),
                    ],
                    veh_rows_html,
                    max_height=400,
                )

                with st.expander("Sửa / Xóa phương tiện"):
                    vtypes_v = _cached_vehicle_types(service)
                    vt_map_v = {str(vt["tenloai"]): int(vt["id"]) for vt in vtypes_v}
                    v_sel_map = {f"#{v['id']} · {v['bienso']} ({v['loaiphuongtien']})": v for v in vehicles_detail}
                    sel_v_lbl = st.selectbox("Chọn phương tiện", list(v_sel_map.keys()), key="edit_veh_sel")
                    sel_v = v_sel_map[sel_v_lbl]
                    with st.form("edit_veh_form"):
                        uv_plate = st.text_input("Biển số", value=str(sel_v["bienso"] or ""), max_chars=8, key="upd_v_plate")
                        vt_keys_v = list(vt_map_v.keys())
                        cur_vt_v_idx = next((i for i, k in enumerate(vt_keys_v) if k == str(sel_v.get("loaiphuongtien"))), 0)
                        uv_type = st.selectbox("Loại xe", vt_keys_v, index=cur_vt_v_idx, key="upd_v_type")
                        vb1, vb2 = st.columns(2)
                        if vb1.form_submit_button("Cập nhật phương tiện", type="primary"):
                            try:
                                service.update_vehicle(int(sel_v["id"]), uv_plate, vt_map_v[uv_type])
                                _invalidate_data_cache()
                                _queue_toast(f"Đã cập nhật phương tiện #{sel_v['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))
                        if vb2.form_submit_button("Xóa phương tiện"):
                            try:
                                service.delete_vehicle(int(sel_v["id"]))
                                _invalidate_data_cache()
                                _queue_toast(f"Đã xóa phương tiện #{sel_v['id']}.")
                                st.rerun()
                            except (ValidationError, DatabaseError) as exc:
                                st.error(str(exc))


def _render_analytics_page(service: ParkingService) -> None:
    _render_page_header(
        "chart",
        "Thống kê doanh thu & Lưu lượng",
        "Phân tích xu hướng doanh thu theo ngày, doanh thu vé tháng và cơ cấu theo từng loại phương tiện.",
    )

    pass_rev = _cached_monthly_pass_revenue_summary(service)
    _render_kpi_grid(
        [
            {
                "label": "Doanh thu vé tháng (tổng)",
                "value": _format_vnd(pass_rev["total_pass_revenue"]),
                "chip": f"{pass_rev['total_passes']} vé đã phát hành",
                "chip_tone": "blue",
                "icon": "ticket",
                "icon_tone": "blue",
            },
            {
                "label": "Doanh thu vé tháng (tháng này)",
                "value": _format_vnd(pass_rev["this_month_pass_revenue"]),
                "chip": f"{pass_rev['active_passes']} vé đang hiệu lực",
                "chip_tone": "green",
                "icon": "wallet",
                "icon_tone": "green",
            },
        ],
        cols=2,
    )

    days = st.slider("Khoảng thời gian thống kê (ngày gần nhất)", min_value=7, max_value=90, value=30)
    skeleton = _show_skeleton("dashboard")
    daily_rows = _cached_daily_revenue(service, days)
    vtype_rows = _cached_revenue_by_vehicle_type(service)
    lot_rev_rows = _cached_revenue_by_lot(service)
    skeleton.empty()

    if daily_rows:
        df_daily = pd.DataFrame(daily_rows)
        df_daily["ngay_dt"] = pd.to_datetime(df_daily["ngay"])
        df_daily["ngay_label"] = df_daily["ngay_dt"].dt.strftime("%d/%m")
        df_daily["doanh_thu"] = pd.to_numeric(df_daily["doanh_thu"], errors="coerce").fillna(0).astype(int)
        df_daily["so_luot"] = pd.to_numeric(df_daily["so_luot"], errors="coerce").fillna(0).astype(int)

        total_rev = int(df_daily["doanh_thu"].sum())
        total_turns = int(df_daily["so_luot"].sum())
        active_days = max(len(df_daily), 1)
        avg_daily = total_rev // active_days
        avg_per_turn = total_rev // total_turns if total_turns > 0 else 0

        _render_kpi_grid(
            [
                {
                    "label": f"Tổng doanh thu ({days} ngày)",
                    "value": _format_vnd(total_rev),
                    "chip": f"{len(df_daily)} ngày phát sinh",
                    "chip_tone": "green",
                    "icon": "wallet",
                    "icon_tone": "green",
                },
                {
                    "label": "Tổng lượt xe",
                    "value": f"{total_turns:,}".replace(",", "."),
                    "chip": "Lượt thanh toán",
                    "chip_tone": "blue",
                    "icon": "car",
                    "icon_tone": "blue",
                },
                {
                    "label": "TB / ngày phát sinh",
                    "value": _format_vnd(avg_daily),
                    "chip": "Bình quân ngày",
                    "chip_tone": "slate",
                    "icon": "chart",
                    "icon_tone": "indigo",
                },
                {
                    "label": "TB / lượt gửi",
                    "value": _format_vnd(avg_per_turn),
                    "chip": "Đơn giá bình quân",
                    "chip_tone": "amber",
                    "icon": "receipt",
                    "icon_tone": "amber",
                },
            ],
            cols=4,
        )
    else:
        df_daily = pd.DataFrame()

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("Doanh thu theo ngày")
        if not df_daily.empty:
            chart = (
                alt.Chart(df_daily)
                .mark_bar(cornerRadiusTopLeft=5, cornerRadiusTopRight=5, color="#2563EB")
                .encode(
                    x=alt.X(
                        "ngay_label:N",
                        title="Ngày",
                        sort=None,
                        axis=alt.Axis(labelAngle=-35),
                    ),
                    y=alt.Y(
                        "doanh_thu:Q",
                        title="Doanh thu (VNĐ)",
                        axis=alt.Axis(format="~s", gridColor="#E2E8F0"),
                    ),
                    tooltip=[
                        alt.Tooltip("ngay_label:N", title="Ngày"),
                        alt.Tooltip("so_luot:Q", title="Số lượt", format=","),
                        alt.Tooltip("doanh_thu:Q", title="Doanh thu (VNĐ)", format=","),
                    ],
                )
                .properties(height=320)
                .configure_view(strokeWidth=0)
                .configure_axis(labelColor="#475569", titleColor="#334155", labelFontSize=11, titleFontSize=12)
            )
            st.altair_chart(chart, width="stretch")
        else:
            _render_empty_state("Chưa có dữ liệu doanh thu theo ngày", "Hãy chọn khoảng thời gian rộng hơn.", icon_name="chart")

    with c2:
        st.subheader("Doanh thu theo loại phương tiện")
        if vtype_rows:
            df_vt = pd.DataFrame(vtype_rows)
            df_vt["doanh_thu"] = pd.to_numeric(df_vt["doanh_thu"], errors="coerce").fillna(0).astype(int)
            df_vt["so_luot"] = pd.to_numeric(df_vt["so_luot"], errors="coerce").fillna(0).astype(int)
            palette = ["#2563EB", "#10B981", "#0EA5E9", "#6366F1", "#F59E0B"]
            chart_vt = (
                alt.Chart(df_vt)
                .mark_arc(innerRadius=55, outerRadius=110)
                .encode(
                    theta=alt.Theta("doanh_thu:Q", title="Doanh thu"),
                    color=alt.Color(
                        "loaiphuongtien:N",
                        title="Loại xe",
                        scale=alt.Scale(range=palette),
                    ),
                    tooltip=[
                        alt.Tooltip("loaiphuongtien:N", title="Loại xe"),
                        alt.Tooltip("so_luot:Q", title="Số lượt", format=","),
                        alt.Tooltip("doanh_thu:Q", title="Doanh thu (VNĐ)", format=","),
                    ],
                )
                .properties(height=320)
                .configure_view(strokeWidth=0)
                .configure_legend(labelColor="#334155", titleColor="#0F172A", labelFontSize=12)
            )
            st.altair_chart(chart_vt, width="stretch")
        else:
            _render_empty_state("Chưa có dữ liệu phân bổ", "Chưa có giao dịch theo loại phương tiện.", icon_name="chart")

    if not df_daily.empty:
        st.subheader("Lưu lượng lượt xe theo ngày")
        flow_chart = (
            alt.Chart(df_daily)
            .mark_area(
                line={"color": "#10B981", "strokeWidth": 2},
                color=alt.Gradient(
                    gradient="linear",
                    stops=[
                        alt.GradientStop(color="rgba(16, 185, 129, 0.30)", offset=1),
                        alt.GradientStop(color="rgba(16, 185, 129, 0.02)", offset=0),
                    ],
                    x1=1,
                    x2=1,
                    y1=1,
                    y2=0,
                ),
            )
            .encode(
                x=alt.X("ngay_label:N", title="Ngày", sort=None, axis=alt.Axis(labelAngle=-35)),
                y=alt.Y("so_luot:Q", title="Số lượt xe", axis=alt.Axis(gridColor="#E2E8F0")),
                tooltip=[
                    alt.Tooltip("ngay_label:N", title="Ngày"),
                    alt.Tooltip("so_luot:Q", title="Số lượt", format=","),
                ],
            )
            .properties(height=240)
            .configure_view(strokeWidth=0)
            .configure_axis(labelColor="#475569", titleColor="#334155", labelFontSize=11, titleFontSize=12)
        )
        st.altair_chart(flow_chart, width="stretch")

    st.subheader("Doanh thu & Lưu lượng theo bãi đỗ")
    if lot_rev_rows:
        df_lot = pd.DataFrame(lot_rev_rows)
        df_lot["doanh_thu"] = pd.to_numeric(df_lot["doanh_thu"], errors="coerce").fillna(0).astype(int)
        df_lot["so_luot"] = pd.to_numeric(df_lot["so_luot"], errors="coerce").fillna(0).astype(int)
        lot_chart = (
            alt.Chart(df_lot)
            .mark_bar(cornerRadiusTopRight=5, cornerRadiusBottomRight=5, color="#0EA5E9")
            .encode(
                y=alt.Y("tenbaido:N", title="Bãi đỗ", sort="-x"),
                x=alt.X("doanh_thu:Q", title="Doanh thu (VNĐ)", axis=alt.Axis(format="~s", gridColor="#E2E8F0")),
                tooltip=[
                    alt.Tooltip("tenbaido:N", title="Bãi đỗ"),
                    alt.Tooltip("diadiem:N", title="Địa điểm"),
                    alt.Tooltip("so_luot:Q", title="Số lượt", format=","),
                    alt.Tooltip("doanh_thu:Q", title="Doanh thu (VNĐ)", format=","),
                ],
            )
            .properties(height=210)
            .configure_view(strokeWidth=0)
            .configure_axis(labelColor="#475569", titleColor="#334155", labelFontSize=11, titleFontSize=12)
        )
        st.altair_chart(lot_chart, width="stretch")
        lot_rows_html = [
            [
                _tbl_stack(r["tenbaido"], r["diadiem"]),
                _tbl_pill(f"{int(r['so_luot']):,} lượt".replace(",", "."), "blue"),
                f'<span class="tbl-money">{html.escape(_format_vnd(int(r["doanh_thu"])))}</span>',
            ]
            for _, r in df_lot.iterrows()
        ]
        _render_modern_table(
            [
                ("Bãi đỗ & Địa điểm", False),
                ("Số lượt", False),
                ("Doanh thu", True),
            ],
            lot_rows_html,
            max_height=240,
        )
    else:
        _render_empty_state("Chưa có dữ liệu doanh thu theo bãi đỗ", "Các giao dịch thành công sẽ được tổng hợp theo từng bãi.", icon_name="chart")


def main() -> None:
    _flush_toasts()

    with st.sidebar:
        st.markdown(
            f"""
            <div class="brand active">
                {brand_logo_svg(30)}
                <div>
                    <div class="brand-title">Smart Parking</div>
                    <div class="brand-sub">Hệ thống quản lý bãi đỗ xe PTIT</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    try:
        db = _create_db_service()
        ok, status_msg = _check_db_health(db)
        if not ok:
            with st.sidebar:
                st.markdown(
                    f'<div class="status-pill status-pill--err">{svg_icon("alert", 15, 2.0)}<span>Mất kết nối TiDB</span></div>',
                    unsafe_allow_html=True,
                )
            st.error(f"Lỗi kết nối TiDB Cloud: {status_msg}")
            return
    except DatabaseError as exc:
        st.error(str(exc))
        return

    base_service = ParkingService(db)
    service: Any = base_service if _LEGACY_WRITES_ENABLED else _ReadOnlyParkingServiceProxy(base_service)

    with st.sidebar:
        st.markdown(
            f'<div class="status-pill status-pill--ok">{svg_icon("check", 15, 2.0)}<span>Đã kết nối TiDB (dbptit)</span></div>',
            unsafe_allow_html=True,
        )
        if not _LEGACY_WRITES_ENABLED:
            st.info(
                "Chế độ chỉ đọc (Legacy Demo). Mọi thao tác ghi cần thực hiện trên giao diện React + FastAPI v2.1.",
                icon="🔒",
            )
        page = st.radio(
            "Điều hướng",
            list(NAV_ITEMS),
        )
        st.divider()
        st.caption("Quản trị dữ liệu")
        if st.button("Làm mới dữ liệu", icon=":material/refresh:", width="stretch"):
            _invalidate_data_cache()
            st.rerun()

    try:
        if page == NAV_ITEMS[0]:
            _render_overview_page(service)
        elif page == NAV_ITEMS[1]:
            _render_checkin_checkout_page(service)
        elif page == NAV_ITEMS[2]:
            _render_transactions_page(service)
        elif page == NAV_ITEMS[3]:
            _render_passes_and_tariffs_page(service)
        elif page == NAV_ITEMS[4]:
            _render_analytics_page(service)
        elif page == NAV_ITEMS[5]:
            _render_people_and_visitors_page(service)
    except DatabaseError as exc:
        st.error(f"Lỗi thao tác cơ sở dữ liệu: {exc}")


if __name__ == "__main__":
    main()
