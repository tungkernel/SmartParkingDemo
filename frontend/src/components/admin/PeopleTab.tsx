import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarFront, Edit3, Trash2, UserCheck, UserPlus, Users } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { apiRequest, formatDateTime, formatVnd, getErrorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import type {
  CatalogsResponse,
  CustomerRecord,
  EmployeeRecord,
  VehicleRecord,
  WalkinRecord,
} from '../../types';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LicensePlate } from '../ui/LicensePlate';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { TableSkeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';
import { VehicleIcon } from '../ui/VehicleIcon';

type PeopleSubTab = 'employees' | 'customers' | 'walkins' | 'vehicles';

type DeleteTarget =
  | { kind: 'employee'; id: number; label: string }
  | { kind: 'customer'; id: number; label: string }
  | { kind: 'vehicle'; id: number; label: string };

export function PeopleTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const prefix = useId();

  const [sub, setSub] = useState<PeopleSubTab>('employees');
  const [search, setSearch] = useState('');

  // Employee modal state
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeRecord | null>(null);
  const [empHoten, setEmpHoten] = useState('');
  const [empChucvu, setEmpChucvu] = useState('');
  const [empSdt, setEmpSdt] = useState('');
  const [empCccd, setEmpCccd] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empDiachi, setEmpDiachi] = useState('');
  const [empLotId, setEmpLotId] = useState<number | ''>('');
  const [empBirthDate, setEmpBirthDate] = useState('');
  const [empStartDate, setEmpStartDate] = useState('');

  // Customer edit modal state
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [custHoten, setCustHoten] = useState('');
  const [custSdt, setCustSdt] = useState('');
  const [custCccd, setCustCccd] = useState('');
  const [custTypeId, setCustTypeId] = useState<number | ''>('');

  // Vehicle edit modal state
  const [editingVehicle, setEditingVehicle] = useState<VehicleRecord | null>(null);
  const [vehPlate, setVehPlate] = useState('');
  const [vehTypeId, setVehTypeId] = useState<number | ''>('');

  // Confirm delete state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const catalogsQuery = useQuery<CatalogsResponse>({
    queryKey: ['catalogs'],
    queryFn: ({ signal }) => apiRequest<CatalogsResponse>('/api/v1/catalogs', { signal }),
    staleTime: 60_000,
  });

  const employeesQuery = useQuery<EmployeeRecord[]>({
    queryKey: ['people', 'employees'],
    queryFn: ({ signal }) => apiRequest<EmployeeRecord[]>('/api/v1/people/employees', { signal }),
    enabled: sub === 'employees',
  });

  const customersQuery = useQuery<CustomerRecord[]>({
    queryKey: ['people', 'customers'],
    queryFn: ({ signal }) => apiRequest<CustomerRecord[]>('/api/v1/people/customers', { signal }),
    enabled: sub === 'customers',
  });

  const walkinsQuery = useQuery<WalkinRecord[]>({
    queryKey: ['people', 'walkins'],
    queryFn: ({ signal }) =>
      apiRequest<WalkinRecord[]>('/api/v1/people/walkins?limit=200', { signal }),
    enabled: sub === 'walkins',
  });

  const vehiclesQuery = useQuery<VehicleRecord[]>({
    queryKey: ['vehicles'],
    queryFn: ({ signal }) => apiRequest<VehicleRecord[]>('/api/v1/vehicles', { signal }),
    enabled: sub === 'vehicles',
  });

  const catalogs = catalogsQuery.data;

  const saveEmployeeMutation = useMutation({
    mutationFn: () => {
      const body = {
        hoten: empHoten.trim(),
        chucvu: empChucvu.trim(),
        sdt: empSdt.trim(),
        email: empEmail.trim(),
        diachi: empDiachi.trim(),
        cccd: empCccd.trim(),
        birth_date: empBirthDate || null,
        start_date: empStartDate || null,
        lot_id: empLotId ? Number(empLotId) : null,
      };
      return editingEmp
        ? apiRequest(`/api/v1/people/employees/${editingEmp.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : apiRequest('/api/v1/people/employees', {
            method: 'POST',
            body: JSON.stringify(body),
          });
    },
    onSuccess: () => {
      notify('ok', editingEmp ? 'Đã cập nhật hồ sơ nhân viên.' : 'Đã thêm nhân viên mới.');
      setEmpModalOpen(false);
      setEditingEmp(null);
      void queryClient.invalidateQueries({ queryKey: ['people', 'employees'] });
      void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const updateCustomerMutation = useMutation({
    mutationFn: () => {
      if (!editingCustomer) throw new Error('Thiếu thông tin khách hàng.');
      return apiRequest(`/api/v1/people/customers/${editingCustomer.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          hoten: custHoten.trim(),
          sdt: custSdt.trim(),
          cccd: custCccd.trim(),
          customer_type_id: Number(custTypeId),
        }),
      });
    },
    onSuccess: () => {
      notify('ok', 'Đã cập nhật thông tin khách hàng.');
      setEditingCustomer(null);
      void queryClient.invalidateQueries({ queryKey: ['people', 'customers'] });
      void queryClient.invalidateQueries({ queryKey: ['passes'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const updateVehicleMutation = useMutation({
    mutationFn: () => {
      if (!editingVehicle) throw new Error('Thiếu thông tin phương tiện.');
      return apiRequest(`/api/v1/vehicles/${editingVehicle.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          plate: vehPlate.trim().toUpperCase(),
          vehicle_type_id: Number(vehTypeId),
        }),
      });
    },
    onSuccess: () => {
      notify('ok', 'Đã cập nhật thông tin phương tiện.');
      setEditingVehicle(null);
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['turns'] });
      void queryClient.invalidateQueries({ queryKey: ['passes'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (target: DeleteTarget) => {
      const path =
        target.kind === 'employee'
          ? `/api/v1/people/employees/${target.id}`
          : target.kind === 'customer'
            ? `/api/v1/people/customers/${target.id}`
            : `/api/v1/vehicles/${target.id}`;
      return apiRequest(path, { method: 'DELETE' });
    },
    onSuccess: (_res, target) => {
      notify('ok', `Đã xóa ${target.label}.`);
      setDeleteTarget(null);
      if (target.kind === 'employee') {
        void queryClient.invalidateQueries({ queryKey: ['people', 'employees'] });
        void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
        void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      } else if (target.kind === 'customer') {
        void queryClient.invalidateQueries({ queryKey: ['people', 'customers'] });
        void queryClient.invalidateQueries({ queryKey: ['passes'] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        void queryClient.invalidateQueries({ queryKey: ['turns'] });
        void queryClient.invalidateQueries({ queryKey: ['passes'] });
      }
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const openCreateEmployeeModal = () => {
    setEditingEmp(null);
    setEmpHoten('');
    setEmpChucvu('Bảo vệ');
    setEmpSdt('');
    setEmpCccd('');
    setEmpEmail('');
    setEmpDiachi('');
    setEmpLotId(catalogs?.lots[0]?.id ?? '');
    setEmpBirthDate('');
    setEmpStartDate('');
    setEmpModalOpen(true);
  };

  const openEditEmployeeModal = (e: EmployeeRecord) => {
    setEditingEmp(e);
    setEmpHoten(e.hoten);
    setEmpChucvu(e.chucvu);
    setEmpSdt(e.sdt ?? '');
    setEmpCccd(e.cccd ?? '');
    setEmpEmail(e.email ?? '');
    setEmpDiachi(e.diachi ?? '');
    setEmpLotId(e.idbdx ?? '');
    setEmpBirthDate(e.ngaysinh ? e.ngaysinh.slice(0, 10) : '');
    setEmpStartDate(e.ngaybatdau ? e.ngaybatdau.slice(0, 10) : '');
    setEmpModalOpen(true);
  };

  const openEditCustomerModal = (c: CustomerRecord) => {
    const matchedType =
      c.idlkh ??
      catalogs?.customer_types.find((ct) => ct.tenloai === c.loaikhachhang)?.id ??
      catalogs?.customer_types[0]?.id ??
      '';
    setCustHoten(c.hoten);
    setCustSdt(c.sdt ?? '');
    setCustCccd(c.cccd ?? '');
    setCustTypeId(matchedType);
    setEditingCustomer(c);
  };

  const openEditVehicleModal = (v: VehicleRecord) => {
    const matchedType =
      v.vehicle_type_id ??
      catalogs?.vehicle_types.find((vt) => vt.tenloai === v.loaiphuongtien)?.id ??
      catalogs?.vehicle_types[0]?.id ??
      '';
    setVehPlate(v.bienso);
    setVehTypeId(matchedType);
    setEditingVehicle(v);
  };

  const q = search.trim().toLowerCase();

  const employees = useMemo(
    () =>
      (employeesQuery.data ?? []).filter(
        (e) =>
          !q ||
          e.hoten.toLowerCase().includes(q) ||
          e.chucvu.toLowerCase().includes(q) ||
          e.tenbaido.toLowerCase().includes(q) ||
          (e.sdt?.toLowerCase().includes(q) ?? false),
      ),
    [employeesQuery.data, q],
  );

  const customers = useMemo(
    () =>
      (customersQuery.data ?? []).filter(
        (c) =>
          !q ||
          c.hoten.toLowerCase().includes(q) ||
          c.bien_so_dang_ky.toLowerCase().includes(q) ||
          (c.sdt?.toLowerCase().includes(q) ?? false),
      ),
    [customersQuery.data, q],
  );

  const walkins = useMemo(
    () =>
      (walkinsQuery.data ?? []).filter(
        (w) =>
          !q ||
          (w.bienso?.toLowerCase().includes(q) ?? false) ||
          (w.mathe?.toLowerCase().includes(q) ?? false) ||
          w.vitri_do.toLowerCase().includes(q),
      ),
    [walkinsQuery.data, q],
  );

  const vehicles = useMemo(
    () =>
      (vehiclesQuery.data ?? []).filter(
        (v) =>
          !q ||
          v.bienso.toLowerCase().includes(q) ||
          v.chu_xe.toLowerCase().includes(q) ||
          v.loaiphuongtien.toLowerCase().includes(q),
      ),
    [vehiclesQuery.data, q],
  );

  const activeQuery =
    sub === 'employees'
      ? employeesQuery
      : sub === 'customers'
        ? customersQuery
        : sub === 'walkins'
          ? walkinsQuery
          : vehiclesQuery;

  const currentCount =
    sub === 'employees'
      ? employees.length
      : sub === 'customers'
        ? customers.length
        : sub === 'walkins'
          ? walkins.length
          : vehicles.length;

  const empFormId = `${prefix}-emp-form`;
  const custFormId = `${prefix}-cust-form`;
  const vehFormId = `${prefix}-veh-form`;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Danh bạ đối tượng">
          {(
            [
              ['employees', 'Nhân sự vận hành', employeesQuery.data?.length],
              ['customers', 'Khách vé tháng', customersQuery.data?.length],
              ['walkins', 'Khách vãng lai', walkinsQuery.data?.length],
              ['vehicles', 'Danh bạ phương tiện', vehiclesQuery.data?.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={sub === key}
              onClick={() => {
                setSub(key);
                setSearch('');
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors',
                sub === key
                  ? 'bg-brand-soft'
                  : 'border-slate-200 dark:border-slate-800 bg-surface dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
              )}
            >
              <span>{label}</span>
              {count !== undefined && (
                <span className="font-mono-plate text-[10px] opacity-75">({count})</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <SearchInput
            containerClassName="flex-1 sm:w-64"
            aria-label="Tìm trong danh bạ hiện tại"
            value={search}
            onChange={setSearch}
            placeholder="Lọc nhanh danh bạ..."
          />
          {sub === 'employees' && (
            <Button
              size="md"
              icon={<UserPlus className="h-4 w-4" />}
              onClick={openCreateEmployeeModal}
            >
              Thêm nhân viên
            </Button>
          )}
        </div>
      </div>

      <div className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[320px] max-h-[72vh] lg:max-h-none flex flex-col">
        <div className="flex-1 min-h-0 scroll-pane">
          {activeQuery.isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : activeQuery.isError ? (
            <div className="p-5">
              <ErrorState
                message={getErrorMessage(activeQuery.error)}
                onRetry={() => void activeQuery.refetch()}
              />
            </div>
          ) : currentCount === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="Không có dữ liệu phù hợp"
              description={
                search
                  ? 'Thử xóa từ khóa tìm kiếm để xem toàn bộ danh bạ.'
                  : 'Danh bạ này hiện chưa có bản ghi.'
              }
            />
          ) : (
            <>
              {sub === 'employees' && (
                <table className="w-full text-left text-[13px]">
                  <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Họ tên / Chức vụ</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Bãi phụ trách</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">SĐT / CCCD</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Email / Địa chỉ</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {employees.map((e) => (
                      <tr
                        key={e.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3.5 py-2.5">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {e.hoten}
                          </div>
                          <div className="text-[11px] text-slate-500">{e.chucvu}</div>
                        </td>
                        <td className="px-3.5 py-2.5">{e.tenbaido}</td>
                        <td className="px-3.5 py-2.5 font-mono-plate text-xs whitespace-nowrap">
                          <div>{e.sdt || '—'}</div>
                          <div className="text-[11px] text-slate-500">{e.cccd || '—'}</div>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">
                          <div>{e.email || '—'}</div>
                          <div className="text-[11px] text-slate-500">{e.diachi || '—'}</div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              aria-label={`Sửa nhân viên ${e.hoten}`}
                              onClick={() => openEditEmployeeModal(e)}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-600 transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Xóa nhân viên ${e.hoten}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: 'employee',
                                  id: e.id,
                                  label: `nhân viên ${e.hoten}`,
                                })
                              }
                              className="rounded-lg border border-rose-200 dark:border-rose-900 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {sub === 'customers' && (
                <table className="w-full text-left text-[13px]">
                  <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Họ tên</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Đối tượng</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">SĐT / CCCD</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Biển số đăng ký</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Vé hiệu lực</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-slate-100">
                          {c.hoten}
                        </td>
                        <td className="px-3.5 py-2.5">{c.loaikhachhang}</td>
                        <td className="px-3.5 py-2.5 font-mono-plate text-xs whitespace-nowrap">
                          <div>{c.sdt || '—'}</div>
                          <div className="text-[11px] text-slate-500">{c.cccd || '—'}</div>
                        </td>
                        <td className="px-3.5 py-2.5 font-mono-plate text-xs font-semibold">
                          {c.bien_so_dang_ky}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono-plate font-bold whitespace-nowrap">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {c.so_ve_hieu_luc}
                          </span>{' '}
                          / {c.tong_ve_da_dang_ky}
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              aria-label={`Sửa khách hàng ${c.hoten}`}
                              onClick={() => openEditCustomerModal(c)}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-600 transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Xóa khách hàng ${c.hoten}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: 'customer',
                                  id: c.id,
                                  label: `khách hàng ${c.hoten}`,
                                })
                              }
                              className="rounded-lg border border-rose-200 dark:border-rose-900 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {sub === 'walkins' && (
                <table className="w-full text-left text-[13px]">
                  <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Biển số / Xe</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Vị trí / Thẻ</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Giờ vào</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Trạng thái</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Chi phí</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {walkins.map((w) => (
                      <tr
                        key={w.id_luotdo}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3.5 py-2.5">
                          <LicensePlate plate={w.bienso} size="xs" />
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 capitalize">
                            <VehicleIcon vehicleType={w.loaiphuongtien} className="h-3 w-3" />
                            {w.loaiphuongtien || '—'}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">
                          <div className="font-medium">{w.vitri_do}</div>
                          <div className="text-[11px] text-slate-500 font-mono-plate">
                            Thẻ #{w.mathe}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-xs tabular-nums">
                          {formatDateTime(w.giovao)}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <StatusBadge dot tone={w.trang_thai === 'Đang gửi' ? 'sky' : 'emerald'}>
                            {w.trang_thai}
                          </StatusBadge>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono-plate font-bold whitespace-nowrap">
                          {formatVnd(w.chiphi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {sub === 'vehicles' && (
                <table className="w-full text-left text-[13px]">
                  <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Biển số</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Loại xe</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Chủ xe</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Tổng lượt</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Tình trạng</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {vehicles.map((v) => (
                      <tr
                        key={v.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <LicensePlate plate={v.bienso} size="xs" copyable />
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 capitalize">
                            <VehicleIcon
                              vehicleType={v.loaiphuongtien}
                              className="h-3.5 w-3.5 text-slate-400"
                            />
                            {v.loaiphuongtien}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5">{v.chu_xe}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono-plate font-bold whitespace-nowrap">
                          {v.tong_luot}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <StatusBadge dot tone={v.dang_trong_bai ? 'sky' : 'slate'}>
                            {v.dang_trong_bai ? 'Đang trong bãi' : 'Ngoài bãi'}
                          </StatusBadge>
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              aria-label={`Sửa phương tiện ${v.bienso}`}
                              onClick={() => openEditVehicleModal(v)}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-600 transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Xóa phương tiện ${v.bienso}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: 'vehicle',
                                  id: v.id,
                                  label: `phương tiện ${v.bienso}`,
                                })
                              }
                              className="rounded-lg border border-rose-200 dark:border-rose-900 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create / Edit Employee Modal */}
      <Modal
        open={empModalOpen}
        onClose={() => setEmpModalOpen(false)}
        maxWidthClass="max-w-lg"
        title={editingEmp ? `Cập nhật nhân viên #${editingEmp.id}` : 'Thêm nhân viên mới'}
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <UserPlus className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmpModalOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={empFormId}
              variant="primary"
              loading={saveEmployeeMutation.isPending}
            >
              {editingEmp ? 'Lưu thay đổi' : 'Thêm nhân viên'}
            </Button>
          </>
        }
      >
        <form
          id={empFormId}
          onSubmit={(e) => {
            e.preventDefault();
            saveEmployeeMutation.mutate();
          }}
          className="p-5 space-y-3.5 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${prefix}-emp-hoten`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Họ và tên
              </label>
              <input
                id={`${prefix}-emp-hoten`}
                required
                maxLength={60}
                value={empHoten}
                onChange={(e) => setEmpHoten(e.target.value)}
                placeholder="Nguyễn Văn B"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label
                htmlFor={`${prefix}-emp-chucvu`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Chức vụ
              </label>
              <input
                id={`${prefix}-emp-chucvu`}
                required
                maxLength={30}
                value={empChucvu}
                onChange={(e) => setEmpChucvu(e.target.value)}
                placeholder="Bảo vệ / Thu ngân"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${prefix}-emp-sdt`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Số điện thoại
              </label>
              <input
                id={`${prefix}-emp-sdt`}
                required
                minLength={8}
                maxLength={15}
                value={empSdt}
                onChange={(e) => setEmpSdt(e.target.value)}
                placeholder="0912345678"
                className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label
                htmlFor={`${prefix}-emp-cccd`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Số CCCD
              </label>
              <input
                id={`${prefix}-emp-cccd`}
                maxLength={15}
                value={empCccd}
                onChange={(e) => setEmpCccd(e.target.value)}
                placeholder="001204000123"
                className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${prefix}-emp-lot`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Bãi phụ trách
              </label>
              <select
                id={`${prefix}-emp-lot`}
                value={empLotId}
                onChange={(e) => setEmpLotId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="">Toàn hệ thống</option>
                {(catalogs?.lots ?? []).map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.tenbaido}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`${prefix}-emp-email`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Email
              </label>
              <input
                id={`${prefix}-emp-email`}
                type="email"
                maxLength={100}
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
                placeholder="nhanvien@ptit.edu.vn"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${prefix}-emp-diachi`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Địa chỉ
            </label>
            <input
              id={`${prefix}-emp-diachi`}
              maxLength={255}
              value={empDiachi}
              onChange={(e) => setEmpDiachi(e.target.value)}
              placeholder="Hà Đông, Hà Nội"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm focus:border-brand-500 outline-none"
            />
          </div>

          {!editingEmp && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={`${prefix}-emp-birth`}
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Ngày sinh (tùy chọn)
                </label>
                <input
                  id={`${prefix}-emp-birth`}
                  type="date"
                  value={empBirthDate}
                  onChange={(e) => setEmpBirthDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor={`${prefix}-emp-start`}
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Ngày vào làm (tùy chọn)
                </label>
                <input
                  id={`${prefix}-emp-start`}
                  type="date"
                  value={empStartDate}
                  onChange={(e) => setEmpStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        open={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        maxWidthClass="max-w-md"
        title={editingCustomer ? `Cập nhật khách hàng #${editingCustomer.id}` : ''}
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <UserCheck className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingCustomer(null)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={custFormId}
              variant="primary"
              loading={updateCustomerMutation.isPending}
              disabled={!custTypeId}
            >
              Lưu thay đổi
            </Button>
          </>
        }
      >
        {editingCustomer && (
          <form
            id={custFormId}
            onSubmit={(e) => {
              e.preventDefault();
              if (custTypeId) updateCustomerMutation.mutate();
            }}
            className="p-5 space-y-3.5 text-xs"
          >
            <div>
              <label
                htmlFor={`${prefix}-cust-hoten`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Họ tên khách hàng
              </label>
              <input
                id={`${prefix}-cust-hoten`}
                required
                maxLength={60}
                value={custHoten}
                onChange={(e) => setCustHoten(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={`${prefix}-cust-sdt`}
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Số điện thoại
                </label>
                <input
                  id={`${prefix}-cust-sdt`}
                  required
                  minLength={8}
                  maxLength={20}
                  value={custSdt}
                  onChange={(e) => setCustSdt(e.target.value)}
                  className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor={`${prefix}-cust-cccd`}
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Số CCCD
                </label>
                <input
                  id={`${prefix}-cust-cccd`}
                  required
                  minLength={9}
                  maxLength={15}
                  value={custCccd}
                  onChange={(e) => setCustCccd(e.target.value)}
                  className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor={`${prefix}-cust-type`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Đối tượng khách hàng
              </label>
              <select
                id={`${prefix}-cust-type`}
                required
                value={custTypeId}
                onChange={(e) => setCustTypeId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
              >
                {(catalogs?.customer_types ?? []).map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.tenloai}
                  </option>
                ))}
              </select>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit Vehicle Modal */}
      <Modal
        open={Boolean(editingVehicle)}
        onClose={() => setEditingVehicle(null)}
        maxWidthClass="max-w-sm"
        title={editingVehicle ? `Cập nhật phương tiện #${editingVehicle.id}` : ''}
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <CarFront className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingVehicle(null)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={vehFormId}
              variant="primary"
              loading={updateVehicleMutation.isPending}
              disabled={!vehPlate.trim() || !vehTypeId}
            >
              Lưu thay đổi
            </Button>
          </>
        }
      >
        {editingVehicle && (
          <form
            id={vehFormId}
            onSubmit={(e) => {
              e.preventDefault();
              if (vehTypeId) updateVehicleMutation.mutate();
            }}
            className="p-5 space-y-3.5 text-xs"
          >
            <div>
              <label
                htmlFor={`${prefix}-veh-plate`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Biển số xe
              </label>
              <input
                id={`${prefix}-veh-plate`}
                required
                maxLength={15}
                value={vehPlate}
                onChange={(e) => setVehPlate(e.target.value.toUpperCase())}
                className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm font-bold uppercase"
              />
            </div>
            <div>
              <label
                htmlFor={`${prefix}-veh-type`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Loại phương tiện
              </label>
              <select
                id={`${prefix}-veh-type`}
                required
                value={vehTypeId}
                onChange={(e) => setVehTypeId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2 text-sm"
              >
                {(catalogs?.vehicle_types ?? []).map((vt) => (
                  <option key={vt.id} value={vt.id}>
                    {vt.tenloai}
                  </option>
                ))}
              </select>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xác nhận xóa bản ghi"
        message={
          deleteTarget
            ? `Xác nhận xóa ${deleteTarget.label}? Chỉ xóa được nếu đối tượng chưa phát sinh lượt đỗ, tài khoản hoặc vé tháng liên kết.`
            : ''
        }
        confirmLabel="Xóa bản ghi"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
