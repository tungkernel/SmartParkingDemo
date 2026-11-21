import { ArrowRightLeft } from 'lucide-react';
import { useId } from 'react';
import type { ActiveTurn, ParkingSlot } from '../../types';
import { Button } from '../ui/Button';
import { LicensePlate } from '../ui/LicensePlate';
import { Modal } from '../ui/Modal';

interface MoveSlotModalProps {
  turn: ActiveTurn | null;
  targetSlotId: number | '';
  onTargetSlotChange: (id: number | '') => void;
  availableSlots: ParkingSlot[];
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function MoveSlotModal({
  turn,
  targetSlotId,
  onTargetSlotChange,
  availableSlots,
  submitting,
  onConfirm,
  onClose,
}: MoveSlotModalProps) {
  const selectId = useId();
  if (!turn) return null;

  return (
    <Modal
      open={Boolean(turn)}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={`Chuyển vị trí cho xe ${turn.bienso}`}
      titleIcon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
          <ArrowRightLeft className="h-4 w-4" />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!targetSlotId}
            onClick={onConfirm}
          >
            {submitting ? 'Đang chuyển...' : 'Xác nhận chuyển'}
          </Button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 p-3 text-xs">
          <LicensePlate plate={turn.bienso} size="sm" />
          <div className="text-right">
            <div className="text-[10px] uppercase font-semibold text-slate-400">
              Vị trí hiện tại
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-100">
              {turn.tenbaido} · {turn.khuvuc}-{turn.vitri}
            </div>
          </div>
        </div>
        <div>
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Chọn ô đỗ trống mới ({availableSlots.length} ô sẵn sàng)
          </label>
          <select
            id={selectId}
            value={targetSlotId}
            onChange={(e) => onTargetSlotChange(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
          >
            <option value="">-- Chọn vị trí đích --</option>
            {availableSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.tenbaido} · Khu {slot.ten_khuvuc} — Ô {slot.sothutu}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
