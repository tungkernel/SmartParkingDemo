import {
  BarChart3,
  CarFront,
  CreditCard,
  LayoutDashboard,
  ReceiptText,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavGroupKey = 'ops' | 'finance' | 'system';

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  group: NavGroupKey;
}

export const NAV_GROUP_LABELS: Record<NavGroupKey, string> = {
  ops: 'Vận hành bãi xe',
  finance: 'Dịch vụ & Tài chính',
  system: 'Quản trị danh mục',
};

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/gate',
    label: 'Cổng Vào / Ra (POS)',
    shortLabel: 'Cổng POS',
    title: 'Quầy Vào / Ra (POS)',
    subtitle: 'Check-in nhanh, tính phí tự động, VietQR & in nhiệt 80mm',
    icon: CarFront,
    group: 'ops',
  },
  {
    to: '/overview',
    label: 'Tổng quan & Sơ đồ',
    shortLabel: 'Sơ đồ bãi',
    title: 'Tổng quan & Sơ đồ Bãi xe',
    subtitle: 'Giám sát công suất theo bãi, sơ đồ khu vực thời gian thực',
    icon: LayoutDashboard,
    group: 'ops',
  },
  {
    to: '/passes',
    label: 'Vé tháng & Bảng giá',
    shortLabel: 'Vé tháng',
    title: 'Quản lý Vé tháng & Bảng giá',
    subtitle: 'Đăng ký mới, gia hạn định kỳ và ma trận giá dịch vụ',
    icon: CreditCard,
    group: 'finance',
  },
  {
    to: '/transactions',
    label: 'Lịch sử Giao dịch',
    shortLabel: 'Giao dịch',
    title: 'Lịch sử Hóa đơn & Giao dịch',
    subtitle: 'Tra cứu hóa đơn thanh toán, lọc theo ngày/thu ngân và xuất CSV',
    icon: ReceiptText,
    group: 'finance',
  },
  {
    to: '/analytics',
    label: 'Phân tích Doanh thu',
    shortLabel: 'Phân tích',
    title: 'Phân tích Doanh thu',
    subtitle: 'Xu hướng doanh thu, lưu lượng ngày và cơ cấu theo bãi đỗ',
    icon: BarChart3,
    group: 'finance',
  },
  {
    to: '/admin',
    label: 'Quản trị Danh mục',
    shortLabel: 'Quản trị',
    title: 'Quản trị Danh mục & Hạ tầng',
    subtitle: 'Quản lý nhân sự, khách hàng, phương tiện, kho thẻ RFID và hạ tầng bãi xe',
    icon: Shield,
    group: 'system',
  },
];
