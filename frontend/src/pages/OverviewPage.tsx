import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CarFront,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Plus,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime, formatVnd, getErrorMessage } from '../lib/api';
import type { AuthUser, OverviewResponse, ParkingSlot } from '../types';

interface OverviewPageProps {
  user: AuthUser;
}

export function OverviewPage({ user }: OverviewPageProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const lotFilterId = useId();
  const zoneFilterId = useId();
  const statusFilterId = useId();
  const addZoneId = useId();
  const addCountId = useId();

  const [lotFilter, setLotFilter] = useState<number | 'all'>('all');
  const [zoneFilter, setZoneFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0' | '2'>('all');
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [addZoneIdVal, setAddZoneIdVal] = useState<number | ''>('');
  const [addCount, setAddCount] = useState(5);

  const overviewQuery = useQuery<OverviewResponse>({
    queryKey: ['overview'],
    queryFn: ({ signal }) => apiRequest<OverviewResponse>('/api/v1/overview', { signal }),
  });

  const slotsParams = useMemo(() => {
    const p = new URLSearchParams();
    if (lotFilter !== 'all') p.set('lot_id', String(lotFilter));
    if (zoneFilter !== 'all') p.set('zone_id', String(zoneFilter));
    if (statusFilter !== 'all') p.set('status_filter', statusFilter);
    return p.toString();
  }, [lotFilter, zoneFilter, statusFilter]);

  const slotsQuery = useQuery<ParkingSlot[]>({
    queryKey: ['slots', 'map', slotsParams],
    queryFn: ({ signal }) =>
      apiRequest<ParkingSlot[]>(`/api/v1/slots${slotsParams ? `?${slotsParams}` : ''}`, { signal }),
  });

  const overview = overviewQuery.data;
  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);
  const selectedSlot = useMemo(
    () => (selectedSlotId ? (slots.find((s) => s.id === selectedSlotId) ?? null) : null),
    [selectedSlotId, slots],
  );

  const zonesForFilter = useMemo(() => {
    const allZones = overview?.zones ?? [];
    if (lotFilter === 'all') return allZones;
    return allZones.filter((z) => z.idbdx === lotFilter);
  }, [overview, lotFilter]);

  const effectiveAddZoneId = addZoneIdVal || overview?.zones[0]?.id || '';

  const maintenanceMutation = useMutation({
    mutationFn: ({ slotId, maintenance }: { slotId: number; maintenance: boolean }) =>
      apiRequest(`/api/v1/slots/${slotId}/maintenance`, {
        method: 'PATCH',
        body: JSON.stringify({ maintenance }),
      }),
    onSuccess: (_data, vars) => {
      notify('ok', vars.maintenance ? 'Đã khóa bảo trì vị trí đỗ.' : 'Đã mở lại vị trí đỗ.');
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const addSlotsMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ created: number }>('/api/v1/slots', {
        method: 'POST',
        body: JSON.stringify({ zone_id: Number(effectiveAddZoneId), count: addCount }),
      }),
    onSuccess: (res) => {
      notify('ok', `Đã thêm ${res.created} vị trí đỗ mới.`);
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const reconcileMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ message: string; slots_reconciled: number; cards_reconciled: number }>(
        '/api/v1/slots/reconcile',
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      notify(
        'ok',
        `${res.message} (${res.slots_reconciled} ô, ${res.cards_reconciled} thẻ được đồng bộ).`,
      );
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  if (overviewQuery.isLoading || !overview) {
    return (
      <div className="p-10 text-center text-sm text-slate-400">
        Đang tải dữ liệu tổng quan bãi đỗ...
      </div>
    );
  }

  const m = overview.metrics;
  const occRate = m.total_slots > 0 ? Math.round((m.occupied_slots / m.total_slots) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Tổng vị trí</span>
            <Building2 className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold">{m.total_slots}</div>
          <div className="mt-1 text-[11px] text-slate-400">Công suất {occRate}%</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
            <span>Chỗ trống</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {m.available_slots}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
            Sẵn sàng tiếp nhận
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300">
            <span>Xe đang gửi</span>
            <CarFront className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-700 dark:text-amber-300">
            {m.active_vehicles}
          </div>
          <div className="mt-1 text-[11px] text-amber-600/80 dark:text-amber-400/80">
            Ô có xe: {m.occupied_slots}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Doanh thu hôm nay</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-slate-900 dark:text-slate-100">
            {formatVnd(m.today_revenue)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Lũy kế: {formatVnd(m.total_revenue)}
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Vé tháng hiệu lực</span>
            <CreditCard className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-indigo-700 dark:text-indigo-300">
            {m.active_monthly_passes}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Đang hoạt động</div>
        </div>
      </div>

      {/* Lot capacity cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {overview.lots.map((lot) => {
          const pct = lot.tong_cho > 0 ? Math.round((lot.dang_do / lot.tong_cho) * 100) : 0;
          return (
            <div
              key={lot.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">{lot.tenbaido}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{lot.diadiem}</p>
                </div>
                <StatusBadge tone={pct >= 85 ? 'rose' : pct >= 60 ? 'amber' : 'emerald'}>
                  {pct}% đầy
                </StatusBadge>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Trống: <strong>{lot.cho_trong}</strong></span>
                <span>Đang đỗ: <strong>{lot.dang_do}</strong></span>
                <span>Bảo trì: <strong>{lot.bao_tri}</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Slot Map */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Sơ đồ ô đỗ thời gian thực ({slots.length} ô)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nhấn vào từng ô để xem biển số đang đỗ hoặc bật/tắt trạng thái bảo trì
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={lotFilterId} className="sr-only">Lọc bãi đỗ</label>
            <select
              id={lotFilterId}
              value={lotFilter}
              onChange={(e) => {
                setLotFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
                setZoneFilter('all');
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs"
            >
              <option value="all">Tất cả bãi đỗ</option>
              {overview.lots.map((l) => (
                <option key={l.id} value={l.id}>{l.tenbaido}</option>
              ))}
            </select>

            <label htmlFor={zoneFilterId} className="sr-only">Lọc khu vực</label>
            <select
              id={zoneFilterId}
              value={zoneFilter}
              onChange={(e) =>
                setZoneFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs"
            >
              <option value="all">Tất cả khu vực</option>
              {zonesForFilter.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.tenbaido} · Khu {z.ten}
                </option>
              ))}
            </select>

            <label htmlFor={statusFilterId} className="sr-only">Lọc trạng thái ô</label>
            <select
              id={statusFilterId}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | '1' | '0' | '2')}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs"
            >
              <option value="all">Mọi trạng thái</option>
              <option value="1">Trống</option>
              <option value="0">Đang đỗ</option>
              <option value="2">Bảo trì</option>
            </select>

            {user.role === 'ADMIN' && (
              <button
                type="button"
                disabled={reconcileMutation.isPending}
                onClick={() => reconcileMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Đối soát ô & thẻ
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
          {slots.map((slot) => {
            const isFree = slot.trangthai === 1;
            const isMaint = slot.trangthai === 2;
            const cardCls = isFree
              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 hover:border-emerald-400'
              : isMaint
                ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                : 'border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:border-rose-400';

            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => setSelectedSlotId(slot.id)}
                className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${cardCls}`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>{slot.ten_khuvuc}-{slot.sothutu}</span>
                  {isMaint && <Wrench className="h-3 w-3" />}
                </div>
                <div className="mt-1 truncate font-mono-plate text-[11px] font-semibold">
                  {isFree ? 'Trống' : isMaint ? 'Bảo trì' : slot.bienso || 'Đang đỗ'}
                </div>
              </button>
            );
          })}
        </div>

        {user.role === 'ADMIN' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (effectiveAddZoneId) addSlotsMutation.mutate();
            }}
            className="flex flex-wrap items-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4"
          >
            <div>
              <label htmlFor={addZoneId} className="block text-[11px] font-semibold text-slate-500 mb-1">
                Khu vực thêm ô
              </label>
              <select
                id={addZoneId}
                value={effectiveAddZoneId}
                onChange={(e) => setAddZoneIdVal(Number(e.target.value))}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"
              >
                {overview.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.tenbaido} · Khu {z.ten}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={addCountId} className="block text-[11px] font-semibold text-slate-500 mb-1">
                Số ô mới (1–50)
              </label>
              <input
                id={addCountId}
                type="number"
                min={1}
                max={50}
                value={addCount}
                onChange={(e) => setAddCount(Number(e.target.value))}
                className="w-24 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={addSlotsMutation.isPending || !effectiveAddZoneId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {addSlotsMutation.isPending ? 'Đang thêm...' : 'Thêm vị trí đỗ'}
            </button>
          </form>
        )}
      </section>

      {/* Live Slot Detail Modal */}
      <Modal
        open={Boolean(selectedSlot)}
        onClose={() => setSelectedSlotId(null)}
        maxWidthClass="max-w-md"
        title={
          selectedSlot
            ? `Chi tiết ô ${selectedSlot.ten_khuvuc}-${selectedSlot.sothutu} (${selectedSlot.tenbaido})`
            : ''
        }
      >
        {selectedSlot && (
          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Trạng thái:</span>
              <StatusBadge
                tone={
                  selectedSlot.trangthai === 1
                    ? 'emerald'
                    : selectedSlot.trangthai === 2
                      ? 'slate'
                      : 'rose'
                }
              >
                {selectedSlot.trangthai === 1
                  ? 'Trống'
                  : selectedSlot.trangthai === 2
                    ? 'Đang bảo trì'
                    : 'Đang có xe'}
              </StatusBadge>
            </div>
            {selectedSlot.trangthai === 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Biển số:</span>
                  <span className="font-mono-plate font-bold text-sm">{selectedSlot.bienso || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Loại phương tiện:</span>
                  <span>{selectedSlot.loaiphuongtien || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Giờ vào:</span>
                  <span>{formatDateTime(selectedSlot.giovao)}</span>
                </div>
              </div>
            )}
            {(user.role === 'ADMIN' || user.role === 'OPERATOR') && selectedSlot.trangthai !== 0 && (
              <button
                type="button"
                disabled={maintenanceMutation.isPending}
                onClick={() =>
                  maintenanceMutation.mutate({
                    slotId: selectedSlot.id,
                    maintenance: selectedSlot.trangthai === 1,
                  })
                }
                className="w-full rounded-xl bg-slate-900 dark:bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {selectedSlot.trangthai === 1 ? 'Khóa bảo trì vị trí này' : 'Mở lại vị trí trống'}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
