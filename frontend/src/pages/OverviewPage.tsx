import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CarFront,
  CheckCircle2,
  CreditCard,
  DollarSign,
  LayoutGrid,
  MapPin,
  Plus,
  RefreshCw,
  Rows3,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { KpiCard } from '../components/ui/KpiCard';
import { LicensePlate } from '../components/ui/LicensePlate';
import { Modal } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { KpiGridSkeleton, Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { VehicleIcon } from '../components/ui/VehicleIcon';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime, formatVnd, getErrorMessage } from '../lib/api';
import { cn } from '../lib/cn';
import { formatElapsedDuration, getHoursParked } from '../lib/time';
import type { AuthUser, OverviewResponse, ParkingSlot } from '../types';

interface OverviewPageProps {
  user: AuthUser;
}

export function OverviewPage({ user }: OverviewPageProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const lotFilterId = useId();
  const zoneFilterId = useId();
  const statusFilterId = useId();
  const addZoneId = useId();
  const addCountId = useId();

  const [lotFilter, setLotFilter] = useState<number | 'all'>('all');
  const [zoneFilter, setZoneFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0' | '2'>('all');
  const [plateSearch, setPlateSearch] = useState('');
  const [compactView, setCompactView] = useState(false);

  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [deleteSlotTarget, setDeleteSlotTarget] = useState<ParkingSlot | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
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

  const normalizedPlateQuery = plateSearch.trim().toLowerCase();

  // Group slots cleanly by Lot -> Zone for intuitive floorplan navigation
  const groupedFloorplan = useMemo(() => {
    const filtered = normalizedPlateQuery
      ? slots.filter(
          (s) =>
            (s.bienso?.toLowerCase().includes(normalizedPlateQuery) ?? false) ||
            `${s.ten_khuvuc}-${s.sothutu}`.toLowerCase().includes(normalizedPlateQuery),
        )
      : slots;

    const groups = new Map<
      string,
      {
        key: string;
        lotName: string;
        zoneName: string;
        slots: ParkingSlot[];
        free: number;
        occupied: number;
        maint: number;
      }
    >();

    filtered.forEach((slot) => {
      const key = `${slot.idbdx}-${slot.idkvd}`;
      let entry = groups.get(key);
      if (!entry) {
        entry = {
          key,
          lotName: slot.tenbaido,
          zoneName: slot.ten_khuvuc,
          slots: [],
          free: 0,
          occupied: 0,
          maint: 0,
        };
        groups.set(key, entry);
      }
      entry.slots.push(slot);
      if (slot.trangthai === 1) entry.free += 1;
      else if (slot.trangthai === 2) entry.maint += 1;
      else entry.occupied += 1;
    });

    return { totalShown: filtered.length, groups: Array.from(groups.values()) };
  }, [slots, normalizedPlateQuery]);

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
      setAddModalOpen(false);
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

  const deleteSlotMutation = useMutation({
    mutationFn: (slotId: number) => apiRequest(`/api/v1/slots/${slotId}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('ok', 'Đã xóa vị trí đỗ.');
      setDeleteSlotTarget(null);
      setSelectedSlotId(null);
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={5} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (overviewQuery.isError || !overview) {
    return (
      <ErrorState
        title="Không thể tải dữ liệu tổng quan bãi đỗ"
        message={getErrorMessage(overviewQuery.error)}
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  const m = overview.metrics;
  const occRate = m.total_slots > 0 ? Math.round((m.occupied_slots / m.total_slots) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      {/* Bento KPI Grid */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Tổng vị trí"
          value={m.total_slots}
          sublabel={`Đang sử dụng ${occRate}% công suất`}
          icon={<Building2 className="h-4 w-4" />}
          tone={occRate >= 85 ? 'rose' : occRate >= 60 ? 'amber' : 'brand'}
          progressPct={occRate}
        />
        <KpiCard
          label="Chỗ trống"
          value={m.available_slots}
          sublabel="Sẵn sàng tiếp nhận"
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Xe đang gửi"
          value={m.active_vehicles}
          sublabel={`Ô đang có xe: ${m.occupied_slots}`}
          icon={<CarFront className="h-4 w-4" />}
          tone="sky"
        />
        <KpiCard
          label="Doanh thu hôm nay"
          value={<span className="text-lg">{formatVnd(m.today_revenue)}</span>}
          sublabel={`Lũy kế: ${formatVnd(m.total_revenue)}`}
          icon={<DollarSign className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Vé tháng hiệu lực"
          value={m.active_monthly_passes}
          sublabel="Khách đăng ký hoạt động"
          icon={<CreditCard className="h-4 w-4" />}
          tone="violet"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Interactive Lot Capacity Cards */}
      <div className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3 max-h-44 overflow-y-auto scroll-pane">
        {overview.lots.map((lot) => {
          const pct = lot.tong_cho > 0 ? Math.round((lot.dang_do / lot.tong_cho) * 100) : 0;
          const isSelected = lotFilter === lot.id;
          return (
            <button
              key={lot.id}
              type="button"
              onClick={() => {
                setLotFilter(isSelected ? 'all' : lot.id);
                setZoneFilter('all');
              }}
              className={cn(
                'card-surface rounded-2xl p-3 text-left transition-all duration-150',
                isSelected
                  ? 'ring-2 ring-brand-500 border-brand-500/70'
                  : 'hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {lot.tenbaido}
                    </h3>
                    {isSelected && (
                      <span className="rounded-md bg-brand-soft border px-1.5 py-0.5 text-[10px] font-bold">
                        Đang lọc
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {lot.diadiem}
                  </p>
                </div>
                <StatusBadge tone={pct >= 85 ? 'rose' : pct >= 60 ? 'amber' : 'emerald'} dot>
                  {pct}% đầy
                </StatusBadge>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Trống: <strong>{lot.cho_trong}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  Đang đỗ: <strong>{lot.dang_do}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Bảo trì: <strong>{lot.bao_tri}</strong>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Grouped Interactive Floorplan */}
      <section className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[300px] max-h-[68vh] lg:max-h-none flex flex-col">
        <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Sơ đồ ô đỗ theo khu vực ({groupedFloorplan.totalShown} ô)
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              {user.role === 'ADMIN' && (
                <>
                  <Button
                    variant="subtle"
                    size="sm"
                    loading={reconcileMutation.isPending}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => reconcileMutation.mutate()}
                  >
                    Đối soát ô & thẻ
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setAddModalOpen(true)}
                  >
                    Thêm vị trí
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Filter & Legend Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                containerClassName="w-52 sm:w-60"
                aria-label="Tìm biển số hoặc mã ô trên sơ đồ"
                value={plateSearch}
                onChange={setPlateSearch}
                placeholder="Tìm biển số, mã ô..."
              />

              <label htmlFor={lotFilterId} className="sr-only">
                Lọc bãi đỗ
              </label>
              <select
                id={lotFilterId}
                value={lotFilter}
                onChange={(e) => {
                  setLotFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
                  setZoneFilter('all');
                }}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3 text-xs font-medium"
              >
                <option value="all">Tất cả bãi đỗ</option>
                {overview.lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.tenbaido}
                  </option>
                ))}
              </select>

              <label htmlFor={zoneFilterId} className="sr-only">
                Lọc khu vực
              </label>
              <select
                id={zoneFilterId}
                value={zoneFilter}
                onChange={(e) =>
                  setZoneFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3 text-xs font-medium"
              >
                <option value="all">Tất cả khu vực</option>
                {zonesForFilter.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.tenbaido} · Khu {z.ten}
                  </option>
                ))}
              </select>

              <label htmlFor={statusFilterId} className="sr-only">
                Lọc trạng thái ô
              </label>
              <select
                id={statusFilterId}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | '1' | '0' | '2')}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3 text-xs font-medium"
              >
                <option value="all">Mọi trạng thái</option>
                <option value="1">Trống</option>
                <option value="0">Đang đỗ</option>
                <option value="2">Bảo trì</option>
              </select>
            </div>

            {/* Legend & Density Switch */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />
                Trống
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/80" />
                Đang đỗ
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/80" />
                Bảo trì
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border-2 border-rose-500 bg-rose-500/20" />
                Quá 24h
              </span>
              <button
                type="button"
                onClick={() => setCompactView((v) => !v)}
                title={compactView ? 'Chuyển chế độ thẻ chi tiết' : 'Chuyển chế độ thu gọn'}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {compactView ? (
                  <LayoutGrid className="h-3.5 w-3.5" />
                ) : (
                  <Rows3 className="h-3.5 w-3.5" />
                )}
                {compactView ? 'Chi tiết' : 'Thu gọn'}
              </button>
            </div>
          </div>
        </div>

        {/* Grouped Floorplan Grid */}
        <div className="flex-1 min-h-0 scroll-pane p-4">
          {slotsQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
              {Array.from({ length: 16 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : slotsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(slotsQuery.error)}
              onRetry={() => void slotsQuery.refetch()}
            />
          ) : groupedFloorplan.groups.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-5 w-5" />}
              title="Không tìm thấy vị trí đỗ khớp bộ lọc"
              description="Thử đặt lại bộ lọc bãi đỗ, trạng thái hoặc từ khóa tìm biển số."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setLotFilter('all');
                    setZoneFilter('all');
                    setStatusFilter('all');
                    setPlateSearch('');
                  }}
                >
                  Đặt lại bộ lọc
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {groupedFloorplan.groups.map((group) => (
                <div
                  key={group.key}
                  className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-brand-soft border px-2 py-0.5 font-mono-plate text-xs font-bold">
                        Khu {group.zoneName}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {group.lotName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-medium tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {group.free} trống
                      </span>
                      <span className="text-sky-600 dark:text-sky-400">
                        {group.occupied} đang đỗ
                      </span>
                      {group.maint > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {group.maint} bảo trì
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    className={cn(
                      'grid gap-2',
                      compactView
                        ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12'
                        : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8',
                    )}
                  >
                    {group.slots.map((slot) => {
                      const isFree = slot.trangthai === 1;
                      const isMaint = slot.trangthai === 2;
                      const isOccupied = !isFree && !isMaint;
                      const hours = isOccupied ? getHoursParked(slot.giovao) : 0;
                      const isOverdue = isOccupied && hours >= 24;
                      const matchedSearch =
                        Boolean(normalizedPlateQuery) &&
                        (slot.bienso?.toLowerCase().includes(normalizedPlateQuery) ?? false);

                      const cardCls = isFree
                        ? 'border-emerald-300/90 dark:border-emerald-900/70 bg-emerald-50/90 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 hover:border-emerald-400'
                        : isMaint
                          ? 'border-amber-300/90 dark:border-amber-900/70 bg-amber-50/90 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 hover:border-amber-400'
                          : isOverdue
                            ? 'border-rose-400 dark:border-rose-700 bg-rose-50/90 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ring-1 ring-rose-400/40'
                            : 'border-sky-300/90 dark:border-sky-900/70 bg-sky-50/90 dark:bg-sky-950/35 text-sky-900 dark:text-sky-200 hover:border-sky-400';

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlotId(slot.id)}
                          className={cn(
                            'rounded-xl border text-left transition-all duration-150 hover:-translate-y-0.5',
                            compactView ? 'p-2' : 'p-2.5',
                            cardCls,
                            matchedSearch && 'ring-2 ring-brand-500 shadow-md',
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
                            <span className="font-mono-plate">
                              {slot.ten_khuvuc}-{slot.sothutu}
                            </span>
                            {isMaint ? (
                              <Wrench className="h-3 w-3 shrink-0" />
                            ) : isOverdue ? (
                              <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
                            ) : isOccupied ? (
                              <VehicleIcon
                                vehicleType={slot.loaiphuongtien}
                                className="h-3.5 w-3.5 shrink-0 opacity-80"
                              />
                            ) : null}
                          </div>
                          <div className="mt-1 truncate font-mono-plate text-[11px] font-bold">
                            {isFree ? 'Trống' : isMaint ? 'Bảo trì' : slot.bienso || 'Đang đỗ'}
                          </div>
                          {!compactView && isOccupied && slot.giovao && (
                            <div className="mt-0.5 text-[10px] opacity-75 font-mono-plate">
                              {formatElapsedDuration(slot.giovao)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Live Slot Detail Modal */}
      <Modal
        open={Boolean(selectedSlot)}
        onClose={() => setSelectedSlotId(null)}
        maxWidthClass="max-w-md"
        title={selectedSlot ? `Vị trí ${selectedSlot.ten_khuvuc}-${selectedSlot.sothutu}` : ''}
        subtitle={
          selectedSlot ? `${selectedSlot.tenbaido} · Khu ${selectedSlot.ten_khuvuc}` : undefined
        }
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <MapPin className="h-4 w-4" />
          </span>
        }
      >
        {selectedSlot && (
          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Trạng thái hiện tại:</span>
              <StatusBadge
                dot
                tone={
                  selectedSlot.trangthai === 1
                    ? 'emerald'
                    : selectedSlot.trangthai === 2
                      ? 'amber'
                      : getHoursParked(selectedSlot.giovao) >= 24
                        ? 'rose'
                        : 'sky'
                }
              >
                {selectedSlot.trangthai === 1
                  ? 'Trống'
                  : selectedSlot.trangthai === 2
                    ? 'Đang bảo trì'
                    : getHoursParked(selectedSlot.giovao) >= 24
                      ? 'Đang đỗ (Quá 24h)'
                      : 'Đang có xe'}
              </StatusBadge>
            </div>

            {selectedSlot.trangthai === 0 && (
              <>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Biển số:</span>
                    <LicensePlate plate={selectedSlot.bienso} size="md" copyable />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Loại phương tiện:</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold capitalize">
                      <VehicleIcon
                        vehicleType={selectedSlot.loaiphuongtien}
                        className="h-3.5 w-3.5"
                      />
                      {selectedSlot.loaiphuongtien || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Giờ vào:</span>
                    <span className="tabular-nums font-medium">
                      {formatDateTime(selectedSlot.giovao)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Thời lượng đã gửi:</span>
                    <span className="font-mono-plate font-bold">
                      {formatElapsedDuration(selectedSlot.giovao)}
                    </span>
                  </div>
                </div>
                {selectedSlot.bienso && (
                  <Button
                    variant="primary"
                    className="w-full"
                    icon={<ArrowUpRight className="h-4 w-4" />}
                    onClick={() => {
                      const plateTarget = selectedSlot.bienso ?? '';
                      setSelectedSlotId(null);
                      navigate(`/gate?q=${encodeURIComponent(plateTarget)}`);
                    }}
                  >
                    Mở xe này tại Quầy Cổng (Check-out)
                  </Button>
                )}
              </>
            )}

            {(user.role === 'ADMIN' || user.role === 'OPERATOR') &&
              selectedSlot.trangthai !== 0 && (
                <div className="space-y-2">
                  <Button
                    variant={selectedSlot.trangthai === 1 ? 'secondary' : 'success'}
                    loading={maintenanceMutation.isPending}
                    icon={<Wrench className="h-4 w-4" />}
                    onClick={() =>
                      maintenanceMutation.mutate({
                        slotId: selectedSlot.id,
                        maintenance: selectedSlot.trangthai === 1,
                      })
                    }
                    className="w-full"
                  >
                    {selectedSlot.trangthai === 1
                      ? 'Khóa bảo trì vị trí này'
                      : 'Mở lại vị trí trống'}
                  </Button>
                  {user.role === 'ADMIN' && (
                    <Button
                      variant="danger"
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => setDeleteSlotTarget(selectedSlot)}
                      className="w-full"
                    >
                      Xóa ô đỗ này
                    </Button>
                  )}
                </div>
              )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteSlotTarget)}
        title={
          deleteSlotTarget
            ? `Xóa vị trí ${deleteSlotTarget.ten_khuvuc}-${deleteSlotTarget.sothutu}`
            : 'Xóa vị trí đỗ'
        }
        message={
          deleteSlotTarget
            ? `Xác nhận xóa vị trí ${deleteSlotTarget.ten_khuvuc}-${deleteSlotTarget.sothutu} (${deleteSlotTarget.tenbaido})? Chỉ xóa được nếu ô đỗ chưa từng phát sinh lượt gửi xe.`
            : ''
        }
        confirmLabel="Xóa ô đỗ"
        loading={deleteSlotMutation.isPending}
        onConfirm={() => deleteSlotTarget && deleteSlotMutation.mutate(deleteSlotTarget.id)}
        onCancel={() => setDeleteSlotTarget(null)}
      />

      {/* Admin: Add New Parking Slots Modal */}
      {user.role === 'ADMIN' && (
        <Modal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          maxWidthClass="max-w-md"
          title="Thêm vị trí đỗ mới"
          titleIcon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
              <Plus className="h-4 w-4" />
            </span>
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setAddModalOpen(false)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                loading={addSlotsMutation.isPending}
                disabled={!effectiveAddZoneId}
                onClick={() => addSlotsMutation.mutate()}
              >
                Thêm {addCount} vị trí
              </Button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (effectiveAddZoneId) addSlotsMutation.mutate();
            }}
            className="p-5 space-y-4 text-xs"
          >
            <div>
              <label
                htmlFor={addZoneId}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Khu vực thêm ô
              </label>
              <select
                id={addZoneId}
                value={effectiveAddZoneId}
                onChange={(e) => setAddZoneIdVal(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
              >
                {overview.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.tenbaido} · Khu {z.ten} ({z.tong_cho} ô hiện có)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={addCountId}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Số lượng ô cần tạo (1–50)
              </label>
              <input
                id={addCountId}
                type="number"
                min={1}
                max={50}
                value={addCount}
                onChange={(e) => setAddCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm font-mono-plate font-bold"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
