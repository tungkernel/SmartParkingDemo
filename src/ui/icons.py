from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_ICON_PATHS: dict[str, str] = {
    "parking": '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
    "dashboard": '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    "car": '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/><path d="M10 17h4"/>',
    "receipt": '<path d="M4 3v18l2-1.5L8 21l2-1.5L12 21l2-1.5L16 21l2-1.5L20 21V3l-2 1.5L16 3l-2 1.5L12 3l-2 1.5L8 3 6 4.5z"/><path d="M8 9h8"/><path d="M8 13h6"/>',
    "ticket": '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 7v10"/>',
    "chart": '<path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-6"/>',
    "check": '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    "alert": '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    "plus": '<path d="M12 5v14"/><path d="M5 12h14"/>',
    "refresh": '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    "database": '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
    "arrow_right": '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    "layers": '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/>',
    "wallet": '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h.01"/><path d="M2 10h20"/><path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>',
    "map_pin": '<path d="M12 21s-6-5.33-6-10a6 6 0 1 1 12 0c0 4.67-6 10-6 10z"/><circle cx="12" cy="11" r="2.5"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "inbox": '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
}


def svg_icon(
    name: str,
    size: int = 18,
    stroke_width: float = 1.9,
    class_name: str = "",
) -> str:
    """Return an inline single-stroke SVG icon string."""
    paths = _ICON_PATHS.get(name, _ICON_PATHS["parking"])
    cls_attr = f' class="{class_name}"' if class_name else ""
    return (
        f'<svg{cls_attr} viewBox="0 0 24 24" width="{size}" height="{size}" '
        f'fill="none" stroke="currentColor" stroke-width="{stroke_width}" '
        f'stroke-linecap="round" stroke-linejoin="round" '
        f'shape-rendering="geometricPrecision" aria-hidden="true">'
        f"{paths}</svg>"
    )


@lru_cache(maxsize=8)
def brand_logo_svg(size: int = 28) -> str:
    """Load and cache assets/logo.svg or fall back to an inline single-stroke brand mark."""
    logo_path = Path(__file__).resolve().parents[2] / "assets" / "logo.svg"
    if logo_path.exists():
        raw = logo_path.read_text(encoding="utf-8").strip()
        return raw.replace(
            "<svg ",
            f'<svg class="brand-logo" width="{size}" height="{size}" ',
            1,
        )
    return svg_icon("parking", size=size, stroke_width=1.9, class_name="brand-logo")
