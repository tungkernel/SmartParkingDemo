import { CheckCircle2, CreditCard, LayoutGrid, LogIn, UserCheck } from 'lucide-react';
import { useId, useState } from 'react';
import type { RefObject } from 'react';
import { cn } from '../../lib/cn';
import { formatEmployeeOption } from '../../lib/employee';
import type { CardRecord, CatalogsResponse, ParkingSlot } from '../../types';
import { Button } from '../ui/Button';
import { VehicleIcon } from '../ui/VehicleIcon';
import { QuickSlotPicker } from './QuickSlotPicker';

interface CheckInPanelProps {
  plateInputRef: RefObject<HTMLInputElement | null>;
  plate: string;
  onPlateChange: (value: string) => void;
  vehicleTypeId: number | '';
  onVehicleTypeChange: (id: number) => void;
  selectedLotId: number | '';
  onLotChange: (id: number) => void;
  slotId: number | '';
  onSlotChange: (id: number) => void;
  cardId: number | '';
  onCardChange: (id: number) => void;
  employeeId: number | '';
  onEmployeeChange: (id: number) => void;
  catalogs: CatalogsResponse | undefined;
  slotsForLot: ParkingSlot[];
  allAvailableSlots: ParkingSlot[];
  onSelectSlotFromMap: (slotId: number, lotId: number) => void;
  availableCards: CardRecord[];
  matchedPassCard?: CardRecord | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function CheckInPanel({
  plateInputRef,
  plate,
  onPlateChange,
  vehicleTypeId,
  onVehicleTypeChange,
  selectedLotId,
  onLotChange,
  slotId,
  onSlotChange,
  cardId,
  onCardChange,
  employeeId,
  onEmployeeChange,
  catalogs,
  slotsForLot,
  allAvailableSlots,
  onSelectSlotFromMap,
  availableCards,
  matchedPassCard,
  submitting,
  onSubmit,
}: CheckInPanelProps) {
  const plateId = useId();
  const lotSelectId = useId();
  const slotSelectId = useId();
  const cardSelectId = useId();
  const empSelectId = useId();
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);

  const employees = catalogs?.employees ?? [];

  return (
    <section className="card-surface rounded-2xl p-4 xl:max-h-full xl:overflow-y-auto scroll-pane">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800/60">
            <LogIn className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Ghi nhận xe vào bãi
          </h2>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {/* License Plate Input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor={plateId}
              className="text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Biển số xe
            </label>
            <kbd className="kbd-keycap">F2</kbd>
          </div>
          <div className="relative">
            <input
              ref={plateInputRef}
              id={plateId}
              type="text"
              value={plate}
              onChange={(e) => onPlateChange(e.target.value.toUpperCase())}
              maxLength={15}
              required
              autoFocus
              placeholder="VD: 29A-123.45"
              className="font-mono-plate w-full rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3.5 py-2.5 text-lg font-extrabold tracking-widest text-slate-900 dark:text-white uppercase placeholder:text-slate-400 placeholder:font-medium placeholder:tracking-normal focus:bg-surface-input dark:focus:bg-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 outline-none transition-all"
            />
          </div>
          {matchedPassCard && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800/70 px-3 py-2 text-xs font-semibold text-violet-800 dark:text-violet-200">
              <CreditCard className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <span>
                Khớp vé tháng hiệu lực — tự gán thẻ{' '}
                <strong className="font-mono-plate">#{matchedPassCard.maso}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Vehicle Type Selector */}
        <div>
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Loại phương tiện
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(catalogs?.vehicle_types ?? []).map((vt, idx) => {
              const active = vehicleTypeId === vt.id;
              return (
                <button
                  key={vt.id}
                  type="button"
                  onClick={() => onVehicleTypeChange(vt.id)}
                  className={cn(
                    'relative flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition-all duration-150',
                    active
                      ? 'bg-brand-soft ring-1 ring-brand-500/40 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700/80 bg-surface-input dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                  )}
                >
                  {idx < 3 && (
                    <kbd className="kbd-keycap absolute top-1.5 right-1.5 text-[9px] px-1 py-0.5">
                      {idx + 1}
                    </kbd>
                  )}
                  <VehicleIcon vehicleType={vt.tenloai} className="h-5 w-5" />
                  <span className="capitalize truncate max-w-full">{vt.tenloai}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lot & Slot Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={lotSelectId}
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Bãi đỗ
            </label>
            <select
              id={lotSelectId}
              value={selectedLotId}
              onChange={(e) => onLotChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2 text-[13px] font-medium text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-colors"
            >
              {(catalogs?.lots ?? []).map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.tenbaido} ({lot.cho_trong} trống)
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor={slotSelectId}
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Vị trí trống ({slotsForLot.length})
              </label>
              <button
                type="button"
                onClick={() => setSlotPickerOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                <LayoutGrid className="h-3 w-3" />
                Sơ đồ
              </button>
            </div>
            <select
              id={slotSelectId}
              value={slotId}
              onChange={(e) => onSlotChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2 text-[13px] font-medium text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-colors"
            >
              {slotsForLot.length === 0 ? (
                <option value="">Hết chỗ trống</option>
              ) : (
                slotsForLot.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    Khu {slot.ten_khuvuc} — Ô {slot.sothutu}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* RFID Card Selection */}
        <div>
          <label
            htmlFor={cardSelectId}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
          >
            <CreditCard className="h-3.5 w-3.5 text-slate-400" />
            Thẻ RFID sẵn sàng ({availableCards.length})
          </label>
          <select
            id={cardSelectId}
            value={cardId}
            onChange={(e) => onCardChange(Number(e.target.value))}
            className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-colors"
          >
            {availableCards.length === 0 ? (
              <option value="">Hết thẻ trống</option>
            ) : (
              availableCards.map((c) => (
                <option key={c.id} value={c.id}>
                  Thẻ #{c.maso}
                  {c.pass_plate ? ` · Vé tháng (${c.pass_plate})` : ''}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Employee Selection (Option A) */}
        <div>
          <label
            htmlFor={empSelectId}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
          >
            <UserCheck className="h-3.5 w-3.5 text-slate-400" />
            Nhân viên tiếp nhận (Bảo vệ)
          </label>
          <select
            id={empSelectId}
            value={employeeId}
            onChange={(e) => onEmployeeChange(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2 text-[13px] font-medium text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-colors"
          >
            {employees.length === 0 ? (
              <option value="">Chưa có nhân viên</option>
            ) : (
              employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {formatEmployeeOption(emp)}
                </option>
              ))
            )}
          </select>
        </div>

        <Button
          type="submit"
          variant="success"
          size="lg"
          loading={submitting}
          disabled={!slotId || !cardId || !employeeId}
          icon={<CheckCircle2 className="h-4 w-4" />}
          className="w-full"
        >
          {submitting ? 'Đang ghi nhận...' : 'Xác nhận Check-in & In phiếu QR'}
        </Button>
      </form>

      <QuickSlotPicker
        open={slotPickerOpen}
        lots={catalogs?.lots ?? []}
        allSlots={allAvailableSlots}
        activeLotId={selectedLotId}
        selectedSlotId={slotId}
        onSelect={onSelectSlotFromMap}
        onClose={() => setSlotPickerOpen(false)}
      />
    </section>
  );
}
