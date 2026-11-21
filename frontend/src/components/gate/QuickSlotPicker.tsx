import { Building2, Check, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import type { ParkingLot, ParkingSlot } from '../../types';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';

interface QuickSlotPickerProps {
  open: boolean;
  lots: ParkingLot[];
  allSlots: ParkingSlot[];
  activeLotId: number | '';
  selectedSlotId: number | '';
  onSelect: (slotId: number, lotId: number) => void;
  onClose: () => void;
}

export function QuickSlotPicker({
  open,
  lots,
  allSlots,
  activeLotId,
  selectedSlotId,
  onSelect,
  onClose,
}: QuickSlotPickerProps) {
  const [lotFilter, setLotFilter] = useState<'all' | number>('all');

  const handleClose = () => {
    setLotFilter('all');
    onClose();
  };

  const perLotCounts = useMemo(() => {
    const counts = new Map<number, number>();
    allSlots.forEach((slot) => {
      counts.set(slot.idbdx, (counts.get(slot.idbdx) ?? 0) + 1);
    });
    return counts;
  }, [allSlots]);

  const selectedFilterLot = useMemo(
    () => (lotFilter === 'all' ? undefined : lots.find((l) => l.id === lotFilter)),
    [lotFilter, lots],
  );

  const visibleSlots = useMemo(() => {
    if (lotFilter === 'all') return allSlots;
    return allSlots.filter((s) => s.idbdx === lotFilter);
  }, [allSlots, lotFilter]);

  const groupedByLot = useMemo(() => {
    const lotMap = new Map<
      number,
      {
        lotId: number;
        lotName: string;
        zonesMap: Map<string, ParkingSlot[]>;
        totalFree: number;
      }
    >();

    visibleSlots.forEach((slot) => {
      let lotGroup = lotMap.get(slot.idbdx);
      if (!lotGroup) {
        lotGroup = {
          lotId: slot.idbdx,
          lotName: slot.tenbaido,
          zonesMap: new Map<string, ParkingSlot[]>(),
          totalFree: 0,
        };
        lotMap.set(slot.idbdx, lotGroup);
      }
      const zoneSlots = lotGroup.zonesMap.get(slot.ten_khuvuc) ?? [];
      zoneSlots.push(slot);
      lotGroup.zonesMap.set(slot.ten_khuvuc, zoneSlots);
      lotGroup.totalFree += 1;
    });

    const activeId = activeLotId !== '' ? Number(activeLotId) : null;
    const lotOrderIndex = new Map<number, number>();
    lots.forEach((l, idx) => lotOrderIndex.set(l.id, idx));

    const groups = Array.from(lotMap.values()).map((g) => ({
      lotId: g.lotId,
      lotName: g.lotName,
      zones: Array.from(g.zonesMap.entries()),
      totalFree: g.totalFree,
    }));

    groups.sort((a, b) => {
      if (lotFilter === 'all' && activeId !== null) {
        if (a.lotId === activeId && b.lotId !== activeId) return -1;
        if (b.lotId === activeId && a.lotId !== activeId) return 1;
      }
      const idxA = lotOrderIndex.get(a.lotId) ?? Number.MAX_SAFE_INTEGER;
      const idxB = lotOrderIndex.get(b.lotId) ?? Number.MAX_SAFE_INTEGER;
      return idxA - idxB;
    });

    return groups;
  }, [visibleSlots, lots, activeLotId, lotFilter]);

  const modalTitle =
    lotFilter === 'all'
      ? 'Chọn vị trí trống — Tất cả bãi đỗ'
      : `Chọn vị trí trống — ${selectedFilterLot?.tenbaido ?? ''}`;

  const modalSubtitle =
    lotFilter === 'all' && lots.length > 1
      ? `Hiện có ${visibleSlots.length} ô sẵn sàng trên ${lots.length} bãi đỗ`
      : `Hiện có ${visibleSlots.length} ô sẵn sàng tiếp nhận`;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxWidthClass="max-w-2xl"
      title={modalTitle}
      subtitle={modalSubtitle}
      titleIcon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400">
          <MapPin className="h-4 w-4" />
        </span>
      }
    >
      {lots.length > 0 && (
        <div className="sticky top-0 z-10 border-b border-slate-200/80 dark:border-slate-800 bg-surface-subtle/95 backdrop-blur-xs px-5 py-3">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Chọn bãi đỗ"
          >
            <button
              type="button"
              role="tab"
              aria-selected={lotFilter === 'all'}
              onClick={() => setLotFilter('all')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                lotFilter === 'all'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-brand-400',
              )}
            >
              <span>Tất cả bãi</span>
              <span className="font-mono-plate text-[10px] opacity-85">{allSlots.length}</span>
            </button>
            {lots.map((lot) => {
              const count = perLotCounts.get(lot.id) ?? 0;
              const active = lotFilter === lot.id;
              return (
                <button
                  key={lot.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setLotFilter(lot.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-brand-400',
                    count === 0 && !active && 'opacity-55',
                  )}
                >
                  <span>{lot.tenbaido}</span>
                  <span className="font-mono-plate text-[10px] opacity-85">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        {groupedByLot.length === 0 ? (
          <EmptyState
            compact
            icon={<MapPin className="h-5 w-5" />}
            title="Hết vị trí trống trong bãi này"
            description="Hãy chọn bãi đỗ khác hoặc kiểm tra sơ đồ các ô đang bảo trì."
          />
        ) : (
          groupedByLot.map((lotGroup) => {
            const isActiveLot = activeLotId !== '' && lotGroup.lotId === Number(activeLotId);
            return (
              <div
                key={lotGroup.lotId}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
                    <span className="font-bold text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 truncate">
                      {lotGroup.lotName}
                    </span>
                    {isActiveLot && (
                      <span className="rounded-md bg-brand-soft border px-1.5 py-0.5 text-[10px] font-bold shrink-0">
                        Bãi đang chọn
                      </span>
                    )}
                  </div>
                  <span className="font-mono-plate text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                    {lotGroup.totalFree} ô trống
                  </span>
                </div>

                <div className="space-y-3">
                  {lotGroup.zones.map(([zoneName, zoneSlots]) => (
                    <div key={zoneName} className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          Khu {zoneName}
                        </span>
                        <span className="font-mono-plate text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                          {zoneSlots.length} ô trống
                        </span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {zoneSlots.map((slot) => {
                          const active = selectedSlotId === slot.id;
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => {
                                onSelect(slot.id, slot.idbdx);
                                handleClose();
                              }}
                              className={cn(
                                'relative flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 transition-all',
                                active
                                  ? 'bg-brand-soft border-brand-500 ring-2 ring-brand-500/30'
                                  : 'border-emerald-300/90 dark:border-emerald-900/70 bg-emerald-50/90 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 hover:border-emerald-500 hover:-translate-y-0.5',
                              )}
                            >
                              {active && (
                                <Check className="absolute top-1 right-1 h-3 w-3 text-brand-600 dark:text-brand-400" />
                              )}
                              <span className="font-mono-plate text-xs font-bold">
                                {zoneName}-{slot.sothutu}
                              </span>
                              <span className="text-[10px] opacity-75 mt-0.5">Trống</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
