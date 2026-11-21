import {
  BarChart3,
  CarFront,
  CreditCard,
  LayoutDashboard,
  ReceiptText,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '../../types';

export type NavGroupKey = 'ops' | 'finance' | 'system';

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  group: NavGroupKey;
  roles: UserRole[];
}

export const NAV_GROUP_LABELS: Record<NavGroupKey, string> = {
  ops: 'Vận hành bãi xe',
  finance: 'Dịch vụ & Tài chính',
  system: 'Quản trị hệ thống',
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
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/overview',
    label: 'Tổng quan & Sơ đồ',
    shortLabel: 'Sơ đồ bãi',
    title: 'Tổng quan & Sơ đồ Bãi xe',
    subtitle: 'Giám sát công suất theo bãi, sơ đồ khu vực thời gian thực',
    icon: LayoutDashboard,
    group: 'ops',
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/passes',
    label: 'Vé tháng & Bảng giá',
    shortLabel: 'Vé tháng',
    title: 'Quản lý Vé tháng & Bảng giá',
    subtitle: 'Đăng ký mới, gia hạn định kỳ và ma trận giá dịch vụ',
    icon: CreditCard,
    group: 'finance',
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/transactions',
    label: 'Giao dịch & Ca trực',
    shortLabel: 'Giao dịch',
    title: 'Lịch sử Giao dịch & Ca trực',
    subtitle: 'Tra cứu thanh toán, xuất CSV và đối soát quỹ tiền mặt',
    icon: ReceiptText,
    group: 'finance',
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/analytics',
    label: 'Phân tích Doanh thu',
    shortLabel: 'Phân tích',
    title: 'Phân tích Doanh thu',
    subtitle: 'Xu hướng doanh thu, lưu lượng ngày và cơ cấu theo bãi đỗ',
    icon: BarChart3,
    group: 'finance',
    roles: ['ADMIN', 'ACCOUNTANT'],
  },
  {
    to: '/admin',
    label: 'Quản trị & Kiểm toán',
    shortLabel: 'Quản trị',
    title: 'Quản trị Hệ thống & Kiểm toán',
    subtitle: 'Tài khoản RBAC, danh bạ, kho thẻ RFID, hạ tầng và nhật ký',
    icon: Shield,
    group: 'system',
    roles: ['ADMIN', 'ACCOUNTANT'],
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Quản trị viên',
  ACCOUNTANT: 'Thu ngân / Kế toán',
  OPERATOR: 'Vận hành cổng',
};
