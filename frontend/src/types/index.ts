export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'OPERATOR';
export type PaymentMethod = 'Tiền mặt' | 'Chuyển khoản';
export type PaymentStatus = 'Thành công' | 'Hoàn tiền' | 'Thất bại';

export interface AuthUser {
  account_id: number;
  employee_id: number;
  username: string;
  full_name: string;
  role: UserRole;
  lot_id: number | null;
  token_version?: number;
  must_change_password?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OverviewMetrics {
  total_slots: number;
  available_slots: number;
  occupied_slots: number;
  active_vehicles: number;
  total_revenue: number;
  today_revenue: number;
  active_monthly_passes: number;
}

export interface ParkingLot {
  id: number;
  tenbaido: string;
  diadiem: string;
  tong_cho: number;
  cho_trong: number;
  dang_do: number;
  bao_tri: number;
}

export interface ZoneSummary {
  id: number;
  idbdx: number;
  tenbaido: string;
  diadiem: string;
  ten: string;
  tong_cho: number;
  cho_trong: number;
  dang_do: number;
  bao_tri: number;
}

export interface OverviewResponse {
  metrics: OverviewMetrics;
  lots: ParkingLot[];
  zones: ZoneSummary[];
}

export interface ParkingSlot {
  id: number;
  idkvd: number;
  sothutu: number;
  trangthai: number; // 1: trống, 0: đang đỗ, 2: bảo trì
  ten_khuvuc: string;
  idbdx: number;
  tenbaido: string;
  bienso: string | null;
  giovao: string | null;
  loaiphuongtien: string | null;
}

export interface ActiveTurn {
  id_luotdo: number;
  bienso: string;
  loaiphuongtien: string;
  vehicle_type_id?: number;
  chu_xe: string;
  idbdx?: number;
  tenbaido: string;
  khuvuc: string;
  vitri: number;
  idvtd?: number;
  mathe: string;
  giovao: string;
  nhanvien: string;
  loaive: string;
  dongia: number;
  is_monthly_pass?: number;
}

export interface FeeQuote {
  turn_id: number;
  license_plate: string;
  vehicle_type: string;
  ticket_type: string;
  checkin_time: string;
  checkout_time: string;
  duration_hours: number;
  amount: number;
  is_monthly_pass: boolean;
  monthly_pass_id: number | null;
  payment_method?: PaymentMethod | null;
}

export interface TransactionRecord {
  ma_gd: number;
  bienso: string | null;
  loaiphuongtien: string | null;
  mathe: string | null;
  tenbaido: string | null;
  vitri: string | null;
  giovao: string | null;
  giora: string | null;
  giothanhtoan: string;
  chiphi: number;
  hinhthuc: string;
  loaithanhtoan: PaymentMethod;
  ma_ve_thang: number | null;
  trangthai: PaymentStatus | string;
  nv_tiep_nhan: string | null;
  nhanvien: string;
}

export interface MonthlyPass {
  id: number;
  hoten: string;
  sdt: string;
  cccd: string;
  loaikhachhang: string;
  bienso: string;
  vehicle_type_id?: number;
  loaiphuongtien: string;
  card_id?: number;
  mathe: string;
  dongia: number;
  ngaybatdau: string;
  ngayketthuc: string;
  status_code?: 'active' | 'expired';
  trangthai: string;
}

export interface PassSummary {
  total_passes: number;
  active_passes: number;
  total_pass_revenue: number;
  this_month_pass_revenue: number;
}

export interface Tariff {
  id: number;
  loaive: 'ngày' | 'tháng' | string;
  dongia: number;
  loaiphuongtien: string;
  loaikhachhang: string;
  idlpt: number;
  idlkh: number | null;
}

export interface ShiftRecord {
  id: number;
  idnv: number;
  idbdx: number | null;
  ten_nhanvien: string;
  tenbaido: string | null;
  started_at: string;
  ended_at: string | null;
  opening_cash: number;
  expected_cash: number;
  actual_cash: number | null;
  transfer_total: number;
  note: string | null;
  status: 'OPEN' | 'CLOSED';
  live_tx_count?: number;
  live_cash_total?: number;
  live_transfer_total?: number;
  live_refund_total?: number;
  live_expected_cash?: number;
}

export interface ShiftCloseResult {
  shift_id: number;
  expected_cash: number;
  actual_cash: number;
  transfer_total: number;
  refund_total: number;
  diff: number;
}

export interface OperationalAlerts {
  overdue_turns: Array<{
    id: number;
    bienso: string;
    ma_the: string;
    tenbaido: string;
    khu_vuc: string;
    sothutu: number;
    giovao: string;
    hours_parked: number;
  }>;
  expiring_passes: Array<{
    id: number;
    ten_khachhang: string;
    sdt: string;
    bienso: string;
    ma_the: string;
    ngayketthuc: string;
    days_left: number;
  }>;
  lost_cards: Array<{
    id: number;
    maso: string;
  }>;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_username: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address?: string | null;
  details_json: string | null;
  created_at: string;
}

export interface AccountRecord {
  id: number;
  idnv: number;
  username: string;
  role: UserRole;
  is_active: number | boolean;
  must_change_password?: number | boolean;
  last_login_at: string | null;
  created_at: string | null;
  ten_nhanvien: string;
  chucvu: string;
  sdt: string | null;
  email: string | null;
  tenbaido: string | null;
}

export interface EmployeeRecord {
  id: number;
  idbdx?: number | null;
  hoten: string;
  chucvu: string;
  tenbaido: string;
  sdt: string | null;
  cccd: string | null;
  email: string | null;
  diachi: string | null;
  ngaysinh: string | null;
  ngaybatdau: string | null;
}

export interface CustomerRecord {
  id: number;
  hoten: string;
  idlkh?: number | null;
  loaikhachhang: string;
  sdt: string | null;
  cccd: string | null;
  bien_so_dang_ky: string;
  so_ve_hieu_luc: number;
  tong_ve_da_dang_ky: number;
}

export interface WalkinRecord {
  id_luotdo: number;
  bienso: string | null;
  loaiphuongtien: string | null;
  mathe: string | null;
  vitri_do: string;
  giovao: string;
  giora: string | null;
  nhanvien: string;
  trang_thai: string;
  chiphi: number;
  loaithanhtoan: string;
}

export interface CardRecord {
  id: number;
  maso: string;
  trangthai: number;
  pass_plate?: string | null;
  pass_vehicle_type_id?: number | null;
}

export interface CardDetailRecord extends CardRecord {
  bienso_dang_gui: string | null;
  tenbaido: string | null;
  khuvuc: string | null;
  sothutu: number | null;
  giovao: string | null;
  ma_ve_thang: number | null;
  chu_ve_thang: string | null;
  bienso_ve_thang: string | null;
}

export interface VehicleRecord {
  id: number;
  bienso: string;
  vehicle_type_id?: number;
  loaiphuongtien: string;
  tong_luot: number;
  lan_gui_gan_nhat: string | null;
  dang_trong_bai: number;
  co_ve_thang: number;
  chu_xe: string;
}

export interface VietQrConfig {
  bank_bin: string;
  account_no: string;
  account_name: string;
}

export interface CatalogsResponse {
  vehicle_types: Array<{ id: number; tenloai: string }>;
  customer_types: Array<{ id: number; tenloai: string }>;
  lots: ParkingLot[];
  employees: Array<{
    id: number;
    hoten: string;
    chucvu: string;
    sdt: string;
    idbdx: number | null;
    tenbaido: string | null;
  }>;
  vietqr: VietQrConfig;
}

export interface AnalyticsSummary {
  daily: Array<{ ngay: string; so_luot: number; doanh_thu: number }>;
  by_vehicle_type: Array<{ loaiphuongtien: string; so_luot: number; doanh_thu: number }>;
  by_lot: Array<{ lot_id?: number; tenbaido: string; diadiem: string; so_luot: number; doanh_thu: number }>;
  pass_summary: PassSummary;
}

export interface WsEventMessage {
  event: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

export interface PrintableDocument {
  kind: 'ticket' | 'receipt';
  id: number | string;
  plate: string;
  vehicleType?: string;
  slotLabel?: string;
  cardCode?: string;
  checkinTime?: string;
  checkoutTime?: string;
  ticketType?: string;
  paymentMethod?: string;
  amount?: number;
  operatorName?: string;
  status?: string;
}
