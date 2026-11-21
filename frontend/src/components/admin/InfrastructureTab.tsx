import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Edit3, Layers, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { apiRequest, getErrorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { ParkingLot, ZoneSummary } from '../../types';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';

type InfraDeleteTarget =
  { kind: 'lot'; id: number; label: string } | { kind: 'zone'; id: number; label: string };

export function InfrastructureTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const prefix = useId();

  const [selectedLotFilter, setSelectedLotFilter] = useState<number | 'all'>('all');
  const [lotModalOpen, setLotModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<ParkingLot | null>(null);
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InfraDeleteTarget | null>(null);

  const [lotName, setLotName] = useState('');
  const [lotLoc, setLotLoc] = useState('');
  const [zoneLotId, setZoneLotId] = useState<number | ''>('');
  const [zoneName, setZoneName] = useState('');

  const lotsQuery = useQuery<ParkingLot[]>({
    queryKey: ['lots'],
    queryFn: ({ signal }) => apiRequest<ParkingLot[]>('/api/v1/lots', { signal }),
  });

  const zonesQuery = useQuery<ZoneSummary[]>({
    queryKey: ['zones'],
    queryFn: ({ signal }) => apiRequest<ZoneSummary[]>('/api/v1/zones', { signal }),
  });

  const invalidateInfra = () => {
    void queryClient.invalidateQueries({ queryKey: ['lots'] });
    void queryClient.invalidateQueries({ queryKey: ['zones'] });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
    void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
    void queryClient.invalidateQueries({ queryKey: ['slots'] });
  };

  const saveLotMutation = useMutation({
    mutationFn: () => {
      const payload = { name: lotName.trim(), location: lotLoc.trim() };
      return editingLot
        ? apiRequest(`/api/v1/lots/${editingLot.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : apiRequest('/api/v1/lots', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      notify(
        'ok',
        editingLot
          ? `Đã cập nhật bãi đỗ "${lotName.trim()}".`
          : `Đã thêm bãi đỗ "${lotName.trim()}".`,
      );
      setLotName('');
      setLotLoc('');
      setEditingLot(null);
      setLotModalOpen(false);
      invalidateInfra();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const saveZoneMutation = useMutation({
    mutationFn: () => {
      const payload = { lot_id: Number(effectiveLotId), name: zoneName.trim() };
      return editingZone
        ? apiRequest(`/api/v1/zones/${editingZone.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : apiRequest('/api/v1/zones', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      notify(
        'ok',
        editingZone
          ? `Đã cập nhật khu vực "${zoneName.trim()}".`
          : `Đã thêm khu vực "${zoneName.trim()}".`,
      );
      setZoneName('');
      setEditingZone(null);
      setZoneModalOpen(false);
      invalidateInfra();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const deleteInfraMutation = useMutation({
    mutationFn: (target: InfraDeleteTarget) =>
      apiRequest(
        target.kind === 'lot' ? `/api/v1/lots/${target.id}` : `/api/v1/zones/${target.id}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: (_res, target) => {
      notify('ok', `Đã xóa ${target.label}.`);
      if (target.kind === 'lot' && selectedLotFilter === target.id) {
        setSelectedLotFilter('all');
      }
      setDeleteTarget(null);
      invalidateInfra();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const lots = useMemo(() => lotsQuery.data ?? [], [lotsQuery.data]);
  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data]);
  const effectiveLotId =
    zoneLotId || (selectedLotFilter !== 'all' ? selectedLotFilter : lots[0]?.id) || '';

  const visibleZones = useMemo(() => {
    if (selectedLotFilter === 'all') return zones;
    return zones.filter((z) => z.idbdx === selectedLotFilter);
  }, [zones, selectedLotFilter]);

  const openCreateLot = () => {
    setEditingLot(null);
    setLotName('');
    setLotLoc('');
    setLotModalOpen(true);
  };

  const openEditLot = (l: ParkingLot) => {
    setEditingLot(l);
    setLotName(l.tenbaido);
    setLotLoc(l.diadiem);
    setLotModalOpen(true);
  };

  const openCreateZone = () => {
    setEditingZone(null);
    setZoneLotId(selectedLotFilter !== 'all' ? selectedLotFilter : (lots[0]?.id ?? ''));
    setZoneName('');
    setZoneModalOpen(true);
  };

  const openEditZone = (z: ZoneSummary) => {
    setEditingZone(z);
    setZoneLotId(z.idbdx);
    setZoneName(z.ten);
    setZoneModalOpen(true);
  };

  const lotFormId = `${prefix}-lot-form`;
  const zoneFormId = `${prefix}-zone-form`;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-1 gap-4 items-stretch">
      {/* Master: Parking Lots */}
      <section className="lg:col-span-5 card-surface rounded-2xl overflow-hidden flex flex-col min-h-[260px] max-h-[60vh] lg:max-h-none">
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Building2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Bãi đỗ xe ({lots.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Chọn bãi để lọc danh sách khu vực bên phải
            </p>
          </div>
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreateLot}>
            Thêm bãi
          </Button>
        </div>

        <div className="flex-1 min-h-0 scroll-pane p-4 space-y-2.5">
          {lotsQuery.isLoading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : lotsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(lotsQuery.error)}
              onRetry={() => void lotsQuery.refetch()}
            />
          ) : lots.length === 0 ? (
            <EmptyState
              compact
              icon={<Building2 className="h-5 w-5" />}
              title="Chưa có bãi đỗ nào"
            />
          ) : (
            <div className="space-y-2.5">
              {lots.map((l) => {
                const pct = l.tong_cho > 0 ? Math.round((l.dang_do / l.tong_cho) * 100) : 0;
                const selected = selectedLotFilter === l.id;
                return (
                  <div
                    key={l.id}
                    className={cn(
                      'rounded-xl border p-3.5 transition-all',
                      selected
                        ? 'bg-brand-soft ring-1 ring-brand-500/40'
                        : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLotFilter(selected ? 'all' : l.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="font-bold text-[13px] text-slate-900 dark:text-slate-100 truncate">
                          {l.tenbaido}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {l.diadiem}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <StatusBadge tone={pct >= 85 ? 'rose' : pct >= 60 ? 'amber' : 'emerald'}>
                          {pct}%
                        </StatusBadge>
                        <button
                          type="button"
                          aria-label={`Sửa bãi ${l.tenbaido}`}
                          onClick={() => openEditLot(l)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 p-1 text-slate-500 hover:text-brand-600 transition-colors"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Xóa bãi ${l.tenbaido}`}
                          onClick={() =>
                            setDeleteTarget({ kind: 'lot', id: l.id, label: `bãi ${l.tenbaido}` })
                          }
                          className="rounded-lg border border-rose-200 dark:border-rose-900 bg-surface-input dark:bg-slate-900 p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                      <span>Tổng: {l.tong_cho} ô</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {l.cho_trong} trống
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Detail: Zones */}
      <section className="lg:col-span-7 card-surface rounded-2xl overflow-hidden flex flex-col min-h-[260px] max-h-[65vh] lg:max-h-none">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Layers className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Khu vực đỗ ({visibleZones.length})
            </h3>
            {selectedLotFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedLotFilter('all')}
                className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline mt-0.5"
              >
                Hiển thị tất cả các bãi
              </button>
            )}
          </div>
          <Button
            size="sm"
            disabled={lots.length === 0}
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={openCreateZone}
          >
            Thêm khu vực
          </Button>
        </div>

        <div className="flex-1 min-h-0 scroll-pane p-4">
          {zonesQuery.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : zonesQuery.isError ? (
            <ErrorState
              message={getErrorMessage(zonesQuery.error)}
              onRetry={() => void zonesQuery.refetch()}
            />
          ) : visibleZones.length === 0 ? (
            <EmptyState
              compact
              icon={<Layers className="h-5 w-5" />}
              title="Chưa có khu vực đỗ nào"
              description="Nhấn Thêm khu vực để phân khu cho bãi đỗ này."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleZones.map((z) => {
                const pct = z.tong_cho > 0 ? Math.round((z.dang_do / z.tong_cho) * 100) : 0;
                return (
                  <div
                    key={z.id}
                    className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-[13px] text-slate-900 dark:text-slate-100 truncate">
                          Khu {z.ten}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{z.tenbaido}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="font-mono-plate text-xs font-bold text-emerald-600 dark:text-emerald-400 mr-1">
                          {z.cho_trong}/{z.tong_cho}
                        </span>
                        <button
                          type="button"
                          aria-label={`Sửa khu vực ${z.ten}`}
                          onClick={() => openEditZone(z)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 p-1 text-slate-500 hover:text-brand-600 transition-colors"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Xóa khu vực ${z.ten}`}
                          onClick={() =>
                            setDeleteTarget({
                              kind: 'zone',
                              id: z.id,
                              label: `khu vực ${z.ten}`,
                            })
                          }
                          className="rounded-lg border border-rose-200 dark:border-rose-900 bg-surface-input dark:bg-slate-900 p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-sky-500',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                      <span>Đang đỗ: {z.dang_do}</span>
                      <span>Bảo trì: {z.bao_tri}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Create / Edit Lot Modal */}
      <Modal
        open={lotModalOpen}
        onClose={() => setLotModalOpen(false)}
        maxWidthClass="max-w-md"
        title={editingLot ? `Cập nhật bãi đỗ #${editingLot.id}` : 'Thêm bãi đỗ xe mới'}
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <Building2 className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setLotModalOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={lotFormId}
              variant="primary"
              loading={saveLotMutation.isPending}
            >
              {editingLot ? 'Lưu thay đổi' : 'Thêm bãi đỗ'}
            </Button>
          </>
        }
      >
        <form
          id={lotFormId}
          onSubmit={(e) => {
            e.preventDefault();
            saveLotMutation.mutate();
          }}
          className="p-5 space-y-4 text-xs"
        >
          <div>
            <label
              htmlFor={`${prefix}-ln`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Tên bãi đỗ
            </label>
            <input
              id={`${prefix}-ln`}
              required
              maxLength={100}
              value={lotName}
              onChange={(e) => setLotName(e.target.value)}
              placeholder="Bãi D - Giảng đường"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-ll`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Địa điểm
            </label>
            <input
              id={`${prefix}-ll`}
              required
              maxLength={255}
              value={lotLoc}
              onChange={(e) => setLotLoc(e.target.value)}
              placeholder="Km10 Nguyễn Trãi, Hà Đông"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none"
            />
          </div>
        </form>
      </Modal>

      {/* Create / Edit Zone Modal */}
      <Modal
        open={zoneModalOpen}
        onClose={() => setZoneModalOpen(false)}
        maxWidthClass="max-w-md"
        title={editingZone ? `Cập nhật khu vực #${editingZone.id}` : 'Thêm khu vực đỗ mới'}
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <Layers className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setZoneModalOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={zoneFormId}
              variant="primary"
              loading={saveZoneMutation.isPending}
              disabled={!effectiveLotId}
            >
              {editingZone ? 'Lưu thay đổi' : 'Thêm khu vực'}
            </Button>
          </>
        }
      >
        <form
          id={zoneFormId}
          onSubmit={(e) => {
            e.preventDefault();
            if (effectiveLotId) saveZoneMutation.mutate();
          }}
          className="p-5 space-y-4 text-xs"
        >
          <div>
            <label
              htmlFor={`${prefix}-zl`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Thuộc bãi đỗ
            </label>
            <select
              id={`${prefix}-zl`}
              value={effectiveLotId}
              onChange={(e) => setZoneLotId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
            >
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.tenbaido}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-zn`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Tên khu vực (tối đa 20 ký tự)
            </label>
            <input
              id={`${prefix}-zn`}
              required
              maxLength={20}
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="VD: KHU-C1"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xác nhận xóa hạ tầng"
        message={
          deleteTarget
            ? `Xác nhận xóa ${deleteTarget.label}? Hệ thống chỉ cho phép xóa nếu đối tượng chưa có khu vực/ô đỗ hoặc lượt gửi xe tham chiếu.`
            : ''
        }
        confirmLabel="Xóa"
        loading={deleteInfraMutation.isPending}
        onConfirm={() => deleteTarget && deleteInfraMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
