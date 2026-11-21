import { Car, CheckCircle2, CreditCard, LogIn } from 'lucide-react';
import { useId } from 'react';
import type { RefObject } from 'react';
import type { CardRecord, CatalogsResponse, ParkingSlot } from '../../types';

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
  catalogs: CatalogsResponse | undefined;
  slotsForLot: ParkingSlot[];
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
  catalogs,
  slotsForLot,
  availableCards,
  matchedPassCard,
  submitting,
  onSubmit,
}: CheckInPanelProps) {
  const plateId = useId();
  const lotSelectId = useId();
  const slotSelectId = useId();
  const cardSelectId = useId();

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
            <LogIn className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ghi nhận xe vào bãi</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Phím tắt: F2 biển số · 1/2/3 loại xe · F3 tìm xe ra
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor={plateId}
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
          >
            Biển số xe (F2)
          </label>
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
            className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg font-bold tracking-wider text-slate-900 dark:text-slate-100 uppercase focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
          {matchedPassCard && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <CreditCard className="h-3.5 w-3.5" />
              Nhận diện vé tháng — tự chọn thẻ #{matchedPassCard.maso}
            </div>
          )}
        </div>

        <div>
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
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
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-semibold transition cursor-pointer ${
                    active
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-600'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Car className="h-4 w-4" />
                  <span className="capitalize">
                    {idx < 3 ? `[${idx + 1}] ` : ''}
                    {vt.tenloai}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={lotSelectId}
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
            >
              Bãi đỗ
            </label>
            <select
              id={lotSelectId}
              value={selectedLotId}
              onChange={(e) => onLotChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            >
              {(catalogs?.lots ?? []).map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.tenbaido} ({lot.cho_trong} trống)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={slotSelectId}
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
            >
              Vị trí trống ({slotsForLot.length})
            </label>
            <select
              id={slotSelectId}
              value={slotId}
              onChange={(e) => onSlotChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
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

        <div>
          <label
            htmlFor={cardSelectId}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Thẻ RFID sẵn sàng ({availableCards.length})
          </label>
          <select
            id={cardSelectId}
            value={cardId}
            onChange={(e) => onCardChange(Number(e.target.value))}
            className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
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

        <button
          type="submit"
          disabled={submitting || !slotId || !cardId}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition cursor-pointer"
        >
          <CheckCircle2 className="h-4 w-4" />
          {submitting ? 'Đang ghi nhận...' : 'Xác nhận Check-in & In phiếu QR'}
        </button>
      </form>
    </section>
  );
}
