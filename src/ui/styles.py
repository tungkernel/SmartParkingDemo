from __future__ import annotations

DESIGN_SYSTEM_CSS = """
<style>
/* Layout & Chrome */
.block-container {
    padding-top: 1.5rem;
    padding-bottom: 2.5rem;
    max-width: 1400px;
}

/* Custom Thin Scrollbars */
* {
    scrollbar-width: thin;
    scrollbar-color: #CBD5E1 transparent;
}
*::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
*::-webkit-scrollbar-track {
    background: transparent;
}
*::-webkit-scrollbar-thumb {
    background: #CBD5E1;
    border-radius: 999px;
}
*::-webkit-scrollbar-thumb:hover {
    background: #94A3B8;
}

/* Brand Header */
.brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0 8px 0;
}
.brand.active .brand-logo {
    image-rendering: crisp-edges;
    flex-shrink: 0;
}
.brand-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #0F172A;
    line-height: 1.2;
}
.brand-sub {
    font-size: 0.78rem;
    color: #64748B;
    margin-top: 2px;
}

/* Section / Page Header */
.page-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 0.75rem;
    color: #0F172A;
}
.page-heading svg {
    color: #2563EB;
    flex-shrink: 0;
}
.page-heading h1 {
    font-size: 1.65rem;
    font-weight: 700;
    margin: 0;
    line-height: 1.25;
}
.page-sub {
    font-size: 0.9rem;
    color: #475569;
    margin-bottom: 1.15rem;
}

/* Status Pill */
.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 11px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    margin: 4px 0 12px 0;
    border: 1px solid transparent;
}
.status-pill--ok {
    background: #ECFDF5;
    color: #047857;
    border-color: #A7F3D0;
}
.status-pill--err {
    background: #FEF2F2;
    color: #B91C1C;
    border-color: #FECACA;
}

/* Metric Cards (Legacy fallback + Bento KPI Grid) */
div[data-testid="stMetric"] {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 14px 16px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
div[data-testid="stMetric"] label {
    color: #475569;
    font-weight: 600;
    font-size: 0.82rem;
}

.kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 1.1rem;
}
@media (max-width: 1100px) {
    .kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
.kpi-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 15px 16px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    position: relative;
    overflow: hidden;
}
.kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
    border-color: #CBD5E1;
}
.kpi-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}
.kpi-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: #64748B;
}
.kpi-icon {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.kpi-icon--blue { background: #EFF6FF; color: #2563EB; }
.kpi-icon--green { background: #ECFDF5; color: #059669; }
.kpi-icon--amber { background: #FFFBEB; color: #D97706; }
.kpi-icon--indigo { background: #EEF2FF; color: #4F46E5; }
.kpi-icon--slate { background: #F1F5F9; color: #334155; }
.kpi-value {
    font-size: 1.65rem;
    font-weight: 700;
    color: #0F172A;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    margin-bottom: 8px;
}
.kpi-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
}
.kpi-chip--green { background: #ECFDF5; color: #047857; }
.kpi-chip--blue { background: #EFF6FF; color: #1D4ED8; }
.kpi-chip--amber { background: #FFFBEB; color: #B45309; }
.kpi-chip--slate { background: #F1F5F9; color: #475569; }

/* Lot Summary Cards */
.lot-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 1.25rem;
}
@media (max-width: 960px) {
    .lot-grid {
        grid-template-columns: 1fr;
    }
}
.lot-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 15px 17px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
.lot-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}
.lot-name {
    font-size: 0.98rem;
    font-weight: 700;
    color: #0F172A;
}
.lot-loc {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78rem;
    color: #64748B;
    margin-top: 2px;
}
.lot-ratio {
    font-size: 0.82rem;
    font-weight: 700;
    color: #0F172A;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
}
.lot-bar-bg {
    width: 100%;
    height: 7px;
    background: #F1F5F9;
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 8px;
}
.lot-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
}
.lot-stats {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    color: #475569;
}

/* Scrollable Container Polish */
div[data-testid="stVerticalBlockBorderWrapper"] {
    background: #FFFFFF;
    border-color: #E2E8F0;
    border-radius: 14px;
}

/* Slot Legend */
.slot-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin: 4px 0 8px 0;
}
.slot-legend {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    font-size: 0.8rem;
    color: #475569;
}
.legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    display: inline-block;
}
.legend-dot--free { background: #10B981; }
.legend-dot--busy { background: #EF4444; }

/* Parking Slot Cards */
.slot-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
}
@media (max-width: 1200px) {
    .slot-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}
@media (max-width: 768px) {
    .slot-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
.slot-card {
    background: #FFFFFF;
    border-radius: 12px;
    padding: 11px 13px;
    min-height: 94px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid #E2E8F0;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
    overflow: hidden;
}
.slot-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}
.slot-free {
    border: 1px solid #BBF7D0;
    background: linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%);
}
.slot-free:hover {
    border-color: #86EFAC;
}
.slot-busy {
    border: 1px solid #FECACA;
    background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 100%);
}
.slot-busy:hover {
    border-color: #FCA5A5;
}
.slot-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}
.slot-title {
    font-weight: 700;
    font-size: 0.92rem;
    color: #0F172A;
    white-space: nowrap;
}
.slot-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 999px;
    white-space: nowrap;
}
.slot-badge--free {
    background: #DCFCE7;
    color: #15803D;
}
.slot-badge--busy {
    background: #FEE2E2;
    color: #B91C1C;
}
.slot-empty-hint {
    font-size: 0.8rem;
    font-weight: 500;
    color: #059669;
    margin: 4px 0 2px 0;
}
.slot-meta {
    font-size: 0.78rem;
    color: #475569;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Invoice / Summary Card */
.invoice-card {
    background: #FFFFFF;
    border: 1px solid #BFDBFE;
    border-radius: 12px;
    padding: 16px 18px;
    margin: 12px 0;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.06);
}
.invoice-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    font-size: 0.9rem;
    color: #334155;
    border-bottom: 1px dashed #E2E8F0;
}
.invoice-row:last-child {
    border-bottom: none;
    padding-top: 10px;
    font-weight: 700;
    font-size: 1.05rem;
    color: #0F172A;
}

/* Sidebar Navigation Menu */
section[data-testid="stSidebar"] div[data-testid="stRadio"] > label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
}
section[data-testid="stSidebar"] div[data-testid="stRadio"] div[role="radiogroup"] {
    gap: 4px;
}
section[data-testid="stSidebar"] div[data-testid="stRadio"] div[role="radiogroup"] label {
    display: flex;
    align-items: center;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    margin: 0;
}
section[data-testid="stSidebar"] div[data-testid="stRadio"] div[role="radiogroup"] label:hover {
    background: #F1F5F9;
}
section[data-testid="stSidebar"] div[data-testid="stRadio"] div[role="radiogroup"] label > div:first-child {
    display: none;
}
section[data-testid="stSidebar"] div[data-testid="stRadio"] div[role="radiogroup"] label:has(input:checked) {
    background: #EFF6FF;
    border-color: #BFDBFE;
}
section[data-testid="stSidebar"] div[data-testid="stRadio"] div[role="radiogroup"] label:has(input:checked) p {
    color: #1D4ED8;
    font-weight: 600;
}

/* Tabs Polish */
button[data-baseweb="tab"] {
    font-weight: 600;
    font-size: 0.9rem;
    padding-top: 8px;
    padding-bottom: 8px;
}

/* KPI Grid Variants */
.kpi-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.kpi-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.kpi-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1100px) {
    .kpi-grid--3,
    .kpi-grid--4 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

/* Slot Plate & Empty State */
.slot-plate {
    display: inline-block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.84rem;
    font-weight: 700;
    color: #0F172A;
    background: #FFFFFF;
    border: 1px solid #FECACA;
    border-radius: 6px;
    padding: 2px 8px;
    margin-bottom: 5px;
    letter-spacing: 0.02em;
}
.empty-state {
    background: #F8FAFC;
    border: 1px dashed #CBD5E1;
    border-radius: 14px;
    padding: 26px 20px;
    text-align: center;
    color: #475569;
    margin: 10px 0 14px 0;
}
.empty-state-icon {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: #EFF6FF;
    color: #2563EB;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
}
.empty-state-title {
    font-size: 0.96rem;
    font-weight: 700;
    color: #0F172A;
    margin-bottom: 4px;
}
.empty-state-desc {
    font-size: 0.84rem;
    color: #64748B;
}

/* Preview Strip */
.preview-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #EFF6FF;
    border: 1px solid #BFDBFE;
    border-radius: 12px;
    padding: 12px 16px;
    margin: 8px 0 12px 0;
    font-size: 0.86rem;
    color: #1E3A8A;
}
.preview-strip strong {
    color: #0F172A;
}

/* Shimmer Skeleton Loader */
@keyframes ptit-shimmer {
    0% { background-position: -400px 0; }
    100% { background-position: 400px 0; }
}
.skeleton-pulse {
    background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
    background-size: 800px 100%;
    animation: ptit-shimmer 1.25s infinite linear;
    border-radius: 8px;
}
.skeleton-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
}
.skeleton-kpi-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 16px;
}
.skeleton-line {
    height: 12px;
    margin-bottom: 10px;
}
.skeleton-line--lg {
    height: 26px;
    width: 55%;
    margin-bottom: 10px;
}
.skeleton-line--sm {
    height: 10px;
    width: 72%;
    margin-bottom: 0;
}
.skeleton-panel {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 16px;
    margin-bottom: 12px;
}
.skeleton-row {
    height: 16px;
    margin-bottom: 12px;
}
.skeleton-row:last-child {
    margin-bottom: 0;
    width: 82%;
}
@media (max-width: 900px) {
    .skeleton-kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
/* Lot status fill variants */
.lot-bar-fill--warn {
    background: linear-gradient(90deg, #D97706, #F59E0B);
}
.lot-bar-fill--full {
    background: linear-gradient(90deg, #DC2626, #EF4444);
}
.lot-stats strong {
    color: #0F172A;
}
/* RFID parking card grid */
.card-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
    padding: 4px 2px;
}
.rfid-card {
    border-radius: 12px;
    padding: 10px 11px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 74px;
    box-sizing: border-box;
}
.rfid-card--free {
    background: #F0FDF4;
    border: 1px solid #BBF7D0;
}
.rfid-card--busy {
    background: #FEF2F2;
    border: 1px solid #FECACA;
}
.rfid-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
}
.rfid-code {
    font-size: 0.86rem;
    font-weight: 700;
    color: #0F172A;
}
.rfid-meta {
    font-size: 0.74rem;
    color: #475569;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
@media (max-width: 1100px) {
    .card-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}
@media (max-width: 700px) {
    .card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
/* Modern data tables */
.modern-table-wrap {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    margin: 6px 0 12px 0;
}
.modern-table-scroll {
    overflow-x: auto;
    overflow-y: auto;
}
.modern-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.81rem;
    color: #1E293B;
    font-variant-numeric: tabular-nums;
}
.modern-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #F8FAFC;
    color: #64748B;
    font-size: 0.71rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    text-align: left;
    padding: 10px 10px;
    border-bottom: 1px solid #E2E8F0;
    white-space: nowrap;
}
.modern-table tbody td {
    padding: 9px 10px;
    border-bottom: 1px solid #F1F5F9;
    vertical-align: middle;
    line-height: 1.35;
}
.modern-table tbody tr:last-child td {
    border-bottom: none;
}
.modern-table tbody tr:hover td {
    background: #F8FAFC;
}
.modern-table th.num,
.modern-table td.num {
    text-align: right;
}
.tbl-id {
    font-weight: 700;
    color: #475569;
    font-size: 0.8rem;
}
.tbl-plate {
    display: inline-block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 700;
    font-size: 0.82rem;
    color: #0F172A;
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    border-radius: 7px;
    padding: 2px 8px;
    letter-spacing: 0.02em;
    white-space: nowrap;
}
.tbl-main {
    font-weight: 600;
    color: #0F172A;
}
.tbl-sub {
    font-size: 0.75rem;
    color: #64748B;
    margin-top: 2px;
}
.tbl-money {
    font-weight: 700;
    color: #0F172A;
    white-space: nowrap;
}
.tbl-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
    white-space: nowrap;
}
.tbl-pill--green {
    background: #ECFDF5;
    color: #047857;
    border: 1px solid #A7F3D0;
}
.tbl-pill--blue {
    background: #EFF6FF;
    color: #1D4ED8;
    border: 1px solid #BFDBFE;
}
.tbl-pill--amber {
    background: #FFFBEB;
    color: #B45309;
    border: 1px solid #FDE68A;
}
.tbl-pill--red {
    background: #FEF2F2;
    color: #B91C1C;
    border: 1px solid #FECACA;
}
.tbl-pill--slate {
    background: #F1F5F9;
    color: #475569;
    border: 1px solid #E2E8F0;
}
.tbl-prog-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 110px;
}
.tbl-prog-track {
    flex: 1;
    height: 7px;
    background: #E2E8F0;
    border-radius: 999px;
    overflow: hidden;
}
.tbl-prog-fill {
    height: 100%;
    border-radius: 999px;
}
</style>
"""
